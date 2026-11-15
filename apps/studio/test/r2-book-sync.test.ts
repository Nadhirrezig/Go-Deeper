import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FlipbookManifest } from "@vipgroup/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookFiles, deleteBookFolder, uploadBookFolder } from "../lib/r2/book-sync";
import type { SyncProgress } from "../lib/r2/book-sync";
import { createR2Client } from "../lib/r2/client";
import { isR2Error } from "../lib/r2/errors";
import type { R2Error } from "../lib/r2/errors";
import { createFakeR2 } from "./r2-fake";
import type { FakeR2 } from "./r2-fake";

const ID = "89dbed3b-e38f-43be-9285-70e0331ede20";
const OTHER = "11111111-2222-4333-8444-555555555555";
const PREFIX = `flipbooks/${ID}/`;

let work: string;
let flipbooksDir: string;
let r2: FakeR2;

const client = () =>
  createR2Client(
    {
      endpoint: "https://acc123.r2.cloudflarestorage.com",
      bucket: "goexperience",
      credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "SECRETTEST" },
    },
    { fetch: r2.fetch, sleep: async () => {} },
  );

const manifestOf = (id: string, pageCount = 2): FlipbookManifest => ({
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

/** A converted book folder on disk, as the converter writes it. */
async function writeBook(id: string, manifest: FlipbookManifest = manifestOf(id)): Promise<string> {
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

const errorOf = async (promise: Promise<unknown>): Promise<R2Error> => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(isR2Error(error)).toBe(true);
  return error as R2Error;
};

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "vgf-r2-"));
  flipbooksDir = path.join(work, "flipbooks");
  r2 = createFakeR2();
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("bookFiles", () => {
  it("lists every page image, the search index, the PDF, then the manifest", () => {
    expect(bookFiles(manifestOf(ID, 1))).toEqual([
      "pages/001-thumb.webp",
      "pages/001.webp",
      "pages/001-zoom.webp",
      "search.json",
      "original.pdf",
      "manifest.json",
    ]);
  });
});

