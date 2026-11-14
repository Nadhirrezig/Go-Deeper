/**
 * Contract between the converter (producer) and the flipbook reader (consumer).
 * All paths are relative to the manifest's own URL. Change only when a step says so.
 */
export interface FlipbookManifest {
  version: 1;
  id: string; // uuid
  slug: string;
  title: string;
  pageCount: number;
  pageWidth: number; // px of the standard image, page 1
  pageHeight: number;
  pdf: string; // relative path, e.g. "original.pdf"
  search: string; // relative path, e.g. "search.json"
  pages: { n: number; thumb: string; standard: string; zoom: string }[];
  createdAt: string; // ISO
}
