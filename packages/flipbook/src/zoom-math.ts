export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.5;
/** Scale the zoom opens at from a button or a double-click. */
export const OPEN_ZOOM = 2;

/** `x` / `y`: offset of the content's centre from the viewport's centre, in px. */
export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export function clampScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_ZOOM), MAX_ZOOM);
}

/** Keep the content covering the viewport (or centred when it is smaller). */
export function clampZoom(state: ZoomState, content: Size, viewport: Size): ZoomState {
  const scale = clampScale(state.scale);
  const maxX = Math.max(0, (content.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (content.height * scale - viewport.height) / 2);
  return {
    scale,
    x: Math.min(Math.max(state.x, -maxX), maxX),
    y: Math.min(Math.max(state.y, -maxY), maxY),
  };
}

/**
 * Change the scale while keeping the content under `point` in place.
 * `point` is relative to the viewport's centre (where a wheel or pinch happens).
 */
export function zoomAt(
  state: ZoomState,
  nextScale: number,
  point: { x: number; y: number },
  content: Size,
  viewport: Size,
): ZoomState {
  const scale = clampScale(nextScale);
  const k = scale / state.scale;
  return clampZoom(
    { scale, x: point.x - (point.x - state.x) * k, y: point.y - (point.y - state.y) * k },
    content,
    viewport,
  );
}

export function panBy(
  state: ZoomState,
  dx: number,
  dy: number,
  content: Size,
  viewport: Size,
): ZoomState {
  return clampZoom({ ...state, x: state.x + dx, y: state.y + dy }, content, viewport);
}

/** Next button level: 1 · 1.5 · 2 · 2.5 · 3. */
export function stepScale(scale: number, direction: 1 | -1): number {
  const snapped =
    direction === 1
      ? Math.floor(scale / ZOOM_STEP + 1e-6) * ZOOM_STEP + ZOOM_STEP
      : Math.ceil(scale / ZOOM_STEP - 1e-6) * ZOOM_STEP - ZOOM_STEP;
  return clampScale(snapped);
}
