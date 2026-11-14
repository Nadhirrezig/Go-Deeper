import { fork } from "node:child_process";
import path from "node:path";
import type { WorkerJob, WorkerMessage } from "@vipgroup/converter";
import { findRepoRoot } from "../storage";
import { ConversionFailure } from "./errors";
import type { RunConversion } from "./queue";

/** The converter's child-process entry, built by `pnpm build` (packages/converter/dist). */
export function defaultWorkerPath(): string {
  return path.join(findRepoRoot(process.cwd()), "packages", "converter", "dist", "worker.js");
}

/**
 * Run one conversion in a separate Node process. The process exits when the book is done,
 * which gives the memory the conversion used (up to ~1 GB) back to the system.
 */
export function childProcessRunner(workerPath: string = defaultWorkerPath()): RunConversion {
  return (job, context) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const settle = (action: () => void): void => {
        if (settled) return;
        settled = true;
        action();
      };
      const child = fork(/*turbopackIgnore: true*/ workerPath, [], {
        // Not Next's own flags (inspector, memory settings): a plain Node process.
        execArgv: [],
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      child.on("message", (message: WorkerMessage) => {
        if (message.type === "progress") context.onProgress(message.page, message.total);
        else if (message.type === "done") settle(() => resolve({ pageCount: message.pageCount }));
        else settle(() => reject(new ConversionFailure(message.code, message.message)));
      });
      child.on("error", (error) =>
        settle(() => reject(new ConversionFailure("CRASHED", String(error)))),
      );
      child.on("exit", (code, signal) =>
        settle(() => reject(new ConversionFailure("CRASHED", `exit ${code ?? signal}`))),
      );
      const message: WorkerJob = {
        type: "convert",
        input: job.uploadPath,
        outDir: context.outDir,
        id: job.bookId,
        title: job.title,
        slug: job.slug,
      };
      child.send(message);
    });
}
