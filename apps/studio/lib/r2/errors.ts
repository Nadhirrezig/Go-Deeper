export type R2ErrorCode =
  | "NOT_CONFIGURED"
  | "ACCESS_DENIED"
  | "UPSTREAM"
  | "NETWORK"
  | "INVALID_BOOK"
  | "MISSING_FILE"
  | "INCOMPLETE"
  | "INDEX_INVALID"
  | "INDEX_CONFLICT";

/** French messages for the team (shown by the Publier / Dépublier actions in S7). */
const MESSAGES: Record<R2ErrorCode, string> = {
  NOT_CONFIGURED:
    "La connexion à Cloudflare R2 n’est pas configurée : renseignez les variables R2_ du fichier .env.",
  ACCESS_DENIED: "Cloudflare R2 refuse les clés : vérifiez le jeton R2 du fichier .env.",
  UPSTREAM: "Cloudflare R2 n’a pas pu traiter la demande. Réessayez dans un instant.",
  NETWORK: "Impossible de joindre Cloudflare R2. Vérifiez la connexion internet.",
  INVALID_BOOK: "Ce flipbook est incomplet : son manifest est absent ou illisible.",
  MISSING_FILE: "Un fichier de ce flipbook est introuvable sur le PC du studio.",
  INCOMPLETE: "L’envoi vers Cloudflare R2 est incomplet. Réessayez.",
  INDEX_INVALID:
    "La liste des flipbooks du site (flipbooks/index.json) est illisible : elle n’a pas été modifiée.",
  INDEX_CONFLICT:
    "Un autre flipbook publié utilise déjà ce slug ou cette adresse courte : dépubliez-le d’abord.",
};

const BRAND = Symbol.for("vipgroup.studio.R2Error");

/** A Cloudflare R2 operation failed. `message` is French; `detail` says what happened, for logs. */
export class R2Error extends Error {
  readonly [BRAND] = true;
  readonly code: R2ErrorCode;
  readonly detail: string;
  /** HTTP status from R2, when there was one. */
  readonly status?: number;

  constructor(code: R2ErrorCode, detail: string, status?: number) {
    super(MESSAGES[code]);
    this.name = "R2Error";
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

/** Not `instanceof`: Next.js can load this module twice (see LibraryError). */
export const isR2Error = (error: unknown): error is R2Error =>
  error instanceof Error && (error as { [BRAND]?: boolean })[BRAND] === true;
