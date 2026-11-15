import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FlipbookManifest } from "@vipgroup/shared";
import { readManifest } from "../library/book-files";
import { contentTypeOf, isSafeSegment } from "../storage";
import type { R2Client } from "./client";
import { R2Error } from "./errors";

/**
 * Copy a converted book to the bucket, or remove it, with exactly the layout of CLAUDE.md
 * "Book output format": flipbooks/<id>/manifest.json, search.json, original.pdf, pages/….
 * Updating flipbooks/index.json (publishing) is a separate step (S7).
 */

/** Book ids are lowercase UUIDs (crypto.randomUUID). */
const BOOK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isBookId = (id: string): boolean => BOOK_ID.test(id);

/** The book's folder in the bucket. */
export const bookPrefix = (id: string): string => `flipbooks/${id}/`;

const MANIFEST = "manifest.json";

export interface SyncProgress {
  /** Files sent (upload) or removed (delete) so far. */
  done: number;
  total: number;
  /** Bytes sent so far (upload only). */
  bytes: number;
}

export interface SyncOptions {
  onProgress?: (progress: SyncProgress) => void;
  /** Requests in flight at once. Default 6. */
  concurrency?: number;
}

/**
 * Every file of a book, as paths relative to its folder, from its manifest; manifest.json
 * comes last. Stray files in the folder (Thumbs.db, .DS_Store…) are not part of the book.
 */
export function bookFiles(manifest: FlipbookManifest): string[] {
  const files = new Set<string>();
  for (const page of manifest.pages) {
    files.add(page.thumb);
    files.add(page.standard);
    files.add(page.zoom);
  }
  files.add(manifest.search);
  files.add(manifest.pdf);
  files.delete(MANIFEST);
  return [...files, MANIFEST];
}

/** A plain relative path to a book file type: no `..`, no absolute path, no odd characters. */
const isBookFilePath = (file: string): boolean =>
  file.split("/").every(isSafeSegment) && contentTypeOf(file) !== undefined;

const isManifestShaped = (manifest: FlipbookManifest): boolean =>
  Array.isArray(manifest.pages) &&
  manifest.pages.length > 0 &&
  manifest.pages.every(
    (page) =>
      typeof page.thumb === "string" &&
      typeof page.standard === "string" &&
      typeof page.zoom === "string",
  ) &&
  typeof manifest.pdf === "string" &&
  typeof manifest.search === "string";

/**
 * Run `task` over `items` with at most `limit` in flight. After a failure no new task starts;
 * the ones running finish, then the first error is thrown.
 */
async function eachLimit<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | undefined;
  const worker = async () => {
    while (!failure && next < items.length) {
      const item = items[next++]!;
      try {
        await task(item);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure.error;
}

export interface UploadResult {
  id: string;
  files: number;
  bytes: number;
}

/**
 * Upload the book folder `bookDir` (<flipbooks dir>/<id>) to flipbooks/<id>/ in the bucket,
 * each file with its Content-Type. The manifest goes last, so a folder holding a manifest is
 * complete. Uploading again overwrites the same files. Afterwards the bucket is listed and every
 * file checked by size; anything missing throws INCOMPLETE.
 */
export async function uploadBookFolder(
  client: R2Client,
  bookDir: string,
  options: SyncOptions = {},
): Promise<UploadResult> {
  const id = path.basename(bookDir);
  if (!isBookId(id)) throw new R2Error("INVALID_BOOK", `Not a book folder: ${bookDir}`);
  const manifest = await readManifest(path.dirname(bookDir), id);
  if (!manifest || !isManifestShaped(manifest)) {
    throw new R2Error("INVALID_BOOK", `No usable manifest.json in ${bookDir}`);
  }
  if (manifest.id !== id) {
    throw new R2Error("INVALID_BOOK", `${bookDir} holds the manifest of book ${manifest.id}`);
  }

  const files = bookFiles(manifest);
  const unsafe = files.find((file) => !isBookFilePath(file));
  if (unsafe) throw new R2Error("INVALID_BOOK", `Unexpected file path in the manifest: ${unsafe}`);

  // Sizes first: a missing file stops the upload before anything is sent.
  const localPath = (file: string) => path.join(bookDir, ...file.split("/"));
  const sizes = new Map<string, number>();
  for (const file of files) {
    try {
      sizes.set(file, (await stat(/*turbopackIgnore: true*/ localPath(file))).size);
    } catch {
      throw new R2Error("MISSING_FILE", `Missing in ${bookDir}: ${file}`);
    }
  }

  const prefix = bookPrefix(id);
  const progress: SyncProgress = { done: 0, total: files.length, bytes: 0 };
  const upload = async (file: string) => {
    const body = await readFile(/*turbopackIgnore: true*/ localPath(file));
    await client.putObject(prefix + file, body, contentTypeOf(file)!);
    progress.done += 1;
    progress.bytes += body.byteLength;
    options.onProgress?.({ ...progress });
  };

  await eachLimit(files.slice(0, -1), options.concurrency ?? 6, upload);
  await upload(MANIFEST);

  const stored = new Map((await client.listObjects(prefix)).map((o) => [o.key, o.size]));
  const missing = files.filter((file) => stored.get(prefix + file) !== sizes.get(file));
  if (missing.length > 0) {
    throw new R2Error(
      "INCOMPLETE",
      `${missing.length} file(s) missing or of another size in R2: ${missing.slice(0, 5).join(", ")}`,
    );
  }
  return { id, files: files.length, bytes: progress.bytes };
}

/**
 * Remove every object under flipbooks/<id>/ from the bucket. The manifest goes first, so a
 * half-removed folder never looks complete. Removing a book that is not there succeeds with 0.
 * Only a book id is accepted: nothing outside one book folder can be deleted.
 */
export async function deleteBookFolder(
  client: R2Client,
  id: string,
  options: SyncOptions = {},
): Promise<{ deleted: number }> {
  if (!isBookId(id)) throw new R2Error("INVALID_BOOK", `Not a book id: ${id}`);
  const prefix = bookPrefix(id);
  const keys = (await client.listObjects(prefix))
    .map((object) => object.key)
    .filter((key) => key.startsWith(prefix));
  const manifestKey = prefix + MANIFEST;
  const ordered = [
    ...keys.filter((key) => key === manifestKey),
    ...keys.filter((key) => key !== manifestKey),
  ];

  const progress: SyncProgress = { done: 0, total: ordered.length, bytes: 0 };
  const remove = async (key: string) => {
    await client.deleteObject(key);
    progress.done += 1;
    options.onProgress?.({ ...progress });
  };
  if (ordered[0] === manifestKey) await remove(manifestKey);
  await eachLimit(
    ordered.filter((key) => key !== manifestKey),
    options.concurrency ?? 6,
    remove,
  );

  const left = await client.listObjects(prefix);
  if (left.length > 0) {
    throw new R2Error("INCOMPLETE", `${left.length} object(s) still under ${prefix}`);
  }
  return { deleted: ordered.length };
}
