"use client";

import { useRef, useState } from "react";
import type { BookRecord, Folder } from "@vipgroup/shared";
import { flipbookCount } from "../../lib/format";
import { FolderDialogs } from "../folder-dialogs";
import type { FolderDialog } from "../folder-dialogs";
import GlassFolder, { hashString } from "../ui/glass-folder";
import { NewFolderTile } from "../ui/new-folder-tile";
import { UploadDialog } from "../upload/upload-dialog";
import { folderWidthFor, useElementWidth } from "../use-element-width";
import { useLiveBooks } from "../use-live-books";
import { folderFiles } from "./folder-files";

interface FolderGridProps {
  folders: Folder[];
  books: BookRecord[];
}

/** The /flipbooks page: every folder, then the "new folder" tile. */
export function FolderGrid({ folders, books }: FolderGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const width = folderWidthFor(useElementWidth(gridRef));
  const live = useLiveBooks(books);
  const [dialog, setDialog] = useState<FolderDialog | null>(null);

  return (
    <>
      <div
        ref={gridRef}
        className="grid justify-center gap-x-10 gap-y-16 pt-14"
        style={{ gridTemplateColumns: `repeat(auto-fill, ${width}px)` }}
      >
        {folders.map((folder, index) => {
          const count = live.filter((book) => book.folderId === folder.id).length;
          return (
            <GlassFolder
              key={folder.id}
              label={folder.name}
              meta={flipbookCount(count)}
              art={folder.art}
              seed={hashString(folder.id) % 1000}
              files={folderFiles(folder, live)}
              action="more"
              width={width}
              appearDelay={Math.min(index, 8) * 70}
              menu={[
                {
                  label: "Nouveau flipbook",
                  onSelect: () => setDialog({ kind: "upload", folder }),
                },
                { label: "Renommer", onSelect: () => setDialog({ kind: "rename", folder }) },
                {
                  label: "Supprimer",
                  danger: true,
                  onSelect: () =>
                    setDialog({
                      kind: "delete",
                      folder,
                      bookCount: count,
                      isLast: folders.length <= 1,
                    }),
                },
              ]}
            />
          );
        })}
        <NewFolderTile width={width} onCreate={() => setDialog({ kind: "new-folder" })} />
      </div>

      <FolderDialogs
        dialog={dialog?.kind === "upload" ? null : dialog}
        onClose={() => setDialog(null)}
      />
      <UploadDialog
        folder={dialog?.kind === "upload" ? dialog.folder : null}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
