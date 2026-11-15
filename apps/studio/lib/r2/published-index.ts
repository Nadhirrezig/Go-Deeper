import { shortBookId } from "@vipgroup/shared";
import type { FlipbookIndex, FlipbookIndexEntry } from "@vipgroup/shared";
import type { R2Client } from "./client";
import { R2Error } from "./errors";

/**
 * flipbooks/index.json, the list of books goexperience.travel shows (CLAUDE.md, "Published
 * list"). The studio reads it, changes one entry and writes it back; entries it did not write
 * (e.g. a test book listed by hand) are kept as they are.
 */

export const INDEX_KEY = "flipbooks/index.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Fields of an entry, whatever else it holds (an entry written by hand may be odd). */
const entryId = (entry: unknown): unknown => (isRecord(entry) ? entry.id : undefined);
const entrySlug = (entry: unknown): unknown => (isRecord(entry) ? entry.slug : undefined);

/**
 * The list from the text of index.json; no file yet (null) is an empty list. A file that is not
 * a version 1 list throws INDEX_INVALID: it is never overwritten, so nothing written there by
 * hand is lost.
 */
export function parseIndex(text: string | null): FlipbookIndex {
  if (text === null) return { version: 1, books: [] };
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new R2Error("INDEX_INVALID", "index.json is not valid JSON");
  }
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.books)) {
    throw new R2Error("INDEX_INVALID", "index.json is not a version 1 list with a books array");
  }
  return data as unknown as FlipbookIndex;
}

/**
 * The list with `entry` added, or replacing the entry of the same book. Another book with the
 * same slug or the same short id (the site would show only one of them) throws INDEX_CONFLICT.
 */
export function withBook(index: FlipbookIndex, entry: FlipbookIndexEntry): FlipbookIndex {
  const others = index.books.filter((book) => entryId(book) !== entry.id);
  const clash = others.find((book) => {
    const id = entryId(book);
    return (
      entrySlug(book) === entry.slug ||
      (typeof id === "string" && shortBookId(id) === shortBookId(entry.id))
    );
  });
  if (clash) {
    throw new R2Error(
      "INDEX_CONFLICT",
      `Published book ${String(entryId(clash))} (${String(entrySlug(clash))}) has the slug or short id of ${entry.id} (${entry.slug})`,
    );
  }
  const listed = index.books.some((book) => entryId(book) === entry.id);
  return {
    ...index,
    books: listed
      ? index.books.map((book) => (entryId(book) === entry.id ? entry : book))
      : [...index.books, entry],
  };
}

/** The list without book `id` (unchanged when it is not listed). */
export function withoutBook(index: FlipbookIndex, id: string): FlipbookIndex {
  return { ...index, books: index.books.filter((book) => entryId(book) !== id) };
}

export async function readIndex(client: R2Client): Promise<FlipbookIndex> {
  return parseIndex(await client.getText(INDEX_KEY));
}

export async function writeIndex(client: R2Client, index: FlipbookIndex): Promise<void> {
  const body = new TextEncoder().encode(`${JSON.stringify(index, null, 2)}\n`);
  await client.putObject(INDEX_KEY, body, "application/json; charset=utf-8");
}
