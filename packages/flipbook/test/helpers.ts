import type { FlipbookManifest } from "@vipgroup/shared";

/** A manifest shaped like the converter's output. */
export function makeManifest(
  pageCount: number,
  overrides: Partial<FlipbookManifest> = {},
): FlipbookManifest {
  const pad = (n: number): string => String(n).padStart(3, "0");
  return {
    version: 1,
    id: "11111111-2222-3333-4444-555555555555",
    slug: "test-book",
    title: "Test book",
    pageCount,
    pageWidth: 1000,
    pageHeight: 1414,
    pdf: "original.pdf",
    search: "search.json",
    pages: Array.from({ length: pageCount }, (_, i) => ({
      n: i + 1,
      thumb: `pages/${pad(i + 1)}-thumb.webp`,
      standard: `pages/${pad(i + 1)}.webp`,
      zoom: `pages/${pad(i + 1)}-zoom.webp`,
    })),
    createdAt: "2026-11-14T10:00:00.000Z",
    ...overrides,
  };
}
