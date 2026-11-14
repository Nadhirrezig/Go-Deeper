"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Folder } from "@vipgroup/shared";
import {
  createFolderAction,
  deleteFolderAction,
  renameFolderAction,
} from "../app/flipbooks/actions";
import { buttonClass, inputClass } from "./ui/button";
import { Modal } from "./ui/modal";

const NAME_MAX = 60;

/** What a folder's `···` menu (or the new-folder tile) opened. */
export type FolderDialog =
  | { kind: "new-folder" }
  | { kind: "rename"; folder: Folder }
  | { kind: "delete"; folder: Folder; bookCount: number; isLast: boolean }
  | { kind: "upload"; folder: Folder };

interface NameFormProps {
  initial: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

function NameForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: NameFormProps) {
  const [name, setName] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Select the current name, ready to be typed over.
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const tooLong = name.trim().length > NAME_MAX;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name);
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Nom du dossier</span>
        <input
          ref={inputRef}
          className={inputClass}
          value={name}
          maxLength={NAME_MAX + 20}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(error) || tooLong}
          aria-describedby="folder-name-help"
        />
        <span
          id="folder-name-help"
          className={error || tooLong ? "text-danger" : "text-muted-foreground"}
          role={error ? "alert" : undefined}
        >
          {error ?? `${name.trim().length} / ${NAME_MAX} caractères`}
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClass.ghost} onClick={onCancel}>
          Annuler
        </button>
        <button
          type="submit"
          className={buttonClass.primary}
          disabled={pending || name.trim().length === 0 || tooLong}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

interface FolderDialogsProps {
  dialog: FolderDialog | null;
  onClose: () => void;
  /** After a folder was created or renamed. */
  onSaved?: (folder: Folder) => void;
  /** After a folder was deleted. */
  onDeleted?: (folder: Folder) => void;
}

/** The folder modals: new folder, rename, delete. (Upload is UploadDialog.) */
export function FolderDialogs({ dialog, onClose, onSaved, onDeleted }: FolderDialogsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setError(null);
    onClose();
  };

  const saveName = (name: string) => {
    if (!dialog || (dialog.kind !== "new-folder" && dialog.kind !== "rename")) return;
    startTransition(async () => {
      const result =
        dialog.kind === "new-folder"
          ? await createFolderAction(name)
          : await renameFolderAction(dialog.folder.id, name);
      if (!result.ok) return setError(result.error.message);
      close();
      onSaved?.(result.value);
    });
  };

  const remove = () => {
    if (dialog?.kind !== "delete") return;
    startTransition(async () => {
      const result = await deleteFolderAction(dialog.folder.id);
      if (!result.ok) return setError(result.error.message);
      close();
      onDeleted?.(dialog.folder);
    });
  };

  return (
    <>
      <Modal open={dialog?.kind === "new-folder"} title="Nouveau dossier" onClose={close}>
        {dialog?.kind === "new-folder" && (
          <NameForm
            initial=""
            submitLabel="Créer"
            pending={pending}
            error={error}
            onSubmit={saveName}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal open={dialog?.kind === "rename"} title="Renommer le dossier" onClose={close}>
        {dialog?.kind === "rename" && (
          <NameForm
            key={dialog.folder.id}
            initial={dialog.folder.name}
            submitLabel="Renommer"
            pending={pending}
            error={error}
            onSubmit={saveName}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === "delete"}
        title={dialog?.kind === "delete" ? `Supprimer « ${dialog.folder.name} » ?` : ""}
        onClose={close}
      >
        {dialog?.kind === "delete" && (
          <DeleteBody
            dialog={dialog}
            pending={pending}
            error={error}
            onDelete={remove}
            onCancel={close}
          />
        )}
      </Modal>
    </>
  );
}

function DeleteBody({
  dialog,
  pending,
  error,
  onDelete,
  onCancel,
}: {
  dialog: Extract<FolderDialog, { kind: "delete" }>;
  pending: boolean;
  error: string | null;
  onDelete: () => void;
  onCancel: () => void;
}) {
  // Say up front why it cannot be deleted, instead of offering a button that fails.
  const blocked =
    dialog.bookCount > 0
      ? "Supprimez d’abord les flipbooks de ce dossier."
      : dialog.isLast
        ? "Le dernier dossier ne peut pas être supprimé."
        : null;
  return (
    <div className="flex flex-col gap-4">
      <p
        className={blocked || error ? "text-sm text-danger" : "text-sm text-muted-foreground"}
        role={blocked || error ? "alert" : undefined}
      >
        {error ?? blocked ?? "Le dossier est vide. Cette action est définitive."}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClass.ghost} onClick={onCancel}>
          {blocked ? "Fermer" : "Annuler"}
        </button>
        {!blocked && (
          <button
            type="button"
            className={buttonClass.danger}
            disabled={pending}
            onClick={onDelete}
          >
            Supprimer
          </button>
        )}
      </div>
    </div>
  );
}
