import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { childProcessRunner, defaultWorkerPath } from "../lib/conversion/child-runner";
import { ConversionFailure } from "../lib/conversion/errors";
import { ConversionQueue } from "../lib/conversion/queue";
import type { ConversionJob, RunConversion } from "../lib/conversion/queue";
import { JsonLibraryRepository } from "../lib/library/json-repository";

let work: string;
let flipbooksDir: string;
let uploadsDir: string;
let repo: JsonLibraryRepository;
let folderId: string;

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "vgf-queue-"));
  flipbooksDir = path.join(work, "flipbooks");
  uploadsDir = path.join(work, "uploads");
  await mkdir(uploadsDir, { recursive: true });
  repo = new JsonLibraryRepository(path.join(work, "library.json"));
  folderId = (await repo.listFolders())[0]!.id;
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

async function addJob(id: string): Promise<ConversionJob> {
  const uploadPath = path.join(uploadsDir, `${id}.pdf`);
  await writeFile(uploadPath, "%PDF-1.4");
  await repo.createBook({
    id,
    folderId,
    title: id,
    slug: id,
    status: "converting",
    progress: { page: 0, total: 0 },
  });
  return { bookId: id, uploadPath, title: id, slug: id };
}

/** A fake conversion: reports pages, writes a book folder, or fails. */
function fakeRun(log: string[], fail: Record<string, string> = {}): RunConversion {
  return async (job, { outDir, onProgress }) => {
    log.push(`start ${job.bookId}`);
    for (let page = 1; page <= 3; page++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      onProgress(page, 3);
    }
    log.push(`end ${job.bookId}`);
    if (fail[job.bookId]) throw new ConversionFailure(fail[job.bookId]!);
    await mkdir(path.join(outDir, job.bookId), { recursive: true });
    await writeFile(path.join(outDir, job.bookId, "manifest.json"), "{}");
    return { pageCount: 3 };
  };
}

describe("ConversionQueue", () => {
  it("runs one job at a time, in order", async () => {
    const log: string[] = [];
    const queue = new ConversionQueue({ repo, flipbooksDir, run: fakeRun(log) });
    queue.enqueue(await addJob("a"));
    queue.enqueue(await addJob("b"));
    expect(queue.pending).toBe(2);
    await queue.idle();
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
    expect(queue.pending).toBe(0);
  });

  it("records progress while converting, then ready with page count and size", async () => {
    const seen: string[] = [];
    const run: RunConversion = async (job, context) => {
      for (let page = 1; page <= 3; page++) {
        context.onProgress(page, 3);
        await new Promise((resolve) => setTimeout(resolve, 20));
        const book = await repo.getBook(job.bookId);
        seen.push(`${book?.progress?.page}/${book?.progress?.total}`);
      }
      await mkdir(path.join(context.outDir, job.bookId), { recursive: true });
      await writeFile(path.join(context.outDir, job.bookId, "x.webp"), "1234567890");
      return { pageCount: 3 };
    };
    const queue = new ConversionQueue({ repo, flipbooksDir, run, progressIntervalMs: 0 });
    queue.enqueue(await addJob("a"));
    await queue.idle();
    expect(seen).toEqual(["1/3", "2/3", "3/3"]);
    const book = await repo.getBook("a");
    expect(book).toMatchObject({ status: "ready", pageCount: 3, sizeBytes: 10 });
    expect(book?.progress).toBeUndefined();
  });

  it("marks a failed conversion failed with a French message, and goes on", async () => {
    const log: string[] = [];
    const queue = new ConversionQueue({
      repo,
      flipbooksDir,
      run: fakeRun(log, { a: "PASSWORD_PROTECTED" }),
    });
    queue.enqueue(await addJob("a"));
    queue.enqueue(await addJob("b"));
    await queue.idle();
    expect(await repo.getBook("a")).toMatchObject({
      status: "failed",
      error: { code: "PASSWORD_PROTECTED", message: "Ce PDF est protégé par un mot de passe." },
    });
    expect((await repo.getBook("b"))?.status).toBe("ready");
  });

  it("deletes the uploaded PDF whatever happens", async () => {
    const queue = new ConversionQueue({
      repo,
      flipbooksDir,
      run: fakeRun([], { b: "INVALID_PDF" }),
    });
    queue.enqueue(await addJob("a"));
    queue.enqueue(await addJob("b"));
    await queue.idle();
    expect(await readdir(uploadsDir)).toEqual([]);
  });
});

// Real child process, with the converter's built worker (skipped before `pnpm build`).
const workerPath = defaultWorkerPath();
describe.skipIf(!existsSync(workerPath))("childProcessRunner", () => {
  it("converts in a separate process and reports progress", async () => {
    const pdf = minimalPdf();
    const uploadPath = path.join(uploadsDir, "real.pdf");
    await writeFile(uploadPath, pdf);
    const progress: string[] = [];
    const result = await childProcessRunner(workerPath)(
      { bookId: "real", uploadPath, title: "Réel", slug: "reel" },
      { outDir: flipbooksDir, onProgress: (page, total) => progress.push(`${page}/${total}`) },
    );
    expect(result).toEqual({ pageCount: 1 });
    expect(progress).toEqual(["1/1"]);
    expect(existsSync(path.join(flipbooksDir, "real", "manifest.json"))).toBe(true);
  }, 60_000);

  it("turns converter errors into French failures", async () => {
    const uploadPath = path.join(uploadsDir, "bad.pdf");
    await writeFile(uploadPath, "%PDF-1.4 but nothing else");
    const failure = await childProcessRunner(workerPath)(
      { bookId: "bad", uploadPath, title: "Bad", slug: "bad" },
      { outDir: flipbooksDir, onProgress: () => undefined },
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConversionFailure);
    expect(failure).toMatchObject({
      code: "INVALID_PDF",
      message: "Ce fichier n’est pas un PDF valide.",
    });
  }, 60_000);
});

/** A one-page PDF with correct cross-reference offsets. */
function minimalPdf(): string {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 280] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length 44 >>\nstream\nBT /F1 18 Tf 20 200 Td (Bonjour) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}
