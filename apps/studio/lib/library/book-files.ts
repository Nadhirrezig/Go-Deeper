import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { FlipbookManifest } from "@vipgroup/shared";
import { isSafeSegment } from "../storage";

/** The manifest of `<flipbooksDir>/<id>/`, or null if it is missing or unreadable. */
export async function readManifest(
  flipbooksDir: string,
  id: string,
): Promise<FlipbookManifest | null> {
  if (!isSafeSegment(id)) return null;
  try {
    const raw = await readFile(
      /*turbopackIgnore: true*/ path.join(flipbooksDir, id, "manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(raw) as FlipbookManifest;
    return manifest.version === 1 ? manifest : null;
  } catch {
    return null;
  }
}

/** Total size in bytes of every file under `dir`. */
export async function folderSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await folderSize(full);
    else if (entry.isFile()) total += (await stat(/*turbopackIgnore: true*/ full)).size;
  }
  return total;
}

/** Delete `<flipbooksDir>/<id>/` (the converted pages, PDF and JSON). */
export async function removeBookFolder(flipbooksDir: string, id: string): Promise<void> {
  if (!isSafeSegment(id)) throw new Error(`Unsafe book id: ${id}`);
  await rm(/*turbopackIgnore: true*/ path.join(flipbooksDir, id), {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
