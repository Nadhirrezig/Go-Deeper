import type { ViewMode } from "./types";

/**
 * Where a click landed on the visible book:
 * - "corner": page-flip turns the page itself (it also folds the corner on hover);
 * - "prev" / "next": outer edge strips, the reader turns the page;
 * - "middle": no page turn (a double-click there opens the zoom).
 */
export type HitZone = "corner" | "prev" | "next" | "middle" | "outside";

/** Width of the clickable edge strip, as a fraction of one page. */
export const EDGE_STRIP = 0.15;

export interface BookBox {
  /** Visible book size: one page wide (single) or two (double). */
  width: number;
  height: number;
  pageWidth: number;
}

/** `x` / `y` are relative to the visible book's top-left corner. */
export function hitZone(x: number, y: number, box: BookBox, mode: ViewMode): HitZone {
  if (x < 0 || y < 0 || x > box.width || y > box.height) return "outside";

  // Same corner size as page-flip's own `isPointOnCorners`.
  const reach = Math.hypot(box.pageWidth, box.height) / 5;
  const nearTopOrBottom = y < reach || y > box.height - reach;
  const nearRight = x > box.width - reach;
  // In single mode page-flip's book extends one page to the left, off screen:
  // only the right corners exist.
  const nearLeft = mode === "double" && x < reach;
  if (nearTopOrBottom && (nearLeft || nearRight)) return "corner";

  const strip = box.pageWidth * EDGE_STRIP;
  if (x < strip) return "prev";
  if (x > box.width - strip) return "next";
  return "middle";
}
