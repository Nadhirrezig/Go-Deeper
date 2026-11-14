import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));

/** pdfjs reads these with fs in Node: plain folder paths ending with a separator. */
const assetDir = (name: string): string => path.join(pdfjsRoot, name) + path.sep;

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