describe("uploadBookFolder", () => {
  it("uploads the book's files to flipbooks/<id>/ with their types, the manifest last", async () => {
    const dir = await writeBook(ID);
    await writeFile(path.join(dir, "Thumbs.db"), "not part of the book");
    const progress: SyncProgress[] = [];

    const result = await uploadBookFolder(client(), dir, { onProgress: (p) => progress.push(p) });

    expect(result).toMatchObject({ id: ID, files: 9 });
    expect([...r2.objects.keys()].sort()).toEqual(
      bookFiles(manifestOf(ID))
        .map((file) => PREFIX + file)
        .sort(),
    );
    expect(r2.objects.get(`${PREFIX}manifest.json`)!.contentType).toBe(
      "application/json; charset=utf-8",
    );
    expect(r2.objects.get(`${PREFIX}original.pdf`)!.contentType).toBe("application/pdf");
    expect(r2.objects.get(`${PREFIX}pages/002-zoom.webp`)!.contentType).toBe("image/webp");
    const puts = r2.log.filter((line) => line.startsWith("PUT"));
    expect(puts.at(-1)).toBe(`PUT ${PREFIX}manifest.json`);
    expect(progress.map((p) => p.done)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(progress.at(-1)).toMatchObject({ total: 9, bytes: result.bytes });
    // Checked in R2 after the upload.
    expect(r2.log.at(-1)).toBe(`LIST ${PREFIX}`);
  });

  it("uploads again over the same files", async () => {
    const dir = await writeBook(ID);
    await uploadBookFolder(client(), dir);
    await uploadBookFolder(client(), dir);
    expect(r2.objects.size).toBe(9);
  });

  it("retries R2 hiccups during the upload", async () => {
    const dir = await writeBook(ID);
    r2.failNext.push(503, "network");
    await expect(uploadBookFolder(client(), dir)).resolves.toMatchObject({ files: 9 });
  });

  it("refuses a book with a missing file before sending anything", async () => {
    const dir = await writeBook(ID);
    await rm(path.join(dir, "pages", "002.webp"));
    const error = await errorOf(uploadBookFolder(client(), dir));
    expect(error.code).toBe("MISSING_FILE");
    expect(error.detail).toContain("pages/002.webp");
    expect(r2.log).toEqual([]);
  });

  it("refuses a folder that is not a book", async () => {
    const notUuid = path.join(flipbooksDir, "brochure");
    await mkdir(notUuid, { recursive: true });
    expect((await errorOf(uploadBookFolder(client(), notUuid))).code).toBe("INVALID_BOOK");

    const noManifest = path.join(flipbooksDir, OTHER);
    await mkdir(noManifest, { recursive: true });
    expect((await errorOf(uploadBookFolder(client(), noManifest))).code).toBe("INVALID_BOOK");

    const wrongId = await writeBook(ID, manifestOf(OTHER));
    expect((await errorOf(uploadBookFolder(client(), wrongId))).detail).toContain(OTHER);
    expect(r2.log).toEqual([]);
  });

  it("refuses a manifest pointing outside the book folder", async () => {
    const manifest = manifestOf(ID, 1);
    manifest.pages[0]!.zoom = "../other/secret.webp";
    const dir = await writeBook(ID, { ...manifest, pages: manifestOf(ID, 1).pages });
    await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    expect((await errorOf(uploadBookFolder(client(), dir))).code).toBe("INVALID_BOOK");
    expect(r2.log).toEqual([]);
  });

  it("reports INCOMPLETE when R2 does not hold every file afterwards", async () => {
    const dir = await writeBook(ID);
    const lossy = createR2Client(
      {
        endpoint: "https://acc123.r2.cloudflarestorage.com",
        bucket: "goexperience",
        credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "SECRETTEST" },
      },
      {
        fetch: (async (url: string, init: RequestInit) => {
          const response = await r2.fetch(url, init);
          // Lose one page right after it is stored.
          r2.objects.delete(`${PREFIX}pages/001.webp`);
          return response;
        }) as typeof fetch,
      },
    );
    const error = await errorOf(uploadBookFolder(lossy, dir));
    expect(error.code).toBe("INCOMPLETE");
    expect(error.detail).toContain("pages/001.webp");
  });
});

describe("deleteBookFolder", () => {
  it("removes every object of the book, the manifest first, and nothing else", async () => {
    await uploadBookFolder(client(), await writeBook(ID));
    await uploadBookFolder(client(), await writeBook(OTHER));
    r2.objects.set("journeys/site/hero.webp", { body: new Uint8Array(1), contentType: "x" });
    r2.objects.set("flipbooks/index.json", { body: new Uint8Array(1), contentType: "x" });
    r2.log.length = 0;
    const progress: SyncProgress[] = [];

    const result = await deleteBookFolder(client(), ID, { onProgress: (p) => progress.push(p) });

    expect(result).toEqual({ deleted: 9 });
    expect([...r2.objects.keys()].some((key) => key.startsWith(PREFIX))).toBe(false);
    expect(r2.objects.has(`flipbooks/${OTHER}/manifest.json`)).toBe(true);
    expect(r2.objects.has("journeys/site/hero.webp")).toBe(true);
    expect(r2.objects.has("flipbooks/index.json")).toBe(true);
    const deletes = r2.log.filter((line) => line.startsWith("DELETE"));
    expect(deletes[0]).toBe(`DELETE ${PREFIX}manifest.json`);
    expect(progress.at(-1)).toMatchObject({ done: 9, total: 9 });
  });

  it("succeeds with 0 for a book that is not in the bucket", async () => {
    await expect(deleteBookFolder(client(), ID)).resolves.toEqual({ deleted: 0 });
  });

  it.each(["", "flipbooks", "..", "89dbed3b", `${ID}/..`, ID.toUpperCase()])(
    "refuses %j without touching the bucket",
    async (id) => {
      const error = await errorOf(deleteBookFolder(client(), id));
      expect(error.code).toBe("INVALID_BOOK");
      expect(r2.log).toEqual([]);
    },
  );
});
