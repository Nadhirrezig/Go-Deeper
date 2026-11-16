"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { publishedSites } from "@vipgroup/shared";
import type { BookRecord } from "@vipgroup/shared";
import { buttonClass } from "../ui/button";
import { DeleteBookDialog } from "./delete-book-dialog";

/**
 * "Supprimer" on the flipbook page; goes back to the folder afterwards. Off while the book
 * converts, is being published, or is online (it must be unpublished first).
 */
export function DeleteBookButton({ book }: { book: BookRecord }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const online = publishedSites(book).length > 0 || book.publication !== undefined;
  return (
    <>
      <button
        type="button"
        className={buttonClass.secondary + " text-danger"}
        disabled={book.status === "converting" || online}
        title={online ? "Dépubliez le flipbook avant de le supprimer." : undefined}
        onClick={() => setOpen(true)}
      >
        Supprimer
      </button>
      <DeleteBookDialog
        book={open ? book : null}
        onClose={() => setOpen(false)}
        onDeleted={() => router.push(`/flipbooks/folders/${book.folderId}`)}
      />
    </>
  );
}
