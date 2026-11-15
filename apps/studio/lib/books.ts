import { removeBookFolder } from "./library/book-files";
import { LibraryError } from "./library/errors";
import type { LibraryRepository } from "./library/repository";

/**
 * Remove a book: its record and its folder on disk. Refused while it is converting, being
 * published, or online (it must be unpublished first, so R2 keeps no orphan files).
 */
export async function deleteBook(
  repo: LibraryRepository,
  flipbooksDir: string,
  id: string,
): Promise<void> {
  const book = await repo.getBook(id);
  if (!book) throw new LibraryError("NOT_FOUND", "Ce flipbook n’existe plus.");
  if (book.status === "converting") {
    throw new LibraryError(
      "BOOK_BUSY",
      "Ce flipbook est en cours de conversion : attendez la fin pour le supprimer.",
    );
  }
  if (book.publication) {
    throw new LibraryError(
      "BOOK_BUSY",
      "Une publication de ce flipbook est en cours : attendez la fin pour le supprimer.",
    );
  }
  if (book.publishedAt) {
    throw new LibraryError(
      "BOOK_PUBLISHED",
      "Ce flipbook est en ligne : dépubliez-le avant de le supprimer.",
    );
  }
  await repo.deleteBook(id);
  await removeBookFolder(flipbooksDir, id);
}
