import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FlipbookManifest } from "@vipgroup/shared";

/** File types a book folder contains; anything else is not served. */
const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

/** A safe path segment: plain file/folder name, no dots first, no separators, no "%". */
const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

export const isSafeSegment = (segment: string): boolean =>
  SAFE_SEGMENT.test(segment) && !segment.includes("..");

// Book files are read at run time from a folder chosen by the user (FLIPBOOKS_DIR), never
// bundled: `turbopackIgnore` stops Next from tracing the whole project for these fs calls.

/** Walk up from `start` to the folder holding `pnpm-workspace.yaml`. */
export function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(/*turbopackIgnore: true*/ path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/**
 * Studio data folder: `library.json`, `flipbooks/`, `uploads/`.
 * `STORAGE_DIR` overrides the default `<repo root>/storage`.
 */
export function getStorageRoot(): string {
  const configured = process.env.STORAGE_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(findRepoRoot(process.cwd()), "storage");
}

/**
 * Folder holding the converted books (`<dir>/<id>/manifest.json`, …).
 * `FLIPBOOKS_DIR` overrides the default `<storage>/flipbooks`.
 */
export function getFlipbooksDir(): string {
  const configured = process.env.FLIPBOOKS_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(getStorageRoot(), "flipbooks");
}

/** The library (folders and book records) until PostgreSQL in step 6. */
export function getLibraryFile(): string {
  return path.join(getStorageRoot(), "library.json");
}

/** Uploaded PDFs waiting for (or in) conversion. Emptied as jobs finish. */
export function getUploadsDir(): string {
  return path.join(getStorageRoot(), "uploads");
}

/** @deprecated Use getFlipbooksDir. Kept for the temporary /dev pages. */
export const getStorageDir = getFlipbooksDir;

export interface StorageFile {
  file: string;
  contentType: string;
}

/**
 * Map URL segments (`["<id>", "pages", "001.webp"]`) to a file inside `root`.
 * Returns null for anything that could leave the folder (`..`, absolute or encoded paths,
 * separators, dot files) or that is not a book file type.
 */
export function resolveStorageFile(root: string, segments: readonly string[]): StorageFile | null {
  if (segments.length === 0 || !segments.every(isSafeSegment)) return null;
  const base = path.resolve(root);
  const file = path.resolve(base, ...segments);
  // Defence in depth: the resolved path must still be inside the storage folder.
  if (!file.startsWith(base + path.sep)) return null;
  const contentType = CONTENT_TYPES[path.extname(file).toLowerCase()];
  return contentType ? { file, contentType } : null;
}

export interface BookSummary {
  id: string;
  title: string;
  pageCount: number;
  createdAt: string;
}

/** Books found in the storage folder, newest first. Broken folders are skipped. */
export async function listBooks(root: string = getStorageDir()): Promise<BookSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(/*turbopackIgnore: true*/ root);
  } catch {
    return [];
  }
  const books: BookSummary[] = [];
  for (const id of entries) {
    if (!isSafeSegment(id)) continue;
    try {
      const raw = await readFile(
        /*turbopackIgnore: true*/ path.join(root, id, "manifest.json"),
        "utf8",
      );
      const manifest = JSON.parse(raw) as FlipbookManifest;
      books.push({
        id,
        title: manifest.title,
        pageCount: manifest.pageCount,
        createdAt: manifest.createdAt,
      });
    } catch {
      // Not a finished book (e.g. a `.tmp` folder being written): ignore.
    }
  }
  return books.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
