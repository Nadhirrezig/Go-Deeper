"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BookRecord } from "@vipgroup/shared";

/** How often converting books are polled. */
export const POLL_INTERVAL_MS = 1000;

export async function fetchBook(id: string): Promise<BookRecord | null> {
  const response = await fetch(`/api/books/${id}`, { cache: "no-store" });
  if (!response.ok) return null;
  return ((await response.json()) as { book: BookRecord }).book;
}

/**
 * `books` with fresh progress for the ones converting: each is polled about once a second
 * (no websockets). When a conversion ends, the page's server data is refreshed.
 */
export function useLiveBooks(books: BookRecord[]): BookRecord[] {
  const router = useRouter();
  const [live, setLive] = useState<Record<string, BookRecord>>({});
  const converting = useMemo(
    () => books.filter((book) => book.status === "converting").map((book) => book.id),
    [books],
  );
  const key = converting.join(",");
  const refreshed = useRef(new Set<string>());

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    let stopped = false;
    const poll = async () => {
      const fresh = await Promise.all(ids.map((id) => fetchBook(id).catch(() => null)));
      if (stopped) return;
      const next: Record<string, BookRecord> = {};
      let ended = false;
      for (const book of fresh) {
        if (!book) continue;
        next[book.id] = book;
        if (book.status !== "converting" && !refreshed.current.has(book.id)) {
          refreshed.current.add(book.id);
          ended = true;
        }
      }
      setLive((current) => ({ ...current, ...next }));
      if (ended) router.refresh();
    };
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    void poll();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [key, router]);

  return books.map((book) => {
    const fresher = live[book.id];
    // Server data wins once it caught up (the poll result may be older than a refresh).
    return fresher && book.status === "converting" ? fresher : book;
  });
}
