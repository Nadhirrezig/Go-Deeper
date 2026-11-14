import type { FlipDirection } from "./types";

/**
 * Maths of the one-page turn (phones in portrait), kept free of the DOM so it can be tested.
 *
 * The turning page ("leaf") rotates around the left edge (the spine):
 *   0°     flat on the book, front visible
 *   -90°   edge-on
 *   -180°  turned away to the left, (white) back visible
 * Forward goes 0 → -180, backward -180 → 0. `progress` is 0 at the start and 1 at the end.
 */

/** A turn completes on release past this progress… */
export const COMPLETE_PROGRESS = 0.3;
/** …or when the finger is moving this fast in the turn direction (px/ms). */
export const FLICK_VELOCITY = 0.35;
/** Horizontal movement (px) after which a drag becomes a page turn. */
export const DRAG_START = 8;
/** Duration of a full turn (tap, button, key), in ms. */
export const TURN_DURATION = 650;

export function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** Direction a horizontal drag asks for: right-to-left turns forward. */
export function dragDirection(dx: number): FlipDirection {
  return dx < 0 ? "forward" : "backward";
}

/** Drag distance → turn progress. A drag across the whole page width completes the turn. */
export function dragProgress(dx: number, pageWidth: number, direction: FlipDirection): number {
  if (!(pageWidth > 0)) return 0;
  return clamp01((direction === "forward" ? -dx : dx) / pageWidth);
}

/**
 * Leaf angle (deg) for a progress. The cosine curve keeps the page's free edge close to the
 * finger (the edge sits at `cos(angle) × width` from the spine).
 */
export function leafAngle(progress: number, direction: FlipDirection): number {
  const turned = (Math.acos(1 - 2 * clamp01(progress)) * 180) / Math.PI;
  return direction === "forward" ? -turned : -(180 - turned);
}

/** Whether a released drag finishes the turn or falls back. `velocity` is px/ms, signed like dx. */
export function shouldComplete(
  progress: number,
  velocity: number,
  direction: FlipDirection,
): boolean {
  const towards = direction === "forward" ? -velocity : velocity;
  if (towards > FLICK_VELOCITY) return true;
  if (towards < -FLICK_VELOCITY) return false;
  return progress > COMPLETE_PROGRESS;
}

/** Time to animate the rest of a turn, shorter when little is left. */
export function remainingDuration(from: number, to: number): number {
  return Math.max(120, Math.abs(to - from) * TURN_DURATION);
}

/** Ease in-out for a full turn: the page lifts, sweeps, lands. */
export function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Ease out, to finish a turn the finger already started. */
export function easeOut(t: number): number {
  return 1 - (1 - clamp01(t)) ** 3;
}

/**
 * Light on the turning page and shadow on the page under it, from the leaf angle.
 * Both are strongest when the leaf stands edge-on (-90°).
 */
export function turnShading(angle: number): { leaf: number; under: number } {
  const lift = Math.sin((Math.min(Math.max(-angle, 0), 180) * Math.PI) / 180);
  return { leaf: 0.3 * lift, under: 0.45 * lift };
}
