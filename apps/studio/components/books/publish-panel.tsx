"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BookRecord, PublishSite } from "@vipgroup/shared";
import { publishBookAction, unpublishBookAction } from "../../app/flipbooks/actions";
import type { ActionResult } from "../../app/flipbooks/actions";
import { formatDate } from "../../lib/format";
import type { PublicSite } from "../../lib/publish/sites";
import { buttonClass } from "../ui/button";
import { Modal } from "../ui/modal";
import { useLiveBooks } from "../use-live-books";

type Action = () => Promise<ActionResult<BookRecord>>;

/**
 * The flipbook page's "Publication" card: one row per site (GO Experience, VIP Destinations)
 * with its status, progress, share link, "Voir sur le site" and "Dépublier". "Publier…" opens a
 * window to tick the sites to publish to. Progress comes from the book record, polled while an
 * operation runs (useLiveBooks).
 */
export function PublishPanel({ book, sites }: { book: BookRecord; sites: PublicSite[] }) {
  const router = useRouter();
  const [live = book] = useLiveBooks([book]);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<PublishSite[]>([]);
  const [unpublishing, setUnpublishing] = useState<PublicSite | null>(null);

  const run = (action: Action) =>
    startTransition(async () => {
      setActionError(null);
      const result = await action();
      if (!result.ok) setActionError(result.error.message);
      router.refresh();
    });

  const isOnline = (site: PublishSite) => live.sites?.[site] !== undefined;
  const offline = sites.filter((site) => !isOnline(site.id));
  const busy = live.publication !== undefined;
  const canPublish = live.status === "ready" && !busy && !pending && offline.length > 0;

  const openWindow = () => {
    // The first site the book is not on yet is ticked; the team adds the others.
    setChosen(offline.slice(0, 1).map((site) => site.id));
    setChoosing(true);
  };
  const toggle = (site: PublishSite, on: boolean) =>
    setChosen((current) => (on ? [...current, site] : current.filter((value) => value !== site)));

  return (
    <section
      className="glass flex flex-col gap-5 rounded-3xl p-6"
      aria-labelledby="publish-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="publish-heading" className="text-lg font-semibold">
            Publication
          </h2>
          <p className="text-sm text-muted-foreground">
            {live.status === "ready"
              ? "Les sites affichent les changements d’ici une minute."
              : "Disponible à la publication après la conversion."}
          </p>
        </div>
        <button
          type="button"
          className={buttonClass.primary}
          disabled={!canPublish}
          title={
            live.status === "ready" && offline.length === 0
              ? "Ce flipbook est en ligne sur tous les sites."
              : undefined
          }
          onClick={openWindow}
        >
          Publier…
        </button>
      </div>

      <ul className="flex flex-col gap-3">
        {sites.map((site) => (
          <SiteRow
            key={site.id}
            book={live}
            site={site}
            disabled={pending || busy}
            onUnpublish={() => setUnpublishing(site)}
          />
        ))}
      </ul>

      {actionError && (
        <p className="text-sm text-danger" role="alert">
          {actionError}
        </p>
      )}

      <Modal
        open={choosing}
        title={`Publier « ${live.title} »`}
        description="Choisissez les sites où le flipbook doit apparaître."
        onClose={() => setChoosing(false)}
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (chosen.length === 0) return;
            setChoosing(false);
            run(() => publishBookAction(live.id, chosen));
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Sites</legend>
            {sites.map((site) => {
              const online = isOnline(site.id);
              return (
                <label
                  key={site.id}
                  className={
                    "flex items-center gap-3 rounded-2xl border border-border bg-white/60 px-4 py-3 " +
                    (online ? "opacity-60" : "cursor-pointer hover:bg-white/80")
                  }
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-zinc-900"
                    checked={online || chosen.includes(site.id)}
                    disabled={online}
                    onChange={(event) => toggle(site.id, event.target.checked)}
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">{site.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {online ? `${site.host} · déjà en ligne` : site.host}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass.ghost} onClick={() => setChoosing(false)}>
              Annuler
            </button>
            <button type="submit" className={buttonClass.primary} disabled={chosen.length === 0}>
              Publier
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={unpublishing !== null}
        title={`Dépublier « ${live.title} » de ${unpublishing?.name ?? ""} ?`}
        onClose={() => setUnpublishing(null)}
      >
        <p className="text-sm text-muted-foreground">
          Le flipbook disparaît de {unpublishing?.host} d’ici une minute et ses fichiers y sont
          supprimés de Cloudflare R2. Il reste dans le studio et sur les autres sites : vous pourrez
          le publier à nouveau.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.ghost} onClick={() => setUnpublishing(null)}>
            Annuler
          </button>
          <button
            type="button"
            className={buttonClass.danger}
            disabled={pending}
            onClick={() => {
              const site = unpublishing;
              setUnpublishing(null);
              if (site) run(() => unpublishBookAction(live.id, site.id));
            }}
          >
            Dépublier
          </button>
        </div>
      </Modal>
    </section>
  );
}

/** One site of the card: status, progress while it is being worked on, links, its last error. */
function SiteRow({
  book,
  site,
  disabled,
  onUnpublish,
}: {
  book: BookRecord;
  site: PublicSite;
  disabled: boolean;
  onUnpublish: () => void;
}) {
  const publication = book.publication?.site === site.id ? book.publication : undefined;
  const waiting = book.publication?.waiting?.includes(site.id) ?? false;
  const publishedAt = book.sites?.[site.id]?.publishedAt;
  const error =
    !publication && book.publicationError?.site === site.id ? book.publicationError : undefined;
  const percent = publication?.total ? (publication.done / publication.total) * 100 : 0;
  const headingId = `publish-${site.id}`;

  const status = publication
    ? publication.action === "publish"
      ? "Publication en cours…"
      : "Dépublication en cours…"
    : waiting
      ? "En attente : publication après le site précédent"
      : publishedAt
        ? `En ligne depuis le ${formatDate(publishedAt)}`
        : "Pas en ligne";

  return (
    <li
      className="flex flex-col gap-3 rounded-2xl border border-border bg-white/40 p-4"
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h3 id={headingId} className="font-medium">
            {site.name} <span className="font-normal text-muted-foreground">· {site.host}</span>
          </h3>
          <p className="flex items-center gap-2 text-sm" aria-live="polite">
            <span
              aria-hidden="true"
              className={
                "size-2 shrink-0 rounded-full " +
                (publication || waiting
                  ? "bg-amber-500"
                  : publishedAt
                    ? "bg-emerald-600"
                    : "bg-zinc-300")
              }
            />
            {status}
          </p>
        </div>
        {publishedAt && !publication && (
          <div className="flex flex-wrap gap-2">
            <a
              href={site.page}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass.secondary}
              aria-label={`Voir sur le site ${site.name}`}
            >
              Voir sur le site
            </a>
            <button
              type="button"
              className={buttonClass.secondary + " text-danger"}
              disabled={disabled}
              aria-label={`Dépublier de ${site.name}`}
              onClick={onUnpublish}
            >
              Dépublier
            </button>
          </div>
        )}
      </div>

      {publication && (
        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-label={
              publication.action === "publish"
                ? `Publication de « ${book.title} » sur ${site.name}`
                : `Dépublication de « ${book.title} » de ${site.name}`
            }
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
            {publication.total
              ? `${publication.done}/${publication.total} fichiers`
              : "Préparation…"}
          </p>
        </div>
      )}

      {publishedAt && !publication && (
        <p className="text-sm">
          Lien à partager :{" "}
          <code className="font-mono text-[13px] break-all select-all">{site.share}</code>
        </p>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error.message}
        </p>
      )}
    </li>
  );
}
