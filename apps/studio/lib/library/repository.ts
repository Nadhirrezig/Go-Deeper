import { isValidSlug, uniqueSlug } from "@vipgroup/shared";
import type { BookRecord, Folder } from "@vipgroup/shared";
import { LibraryError } from "./errors";

/** Name of the folder created on first run, and where books found on disk are added. */
export const DEFAULT_FOLDER_NAME = "Général";
export const FOLDER_NAME_MAX = 60;

export type NewBook = Omit<BookRecord, "createdAt"> & { createdAt?: string };
export type BookPatch = Partial<Omit<BookRecord, "id" | "createdAt">>;

/**
 * Folders and book records of the studio. Every page, action and route goes through this
 * interface; step 6 swaps the JSON file for PostgreSQL behind it.
 */
export interface LibraryRepository {
  /** All folders, oldest first. Creates "Général" first if there is none (never empty). */
  listFolders(): Promise<Folder[]>;
  getFolder(id: string): Promise<Folder | null>;
  /** Name: 1–60 characters, unique (case-insensitive). Gets the next artwork in order. */
  createFolder(name: string): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<Folder>;
  /** Refused when the folder holds books or is the last one. */
  deleteFolder(id: string): Promise<void>;

  /** Books, newest first; only one folder's when `folderId` is given. */
  listBooks(filter?: { folderId?: string }): Promise<BookRecord[]>;
  getBook(id: string): Promise<BookRecord | null>;
  /** The folder must exist and the slug be unique across all books. */
  createBook(book: NewBook): Promise<BookRecord>;
  updateBook(id: string, patch: BookPatch): Promise<BookRecord>;
  deleteBook(id: string): Promise<void>;
  /** Slugs used by every book (for suggestions). */
  slugsInUse(): Promise<Set<string>>;
}

/** Trim and collapse inner whitespace. */
export function cleanFolderName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

const sameName = (a: string, b: string): boolean =>
  a.toLocaleLowerCase("fr") === b.toLocaleLowerCase("fr");

/** Throws NAME_INVALID / NAME_TAKEN; returns the cleaned name. */
export function checkFolderName(
  name: string,
  folders: readonly Folder[],
  exceptId?: string,
): string {
  const clean = cleanFolderName(name);
  if (clean.length < 1 || clean.length > FOLDER_NAME_MAX) {
    throw new LibraryError(
      "NAME_INVALID",
      `Le nom doit contenir entre 1 et ${FOLDER_NAME_MAX} caractères.`,
    );
  }
  if (folders.some((folder) => folder.id !== exceptId && sameName(folder.name, clean))) {
    throw new LibraryError("NAME_TAKEN", "Un dossier porte déjà ce nom.");
  }
  return clean;
}

/** Newest first, then by title for books added in the same millisecond. */
export function newestFirst(a: BookRecord, b: BookRecord): number {
  return b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title, "fr");
}

/**
 * Throws SLUG_INVALID, or SLUG_TAKEN with a free slug to offer instead (`books` are the other
 * books of the library; `exceptId` is the book being renamed).
 */
export function checkSlug(
  slug: string,
  books: readonly Pick<BookRecord, "id" | "slug">[],
  exceptId?: string,
): void {
  if (!isValidSlug(slug)) {
    throw new LibraryError(
      "SLUG_INVALID",
      "Le slug ne peut contenir que des lettres minuscules, des chiffres et des tirets.",
    );
  }
  const taken = new Set(books.filter((book) => book.id !== exceptId).map((book) => book.slug));
  if (taken.has(slug)) {
    throw new LibraryError(
      "SLUG_TAKEN",
      "Ce slug est déjà utilisé par un autre flipbook.",
      uniqueSlug(slug, taken),
    );
  }
}
