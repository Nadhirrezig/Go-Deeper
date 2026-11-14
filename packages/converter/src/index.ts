export {
  convertPdf,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_PAGES,
  DEFAULT_QUALITY,
  DEFAULT_SIZES,
} from "./convert";
export { ConverterError, isConverterError } from "./errors";
export type { ConverterErrorCode } from "./errors";
export { slugify } from "./slugify";
export type { WorkerJob, WorkerMessage } from "./worker-protocol";
export type {
  ConvertOptions,
  ConvertProgressEvent,
  ConvertResult,
  ConvertStage,
  ImageSizes,
  SearchEntry,
} from "./types";

/** Converter package version. */
export const version = "0.1.0";
