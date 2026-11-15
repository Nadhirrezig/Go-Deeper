import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FlipbookManifest } from "@vipgroup/shared";

/** The manifest the converter would write for a book of `pageCount` pages. */
export const manifestOf = (id: string, pageCount = 2): FlipbookManifest => ({
  version: 1,
  id,
  slug: "posts",
  title: "Posts",
  pageCount,
  pageWidth: 1000,
  pageHeight: 1250,
  pdf: "original.pdf",
  search: "search.json",
  pages: Array.from({ length: pageCount }, (_, i) => {
    const n = String(i + 1).padStart(3, "0");
    return {
      n: i + 1,
      thumb: `pages/${n}-thumb.webp`,
      standard: `pages/${n}.webp`,
      zoom: `pages/${n}-zoom.webp`,
    };
  }),
  createdAt: "2026-11-14T14:08:30.108Z",
});

/** A converted book folder on disk (<flipbooksDir>/<id>/), as the converter writes it. */
export async function writeBook(
  flipbooksDir: string,
  id: string,
  manifest: FlipbookManifest = manifestOf(id),
): Promise<string> {
  const dir = path.join(flipbooksDir, id);
  await mkdir(path.join(dir, "pages"), { recursive: true });
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(dir, "search.json"), "[]");
  await writeFile(path.join(dir, "original.pdf"), "%PDF-1.7 test");
  for (const page of manifest.pages) {
    for (const file of [page.thumb, page.standard, page.zoom]) {
      await writeFile(path.join(dir, file), `webp ${file}`);
    }
  }
  return dir;
}
