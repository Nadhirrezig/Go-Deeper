import type { FlipbookManifest } from "@vipgroup/shared";
import type { ResolvedBook } from "./types";

export type FlipbookErrorCode = "load" | "version";

export class FlipbookError extends Error {
  readonly code: FlipbookErrorCode;

  constructor(code: FlipbookErrorCode, message: string) {
    super(message);
    this.name = "FlipbookError";
    this.code = code;
  }
}

/** Resolve `path` against `baseUrl` (an absolute URL). Absolute paths are kept. */
export function resolveUrl(path: string, baseUrl: string): string {
  return new URL(path, baseUrl).href;
}

/**
 * Absolute URL that the manifest's relative paths resolve against.
 * - With a manifest URL: that URL itself (so "pages/001.webp" lands next to manifest.json).
 * - With a `baseUrl` prop: the folder, with a trailing slash added when missing.
 * `documentUrl` makes relative inputs ("/files/abc/manifest.json") absolute.
 */
export function manifestBase(
  source: { manifestUrl: string } | { baseUrl: string },
  documentUrl: string,
): string {
  if ("manifestUrl" in source) return new URL(source.manifestUrl, documentUrl).href;
  const folder = source.baseUrl.endsWith("/") ? source.baseUrl : `${source.baseUrl}/`;
  return new URL(folder, documentUrl).href;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Validate the parts of the contract the reader relies on. */
export function assertManifest(data: unknown): FlipbookManifest {
  if (!isRecord(data)) throw new FlipbookError("load", "Manifest is not an object.");
  if (data.version !== 1) {
    throw new FlipbookError("version", `Unsupported manifest version: ${String(data.version)}.`);
  }
  const { pages, pageWidth, pageHeight } = data;
  const validPages =
    Array.isArray(pages) &&
    pages.length > 0 &&
    pages.every(
      (page) =>
        isRecord(page) &&
        typeof page.thumb === "string" &&
        typeof page.standard === "string" &&
        typeof page.zoom === "string",
    );
  const validSize =
    typeof pageWidth === "number" &&
    typeof pageHeight === "number" &&
    pageWidth > 0 &&
    pageHeight > 0;
  if (!validPages || !validSize) throw new FlipbookError("load", "Manifest is incomplete.");
  return data as unknown as FlipbookManifest;
}

/** Turn every relative path of the manifest into an absolute URL. */
export function resolveBook(manifest: FlipbookManifest, baseUrl: string): ResolvedBook {
  return {
    id: manifest.id,
    slug: manifest.slug,
    title: manifest.title,
    pageCount: manifest.pages.length,
    pageWidth: manifest.pageWidth,
    pageHeight: manifest.pageHeight,
    pdf: resolveUrl(manifest.pdf, baseUrl),
    search: resolveUrl(manifest.search, baseUrl),
    pages: manifest.pages.map((page, index) => ({
      n: index + 1,
      thumb: resolveUrl(page.thumb, baseUrl),
      standard: resolveUrl(page.standard, baseUrl),
      zoom: resolveUrl(page.zoom, baseUrl),
    })),
  };
}

export async function fetchManifest(url: string, signal?: AbortSignal): Promise<FlipbookManifest> {
  let data: unknown;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new FlipbookError("load", `Could not load the manifest: ${String(error)}`);
  }
  return assertManifest(data);
}
