import type { FlipDirection, ViewMode } from "./types";

/** Inclusive, 1-based range of the pages visible together. */
export type Spread = readonly [first: number, last: number];

export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.round(page), 1), Math.max(pageCount, 1));
}

/**
 * Pages shown together with `page`. In double mode page 1 is the cover and stands alone
 * (like a printed brochure): 1 · 2–3 · 4–5 · … and a last even page stands alone too.
 */
export function spreadForPage(page: number, pageCount: number, mode: ViewMode): Spread {
  const p = clampPage(page, pageCount);
  if (mode === "single" || p === 1) return [p, p];
  const first = p % 2 === 0 ? p : p - 1;
  return [first, Math.min(first + 1, pageCount)];
}

export function neighbourSpread(
  spread: Spread,
  pageCount: number,
  mode: ViewMode,
  direction: FlipDirection,
): Spread | null {
  const page = direction === "forward" ? spread[1] + 1 : spread[0] - 1;
  if (page < 1 || page > pageCount) return null;
  return spreadForPage(page, pageCount, mode);
}

/** "1" or "2–3". */
export function formatSpread(spread: Spread): string {
  return spread[0] === spread[1] ? String(spread[0]) : `${spread[0]}–${spread[1]}`;
}

/**
 * Page typed in the indicator: the first number found, clamped to the book.
 * "12", " 12 ", "12–13" and "p. 12" all give 12. Returns null when there is no number.
 */
export function parsePageInput(text: string, pageCount: number): number | null {
  const match = /\d+/.exec(text);
  if (!match) return null;
  return clampPage(Number(match[0]), pageCount);
}
