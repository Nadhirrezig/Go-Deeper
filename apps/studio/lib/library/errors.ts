export type LibraryErrorCode =
  | "NOT_FOUND"
  | "NAME_INVALID"
  | "NAME_TAKEN"
  | "FOLDER_NOT_EMPTY"
  | "LAST_FOLDER"
  | "SLUG_INVALID"
  | "SLUG_TAKEN"
  | "BOOK_BUSY";

/** A rule of the library was broken. `message` is French, ready to show to the team. */
export class LibraryError extends Error {
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

export const isLibraryError = (error: unknown): error is LibraryError =>
  error instanceof LibraryError;
