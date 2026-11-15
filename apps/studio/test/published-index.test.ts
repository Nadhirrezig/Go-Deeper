import type { FlipbookIndex, FlipbookIndexEntry } from "@vipgroup/shared";
import { describe, expect, it } from "vitest";
import { createR2Client } from "../lib/r2/client";
import { isR2Error } from "../lib/r2/errors";
import type { R2Error } from "../lib/r2/errors";
import {
  INDEX_KEY,
  parseIndex,
  readIndex,
  withBook,
  withoutBook,
  writeIndex,
} from "../lib/r2/published-index";
import { createFakeR2 } from "./r2-fake";

const entry = (overrides: Partial<FlipbookIndexEntry> = {}): FlipbookIndexEntry => ({
  slug: "brochure-ete",
  id: "a704986e-27f8-4e4e-b737-fe638c3ac410",
  title: "Brochure été",
  pageCount: 24,
  publishedAt: "2026-11-15T10:00:00.000Z",
  ...overrides,
});

/** The test book Nadhir listed by hand during S5. */
const handWritten = {
  slug: "posts",
  id: "89dbed3b-e38f-43be-9285-70e0331ede20",
  title: "Posts",
  pageCount: 10,
  publishedAt: "2026-11-15T10:00:00Z",
};

const thrown = (run: () => unknown): R2Error => {
  try {
    run();
  } catch (error) {
    expect(isR2Error(error)).toBe(true);
    return error as R2Error;
  }
  throw new Error("expected an R2Error");
};

describe("parseIndex", () => {
  it("reads no file as an empty list", () => {
    expect(parseIndex(null)).toEqual({ version: 1, books: [] });
  });

  it("reads a list, with a byte-order mark too", () => {
    const text = JSON.stringify({ version: 1, books: [handWritten] });
    expect(parseIndex(text).books).toEqual([handWritten]);
    expect(parseIndex(`﻿${text}`).books).toEqual([handWritten]);
  });

  it.each(["", "{", "[]", '{"version":2,"books":[]}', '{"version":1}'])(
    "refuses %j with INDEX_INVALID",
    (text) => {
      expect(thrown(() => parseIndex(text)).code).toBe("INDEX_INVALID");
    },
  );
});

describe("withBook / withoutBook", () => {
  const index: FlipbookIndex = { version: 1, books: [handWritten] };

  it("adds a book after the others, keeping them as they are", () => {
    expect(withBook(index, entry()).books).toEqual([handWritten, entry()]);
  });

  it("replaces the entry of the same book", () => {
    const once = withBook(index, entry());
    const again = withBook(once, entry({ title: "Nouveau titre" }));
    expect(again.books).toEqual([handWritten, entry({ title: "Nouveau titre" })]);
  });

  it("refuses another book with the same slug or short id", () => {
    expect(thrown(() => withBook(index, entry({ slug: "posts" }))).code).toBe("INDEX_CONFLICT");
    const sameShortId = entry({ id: "89dbed3b-0000-4000-8000-000000000000" });
    expect(thrown(() => withBook(index, sameShortId)).detail).toContain(handWritten.id);
  });

  it("removes a book, and changes nothing for a book not listed", () => {
    const both = withBook(index, entry());
    expect(withoutBook(both, entry().id).books).toEqual([handWritten]);
    expect(withoutBook(index, entry().id)).toEqual(index);
  });

  it("keeps fields it does not know", () => {
    const extended = { version: 1, books: [], note: "kept" } as unknown as FlipbookIndex;
    expect(withBook(extended, entry())).toMatchObject({ note: "kept" });
  });
});

describe("readIndex / writeIndex", () => {
  it("round-trips through R2 as readable JSON", async () => {
    const r2 = createFakeR2();
    const client = createR2Client(
      {
        endpoint: "https://acc123.r2.cloudflarestorage.com",
        bucket: "goexperience",
        credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "SECRETTEST" },
      },
      { fetch: r2.fetch },
    );
    expect(await readIndex(client)).toEqual({ version: 1, books: [] });
    await writeIndex(client, { version: 1, books: [entry()] });
    const stored = r2.objects.get(INDEX_KEY)!;
    expect(stored.contentType).toBe("application/json; charset=utf-8");
    expect(new TextDecoder().decode(stored.body)).toBe(
      `${JSON.stringify({ version: 1, books: [entry()] }, null, 2)}\n`,
    );
    expect(await readIndex(client)).toEqual({ version: 1, books: [entry()] });
  });
});
