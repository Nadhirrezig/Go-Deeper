import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));

/**
 * Folder path in the form pdfjs accepts for its factory options (cMapUrl, standardFontDataUrl…):
 * it must end with "/" — a "\" is rejected ("Invalid factory url") — and pdfjs reads
 * `${folder}${fileName}` with fs. Forward slashes work for fs on Windows too ("C:/…/cmaps/").
 */
export function toFactoryDir(dir: string, pathApi: path.PlatformPath = path): string {
  const normalised = pathApi.normalize(dir).split(pathApi.sep).join("/");
  return normalised.endsWith("/") ? normalised : `${normalised}/`;
}

const assetDir = (name: string): string => toFactoryDir(path.join(pdfjsRoot, name));

export const pdfjsAssets = {
  cMapUrl: assetDir("cmaps"),
  cMapPacked: true,
  standardFontDataUrl: assetDir("standard_fonts"),
  wasmUrl: assetDir("wasm"),
  iccUrl: assetDir("iccs"),
} as const;

/** Node (legacy) build of pdfjs; it uses @napi-rs/canvas for rendering. */
export function loadPdfjs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}
