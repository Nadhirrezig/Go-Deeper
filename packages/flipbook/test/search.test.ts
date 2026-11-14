import { describe, expect, it } from "vitest";
import {
  buildIndex,
  isSearchable,
  makeSnippet,
  MAX_RESULTS,
  normalize,
  normalizeWithMap,
  parseQuery,
  parseSearchJson,
  searchPages,
} from "../src/search";
import type { SnippetPart } from "../src/search";

const text = (parts: SnippetPart[]): string => parts.map((p) => p.text).join("");
const marked = (parts: SnippetPart[]): string[] => parts.filter((p) => p.match).map((p) => p.text);
const index = (...texts: string[]) => buildIndex(texts.map((t, i) => ({ page: i + 1, text: t })));

describe("normalize", () => {
  it("lowercases and removes French accents", () => {
    expect(normalize("Été")).toBe(normalize("ete"));
    expect(normalize("ça")).toBe("ca");
    expect(normalize("HÔTEL Crème brûlée")).toBe("hotel creme brulee");
    expect(normalize("cœur")).toBe("coeur");
  });

  it("removes Arabic harakat, superscript alef and tatweel", () => {
    expect(normalize("مَدْرَسَةٌ")).toBe(normalize("مدرسة"));
    expect(normalize("هٰذا")).toBe("هذا");
    expect(normalize("كـــتاب")).toBe("كتاب");
  });

  it("unifies alef variants, alef maqsura and taa marbuta", () => {
    for (const alef of ["أ", "إ", "آ", "ٱ"]) expect(normalize(alef)).toBe("ا");
    expect(normalize("إسلام")).toBe(normalize("اسلام"));
    expect(normalize("مستشفى")).toBe(normalize("مستشفي"));
    expect(normalize("مدرسة")).toBe(normalize("مدرسه"));
  });

  it("maps every normalised character back to the original", () => {
    const n = normalizeWithMap("Ça va");
    expect(n.text).toBe("ca va");
    expect(n.start).toEqual([0, 1, 2, 3, 4]);
    const arabic = normalizeWithMap("مَد");
    expect(arabic.text).toBe("مد");
    expect(arabic.start).toEqual([0, 2]);
  });
});

describe("parseQuery", () => {
  it("splits on spaces, normalises and drops duplicates", () => {
    expect(parseQuery("  Hôtel   PARIS hotel ")).toEqual(["hotel", "paris"]);
  });

  it("needs at least 2 characters", () => {
    expect(parseQuery("a")).toEqual([]);
    expect(parseQuery("   ")).toEqual([]);
    expect(parseQuery("ab")).toEqual(["ab"]);
  });
});

describe("searchPages", () => {
  const book = index(
    "Hôtel à Paris, petit déjeuner inclus.",
    "Visite de Paris en bus.",
    "L’hôtel est en bord de mer. Hôtel calme.",
    "",
  );

  it("finds accented words from a plain query", () => {
    expect(searchPages(book, "hotel").results.map((r) => r.page)).toEqual([1, 3]);
    expect(searchPages(book, "dejeuner").results.map((r) => r.page)).toEqual([1]);
  });

  it("needs every word on the page (AND)", () => {
    expect(searchPages(book, "hotel paris").results.map((r) => r.page)).toEqual([1]);
    expect(searchPages(book, "paris mer").results).toEqual([]);
  });

  it("counts the hits of every query word", () => {
    expect(searchPages(book, "hotel").results.find((r) => r.page === 3)?.matches).toBe(2);
    expect(searchPages(book, "hotel paris").results[0]?.matches).toBe(2);
  });

  it("ignores queries shorter than 2 characters", () => {
    expect(searchPages(book, "h")).toEqual({ results: [], total: 0, capped: false });
  });

  it("finds Arabic with and without harakat", () => {
    const arabic = index("زيارة المَدْرَسَة القديمة", "مكتبة");
    expect(searchPages(arabic, "المدرسه").results.map((r) => r.page)).toEqual([1]);
    expect(searchPages(arabic, "المَدْرَسَة").results.map((r) => r.page)).toEqual([1]);
  });

  it("caps the results at 100 and reports the total", () => {
    const big = buildIndex(Array.from({ length: 140 }, (_, i) => ({ page: i + 1, text: "Plage" })));
    const outcome = searchPages(big, "plage");
    expect(outcome.results).toHaveLength(MAX_RESULTS);
    expect(outcome.total).toBe(140);
    expect(outcome.capped).toBe(true);
    expect(outcome.results[99]?.page).toBe(100);
  });
});

describe("snippets", () => {
  it("marks the match in the original text, accents kept", () => {
    const [result] = searchPages(index("Séjour à l’Hôtel Été"), "ete").results;
    expect(marked(result!.snippet)).toEqual(["Été"]);
    expect(text(result!.snippet)).toBe("Séjour à l’Hôtel Été");
  });

  it("keeps Arabic as written, harakat included", () => {
    const [result] = searchPages(index("زيارة المَدْرَسَة القديمة"), "المدرسة").results;
    expect(marked(result!.snippet)).toEqual(["المَدْرَسَة"]);
  });

  it("shows a window of about 80 characters around the first match", () => {
    const long = `${"avant ".repeat(40)}Zanzibar${" après".repeat(40)}`;
    const [result] = searchPages(index(long), "zanzibar").results;
    const shown = text(result!.snippet);
    expect(shown.startsWith("…")).toBe(true);
    expect(shown.endsWith("…")).toBe(true);
    expect(shown.length).toBeGreaterThan(60);
    expect(shown.length).toBeLessThanOrEqual(84);
    expect(marked(result!.snippet)).toEqual(["Zanzibar"]);
    // Cut on spaces: no half words at the edges.
    expect(shown).toMatch(/^… ?\S+ /);
  });

  it("marks every word of the query inside the window", () => {
    const [result] = searchPages(index("Vol Paris – Tokyo, puis Kyoto"), "tokyo paris").results;
    expect(marked(result!.snippet)).toEqual(["Paris", "Tokyo"]);
  });

  it("keeps markup in page text as plain text (never HTML)", () => {
    const [result] = searchPages(
      index('Prix <b>"spécial"</b> & <script>x</script>'),
      "special",
    ).results;
    expect(text(result!.snippet)).toBe('Prix <b>"spécial"</b> & <script>x</script>');
    expect(marked(result!.snippet)).toEqual(["spécial"]);
  });

  it("shows line breaks as spaces", () => {
    const page = buildIndex([{ page: 1, text: "Ligne un\nLigne deux" }])[0]!;
    expect(text(makeSnippet(page, [{ at: 9, length: 5 }]))).toBe("Ligne un Ligne deux");
  });
});

describe("search.json", () => {
  it("detects a scanned book (no text anywhere)", () => {
    expect(
      isSearchable([
        { page: 1, text: "" },
        { page: 2, text: "  " },
      ]),
    ).toBe(false);
    expect(
      isSearchable([
        { page: 1, text: "" },
        { page: 2, text: "x" },
      ]),
    ).toBe(true);
  });

  it("validates the file", () => {
    expect(parseSearchJson([{ page: 1, text: "a" }, { page: 2 }, null, { text: "x" }])).toEqual([
      { page: 1, text: "a" },
      { page: 2, text: "" },
    ]);
    expect(() => parseSearchJson({})).toThrow();
  });
});
