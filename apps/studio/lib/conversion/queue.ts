import { rm } from "node:fs/promises";
import path from "node:path";
import { folderSize } from "../library/book-files";
import type { LibraryRepository } from "../library/repository";
import { ConversionFailure, conversionMessage } from "./errors";

export interface ConversionJob {
  /** Book record id, also the book folder name. */
  bookId: string;
  /** Uploaded PDF, deleted when the job ends (the converter keeps `original.pdf`). */
  uploadPath: string;
  title: string;
  slug: string;
}

export interface RunContext {
  outDir: string;
  onProgress: (page: number, total: number) => void;
}

/** Converts one book; rejects with a ConversionFailure. */
export type RunConversion = (
  job: ConversionJob,
  context: RunContext,
) => Promise<{ pageCount: number }>;

export interface ConversionQueueOptions {
  repo: LibraryRepository;
  flipbooksDir: string;
  run: RunConversion;
  /** Progress is written to the library at most this often (and always for the last page). */
  progressIntervalMs?: number;
}

/**
 * Conversions run one at a time, in upload order. Each job updates its BookRecord:
 * progress while it runs, then "ready" (page count, size on disk) or "failed" (French
 * message). The uploaded PDF is deleted whatever happens.
 */
export class ConversionQueue {
  private readonly waiting: ConversionJob[] = [];
  private current: ConversionJob | null = null;
  private drained: Promise<void> = Promise.resolve();
  private resolveDrained: (() => void) | null = null;

  constructor(private readonly options: ConversionQueueOptions) {}

  /** Add a job; it starts when the jobs before it are done. */
  enqueue(job: ConversionJob): void {
    this.waiting.push(job);
    if (!this.current) {
      this.drained = new Promise((resolve) => (this.resolveDrained = resolve));
      void this.next();
    }
  }

  /** Jobs not finished yet (running one included). */
  get pending(): number {
    return this.waiting.length + (this.current ? 1 : 0);
  }

  /** Resolves once every job queued so far is finished. */
  idle(): Promise<void> {
    return this.drained;
  }

  private async next(): Promise<void> {
    const job = this.waiting.shift();
    if (!job) {
      this.current = null;
      this.resolveDrained?.();
      this.resolveDrained = null;
      return;
    }
    this.current = job;
    await this.process(job);
    await this.next();
  }

  private async process(job: ConversionJob): Promise<void> {
    const { repo, flipbooksDir, run, progressIntervalMs = 500 } = this.options;
    let lastWrite = 0;
    let progressWrites: Promise<unknown> = Promise.resolve();
    const onProgress = (page: number, total: number): void => {
      const now = Date.now();
      if (page < total && now - lastWrite < progressIntervalMs) return;
      lastWrite = now;
      progressWrites = progressWrites.then(() =>
        repo.updateBook(job.bookId, { progress: { page, total } }).catch(() => undefined),
      );
    };

    try {
      const { pageCount } = await run(job, { outDir: flipbooksDir, onProgress });
      await progressWrites;
      const sizeBytes = await folderSize(path.join(flipbooksDir, job.bookId)).catch(
        () => undefined,
      );
      await repo.updateBook(job.bookId, {
        status: "ready",
        pageCount,
        sizeBytes,
        progress: undefined,
        error: undefined,
      });
    } catch (error) {
      await progressWrites;
      const code = error instanceof ConversionFailure ? error.code : "UNEXPECTED";
      await repo
        .updateBook(job.bookId, {
          status: "failed",
          progress: undefined,
          error: { code, message: conversionMessage(code) },
        })
        .catch(() => undefined); // the record may have been removed meanwhile
    } finally {
      await rm(/*turbopackIgnore: true*/ job.uploadPath, {
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  }
}
