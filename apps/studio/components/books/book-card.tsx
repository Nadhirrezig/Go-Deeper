import Link from "next/link";
import { PUBLISH_SITE_NAMES, publishedSites } from "@vipgroup/shared";
import type { BookRecord } from "@vipgroup/shared";
import { coverUrl, formatDate, pageCountLabel } from "../../lib/format";

/** One flipbook in a folder page: cover, title, pages and date, or its conversion state. */
export function BookCard({
  book,
  onDelete,
}: {
  book: BookRecord;
  onDelete: (book: BookRecord) => void;
}) {
  const online = publishedSites(book).map((site) => PUBLISH_SITE_NAMES[site]);
  const progress = book.progress;
  const percent = progress?.total ? (progress.page / progress.total) * 100 : 0;
  return (
    <article className="glass flex flex-col overflow-hidden rounded-3xl">
      <Link
        href={`/flipbooks/${book.id}`}
        className="relative grid aspect-[4/5] place-items-center bg-white/40"
        aria-label={`Ouvrir « ${book.title} »`}
      >
        {book.status === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- served as-is by the /files route
          <img
            src={coverUrl(book.id, book.pageCount)}
            alt=""
            className="h-full w-full object-contain p-3"
            loading="lazy"
          />
        ) : (
          <span className="flex w-2/3 flex-col gap-2" aria-hidden="true">
            {[86, 92, 64, 88, 42].map((w) => (
              <i
                key={w}
                className="block h-1.5 rounded-full bg-zinc-900/10"
                style={{ width: `${w}%` }}
              />
            ))}
          </span>
        )}
      </Link>
      <div className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium" title={book.title}>
            {book.title}
          </h3>
          {online.length > 0 && (
            <span
              className="shrink-0 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
              title={`En ligne sur ${online.join(" et ")}`}
            >
              En ligne
              {online.length > 1 && ` · ${online.length}`}
              <span className="sr-only"> sur {online.join(" et ")}</span>
            </span>
          )}
        </div>
        {book.status === "ready" && (
          <p className="font-mono text-xs text-muted-foreground">
            {pageCountLabel(book.pageCount)} · {formatDate(book.createdAt)}
          </p>
        )}
        {book.status === "converting" && (
          <>
            <div
              role="progressbar"
              aria-label={`Conversion de « ${book.title} »`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
              className="h-1.5 overflow-hidden rounded-full bg-zinc-900/10"
            >
              <div
                className="h-full bg-zinc-900 transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {progress?.total ? `Conversion ${progress.page}/${progress.total}` : "Conversion…"}
            </p>
          </>
        )}
        {book.status === "failed" && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-danger">
              Échec : {book.error?.message ?? "conversion impossible"}
            </p>
            <button
              type="button"
              className="shrink-0 text-xs font-medium underline"
              onClick={() => onDelete(book)}
            >
              Supprimer
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
