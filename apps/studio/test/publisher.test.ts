import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BookRecord, FlipbookIndex, PublishSite } from "@vipgroup/shared";
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
/** The GO Experience bucket, and the VIP Destinations one. */
let r2: FakeR2;
let r2v: FakeR2;
let publisher: Publisher;

const bucketOf = (site: PublishSite) => (site === "goexperience" ? r2 : r2v);

const client = (site: PublishSite) =>
  createR2Client(
    {
      endpoint: "https://acc123.r2.cloudflarestorage.com",
      bucket: site,
      credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "SECRETTEST" },
    },
    { fetch: bucketOf(site).fetch, sleep: async () => {} },
  );

const storedIndex = (bucket: FakeR2 = r2): FlipbookIndex =>
  JSON.parse(new TextDecoder().decode(bucket.objects.get(INDEX_KEY)!.body)) as FlipbookIndex;

const putIndex = (index: unknown, bucket: FakeR2 = r2) =>
  bucket.objects.set(INDEX_KEY, {
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
  r2 = createFakeR2({ bucket: "goexperience" });
  r2v = createFakeR2({ bucket: "vipdestinations" });
  publisher = new Publisher({ repo, flipbooksDir, client, now: () => NOW, progressIntervalMs: 0 });
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("publish", () => {
  it("uploads the book, then lists it in index.json, keeping the other entries", async () => {
    await addBook();
    putIndex({ version: 1, books: [handWritten] });

    const started = await publisher.publish(ID, ["goexperience"]);
    expect(started.publication).toEqual({
      action: "publish",
      site: "goexperience",
      done: 0,
      total: 0,
    });
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
    expect(done.sites).toEqual({ goexperience: { publishedAt: NOW.toISOString() } });
    expect(done.publication).toBeUndefined();
    expect(done.publicationError).toBeUndefined();
    expect(r2v.log).toEqual([]);
  });

  it("creates index.json when there is none yet", async () => {
    await addBook();
    await publisher.publish(ID, ["goexperience"]);
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
    await publisher.publish(ID, ["goexperience"]);
    await publisher.idle();
    expect(seen[0]).toBe("0/0");
    expect(seen.at(-1)).toBe("9/9");
  });

  it("refuses at once a book still converting, one already busy, and missing R2 keys", async () => {
    await addBook({ status: "converting" });
    await expect(publisher.publish(ID, ["goexperience"])).rejects.toMatchObject({
      code: "NOT_READY",
    });

    await repo.updateBook(ID, {
      status: "ready",
      publication: { action: "publish", site: "vipdestinations", done: 1, total: 9 },
    });
    await expect(publisher.publish(ID, ["goexperience"])).rejects.toMatchObject({
      code: "BOOK_BUSY",
    });

    await repo.updateBook(ID, { publication: undefined });
    const unconfigured = new Publisher({
      repo,
      flipbooksDir,
      client: () => {
        throw new R2Error("NOT_CONFIGURED", "Missing environment variables: R2_ACCOUNT_ID");
      },
    });
    await expect(unconfigured.publish(ID, ["goexperience"])).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
    expect((await book()).publication).toBeUndefined();
    expect(r2.log).toEqual([]);
  });

  it("stops before sending anything when another published book has the same slug", async () => {
    await addBook({ slug: "posts" });
    putIndex({ version: 1, books: [handWritten] });
    await publisher.publish(ID, ["goexperience"]);
    await publisher.idle();

    expect(r2.log.some((line) => line.startsWith(`PUT ${PREFIX}`))).toBe(false);
    const failed = await book();
    expect(failed.publicationError?.code).toBe("INDEX_CONFLICT");
    expect(failed.publicationError?.message).toMatch(/dépubliez-le/);
    expect(failed.publication).toBeUndefined();
    expect(failed.sites).toBeUndefined();
  });

  it("never overwrites an index.json it cannot read", async () => {
    await addBook();
    r2.objects.set(INDEX_KEY, { body: new TextEncoder().encode("{ broken"), contentType: "x" });
    await publisher.publish(ID, ["goexperience"]);
    await publisher.idle();
    expect((await book()).publicationError?.code).toBe("INDEX_INVALID");
    expect(new TextDecoder().decode(r2.objects.get(INDEX_KEY)!.body)).toBe("{ broken");
  });

  it("leaves the book unpublished when R2 refuses the keys mid-way", async () => {
    await addBook();
    r2.failNext.push(404); // the index read: no list yet
    r2.failNext.push(403); // the first file
    await publisher.publish(ID, ["goexperience"]);
    await publisher.idle();
    const failed = await book();
    expect(failed.publicationError).toMatchObject({ code: "ACCESS_DENIED", site: "goexperience" });
    expect(failed.sites).toBeUndefined();
    expect(r2.objects.has(INDEX_KEY)).toBe(false);
  });

  it("runs operations one after the other", async () => {
    await addBook();
    await publisher.publish(ID, ["goexperience"]);
    await publisher.idle();
    await publisher.unpublish(ID, "goexperience");
    await expect(publisher.unpublish(ID, "goexperience")).rejects.toMatchObject({
      code: "BOOK_BUSY",
    });
    await publisher.idle();
    expect((await book()).sites).toBeUndefined();
  });
});

describe("unpublish", () => {
  it("removes the book from index.json first, then its files", async () => {
    await addBook();
    putIndex({ version: 1, books: [handWritten] });
    await publisher.publish(ID, ["goexperience"]);
    await publisher.idle();
    r2.log.length = 0;

    const started = await publisher.unpublish(ID, "goexperience");
    expect(started.publication).toMatchObject({ action: "unpublish", site: "goexperience" });
    await publisher.idle();

    expect(storedIndex().books).toEqual([handWritten]);
    const firstDelete = r2.log.findIndex((line) => line.startsWith("DELETE"));
    expect(r2.log.indexOf(`PUT ${INDEX_KEY}`)).toBeLessThan(firstDelete);
    expect([...r2.objects.keys()].some((key) => key.startsWith(PREFIX))).toBe(false);
    const done = await book();
    expect(done.sites).toBeUndefined();
    expect(done.publication).toBeUndefined();
  });

  it("refuses a book that is not online on that site", async () => {
    await addBook({ sites: { goexperience: { publishedAt: NOW.toISOString() } } });
    await expect(publisher.unpublish(ID, "vipdestinations")).rejects.toMatchObject({
      code: "NOT_PUBLISHED",
    });
  });
});

describe("two sites", () => {
  it("publishes to each chosen site, in its own bucket and list, one after the other", async () => {
    await addBook();
    putIndex({ version: 1, books: [handWritten] });

    const seen: string[] = [];
    const original = repo.updateBook.bind(repo);
    repo.updateBook = async (id, patch) => {
      const step = patch.publication;
      if (step) seen.push(`${step.site} ${step.done}/${step.total} [${step.waiting ?? ""}]`);
      return original(id, patch);
    };
    const started = await publisher.publish(ID, ["vipdestinations", "goexperience"]);
    // PUBLISH_SITES order; the record names the site waiting its turn.
    expect(started.publication).toMatchObject({
      site: "goexperience",
      waiting: ["vipdestinations"],
    });
    await publisher.idle();
    expect(seen[0]).toBe("goexperience 0/0 [vipdestinations]");
    expect(seen).toContain("goexperience 9/9 [vipdestinations]");
    expect(seen).toContain("vipdestinations 0/0 []");
    expect(seen.at(-1)).toBe("vipdestinations 9/9 []");

    for (const bucket of [r2, r2v]) {
      expect(bucket.objects.has(`${PREFIX}pages/002-zoom.webp`)).toBe(true);
      expect(storedIndex(bucket).books.at(-1)).toMatchObject({ id: ID, slug: "brochure-ete" });
    }
    expect(storedIndex(r2).books[0]).toEqual(handWritten);
    expect(storedIndex(r2v).books).toHaveLength(1);
    const done = await book();
    expect(done.sites).toEqual({
      goexperience: { publishedAt: NOW.toISOString() },
      vipdestinations: { publishedAt: NOW.toISOString() },
    });
    expect(done.publication).toBeUndefined();
  });

  it("checks slugs and short ids against each site's own list", async () => {
    await addBook({ slug: "posts" }); // "posts" is taken on GO Experience only
    putIndex({ version: 1, books: [handWritten] });
    await publisher.publish(ID, ["vipdestinations"]);
    await publisher.idle();
    expect((await book()).sites).toEqual({ vipdestinations: { publishedAt: NOW.toISOString() } });
    expect(r2.log.filter((line) => line.startsWith("PUT"))).toEqual([]);
  });

  it("stops at the first failing site; the sites done before stay online", async () => {
    await addBook();
    r2v.failNext.push(403); // VIP Destinations refuses the keys (bucket not in the token)
    await publisher.publish(ID, ["goexperience", "vipdestinations"]);
    await publisher.idle();
    const failed = await book();
    expect(failed.sites).toEqual({ goexperience: { publishedAt: NOW.toISOString() } });
    expect(failed.publicationError).toMatchObject({
      code: "ACCESS_DENIED",
      site: "vipdestinations",
    });
    expect(failed.publication).toBeUndefined();
    expect(r2v.objects.size).toBe(0);
  });

  it("unpublishes from one site and keeps the book on the other", async () => {
    await addBook();
    await publisher.publish(ID, ["goexperience", "vipdestinations"]);
    await publisher.idle();
    await publisher.unpublish(ID, "goexperience");
    await publisher.idle();

    expect(storedIndex(r2).books).toEqual([]);
    expect([...r2.objects.keys()].some((key) => key.startsWith(PREFIX))).toBe(false);
    expect(storedIndex(r2v).books).toMatchObject([{ id: ID }]);
    expect(r2v.objects.has(`${PREFIX}manifest.json`)).toBe(true);
    expect((await book()).sites).toEqual({ vipdestinations: { publishedAt: NOW.toISOString() } });
  });

  it("keeps a site's first publication date when the book is published there again", async () => {
    const first = "2026-10-01T08:00:00.000Z";
    await addBook({ sites: { goexperience: { publishedAt: first } } });
    await publisher.publish(ID, ["goexperience", "vipdestinations"]);
    await publisher.idle();
    expect((await book()).sites).toEqual({
      goexperience: { publishedAt: first },
      vipdestinations: { publishedAt: NOW.toISOString() },
    });
    expect(storedIndex(r2).books[0]?.publishedAt).toBe(first);
  });

  it("refuses an empty or unknown list of sites", async () => {
    await addBook();
    await expect(publisher.publish(ID, [])).rejects.toMatchObject({ code: "NO_SITE" });
    const unknown = ["elsewhere"] as unknown as PublishSite[];
    await expect(publisher.publish(ID, unknown)).rejects.toMatchObject({ code: "NO_SITE" });
    await expect(publisher.unpublish(ID, unknown[0]!)).rejects.toMatchObject({ code: "NO_SITE" });
    expect((await book()).publication).toBeUndefined();
  });
});

describe("around publishing", () => {
  it("refuses to delete a book that is online or being published", async () => {
    await addBook({ sites: { vipdestinations: { publishedAt: NOW.toISOString() } } });
    const refusal = await deleteBook(repo, flipbooksDir, ID).catch((e: unknown) => e);
    expect(isLibraryError(refusal) && refusal.code).toBe("BOOK_PUBLISHED");

    await repo.updateBook(ID, {
      sites: undefined,
      publication: { action: "publish", site: "goexperience", done: 0, total: 0 },
    });
    const busy = await deleteBook(repo, flipbooksDir, ID).catch((e: unknown) => e);
    expect(isLibraryError(busy) && busy.code).toBe("BOOK_BUSY");
  });

  it("clears a publication cut short by a stop, keeping where it stood", async () => {
    await addBook({
      sites: { vipdestinations: { publishedAt: NOW.toISOString() } },
      publication: { action: "unpublish", site: "vipdestinations", done: 3, total: 9 },
    });
    const report = await reconcileLibrary(repo, {
      flipbooksDir,
      uploadsDir: path.join(work, "uploads"),
    });
    expect(report.publicationsInterrupted).toEqual([ID]);
    const cleared = await book();
    expect(cleared.publication).toBeUndefined();
    expect(cleared.sites).toEqual({ vipdestinations: { publishedAt: NOW.toISOString() } });
    expect(cleared.publicationError).toMatchObject({
      code: "INTERRUPTED",
      site: "vipdestinations",
    });
    expect(cleared.publicationError?.message).toMatch(/Dépublication interrompue/);
  });
});
