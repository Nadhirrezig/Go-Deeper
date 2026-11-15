import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createCanvas } from "@napi-rs/canvas";
import { MAX_PDF_BYTES, MAX_PDF_MB } from "@vipgroup/shared";
import type { FlipbookManifest } from "@vipgroup/shared";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { ConverterError } from "./errors";
import { loadPdfjs, pdfjsAssets } from "./pdfjs";
import { slugify } from "./slugify";
import { joinTextItems } from "./text";
import type {
  ConvertOptions,
  ConvertProgressEvent,
  ConvertResult,
  ImageSizes,
  SearchEntry,
} from "./types";

type RenderCanvas = Parameters<PDFPageProxy["render"]>[0]["canvas"];

export const DEFAULT_SIZES: ImageSizes = { thumb: 200, standard: 1000, zoom: 2000 };
export const DEFAULT_QUALITY: ImageSizes = { thumb: 70, standard: 80, zoom: 82 };
export const DEFAULT_MAX_PAGES = 500;
export const DEFAULT_CONCURRENCY = 2;
/** Pages whose aspect ratio differs from page 1 by more than this are letterboxed. */
const RATIO_TOLERANCE = 0.02;

const SIZE_KEYS = ["thumb", "standard", "zoom"] as const;
type SizeKey = (typeof SIZE_KEYS)[number];
type Box = { width: number; height: number };

