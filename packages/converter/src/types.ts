import type { FlipbookManifest } from "@vipgroup/shared";

export interface ImageSizes {
  thumb: number;
  standard: number;
  zoom: number;
}

export type ConvertStage = "render" | "text" | "write";

export interface ConvertProgressEvent {
  stage: ConvertStage;
  /** Number of pages finished for this stage so far (1-based, monotonic). */
  page: number;
  total: number;
}

export interface ConvertOptions {
  /** Parent folder; the book is written to `<outDir>/<id>/`. */
  outDir: string;
  /** Default: PDF metadata title, else file name. */
  title?: string;
  /** Default: slugified title (lowercase, a-z0-9 and -, accents removed). */
  slug?: string;
  /** Default: `crypto.randomUUID()`. */
  id?: string;
  /** Image widths in px. Default 200 / 1000 / 2000. */
  sizes?: ImageSizes;
  /** WebP quality (1-100). Default 70 / 80 / 82. */
  quality?: ImageSizes;
  /** Default 500. */
  maxPages?: number;
  /** Pages rendered in parallel. Default 2. */
  concurrency?: number;
  onProgress?: (event: ConvertProgressEvent) => void;
  /** Abort cleanly; the partial folder is deleted. */
  signal?: AbortSignal;
}

export interface ConvertResult {
  manifest: FlipbookManifest;
  /** Absolute path of the book folder. */
  dir: string;
  warnings: string[];
  durationMs: number;
}

export interface SearchEntry {
  page: number;
  text: string;
}
