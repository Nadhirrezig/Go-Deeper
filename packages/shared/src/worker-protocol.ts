/**
 * Messages between a parent process and `@vipgroup/converter/worker` (one conversion per child process,
 * so the ~1 GB a conversion can use is given back when the child exits).
 */

/** Parent → worker: convert one PDF. */
export interface WorkerJob {
  type: "convert";
  /** Path of the PDF to convert. */
  input: string;
  outDir: string;
  id: string;
  title: string;
  slug: string;
  maxPages?: number;
}

/** Worker → parent. The worker exits after "done" or "error". */
export type WorkerMessage =
  | { type: "progress"; page: number; total: number }
  | { type: "done"; pageCount: number; warnings: string[]; durationMs: number }
  | { type: "error"; code: string; message: string };