/** Convert one PDF into a flipbook folder (`<outDir>/<id>/`). See CLAUDE.md "Book output format". */
export async function convertPdf(
  input: string | Uint8Array,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const started = performance.now();
  const sizes = options.sizes ?? DEFAULT_SIZES;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const id = options.id ?? randomUUID();
  const { signal, onProgress } = options;
  validateOptions({ sizes, quality, maxPages, concurrency, id });

  const checkAborted = (): void => {
    if (signal?.aborted) throw new ConverterError("ABORTED", "Conversion aborted.");
  };
  checkAborted();

  const outDir = path.resolve(options.outDir);
  const finalDir = path.join(outDir, id);
  const tmpDir = path.join(outDir, `${id}.tmp`);
  if (await exists(finalDir)) {
    throw new ConverterError("OUT_DIR_EXISTS", `Book folder already exists: ${finalDir}`);
  }

  // Checked before reading, so an oversized file is never loaded into memory.
  const size = typeof input === "string" ? (await stat(input)).size : input.byteLength;
  if (size > MAX_PDF_BYTES) {
    throw new ConverterError(
      "TOO_LARGE",
      `The PDF is ${(size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_PDF_MB} MB.`,
    );
  }

  const bytes = typeof input === "string" ? await readFile(input) : input;
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    // pdfjs may detach the buffer it receives, so give it a copy.
    data: new Uint8Array(bytes),
    ...pdfjsAssets,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });

  const warnings: string[] = [];
  const activeRenders = new Set<RenderTask>();
  const cancelRenders = (): void => activeRenders.forEach((task) => task.cancel());
  signal?.addEventListener("abort", cancelRenders, { once: true });
  let createdTmp = false;

  try {
    const doc = await openDocument(loadingTask.promise);
    checkAborted();
    const total = doc.numPages;
    if (total === 0) throw new ConverterError("EMPTY_PDF", "The PDF has no pages.");
    if (total > maxPages) {
      throw new ConverterError(
        "TOO_MANY_PAGES",
        `The PDF has ${total} pages; the limit is ${maxPages}.`,
      );
    }

    const title = options.title?.trim() || (await metadataTitle(doc)) || fallbackTitle(input);
    const slug = options.slug ?? (slugify(title) || `flipbook-${id.slice(0, 8)}`);

    // Every page shares page 1's aspect ratio (the page-flip reader needs one size).
    const first = await doc.getPage(1);
    const firstViewport = first.getViewport({ scale: 1 });
    const baseRatio = firstViewport.width / firstViewport.height;
    first.cleanup();
    const boxes = Object.fromEntries(
      SIZE_KEYS.map((key) => [
        key,
        { width: sizes[key], height: Math.max(1, Math.round(sizes[key] / baseRatio)) },
      ]),
    ) as Record<SizeKey, Box>;

    await rm(tmpDir, RM_OPTIONS);
    await mkdir(path.join(tmpDir, "pages"), { recursive: true });
    createdTmp = true;
    if (typeof input === "string") await copyFile(input, path.join(tmpDir, "original.pdf"));
    else await writeFile(path.join(tmpDir, "original.pdf"), bytes);

    const pad = Math.max(3, String(total).length);
    const fileNames = (n: number) => {
      const base = String(n).padStart(pad, "0");
      return {
        thumb: `pages/${base}-thumb.webp`,
        standard: `pages/${base}.webp`,
        zoom: `pages/${base}-zoom.webp`,
      };
    };

    const texts: string[] = new Array<string>(total).fill("");
    const done = { render: 0, text: 0 };
    const progress = (stage: ConvertProgressEvent["stage"], page: number): void =>
      onProgress?.({ stage, page, total });

    const render: RenderContext = { baseRatio, boxes, quality, activeRenders, checkAborted };
    const processPage = async (n: number): Promise<void> => {
      const page = await doc.getPage(n);
      try {
        const files = fileNames(n);
        const warning = await renderPage(page, n, render, (key) => path.join(tmpDir, files[key]));
        if (warning) warnings.push(warning);
        checkAborted();
        progress("render", ++done.render);

        const content = await page.getTextContent();
        texts[n - 1] = joinTextItems(content.items);
        progress("text", ++done.text);
      } finally {
        page.cleanup();
      }
    };

    await runPool(total, concurrency, processPage);
    checkAborted();

    if (texts.every((text) => text.length === 0)) {
      warnings.push("PDF looks scanned: search will find nothing.");
    }
    // Warnings come from parallel workers; keep them in page order.
    warnings.sort((a, b) => pageOf(a) - pageOf(b));

    const standard = boxes.standard;
    const manifest: FlipbookManifest = {
      version: 1,
      id,
      slug,
      title,
      pageCount: total,
      pageWidth: standard.width,
      pageHeight: standard.height,
      pdf: "original.pdf",
      search: "search.json",
      pages: Array.from({ length: total }, (_, i) => ({ n: i + 1, ...fileNames(i + 1) })),
      createdAt: new Date().toISOString(),
    };
    const search: SearchEntry[] = texts.map((text, i) => ({ page: i + 1, text }));
    await writeFile(path.join(tmpDir, "search.json"), JSON.stringify(search));
    await writeFile(path.join(tmpDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    checkAborted();
    progress("write", total);

    await publish(tmpDir, finalDir);
    createdTmp = false;
    return { manifest, dir: finalDir, warnings, durationMs: performance.now() - started };
  } catch (error) {
    if (signal?.aborted && !(error instanceof ConverterError && error.code === "ABORTED")) {
      throw new ConverterError("ABORTED", "Conversion aborted.", { cause: error });
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancelRenders);
    if (createdTmp) await rm(tmpDir, RM_OPTIONS);
    await loadingTask.destroy();
  }
}

interface RenderContext {
  baseRatio: number;
  boxes: Record<SizeKey, Box>;
  quality: ImageSizes;
  activeRenders: Set<RenderTask>;
  checkAborted: () => void;
}

/**
 * Render a page once at zoom size, then downscale with sharp to the 3 WebP files.
 * Returns a warning when the page had to be letterboxed into page 1's aspect ratio.
 */
async function renderPage(
  page: PDFPageProxy,
  n: number,
  ctx: RenderContext,
  target: (key: SizeKey) => string,
): Promise<string | undefined> {
  // getViewport applies the page's /Rotate by default.
  const unit = page.getViewport({ scale: 1 });
  const diff = Math.abs(unit.width / unit.height / ctx.baseRatio - 1);
  const letterbox = diff > RATIO_TOLERANCE;
  const zoom = ctx.boxes.zoom;
  const scale = letterbox
    ? Math.min(zoom.width / unit.width, zoom.height / unit.height)
    : zoom.width / unit.width;
  const viewport = page.getViewport({ scale });
  const width = Math.max(1, Math.round(viewport.width));
  const height = Math.max(1, Math.round(viewport.height));

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  // White background, so transparent PDFs never turn black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const task = page.render({ canvas: canvas as unknown as RenderCanvas, viewport });
  ctx.activeRenders.add(task);
  try {
    await task.promise;
  } finally {
    ctx.activeRenders.delete(task);
  }
  ctx.checkAborted();

  const pixels = context.getImageData(0, 0, width, height).data;
  const image = sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    raw: { width, height, channels: 4 },
  }).flatten({ background: "#ffffff" });
  await Promise.all(
    SIZE_KEYS.map((key) =>
      image
        .clone()
        .resize({
          width: ctx.boxes[key].width,
          height: ctx.boxes[key].height,
          // Within tolerance: stretch to the exact box. Otherwise: fit, centred on white.
          fit: letterbox ? "contain" : "fill",
          background: "#ffffff",
          kernel: "lanczos3",
        })
        .webp({ quality: ctx.quality[key] })
        .toFile(target(key)),
    ),
  );

  return letterbox
    ? `Page ${n}: aspect ratio differs from page 1 by ${(diff * 100).toFixed(1)}%, fitted inside page 1's size with white margins.`
    : undefined;
}

