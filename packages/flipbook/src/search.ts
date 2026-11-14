/**
 * In-book search: normalisation, AND matching and snippets. Pure functions, no DOM.
 *
 * Page text and query go through the same normalisation, so "ete" finds "Été" and an Arabic
 * word typed without harakat finds it with them. Every normalised character remembers which
 * original characters it came from, so snippets and highlights use the original text
 * (accents and Arabic shown as printed).
 */

/** Shortest query (normalised, spaces ignored) that runs a search. */
export const MIN_QUERY_LENGTH = 2;
/** Most result rows shown; the rest is summarised by a "showing first 100" line. */
export const MAX_RESULTS = 100;
/** Approximate snippet length, in characters of the original text. */
export const SNIPPET_LENGTH = 80;

/** One entry of `search.json`. */
export interface SearchEntry {
  page: number;
  text: string;
}

/** Text in normalised form, with a map back to the original. */
export interface NormalizedText {
  text: string;
  /** For each normalised character: [start, end) of its source in the original string. */
  start: number[];
  end: number[];
}

export interface IndexedPage {
  page: number;
  original: string;
  normalized: NormalizedText;
}

export interface SnippetPart {
  text: string;
  match: boolean;
}

export interface SearchResult {
  page: number;
  /** Occurrences of all query words on the page. */
  matches: number;
  snippet: SnippetPart[];
}

export interface SearchOutcome {
  results: SearchResult[];
  /** Pages that matched, before the cap. */
  total: number;
  capped: boolean;
}

const COMBINING_MARKS = /\p{M}/gu;
// Harakat / tashkeel (U+064B–U+0652), superscript alef (U+0670), tatweel (U+0640).
const ARABIC_IGNORED = /[ً-ْٰـ]/;
const ARABIC_MAP: Record<string, string> = {
  أ: "ا", // أ → ا
  إ: "ا", // إ → ا
  آ: "ا", // آ → ا
  ٱ: "ا", // ٱ → ا
  ى: "ي", // ى → ي
  ة: "ه", // ة → ه
};
// Ligatures common in French and German text, so "coeur" finds "cœur".
const LIGATURES: Record<string, string> = { œ: "oe", æ: "ae", ß: "ss" };

/** Normalised form of one character (code point): may be "", one or several characters. */
export function normalizeChar(char: string): string {
  if (/\s/.test(char)) return " ";
  if (ARABIC_IGNORED.test(char)) return "";
  const mapped = ARABIC_MAP[char] ?? char;
  const lower = mapped.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
  // Lowercasing can bring marks back (e.g. "İ" → "i̇"): strip again.
  const clean = lower.normalize("NFD").replace(COMBINING_MARKS, "");
  return [...clean].map((c) => LIGATURES[c] ?? c).join("");
}

/** Normalise `original`, keeping for each output character the range it came from. */
export function normalizeWithMap(original: string): NormalizedText {
  let text = "";
  const start: number[] = [];
  const end: number[] = [];
  let index = 0;
  for (const char of original) {
    const out = normalizeChar(char);
    for (let i = 0; i < out.length; i++) {
      start.push(index);
      end.push(index + char.length);
    }
    text += out;
    index += char.length;
  }
  return { text, start, end };
}

export function normalize(value: string): string {
  return normalizeWithMap(value).text;
}

/** Query → distinct normalised words. Empty when the query is too short to run. */
export function parseQuery(query: string): string[] {
  const words = [...new Set(normalize(query).split(" ").filter(Boolean))];
  return words.join("").length >= MIN_QUERY_LENGTH ? words : [];
}

export function buildIndex(entries: readonly SearchEntry[]): IndexedPage[] {
  return [...entries]
    .sort((a, b) => a.page - b.page)
    .map((entry) => ({
      page: entry.page,
      original: entry.text,
      normalized: normalizeWithMap(entry.text),
    }));
}

/** True when no page has any text (scanned PDF): search cannot find anything. */
export function isSearchable(entries: readonly SearchEntry[]): boolean {
  return entries.some((entry) => entry.text.trim().length > 0);
}

