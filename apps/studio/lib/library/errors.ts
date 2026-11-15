export type LibraryErrorCode =
  | "NOT_FOUND"
  | "NAME_INVALID"
  | "NAME_TAKEN"
  | "FOLDER_NOT_EMPTY"
  | "LAST_FOLDER"
  | "SLUG_INVALID"
  | "SLUG_TAKEN"
  | "BOOK_BUSY"
  | "NOT_READY"
  | "BOOK_PUBLISHED"
  | "NOT_PUBLISHED";

/** A rule of the library was broken. `message` is French, ready to show to the team. */
const BRAND = Symbol.for("vipgroup.studio.LibraryError");

export class LibraryError extends Error {
  readonly [BRAND] = true;
  readonly code: LibraryErrorCode;
  /** For SLUG_TAKEN: a free slug to offer instead. */
  readonly suggestion?: string;

  constructor(code: LibraryErrorCode, message: string, suggestion?: string) {
    super(message);
    this.name = "LibraryError";
    this.code = code;
    this.suggestion = suggestion;
  }
}

/**
 * Not `instanceof`: Next.js can load this module twice (the services created at start-up and
 * a route or action bundle each get their own copy of the class), so check a shared brand.
 */
export const isLibraryError = (error: unknown): error is LibraryError =>
  error instanceof Error && (error as { [BRAND]?: boolean })[BRAND] === true;
