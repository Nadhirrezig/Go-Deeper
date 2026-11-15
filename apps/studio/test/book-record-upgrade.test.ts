import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BookRecord } from "@vipgroup/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonLibraryRepository } from "../lib/library/json-repository";
import { upgradeBookRecord } from "../lib/library/repository";

/** Records stored before step 7, when a book could only be on goexperience.travel. */
const legacy = (fields: Record<string, unknown>): BookRecord =>
  ({
    id: "b1",
    folderId: "f1",
    title: "Brochure",
    slug: "brochure",
    status: "ready",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...fields,
  }) as unknown as BookRecord;

describe("upgradeBookRecord", () => {
  it("reads publishedAt as published on GO Experience", () => {
    const upgraded = upgradeBookRecord(legacy({ publishedAt: "2026-11-01T09:00:00.000Z" }));
    expect(upgraded.sites).toEqual({ goexperience: { publishedAt: "2026-11-01T09:00:00.000Z" } });
    expect(upgraded).not.toHaveProperty("publishedAt");
  });

  it("gives an operation or a failure without a site to GO Experience", () => {
    const upgraded = upgradeBookRecord(
      legacy({
        publication: { action: "publish", done: 2, total: 9 },
        publicationError: { code: "NETWORK", message: "…" },
      }),
    );
    expect(upgraded.publication).toEqual({
      action: "publish",
      site: "goexperience",
      done: 2,
      total: 9,
    });
    expect(upgraded.publicationError).toEqual({
      code: "NETWORK",
      message: "…",
      site: "goexperience",
    });
  });

  it("leaves a current record as it is", () => {
    const current = legacy({
      sites: { vipdestinations: { publishedAt: "2026-11-15T09:00:00.000Z" } },
      publication: { action: "unpublish", site: "vipdestinations", done: 0, total: 0 },
    });
    expect(upgradeBookRecord(current)).toBe(current);
    const draft = legacy({});
    expect(upgradeBookRecord(draft)).toBe(draft);
  });
});

describe("library.json written before step 7", () => {
  let work: string;
  beforeEach(async () => {
    work = await mkdtemp(path.join(tmpdir(), "vgf-upgrade-"));
  });
  afterEach(() => rm(work, { recursive: true, force: true }));

  it("is read in the new shape and rewritten in it on the next change", async () => {
    const file = path.join(work, "library.json");
    const folder = {
      id: "f1",
      name: "Général",
      art: "aurora",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        folders: [folder],
        books: [legacy({ publishedAt: "2026-11-01T09:00:00.000Z" })],
        nextArt: 1,
      }),
    );
    const repo = new JsonLibraryRepository(file);
    expect((await repo.getBook("b1"))?.sites).toEqual({
      goexperience: { publishedAt: "2026-11-01T09:00:00.000Z" },
    });

    await repo.updateBook("b1", { title: "Brochure été" });
    const stored = JSON.parse(await readFile(file, "utf8")) as { books: Record<string, unknown>[] };
    expect(stored.books[0]).not.toHaveProperty("publishedAt");
    expect(stored.books[0]!.sites).toEqual({
      goexperience: { publishedAt: "2026-11-01T09:00:00.000Z" },
    });
  });
});
