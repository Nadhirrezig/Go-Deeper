"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookRecord, Folder } from "@vipgroup/shared";
import { BookCard } from "../books/book-card";
import { DeleteBookDialog } from "../books/delete-book-dialog";
import { FolderDialogs } from "../folder-dialogs";
import type { FolderDialog } from "../folder-dialogs";
import { Breadcrumb } from "../ui/breadcrumb";
import { buttonClass } from "../ui/button";
import { MenuButton } from "../ui/menu-button";
import { UploadDialog } from "../upload/upload-dialog";
import { useLiveBooks } from "../use-live-books";

interface FolderViewProps {
  folder: Folder;
  books: BookRecord[];
  isLastFolder: boolean;
  maxUploadMb: number;
}

/** /flipbooks/folders/[folderId]: every flipbook of the folder, newest first. */
export function FolderView({ folder, books, isLastFolder, maxUploadMb }: FolderViewProps) {
  const router = useRouter();
  const live = useLiveBooks(books);
  const [dialog, setDialog] = useState<FolderDialog | null>(null);
  const [toDelete, setToDelete] = useState<BookRecord | null>(null);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Breadcrumb
            items={[{ label: "Flipbooks", href: "/flipbooks" }, { label: folder.name }]}
          />
          <h1 className="truncate text-3xl font-semibold tracking-tight">{folder.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonClass.primary}
            onClick={() => setDialog({ kind: "upload", folder })}
          >
            Nouveau flipbook
          </button>
          <MenuButton
            label={`Plus d’options pour ${folder.name}`}
            actions={[
              { label: "Nouveau flipbook", onSelect: () => setDialog({ kind: "upload", folder }) },
              { label: "Renommer", onSelect: () => setDialog({ kind: "rename", folder }) },
              {
                label: "Supprimer",
                danger: true,
                onSelect: () =>
                  setDialog({
                    kind: "delete",
                    folder,
                    bookCount: live.length,
                    isLast: isLastFolder,
                  }),
              },
            ]}
          />
        </div>
      </header>

      {live.length === 0 ? (
        <p className="glass rounded-3xl p-8 text-center text-muted-foreground">
          Ce dossier est vide. Ajoutez un PDF avec « Nouveau flipbook ».
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-6">
          {live.map((book) => (
            <li key={book.id}>
              <BookCard book={book} onDelete={setToDelete} />
            </li>
          ))}
        </ul>
      )}

      <FolderDialogs
        dialog={dialog?.kind === "upload" ? null : dialog}
        onClose={() => setDialog(null)}
        onDeleted={() => router.push("/flipbooks")}
      />
      <UploadDialog
        folder={dialog?.kind === "upload" ? dialog.folder : null}
        onClose={() => setDialog(null)}
        maxUploadMb={maxUploadMb}
      />
      <DeleteBookDialog
        book={toDelete}
        onClose={() => setToDelete(null)}
        onDeleted={() => router.refresh()}
      />
    </>
  );
}
