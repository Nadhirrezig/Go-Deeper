import { randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { isValidSlug, uniqueSlug } from "@vipgroup/shared";
import type { ConversionJob } from "./conversion/queue";
import { isLibraryError } from "./library/errors";
import type { LibraryRepository } from "./library/repository";

/** Default upload limit, overridable with MAX_UPLOAD_MB. */
export const DEFAULT_MAX_UPLOAD_MB = 200;
export const TITLE_MAX = 200;
const PDF_MAGIC = "%PDF-";

export function maxUploadBytes(env: Record<string, string | undefined> = process.env): number {
  const mb = Number(env.MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024;
}

export interface UploadDeps {
  repo: LibraryRepository;
  enqueue: (job: ConversionJob) => void;
  uploadsDir: string;
  maxBytes: number;
  newId?: () => string;
}

export interface UploadErrorBody {
  error: { code: string; message: string; suggestion?: string };
}

const json = (status: number, body: unknown): Response => Response.json(body, { status });

const fail = (status: number, code: string, message: string, suggestion?: string): Response =>
  json(status, { error: { code, message, suggestion } } satisfies UploadErrorBody);

const tooLarge = (maxBytes: number): Response =>
  fail(
    413,
    "TOO_LARGE",
    `Ce fichier dépasse la taille maximale (${Math.round(maxBytes / 1024 / 1024)} Mo).`,
  );
const notPdf = (): Response => fail(415, "INVALID_PDF", "Ce fichier n’est pas un PDF valide.");

/**
 * `POST /api/upload?folderId=…&title=…&slug=…` with the raw PDF as the body.
 *
 * The body is streamed to `<uploadsDir>/<id>.pdf` (never held in memory) and refused while
 * streaming when it grows past the limit or does not start with `%PDF-`. Then the book is
 * recorded as "converting" and its conversion queued. Answers 201 with the BookRecord.
 */
export async function handleUpload(request: Request, deps: UploadDeps): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const folderId = params.get("folderId") ?? "";
  const title = (params.get("title") ?? "").trim();
  const slug = params.get("slug") ?? "";

  if (!(await deps.repo.getFolder(folderId))) {
    return fail(404, "NOT_FOUND", "Ce dossier n’existe plus.");
  }
  if (title.length < 1 || title.length > TITLE_MAX) {
    return fail(400, "TITLE_INVALID", `Le titre doit contenir entre 1 et ${TITLE_MAX} caractères.`);
  }
  if (!isValidSlug(slug)) {
    return fail(
      400,
      "SLUG_INVALID",
      "Le slug ne peut contenir que des lettres minuscules, des chiffres et des tirets.",
    );
  }
  const taken = await deps.repo.slugsInUse();
  if (taken.has(slug)) {
    return fail(
      409,
      "SLUG_TAKEN",
      "Ce slug est déjà utilisé par un autre flipbook.",
      uniqueSlug(slug, taken),
    );
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > deps.maxBytes) return tooLarge(deps.maxBytes);
  if (!request.body) return notPdf();

  const id = (deps.newId ?? randomUUID)();
  const uploadPath = path.join(deps.uploadsDir, `${id}.pdf`);
  await mkdir(/*turbopackIgnore: true*/ deps.uploadsDir, { recursive: true });

  const refusal = await streamToFile(request.body, uploadPath, deps.maxBytes);
  if (refusal) {
    await rm(/*turbopackIgnore: true*/ uploadPath, { force: true });
    return refusal === "too-large" ? tooLarge(deps.maxBytes) : notPdf();
  }

  try {
    const book = await deps.repo.createBook({
      id,
      folderId,
      title,
      slug,
      status: "converting",
      progress: { page: 0, total: 0 },
    });
    deps.enqueue({ bookId: id, uploadPath, title, slug });
    return json(201, { book });
  } catch (error) {
    await rm(/*turbopackIgnore: true*/ uploadPath, { force: true });
    if (isLibraryError(error)) {
      const status = error.code === "SLUG_TAKEN" ? 409 : error.code === "NOT_FOUND" ? 404 : 400;
      return fail(status, error.code, error.message, error.suggestion);
    }
    throw error;
  }
}

/**
 * Copy `body` to `file` chunk by chunk. Stops (and cancels the upload) as soon as the size
 * passes `maxBytes` or the first bytes are not `%PDF-`.
 */
async function streamToFile(
  body: ReadableStream<Uint8Array>,
  file: string,
  maxBytes: number,
): Promise<"too-large" | "not-pdf" | null> {
  const handle = await open(/*turbopackIgnore: true*/ file, "w");
  const reader = body.getReader();
  let size = 0;
  let head = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return "too-large";
      }
      if (head.length < PDF_MAGIC.length) {
        head += Buffer.from(value.subarray(0, PDF_MAGIC.length - head.length)).toString("latin1");
        if (!PDF_MAGIC.startsWith(head.slice(0, PDF_MAGIC.length))) {
          await reader.cancel();
          return "not-pdf";
        }
      }
      await handle.write(value);
    }
    return head === PDF_MAGIC ? null : "not-pdf";
  } finally {
    await handle.close();
  }
}
