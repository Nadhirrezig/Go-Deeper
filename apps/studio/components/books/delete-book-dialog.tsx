"use client";

import { useState, useTransition } from "react";
import type { BookRecord } from "@vipgroup/shared";
import { deleteBookAction } from "../../app/flipbooks/actions";
import { buttonClass } from "../ui/button";
import { Modal } from "../ui/modal";

interface DeleteBookDialogProps {
  book: BookRecord | null;
  onClose: () => void;
  onDeleted: (book: BookRecord) => void;
}

/** Confirm, then remove the record and the book folder on disk. */
export function DeleteBookDialog({ book, onClose, onDeleted }: DeleteBookDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setError(null);
    onClose();
  };
  return (
    <Modal open={book !== null} title={book ? `Supprimer « ${book.title} » ?` : ""} onClose={close}>
      <p
        className={error ? "text-sm text-danger" : "text-sm text-muted-foreground"}
        role={error ? "alert" : undefined}
      >
        {error ?? "Le flipbook et ses fichiers (pages, PDF) sont supprimés définitivement."}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClass.ghost} onClick={close}>
          Annuler
        </button>
        <button
          type="button"
          className={buttonClass.danger}
          disabled={pending}
          onClick={() =>
            book &&
            startTransition(async () => {
              const result = await deleteBookAction(book.id);
              if (!result.ok) return setError(result.error.message);
              close();
              onDeleted(book);
            })
          }
        >
          Supprimer
        </button>
      </div>
    </Modal>
  );
}
