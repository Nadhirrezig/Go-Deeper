import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BookRecord, FlipbookIndex } from "@vipgroup/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteBook } from "../lib/books";
import { isLibraryError } from "../lib/library/errors";
import { JsonLibraryRepository } from "../lib/library/json-repository";
import { reconcileLibrary } from "../lib/library/startup";
import { Publisher } from "../lib/publish/publisher";
import { createR2Client } from "../lib/r2/client";
import { R2Error } from "../lib/r2/errors";
import { INDEX_KEY } from "../lib/r2/published-index";
import { writeBook } from "./book-fixture";
import { createFakeR2 } from "./r2-fake";
import type { FakeR2 } from "./r2-fake";

const ID = "a704986e-27f8-4e4e-b737-fe638c3ac410";
const PREFIX = `flipbooks/${ID}/`;
const NOW = new Date("2026-11-15T12:00:00.000Z");
const handWritten = {
  slug: "posts",
  id: "89dbed3b-e38f-43be-9285-70e0331ede20",
  title: "Posts",
  pageCount: 10,
  publishedAt: "2026-11-15T10:00:00Z",
};

let work: string;
let flipbooksDir: string;
let repo: JsonLibraryRepository;
let r2: FakeR2;
let publisher: Publisher;

const client = () =>
  createR2Client(
    {
      endpoint: "https://acc123.r2.cloudflarestorage.com",
      bucket: "goexperience",
      credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "SECRETTEST" },
    },
    { fetch: r2.fetch, sleep: async () => {} },
  );

const storedIndex = (): FlipbookIndex =>
  JSON.parse(new TextDecoder().decode(r2.objects.get(INDEX_KEY)!.body)) as FlipbookIndex;

const putIndex = (index: unknown) =>
  r2.objects.set(INDEX_KEY, {
    body: new TextEncoder().encode(JSON.stringify(index)),
    contentType: "application/json",
  });

async function addBook(patch: Partial<BookRecord> = {}): Promise<BookRecord> {
  const folder = (await repo.listFolders())[0]!;
  await writeBook(flipbooksDir, ID);
  return repo.createBook({
    id: ID,
    folderId: folder.id,
    title: "Brochure été",
    slug: "brochure-ete",
    status: "ready",
    pageCount: 2,
    ...patch,
  });
}