/** Run `task(1..total)` with at most `concurrency` in flight; stop scheduling on first error. */
async function runPool(
  total: number,
  concurrency: number,
  task: (n: number) => Promise<void>,
): Promise<void> {
  let next = 1;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next <= total) {
      const n = next++;
      try {
        await task(n);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  // allSettled: wait for in-flight pages before the caller deletes the folder.
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, total) }, worker),
  );
  const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (rejected) throw rejected.reason;
}

async function openDocument(promise: Promise<PDFDocumentProxy>): Promise<PDFDocumentProxy> {
  try {
    return await promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      throw new ConverterError("PASSWORD_PROTECTED", "The PDF is password-protected.", {
        cause: error,
      });
    }
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new ConverterError("INVALID_PDF", `The file is not a valid PDF${detail}`, {
      cause: error,
    });
  }
}

/** Errors Windows returns while another process (OneDrive, antivirus, indexer) holds a file. */
const TRANSIENT_FS_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
/** Retries for a rename blocked by such a process: ~3 s in total. */
const RENAME_RETRY_DELAYS_MS = [100, 200, 400, 800, 1500];

/** Options for removing a folder: Node retries EBUSY / EPERM / ENOTEMPTY itself. */
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

export async function publish(
  tmpDir: string,
  finalDir: string,
  renameDir: (from: string, to: string) => Promise<void> = rename,
): Promise<void> {
  const exists_ = (): ConverterError =>
    new ConverterError("OUT_DIR_EXISTS", `Book folder already exists: ${finalDir}`);
  if (await exists(finalDir)) throw exists_();
  for (let attempt = 0; ; attempt++) {
    try {
      await renameDir(tmpDir, finalDir);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      // Windows also reports a rename onto an existing folder as EPERM: check what is there.
      if (code === "EEXIST" || code === "ENOTEMPTY" || (await exists(finalDir))) {
        const conflict = exists_();
        conflict.cause = error;
        throw conflict;
      }
      const delay = RENAME_RETRY_DELAYS_MS[attempt];
      if (!TRANSIENT_FS_CODES.has(code) || delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function metadataTitle(doc: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const { info } = await doc.getMetadata();
    if (typeof info === "object" && info !== null && "Title" in info) {
      const value = (info as { Title?: unknown }).Title;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // Missing or broken metadata: fall back to the file name.
  }
  return undefined;
}

function fallbackTitle(input: string | Uint8Array): string {
  if (typeof input !== "string") return "Untitled";
  return path.basename(input, path.extname(input)) || "Untitled";
}

function pageOf(warning: string): number {
  const match = /^Page (\d+):/.exec(warning);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function validateOptions(o: {
  sizes: ImageSizes;
  quality: ImageSizes;
  maxPages: number;
  concurrency: number;
  id: string;
}): void {
  const positiveInt = (value: number, name: string): void => {
    if (!Number.isInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a positive integer (got ${value}).`);
    }
  };
  for (const key of SIZE_KEYS) {
    positiveInt(o.sizes[key], `sizes.${key}`);
    positiveInt(o.quality[key], `quality.${key}`);
    if (o.quality[key] > 100) throw new RangeError(`quality.${key} must be at most 100.`);
  }
  positiveInt(o.maxPages, "maxPages");
  positiveInt(o.concurrency, "concurrency");
  if (!/^[A-Za-z0-9_-]+$/.test(o.id)) {
    throw new RangeError(`id must only contain letters, digits, "-" or "_" (got "${o.id}").`);
  }
}
