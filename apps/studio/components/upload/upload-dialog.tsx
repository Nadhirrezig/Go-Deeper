"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { slugify } from "@vipgroup/shared";
import type { Folder } from "@vipgroup/shared";
import { suggestSlugAction } from "../../app/flipbooks/actions";
import { buttonClass, inputClass } from "../ui/button";
import { Modal } from "../ui/modal";
import { DropZone } from "./drop-zone";
import { usePdfUpload } from "./use-pdf-upload";

interface UploadDialogProps {
  folder: Folder | null;
  onClose: () => void;
  /** MAX_UPLOAD_MB, to refuse big files before sending them. */
  maxUploadMb: number;
}

const titleFromFile = (name: string): string =>
  name
    .replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ")
    .trim() || "Sans titre";

/** "Nouveau flipbook": pick a PDF, set title and slug, upload, follow the conversion. */
export function UploadDialog({ folder, onClose, maxUploadMb }: UploadDialogProps) {
  // A new session (fresh form) each time the modal opens.
  const [session, setSession] = useState(0);
  const [openFor, setOpenFor] = useState<Folder | null>(null);
  if (folder !== openFor) {
    setOpenFor(folder);
    if (folder) setSession((n) => n + 1);
  }
  return (
    <Modal
      open={folder !== null}
      title="Nouveau flipbook"
      description={folder ? `Dans « ${folder.name} »` : undefined}
      onClose={onClose}
    >
      {/* An upload in progress carries on if the modal closes (see usePdfUpload). */}
      {folder && (
        <UploadFlow key={session} folder={folder} onClose={onClose} maxUploadMb={maxUploadMb} />
      )}
    </Modal>
  );
}

function UploadFlow({
  folder,
  onClose,
  maxUploadMb,
}: {
  folder: Folder;
  onClose: () => void;
  maxUploadMb: number;
}) {
  const { state, start } = usePdfUpload();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugNote, setSlugNote] = useState<{ text: string; suggestion?: string } | null>(null);
  const checkId = useRef(0);

  // Check the slug against the library (debounced). An automatic slug takes the free
  // suggestion silently; a slug typed by hand gets a "use this one" button.
  useEffect(() => {
    if (!slug) return;
    const id = ++checkId.current;
    const timer = window.setTimeout(async () => {
      const result = await suggestSlugAction(slug);
      if (id !== checkId.current) return;
      if (result.available) setSlugNote(null);
      else if (!slugEdited) {
        setSlug(result.slug);
        setSlugNote({ text: `Slug déjà utilisé : « ${result.slug} » est proposé.` });
      } else {
        setSlugNote({ text: "Ce slug est déjà utilisé.", suggestion: result.slug });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [slug, slugEdited]);

  const pick = (picked: File) => {
    const isPdf = picked.type === "application/pdf" || /\.pdf$/i.test(picked.name);
    if (!isPdf) return setFileError("Choisissez un fichier PDF.");
    if (picked.size > maxUploadMb * 1024 * 1024) {
      return setFileError(`Ce fichier dépasse la taille maximale (${maxUploadMb} Mo).`);
    }
    setFileError(null);
    setFile(picked);
    const nextTitle = titleFromFile(picked.name);
    setTitle(nextTitle);
    setSlugEdited(false);
    setSlug(slugify(nextTitle) || "flipbook");
  };

  if (state.phase === "uploading" || state.phase === "converting") {
    const progress = state.phase === "converting" ? state.book.progress : undefined;
    const percent =
      state.phase === "uploading"
        ? state.percent
        : progress?.total
          ? (progress.page / progress.total) * 100
          : 0;
    const line =
      state.phase === "uploading"
        ? `Envoi du fichier… ${state.percent} %`
        : progress?.total
          ? `Page ${progress.page} / ${progress.total}`
          : "Préparation de la conversion…";
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium">
          {state.phase === "uploading" ? "Envoi" : "Conversion"}
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-valuetext={line}
          className="h-2 overflow-hidden rounded-full bg-zinc-900/10"
        >
          <div
            className="h-full rounded-full bg-zinc-900 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
          {line}
        </p>
        <p className="text-sm text-muted-foreground">
          Vous pouvez fermer cette fenêtre : le flipbook apparaîtra dans son dossier une fois prêt.
        </p>
        <div className="flex justify-end">
          <button type="button" className={buttonClass.secondary} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "ready" || state.phase === "failed") {
    const ok = state.phase === "ready";
    return (
      <div className="flex flex-col gap-4">
        <p className={ok ? "text-sm" : "text-sm text-danger"} role={ok ? "status" : "alert"}>
          {ok ? `« ${state.book.title} » est prêt (${state.book.pageCount} pages).` : state.message}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.ghost} onClick={onClose}>
            Fermer
          </button>
          {state.book && (
            <Link
              href={`/flipbooks/${state.book.id}`}
              className={ok ? buttonClass.primary : buttonClass.secondary}
            >
              {ok ? "Ouvrir le flipbook" : "Voir le flipbook"}
            </Link>
          )}
        </div>
      </div>
    );
  }

  const rejected = state.phase === "rejected" ? state : null;
  const suggestion = rejected?.code === "SLUG_TAKEN" ? rejected.suggestion : slugNote?.suggestion;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (file) start({ file, folderId: folder.id, title: title.trim(), slug });
      }}
    >
      {!file ? (
        <DropZone onFile={pick} />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white/50 px-3 py-2 text-sm">
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            className="shrink-0 text-muted-foreground underline"
            onClick={() => setFile(null)}
          >
            Changer
          </button>
        </div>
      )}
      {(fileError || (rejected && rejected.code !== "SLUG_TAKEN")) && (
        <p className="text-sm text-danger" role="alert">
          {fileError ?? rejected?.message}
        </p>
      )}
      {file && (
        <>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Titre</span>
            <input
              className={inputClass}
              value={title}
              maxLength={200}
              onChange={(event) => {
                setTitle(event.target.value);
                if (!slugEdited) setSlug(slugify(event.target.value) || "flipbook");
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Slug</span>
            <input
              className={inputClass + " font-mono text-sm"}
              value={slug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value.toLowerCase());
              }}
              aria-describedby="slug-help"
            />
            <span
              id="slug-help"
              className={
                slugNote?.suggestion || rejected?.code === "SLUG_TAKEN"
                  ? "text-danger"
                  : "text-muted-foreground"
              }
            >
              {rejected?.code === "SLUG_TAKEN"
                ? rejected.message
                : (slugNote?.text ??
                  "Adresse du flipbook sur le site : lettres minuscules, chiffres et tirets.")}
              {suggestion && (
                <button
                  type="button"
                  className="ml-2 font-medium text-foreground underline"
                  onClick={() => {
                    setSlug(suggestion);
                    setSlugNote(null);
                  }}
                >
                  Utiliser « {suggestion} »
                </button>
              )}
            </span>
          </label>
        </>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClass.ghost} onClick={onClose}>
          Annuler
        </button>
        <button
          type="submit"
          className={buttonClass.primary}
          disabled={!file || !title.trim() || !slug || Boolean(slugNote?.suggestion)}
        >
          Convertir
        </button>
      </div>
    </form>
  );
}
