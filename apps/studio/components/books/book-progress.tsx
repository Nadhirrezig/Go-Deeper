"use client";

import type { BookRecord } from "@vipgroup/shared";
import { useLiveBooks } from "../use-live-books";

/** Live conversion progress on the flipbook page; the page refreshes when it is done. */
export function BookProgress({ book }: { book: BookRecord }) {
  const [live] = useLiveBooks([book]);
  const progress = live?.progress;
  const percent = progress?.total ? (progress.page / progress.total) * 100 : 0;
  const line = progress?.total
    ? `Page ${progress.page} / ${progress.total}`
    : "Préparation de la conversion…";
  return (
    <div className="glass flex flex-col gap-3 rounded-3xl p-8">
      <p className="font-medium">Conversion en cours</p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={line}
        className="h-2 overflow-hidden rounded-full bg-zinc-900/10"
      >
        <div
          className="h-full bg-zinc-900 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
        {line}
      </p>
    </div>
  );
}
