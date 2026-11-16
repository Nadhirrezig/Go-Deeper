import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { uniqueSlug } from "@vipgroup/shared";
import { isSafeSegment } from "../storage";
import { folderSize, readManifest } from "./book-files";
import { DEFAULT_FOLDER_NAME } from "./repository";
import type { LibraryRepository } from "./repository";

export const INTERRUPTED_MESSAGE = "Conversion interrompue";
export const PUBLICATION_INTERRUPTED_MESSAGES = {
  publish: "Publication interrompue par l’arrêt du studio : relancez-la.",
  unpublish: "Dépublication interrompue par l’arrêt du studio : relancez-la.",
} as const;

export interface ReconcileReport {
  /** Books left "converting" by a stopped studio, now "failed". */
  interrupted: string[];
  /** Books found on disk (e.g. converted with the CLI), added to "Général". */
  imported: string[];
  /** Half-written book folders (`<id>.tmp`) and uploads left by a stopped studio. */
  removed: string[];
  /** Books left mid-publish or mid-unpublish by a stopped studio, to be started again. */
  publicationsInterrupted: string[];
}

/**
 * Bring the library in line with the disk when the studio starts (no conversion runs yet).
 */
export async function reconcileLibrary(
  repo: LibraryRepository,
  dirs: { flipbooksDir: string; uploadsDir: string },
): Promise<ReconcileReport> {
  const report: ReconcileReport = {
    interrupted: [],
    imported: [],
    removed: [],
    publicationsInterrupted: [],
  };
  const folders = await repo.listFolders(); // creates "Général" on first run

  // 1. Conversions cut short by a stop: nothing will finish them.
  for (const book of await repo.listBooks()) {
    if (book.status !== "converting") continue;
    await repo.updateBook(book.id, {
      status: "failed",
      progress: undefined,
      error: { code: "INTERRUPTED", message: INTERRUPTED_MESSAGE },
    });
    report.interrupted.push(book.id);
  }

  // 1b. Publications cut short by a stop. Every step of a publish or unpublish can run again,
  // so the team only has to start it again; `sites` already says where it stood.
  for (const book of await repo.listBooks()) {
    if (!book.publication) continue;
    await repo.updateBook(book.id, {
      publication: undefined,
      publicationError: {
        code: "INTERRUPTED",
        message: PUBLICATION_INTERRUPTED_MESSAGES[book.publication.action],
        site: book.publication.site,
      },
    });
    report.publicationsInterrupted.push(book.id);
  }

  // 2. Leftovers of those conversions: uploaded PDFs and half-written book folders.
  await mkdir(/*turbopackIgnore: true*/ dirs.uploadsDir, { recursive: true });
  for (const name of await readdir(/*turbopackIgnore: true*/ dirs.uploadsDir)) {
    await rm(/*turbopackIgnore: true*/ path.join(dirs.uploadsDir, name), {
      recursive: true,
      force: true,
    });
    report.removed.push(`uploads/${name}`);
  }
  await mkdir(/*turbopackIgnore: true*/ dirs.flipbooksDir, { recursive: true });
  const entries = await readdir(/*turbopackIgnore: true*/ dirs.flipbooksDir, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith(".tmp")) {
      await rm(/*turbopackIgnore: true*/ path.join(dirs.flipbooksDir, entry.name), {
        recursive: true,
        force: true,
      });
      report.removed.push(`flipbooks/${entry.name}`);
    }
  }

  // 3. Books on disk the library does not know (converted with the CLI): add to "Général".
  const known = new Set((await repo.listBooks()).map((book) => book.id));
  let general = folders.find(
    (folder) => folder.name.toLocaleLowerCase("fr") === DEFAULT_FOLDER_NAME.toLocaleLowerCase("fr"),
  );
  for (const entry of entries) {
    const id = entry.name;
    if (!entry.isDirectory() || !isSafeSegment(id) || id.endsWith(".tmp") || known.has(id)) {
      continue;
    }
    const manifest = await readManifest(dirs.flipbooksDir, id);
    if (!manifest) continue;
    general ??= await repo.createFolder(DEFAULT_FOLDER_NAME);
    const slug = uniqueSlug(manifest.slug, await repo.slugsInUse());
    await repo.createBook({
      id,
      folderId: general.id,
      title: manifest.title,
      slug,
      status: "ready",
      pageCount: manifest.pageCount,
      sizeBytes: await folderSize(path.join(dirs.flipbooksDir, id)),
      createdAt: manifest.createdAt,
    });
    report.imported.push(id);
  }
  return report;
}
