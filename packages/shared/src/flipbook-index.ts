/**
 * `flipbooks/index.json` in the R2 bucket: the books published on goexperience.travel.
 * Written by the studio (Publier / Dépublier), read by goexperience (src/lib/flipbook-index.ts).
 * Contract: CLAUDE.md, "Published list".
 */
export interface FlipbookIndexEntry {
  slug: string;
  id: string; // uuid; its first 8 characters are the book's public address
  title: string;
  pageCount: number;
  publishedAt: string; // ISO
}

export interface FlipbookIndex {
  version: 1;
  books: FlipbookIndexEntry[];
}

/** A book's public address on goexperience.travel: /flipbook/<first 8 characters of its id>. */
export function shortBookId(id: string): string {
  return id.slice(0, 8);
}
