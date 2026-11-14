import type { ViewMode } from "./types";

export interface BookLayout {
  mode: ViewMode;
  /** Size of one page, in CSS px. */
  pageWidth: number;
  pageHeight: number;
  /** Width of the visible book: one page (single) or two (double). */
  bookWidth: number;
}

/**
 * Two facing pages are used unless they would be much smaller than one page alone:
 * below this ratio (double page width / single page width) the reader shows one page.
 * Phones in portrait give ~0.5 (single); desktops and phones in landscape give ~1 (double).
 */
export const SINGLE_PAGE_THRESHOLD = 0.6;

/**
 * Fit the book inside its container, keeping the page ratio (width / height).
 * Returns null while the container has no size (hidden, not laid out yet).
 */
export function computeLayout(
  containerWidth: number,
  containerHeight: number,
  pageRatio: number,
): BookLayout | null {
  if (!(containerWidth > 0) || !(containerHeight > 0) || !(pageRatio > 0)) return null;
  const singleWidth = Math.min(containerWidth, containerHeight * pageRatio);
  const doubleWidth = Math.min(containerWidth / 2, containerHeight * pageRatio);
  const mode: ViewMode = doubleWidth < singleWidth * SINGLE_PAGE_THRESHOLD ? "single" : "double";
  const pageWidth = Math.max(1, Math.floor(mode === "single" ? singleWidth : doubleWidth));
  // Round up: page-flip shrinks the page when the block is even half a pixel too short.
  const pageHeight = Math.max(1, Math.ceil(pageWidth / pageRatio));
  return { mode, pageWidth, pageHeight, bookWidth: mode === "single" ? pageWidth : pageWidth * 2 };
}
