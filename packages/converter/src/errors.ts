export type ConverterErrorCode =
  | "INVALID_PDF"
  | "PASSWORD_PROTECTED"
  | "EMPTY_PDF"
  | "TOO_MANY_PAGES"
  | "OUT_DIR_EXISTS"
  | "ABORTED";

/** Expected, user-facing conversion failure. `message` is one clear line. */
export class ConverterError extends Error {
  readonly code: ConverterErrorCode;

  constructor(code: ConverterErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConverterError";
    this.code = code;
  }
}

export function isConverterError(error: unknown): error is ConverterError {
  return error instanceof ConverterError;
}
