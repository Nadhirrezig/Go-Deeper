import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversionJob } from "../lib/conversion/queue";
import { JsonLibraryRepository } from "../lib/library/json-repository";
import { handleUpload, maxUploadBytes } from "../lib/upload";
import type { UploadErrorBody } from "../lib/upload";

let work: string;
let uploadsDir: string;
let repo: JsonLibraryRepository;
let folderId: string;
let jobs: ConversionJob[];

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "vgf-upload-"));
  uploadsDir = path.join(work, "uploads");
  repo = new JsonLibraryRepository(path.join(work, "library.json"));
  folderId = (await repo.listFolders())[0]!.id;
  jobs = [];
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** A request whose body arrives in several chunks, like a real upload. */
function upload(
  chunks: (string | Uint8Array)[],
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
): Request {
  const params = new URLSearchParams({
    folderId,
    title: "Brochure été",
    slug: "brochure-ete",
    ...query,
  });
  const encoder = new TextEncoder();
  const pulled: number[] = [];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[pulled.length];
      pulled.push(1);
      if (next === undefined) controller.close();
      else controller.enqueue(typeof next === "string" ? encoder.encode(next) : next);
    },
  });
  return new Request(`http://studio.test/api/upload?${params}`, {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
}

const deps = (maxBytes = 1000) => ({
  repo,
  enqueue: (job: ConversionJob) => jobs.push(job),
  uploadsDir,
  maxBytes,
  newId: () => "job-1",
});

const errorOf = async (response: Response) => ((await response.json()) as UploadErrorBody).error;

describe("POST /api/upload", () => {
  it("streams a PDF to uploads/, records the book as converting and queues it", async () => {
    const response = await handleUpload(upload(["%PD", "F-1.7 rest", " of the file"]), deps());
    expect(response.status).toBe(201);
    const { book } = (await response.json()) as { book: { id: string; status: string } };
    expect(book).toMatchObject({
      id: "job-1",
      status: "converting",
      folderId,
      slug: "brochure-ete",
    });
    const saved = path.join(uploadsDir, "job-1.pdf");
    expect(await readFile(saved, "utf8")).toBe("%PDF-1.7 rest of the file");
    expect(jobs).toEqual([
      { bookId: "job-1", uploadPath: saved, title: "Brochure été", slug: "brochure-ete" },
    ]);
  });

  it("refuses a file larger than the limit while streaming, and keeps nothing", async () => {
    const big = new Uint8Array(400).fill(65);
    const chunks: (string | Uint8Array)[] = ["%PDF-", big, big, big, big];
    const response = await handleUpload(upload(chunks), deps(1000));
    expect(response.status).toBe(413);
    expect((await errorOf(response)).message).toBe("Ce fichier dépasse la taille maximale (0 Mo).");
    expect(await readdir(uploadsDir)).toEqual([]);
    expect(jobs).toEqual([]);
    expect(await repo.listBooks()).toEqual([]);
  });

  it("refuses at once when Content-Length already says too large", async () => {
    const response = await handleUpload(
      upload(["%PDF-"], {}, { "content-length": "5000" }),
      deps(1000),
    );
    expect(response.status).toBe(413);
  });

  it("refuses files that do not start with %PDF- (e.g. a renamed .jpg)", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const response = await handleUpload(upload([jpeg]), deps());
    expect(response.status).toBe(415);
    expect((await errorOf(response)).message).toBe("Ce fichier n’est pas un PDF valide.");
    expect(await readdir(uploadsDir)).toEqual([]);
    // Also when the magic bytes are split across chunks, or the file is tiny.
    expect((await handleUpload(upload(["%P", "DX-1.4"]), deps())).status).toBe(415);
    expect((await handleUpload(upload(["%PD"]), deps())).status).toBe(415);
  });

  it("suggests a free slug when it is taken", async () => {
    await repo.createBook({ id: "a", folderId, title: "A", slug: "brochure-ete", status: "ready" });
    const response = await handleUpload(upload(["%PDF-1.7"]), deps());
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({
      code: "SLUG_TAKEN",
      suggestion: "brochure-ete-2",
    });
  });

  it("checks the folder, title and slug before reading the body", async () => {
    expect((await handleUpload(upload(["%PDF-"], { folderId: "nope" }), deps())).status).toBe(404);
    expect((await handleUpload(upload(["%PDF-"], { title: "  " }), deps())).status).toBe(400);
    expect((await handleUpload(upload(["%PDF-"], { slug: "Pas Bon" }), deps())).status).toBe(400);
  });

  it("reads the limit from MAX_UPLOAD_MB, 200 MB by default", () => {
    expect(maxUploadBytes({})).toBe(200 * 1024 * 1024);
    expect(maxUploadBytes({ MAX_UPLOAD_MB: "50" })).toBe(50 * 1024 * 1024);
    expect(maxUploadBytes({ MAX_UPLOAD_MB: "nope" })).toBe(200 * 1024 * 1024);
  });
});
