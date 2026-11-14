import type { ViewMode } from "./types";

/**
 * Where a click landed on the visible book:
 * - "corner" (two-page mode): page-flip turns the page itself (it also folds it on hover);
 * - "prev" / "next": outer edge strips, the reader turns the page;
 * - "middle": no page turn (a double-click there opens the zoom).
 */
export type HitZone = "corner" | "prev" | "next" | "middle" | "outside";

/** Width of the clickable edge strip, as a fraction of one page (two-page mode). */
export const EDGE_STRIP = 0.15;
/** One-page mode (phones): each side is a larger tap zone, easy to hit with a thumb. */
export const SINGLE_SIDE = 0.25;

export interface BookBox {
  /** Visible book size: one page wide (single) or two (double). */
  width: number;
  height: number;
  pageWidth: number;
}

/** `x` / `y` are relative to the visible book's top-left corner. */
export function hitZone(x: number, y: number, box: BookBox, mode: ViewMode): HitZone {
  if (x < 0 || y < 0 || x > box.width || y > box.height) return "outside";

  // One page: no corner folds (no hover on touch screens), just a tap zone on each side.
  if (mode === "single") {
    if (x < box.width * SINGLE_SIDE) return "prev";
    if (x > box.width * (1 - SINGLE_SIDE)) return "next";
    return "middle";
  }

  // Same corner size as page-flip's own `isPointOnCorners`.
  const reach = Math.hypot(box.pageWidth, box.height) / 5;
  const nearTopOrBottom = y < reach || y > box.height - reach;
  const nearRight = x > box.width - reach;
  const nearLeft = x < reach;
  if (nearTopOrBottom && (nearLeft || nearRight)) return "corner";

  const strip = box.pageWidth * EDGE_STRIP;
  if (x < strip) return "prev";
  if (x > box.width - strip) return "next";
  return "middle";
}
