import type { BookRecord, Folder } from "@vipgroup/shared";
import type { FolderFile } from "../ui/glass-folder";
import { coverUrl } from "../../lib/format";

/** GlassFolder fans out at most 4 sheets. */
export const MAX_SHEETS = 4;

/** Sheet meta line for a book. */
export function bookMeta(book: BookRecord): string {
  if (book.status === "converting") {
    return book.progress?.total
      ? `Conversion ${book.progress.page}/${book.progress.total}`
      : "Conversion…";
  }
  if (book.status === "failed") return "Échec";
  return book.pageCount ? `${book.pageCount} p.` : "";
}

/**
 * The sheets of a folder, back to front (GlassFolder puts the last one nearest the glass).
 * - Ready books show page 1's standard image as their cover (the thumb is too soft).
 * - A converting book is a plain sheet; its id changes when it is ready, so the finished
 *   flipbook drops into the folder.
 * - More than 4 books: the 3 most recent, then "Voir les N flipbooks" (the folder page).
 */
export function folderFiles(folder: Folder, books: readonly BookRecord[]): FolderFile[] {
  const inFolder = books
    .filter((book) => book.folderId === folder.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = inFolder.length > MAX_SHEETS ? inFolder.slice(0, MAX_SHEETS - 1) : inFolder;
  const files: FolderFile[] = shown.reverse().map((book) => ({
    id: `${book.id}:${book.status}`,
    name: book.title,
    meta: bookMeta(book),
    image: book.status === "ready" ? coverUrl(book.id, book.pageCount) : undefined,
    href: `/flipbooks/${book.id}`,
  }));
  if (inFolder.length > MAX_SHEETS) {
    files.push({
      id: `all:${folder.id}`,
      name: `Voir les ${inFolder.length} flipbooks`,
      href: `/flipbooks/folders/${folder.id}`,
    });
  }
  return files;
}
