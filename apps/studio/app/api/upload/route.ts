import { getServices } from "../../../lib/services";
import { MAX_PDF_BYTES } from "@vipgroup/shared";
import { handleUpload } from "../../../lib/upload";

// A route handler, not a Server Action: no body size limit, and the PDF is streamed to
// disk instead of being held in memory. See lib/upload.ts.
export async function POST(request: Request): Promise<Response> {
  const services = getServices();
  await services.ready;
  return handleUpload(request, {
    repo: services.repo,
    enqueue: (job) => services.queue.enqueue(job),
    uploadsDir: services.uploadsDir,
    maxBytes: MAX_PDF_BYTES,
  });
}
