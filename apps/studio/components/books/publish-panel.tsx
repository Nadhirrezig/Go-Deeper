"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BookRecord } from "@vipgroup/shared";
import { publishBookAction, unpublishBookAction } from "../../app/flipbooks/actions";
import type { ActionResult } from "../../app/flipbooks/actions";
import { formatDate } from "../../lib/format";
import { publicBookUrls } from "../../lib/publish/site";
import { buttonClass } from "../ui/button";
import { Modal } from "../ui/modal";
import { useLiveBooks } from "../use-live-books";

type Action = (id: string) => Promise<ActionResult<BookRecord>>;

/**
 * The flipbook page's "Site goexperience.travel" card: publish the book, follow the upload,
 * see where it is online, unpublish it. Progress comes from the book record, polled while an
 * operation runs (useLiveBooks).
 */
export function PublishPanel({ book, siteUrl }: { book: BookRecord; siteUrl: string }) {
  const router = useRouter();
  const [live = book] = useLiveBooks([book]);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = (action: Action) =>
    startTransition(async () => {
      setActionError(null);
      const result = await action(live.id);
      if (!result.ok) setActionError(result.error.message);
      router.refresh();
    });

  const { publication, publishedAt } = live;
  const urls = publicBookUrls(siteUrl, live.id);
  const error = actionError ?? live.publicationError?.message;
  const percent = publication?.total ? (publication.done / publication.total) * 100 : 0;

  const status = publication
    ? publication.action === "publish"
      ? "Publication en cours…"
      : "Dépublication en cours…"
    : publishedAt
      ? `En ligne depuis le ${formatDate(publishedAt)}. Le site affiche les changements d’ici une minute.`
      : live.status === "ready"
        ? "Pas encore en ligne."
        : "Disponible à la publication après la conversion.";

  return (
    <section
      className="glass flex flex-col gap-4 rounded-3xl p-6"
      aria-labelledby="publish-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="publish-heading" className="text-lg font-semibold">
            Site goexperience.travel
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {status}
          </p>
        </div>
        {!publication && (
          <div className="flex flex-wrap gap-2">
            {publishedAt ? (
              <>
                <a
                  href={urls.page}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass.secondary}
                >
                  Voir sur le site
                </a>
                <button
                  type="button"
                  className={buttonClass.secondary + " text-danger"}
                  disabled={pending}
                  onClick={() => setConfirming(true)}
                >
                  Dépublier
                </button>
              </>
            ) : (
              <button
                type="button"
                className={buttonClass.primary}
                disabled={pending || live.status !== "ready"}
                onClick={() => run(publishBookAction)}
              >
                Publier sur le site
              </button>
            )}
          </div>
        )}
      </div>

      {publication && (
        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-label={
              publication.action === "publish"
                ? `Publication de « ${live.title} »`
                : `Dépublication de « ${live.title} »`
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
          <code className="font-mono text-[13px] break-all select-all">{urls.share}</code>
        </p>
      )}

      {error && !publication && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Modal
        open={confirming}
        title={`Dépublier « ${live.title} » ?`}
        onClose={() => setConfirming(false)}
      >
        <p className="text-sm text-muted-foreground">
          Le flipbook disparaît du site d’ici une minute et ses fichiers sont supprimés de
          Cloudflare R2. Il reste dans le studio : vous pourrez le publier à nouveau.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.ghost} onClick={() => setConfirming(false)}>
            Annuler
          </button>
          <button
            type="button"
            className={buttonClass.danger}
            disabled={pending}
            onClick={() => {
              setConfirming(false);
              run(unpublishBookAction);
            }}
          >
            Dépublier
          </button>
        </div>
      </Modal>
    </section>
  );
}
