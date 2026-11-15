import { MAX_PDF_MB } from "@vipgroup/shared";

/** Maximum pages the converter accepts (its default). */
export const MAX_PAGES = 500;

/** French messages for converter and upload error codes, shown to the team. */
export const CONVERSION_MESSAGES: Record<string, string> = {
  INVALID_PDF: "Ce fichier n’est pas un PDF valide.",
  PASSWORD_PROTECTED: "Ce PDF est protégé par un mot de passe.",
  EMPTY_PDF: "Ce PDF ne contient aucune page.",
  TOO_LARGE: `Ce PDF dépasse la taille maximale (${MAX_PDF_MB} Mo).`,
  TOO_MANY_PAGES: `Ce PDF a trop de pages (${MAX_PAGES} au maximum).`,
  OUT_DIR_EXISTS: "Un flipbook existe déjà à cet emplacement.",
  ABORTED: "Conversion annulée.",
  INTERRUPTED: "Conversion interrompue",
  CRASHED: "La conversion s’est arrêtée de façon inattendue.",
  UNEXPECTED: "La conversion a échoué.",
};

export function conversionMessage(code: string): string {
  return CONVERSION_MESSAGES[code] ?? CONVERSION_MESSAGES.UNEXPECTED!;
}

/** A conversion that did not produce a book: `code` from the converter, French `message`. */
export class ConversionFailure extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(conversionMessage(code));
    this.name = "ConversionFailure";
    this.code = code;
    if (detail) this.cause = detail;
  }
}