const book = async () => (await repo.getBook(ID))!;

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "vgf-publish-"));
  flipbooksDir = path.join(work, "flipbooks");
  repo = new JsonLibraryRepository(path.join(work, "library.json"));
  r2 = createFakeR2();
  publisher = new Publisher({ repo, flipbooksDir, client, now: () => NOW, progressIntervalMs: 0 });
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("publish", () => {
  it("uploads the book, then lists it in index.json, keeping the other entries", async () => {
    await addBook();
    putIndex({ version: 1, books: [handWritten] });

    const started = await publisher.publish(ID);
    expect(started.publication).toEqual({ action: "publish", done: 0, total: 0 });
    await publisher.idle();

    expect(r2.objects.has(`${PREFIX}manifest.json`)).toBe(true);
    expect(r2.objects.has(`${PREFIX}pages/002-zoom.webp`)).toBe(true);
    expect(storedIndex().books).toEqual([
      handWritten,
      {
        slug: "brochure-ete",
        id: ID,
        title: "Brochure été",
        pageCount: 2,
        publishedAt: NOW.toISOString(),
      },
    ]);
    const writes = r2.log.filter((line) => line.startsWith("PUT"));
    expect(writes.at(-1)).toBe(`PUT ${INDEX_KEY}`);
    expect(writes.at(-2)).toBe(`PUT ${PREFIX}manifest.json`);
    const done = await book();
    expect(done.publishedAt).toBe(NOW.toISOString());
    expect(done.publication).toBeUndefined();
    expect(done.publicationError).toBeUndefined();
  });

  it("creates index.json when there is none yet", async () => {
    await addBook();
    await publisher.publish(ID);
    await publisher.idle();
    expect(storedIndex()).toMatchObject({ version: 1, books: [{ id: ID }] });
  });

  it("records progress on the book while uploading", async () => {
    await addBook();
    const seen: string[] = [];
    const original = repo.updateBook.bind(repo);
    repo.updateBook = async (id, patch) => {
      if (patch.publication) seen.push(`${patch.publication.done}/${patch.publication.total}`);
      return original(id, patch);
    };
    await publisher.publish(ID);
    await publisher.idle();
    expect(seen[0]).toBe("0/0");
    expect(seen.at(-1)).toBe("9/9");
  });

  it("refuses at once a book still converting, one already busy, and missing R2 keys", async () => {
    await addBook({ status: "converting" });
    await expect(publisher.publish(ID)).rejects.toMatchObject({ code: "NOT_READY" });

    await repo.updateBook(ID, {
      status: "ready",
      publication: { action: "publish", done: 1, total: 9 },
    });
    await expect(publisher.publish(ID)).rejects.toMatchObject({ code: "BOOK_BUSY" });

    await repo.updateBook(ID, { publication: undefined });
    const unconfigured = new Publisher({
      repo,
      flipbooksDir,
      client: () => {
        throw new R2Error("NOT_CONFIGURED", "Missing environment variables: R2_ACCOUNT_ID");
      },
    });
    await expect(unconfigured.publish(ID)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect((await book()).publication).toBeUndefined();
    expect(r2.log).toEqual([]);
  });

  it("stops before sending anything when another published book has the same slug", async () => {
    await addBook({ slug: "posts" });
    putIndex({ version: 1, books: [handWritten] });
    await publisher.publish(ID);
    await publisher.idle();

    expect(r2.log.some((line) => line.startsWith(`PUT ${PREFIX}`))).toBe(false);
    const failed = await book();
    expect(failed.publicationError?.code).toBe("INDEX_CONFLICT");
    expect(failed.publicationError?.message).toMatch(/dépubliez-le/);
    expect(failed.publication).toBeUndefined();
    expect(failed.publishedAt).toBeUndefined();
  });

  it("never overwrites an index.json it cannot read", async () => {
    await addBook();
    r2.objects.set(INDEX_KEY, { body: new TextEncoder().encode("{ broken"), contentType: "x" });
    await publisher.publish(ID);
    await publisher.idle();
    expect((await book()).publicationError?.code).toBe("INDEX_INVALID");
    expect(new TextDecoder().decode(r2.objects.get(INDEX_KEY)!.body)).toBe("{ broken");
  });

  it("leaves the book unpublished when R2 refuses the keys mid-way", async () => {
    await addBook();
    r2.failNext.push(404); // the index read: no list yet
    r2.failNext.push(403); // the first file
    await publisher.publish(ID);
    await publisher.idle();
    const failed = await book();
    expect(failed.publicationError).toMatchObject({ code: "ACCESS_DENIED" });
    expect(failed.publishedAt).toBeUndefined();
    expect(r2.objects.has(INDEX_KEY)).toBe(false);
  });

  it("runs operations one after the other", async () => {
    await addBook();
    await publisher.publish(ID);
    await publisher.idle();
    await publisher.unpublish(ID);
    await expect(publisher.unpublish(ID)).rejects.toMatchObject({ code: "BOOK_BUSY" });
    await publisher.idle();
    expect((await book()).publishedAt).toBeUndefined();
  });
});

describe("unpublish", () => {
  it("removes the book from index.json first, then its files", async () => {
    await addBook();
    putIndex({ version: 1, books: [handWritten] });
    await publisher.publish(ID);
    await publisher.idle();
    r2.log.length = 0;

    const started = await publisher.unpublish(ID);
    expect(started.publication?.action).toBe("unpublish");
    await publisher.idle();

    expect(storedIndex().books).toEqual([handWritten]);
    const firstDelete = r2.log.findIndex((line) => line.startsWith("DELETE"));
    expect(r2.log.indexOf(`PUT ${INDEX_KEY}`)).toBeLessThan(firstDelete);
    expect([...r2.objects.keys()].some((key) => key.startsWith(PREFIX))).toBe(false);
    const done = await book();
    expect(done.publishedAt).toBeUndefined();
    expect(done.publication).toBeUndefined();
  });

  it("refuses a book that is not online", async () => {
    await addBook();
    await expect(publisher.unpublish(ID)).rejects.toMatchObject({ code: "NOT_PUBLISHED" });
  });
});

describe("around publishing", () => {
  it("refuses to delete a book that is online or being published", async () => {
    await addBook({ publishedAt: NOW.toISOString() });
    const refusal = await deleteBook(repo, flipbooksDir, ID).catch((e: unknown) => e);
    expect(isLibraryError(refusal) && refusal.code).toBe("BOOK_PUBLISHED");

    await repo.updateBook(ID, {
      publishedAt: undefined,
      publication: { action: "publish", done: 0, total: 0 },
    });
    const busy = await deleteBook(repo, flipbooksDir, ID).catch((e: unknown) => e);
    expect(isLibraryError(busy) && busy.code).toBe("BOOK_BUSY");
  });

  it("clears a publication cut short by a stop, keeping where it stood", async () => {
    await addBook({
      publishedAt: NOW.toISOString(),
      publication: { action: "unpublish", done: 3, total: 9 },
    });
    const report = await reconcileLibrary(repo, {
      flipbooksDir,
      uploadsDir: path.join(work, "uploads"),
    });
    expect(report.publicationsInterrupted).toEqual([ID]);
    const cleared = await book();
    expect(cleared.publication).toBeUndefined();
    expect(cleared.publishedAt).toBe(NOW.toISOString());
    expect(cleared.publicationError).toMatchObject({ code: "INTERRUPTED" });
    expect(cleared.publicationError?.message).toMatch(/Dépublication interrompue/);
  });
});
