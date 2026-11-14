// Child-process entry: `fork("…/@vipgroup/converter/dist/worker.js")`, send one WorkerJob,
// receive WorkerMessages. One job per process: the process exits when it is done.
import { convertPdf } from "./convert";
import { ConverterError } from "./errors";
import type { WorkerJob, WorkerMessage } from "./worker-protocol";

const send = (message: WorkerMessage): Promise<void> =>
  new Promise((resolve) => {
    if (!process.send) return resolve();
    process.send(message, undefined, {}, () => resolve());
  });

const controller = new AbortController();
// The parent went away (studio stopped): stop, the converter removes its temp folder.
process.on("disconnect", () => controller.abort());

process.once("message", async (job: WorkerJob) => {
  if (job?.type !== "convert") return;
  try {
    const result = await convertPdf(job.input, {
      outDir: job.outDir,
      id: job.id,
      title: job.title,
      slug: job.slug,
      maxPages: job.maxPages,
      signal: controller.signal,
      onProgress: (event) => {
        if (event.stage === "render") {
          void send({ type: "progress", page: event.page, total: event.total });
        }
      },
    });
    await send({
      type: "done",
      pageCount: result.manifest.pageCount,
      warnings: result.warnings,
      durationMs: result.durationMs,
    });
  } catch (error) {
    await send({
      type: "error",
      code: error instanceof ConverterError ? error.code : "UNEXPECTED",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    process.exit(0);
  }
});
