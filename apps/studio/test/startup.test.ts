import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonLibraryRepository } from "../lib/library/json-repository";
import { INTERRUPTED_MESSAGE, reconcileLibrary } from "../lib/library/startup";

let work: string;
let dirs: { flipbooksDir: string; uploadsDir: string };
let repo: JsonLibraryRepository;

async function writeBookOnDisk(id: string, slug: string, title: string) {
  await mkdir(path.join(dirs.flipbooksDir, id, "pages"), { recursive: true });
  await writeFile(path.join(dirs.flipbooksDir, id, "pages", "001.webp"), "x".repeat(100));
  await writeFile(
    path.join(dirs.flipbooksDir, id, "manifest.json"),
    JSON.stringify({
      version: 1,
      id,
      slug,
      title,
      pageCount: 12,
      pageWidth: 1000,
      pageHeight: 1414,
      pdf: "original.pdf",
      search: "search.json",
      pages: [],
      createdAt: "2026-10-01T10:00:00.000Z",
    }),
  );
}

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "vgf-startup-"));
  dirs = { flipbooksDir: path.join(work, "flipbooks"), uploadsDir: path.join(work, "uploads") };
  repo = new JsonLibraryRepository(path.join(work, "library.json"));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

describe("reconcileLibrary (studio start-up)", () => {
  it("adds books converted with the CLI to Général as ready, with a unique slug", async () => {
    const [general] = await repo.listFolders();
    await repo.createBook({
      id: "known",
      folderId: general!.id,
      title: "Déjà là",
      slug: "brochure",
      status: "ready",
    });
    await writeBookOnDisk("known", "brochure", "Déjà là");
    await writeBookOnDisk("cli-book", "brochure", "Brochure CLI");

    const report = await reconcileLibrary(repo, dirs);
    expect(report.imported).toEqual(["cli-book"]);
    const imported = await repo.getBook("cli-book");
    expect(imported).toMatchObject({
      folderId: general!.id,
      title: "Brochure CLI",
      slug: "brochure-2",
      status: "ready",
      pageCount: 12,
      createdAt: "2026-10-01T10:00:00.000Z",
    });
    expect(imported?.sizeBytes).toBeGreaterThan(100);

    // Running again changes nothing.
    expect((await reconcileLibrary(repo, dirs)).imported).toEqual([]);
  });

  it("marks books left converting as failed: 'Conversion interrompue'", async () => {
    const [general] = await repo.listFolders();
    await repo.createBook({
      id: "cut",
      folderId: general!.id,
      title: "Coupé",
      slug: "coupe",
      status: "converting",
      progress: { page: 7, total: 40 },
    });
    const report = await reconcileLibrary(repo, dirs);
    expect(report.interrupted).toEqual(["cut"]);
    const book = await repo.getBook("cut");
    expect(book).toMatchObject({
      status: "failed",
      error: { code: "INTERRUPTED", message: INTERRUPTED_MESSAGE },
    });
    expect(book?.progress).toBeUndefined();
  });

  it("removes leftover uploads and half-written book folders", async () => {
    await mkdir(dirs.uploadsDir, { recursive: true });
    await writeFile(path.join(dirs.uploadsDir, "job.pdf"), "%PDF-");
    await mkdir(path.join(dirs.flipbooksDir, "abc.tmp", "pages"), { recursive: true });
    const report = await reconcileLibrary(repo, dirs);
    expect(report.removed.sort()).toEqual(["flipbooks/abc.tmp", "uploads/job.pdf"]);
    expect(await readdir(dirs.uploadsDir)).toEqual([]);
    expect(await readdir(dirs.flipbooksDir)).toEqual([]);
  });

  it("recreates Général for books found on disk if it was renamed", async () => {
    const [general] = await repo.listFolders();
    await repo.renameFolder(general!.id, "Archives");
    await writeBookOnDisk("cli-book", "x", "X");
    await reconcileLibrary(repo, dirs);
    const folders = await repo.listFolders();
    expect(folders.map((f) => f.name)).toEqual(["Archives", "Général"]);
    expect((await repo.getBook("cli-book"))?.folderId).toBe(folders[1]!.id);
  });
});
