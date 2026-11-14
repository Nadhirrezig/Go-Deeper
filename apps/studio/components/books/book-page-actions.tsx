"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookRecord } from "@vipgroup/shared";
import { buttonClass } from "../ui/button";
import { DeleteBookDialog } from "./delete-book-dialog";

/** "Supprimer" on the flipbook page; goes back to the folder afterwards. */
export function DeleteBookButton({ book }: { book: BookRecord }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={buttonClass.secondary + " text-danger"}
        disabled={book.status === "converting"}
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