/** Start offsets of every (non-overlapping) occurrence of `needle`. */
export function findAll(haystack: string, needle: string): number[] {
  const hits: number[] = [];
  if (!needle) return hits;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return hits;
    hits.push(at);
    from = at + needle.length;
  }
}

/** Pages containing every word, in page order, capped at `limit`. */
export function searchPages(
  index: readonly IndexedPage[],
  query: string,
  limit: number = MAX_RESULTS,
): SearchOutcome {
  const words = parseQuery(query);
  if (words.length === 0) return { results: [], total: 0, capped: false };

  const results: SearchResult[] = [];
  let total = 0;
  for (const page of index) {
    const hits: { at: number; length: number }[] = [];
    let everyWord = true;
    for (const word of words) {
      const found = findAll(page.normalized.text, word);
      if (found.length === 0) {
        everyWord = false;
        break;
      }
      for (const at of found) hits.push({ at, length: word.length });
    }
    if (!everyWord) continue;
    total++;
    if (results.length < limit) {
      results.push({ page: page.page, matches: hits.length, snippet: makeSnippet(page, hits) });
    }
  }
  return { results, total, capped: total > results.length };
}

/** Avoid cutting a surrogate pair (emoji, rare scripts) in half. */
function safeBoundary(text: string, at: number): number {
  const code = text.charCodeAt(at);
  return code >= 0xdc00 && code <= 0xdfff ? at - 1 : at;
}

/**
 * About `length` characters of the original text around the first hit, cut on spaces when
 * one is close, with every hit inside the window marked. Whitespace (line breaks) is shown
 * as single spaces; "…" marks a cut.
 */
export function makeSnippet(
  page: IndexedPage,
  hits: readonly { at: number; length: number }[],
  length: number = SNIPPET_LENGTH,
): SnippetPart[] {
  const { original, normalized } = page;
  // Normalised hits → ranges of the original text, sorted and merged.
  const ranges = hits
    .map(({ at, length: size }) => ({
      from: normalized.start[at] ?? 0,
      to: normalized.end[at + size - 1] ?? original.length,
    }))
    .sort((a, b) => a.from - b.from)
    .reduce<{ from: number; to: number }[]>((merged, range) => {
      const last = merged[merged.length - 1];
      if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
      else merged.push({ ...range });
      return merged;
    }, []);
  const first = ranges[0];
  if (!first) return [{ text: collapse(original.slice(0, length)), match: false }];

  // Window: the first hit with roughly a third of the room before it.
  const room = Math.max(0, length - (first.to - first.from));
  let from = Math.max(0, first.from - Math.floor(room / 3));
  let to = Math.min(original.length, Math.max(first.to, from + length));
  if (to - from < length) from = Math.max(0, to - length);
  // Prefer cutting on a space within 12 characters, never inside the first hit.
  if (from > 0) {
    const space = original.slice(from, Math.min(first.from, from + 12)).search(/\s/);
    if (space >= 0) from += space + 1;
  }
  if (to < original.length) {
    const tail = original.slice(Math.max(first.to, to - 12), to);
    const space = tail.search(/\s(?=\S*$)/);
    if (space >= 0) to = Math.max(first.to, to - 12) + space;
  }
  from = safeBoundary(original, from);
  to = safeBoundary(original, to);

  const parts: SnippetPart[] = [];
  const push = (text: string, match: boolean): void => {
    if (text) parts.push({ text, match });
  };
  if (from > 0) push("…", false);
  let cursor = from;
  for (const range of ranges) {
    if (range.to <= from || range.from >= to) continue;
    const a = Math.max(range.from, from);
    const b = Math.min(range.to, to);
    push(collapse(original.slice(cursor, a)), false);
    push(collapse(original.slice(a, b)), true);
    cursor = b;
  }
  push(collapse(original.slice(cursor, to)), false);
  if (to < original.length) push("…", false);
  return parts;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** Validate `search.json`; anything malformed becomes an empty page text. */
export function parseSearchJson(data: unknown): SearchEntry[] {
  if (!Array.isArray(data)) throw new Error("search.json is not an array.");
  return data.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { page, text } = item as { page?: unknown; text?: unknown };
    if (typeof page !== "number") return [];
    return [{ page, text: typeof text === "string" ? text : "" }];
  });
}
