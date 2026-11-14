import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getFlipbooksDir, resolveStorageFile } from "../../../lib/storage";

// Serves book files from the local storage folder (until cloud storage in step 6).

const notFound = (): Response => new Response("Not found", { status: 404 });

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await context.params;
  const root = getFlipbooksDir();
  const target = resolveStorageFile(root, segments);
  if (!target) return notFound();

  try {
    // Symbolic links must not lead outside the storage folder either.
    const [realRoot, realFile] = await Promise.all([
      realpath(/*turbopackIgnore: true*/ root),
      realpath(/*turbopackIgnore: true*/ target.file),
    ]);
    if (!realFile.startsWith(realRoot + path.sep)) return notFound();
    const info = await stat(/*turbopackIgnore: true*/ realFile);
    if (!info.isFile()) return notFound();

    const lastModified = new Date(Math.floor(info.mtimeMs / 1000) * 1000);
    const headers = new Headers({
      "Content-Type": target.contentType,
      "Last-Modified": lastModified.toUTCString(),
      // A book folder never changes after conversion: images and the PDF can be cached for good.
      "Cache-Control": target.contentType.startsWith("application/json")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });

    const since = request.headers.get("if-modified-since");
    if (since && new Date(since).getTime() >= lastModified.getTime()) {
      return new Response(null, { status: 304, headers });
    }

    headers.set("Content-Length", String(info.size));
    const body = Readable.toWeb(
      createReadStream(/*turbopackIgnore: true*/ realFile),
    ) as ReadableStream<Uint8Array>;
    return new Response(body, { status: 200, headers });
  } catch {
    return notFound();
  }
}
