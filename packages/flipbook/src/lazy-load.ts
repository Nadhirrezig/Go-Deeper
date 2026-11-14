import type { Spread } from "./spread";
import type { FlipDirection } from "./types";

/** What a page element holds: the standard image (over its thumb), only the thumb, or nothing. */
export type PageLevel = "standard" | "thumb" | "none";

/** Standard images are kept for pages this close to the visible spread. */
export const STANDARD_RADIUS = 2;
/** Thumbs (blurred placeholders) are kept for pages this close. */
export const THUMB_RADIUS = 6;

export interface LoadPlanInput {
  /** Visible spread. */
  spread: Spread;
  pageCount: number;
  /** Last flip direction; null until the reader has been flipped once. */
  direction: FlipDirection | null;
  /** Spread a flip in progress is heading to, so its images load during the animation. */
  target?: Spread | null;
}

/**
 * Level of every page (index 0 = page 1).
 * - Just opened (no flip yet): standard images for the visible spread only.
 * - After that: standard within ±2 pages of the spread (and of the flip target).
 * - Thumbs within ±6; nothing further away.
 * Zoom images are never part of the plan: only the zoom overlay requests them.
 */
export function computeLoadPlan(input: LoadPlanInput): PageLevel[] {
  const { spread, pageCount, direction, target } = input;
  const lo = Math.min(spread[0], target?.[0] ?? spread[0]);
  const hi = Math.max(spread[1], target?.[1] ?? spread[1]);
  const opened = direction === null && !target;
  const standardRadius = opened ? 0 : STANDARD_RADIUS;

  const levels: PageLevel[] = [];
  for (let page = 1; page <= pageCount; page++) {
    if (page >= lo - standardRadius && page <= hi + standardRadius) levels.push("standard");
    else if (page >= lo - THUMB_RADIUS && page <= hi + THUMB_RADIUS) levels.push("thumb");
    else levels.push("none");
  }
  return levels;
}

/**
 * Order in which images should be requested: the visible spread, then the pages ahead in the
 * flip direction (the next spread is what a flip reveals), then the pages behind.
 */
export function loadOrder(input: LoadPlanInput): number[] {
  const { spread, pageCount, direction } = input;
  const visible: number[] = [];
  const ahead: number[] = [];
  const behind: number[] = [];
  for (let page = spread[0]; page <= spread[1]; page++) visible.push(page);
  for (let page = spread[1] + 1; page <= pageCount; page++) ahead.push(page);
  for (let page = spread[0] - 1; page >= 1; page--) behind.push(page);
  return direction === "backward"
    ? [...visible, ...behind, ...ahead]
    : [...visible, ...ahead, ...behind];
}
