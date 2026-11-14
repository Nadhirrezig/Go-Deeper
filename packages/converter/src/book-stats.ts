import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export interface BookStats {
  thumb: number;
  standard: number;
  zoom: number;
  other: number;
  total: number;
}

/** Bytes on disk per image size for a book folder (used by the CLI summary). */
export async function bookStats(dir: string): Promise<BookStats> {
  const stats: BookStats = { thumb: 0, standard: 0, zoom: 0, other: 0, total: 0 };
  const pagesDir = path.join(dir, "pages");
  for (const name of await readdir(pagesDir)) {
    const { size } = await stat(path.join(pagesDir, name));
    if (name.endsWith("-thumb.webp")) stats.thumb += size;
    else if (name.endsWith("-zoom.webp")) stats.zoom += size;
    else stats.standard += size;
  }
  for (const name of await readdir(dir)) {
    if (name === "pages") continue;
    stats.other += (await stat(path.join(dir, name))).size;
  }
  stats.total = stats.thumb + stats.standard + stats.zoom + stats.other;
  return stats;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
