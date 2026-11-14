export type KeyAction = "next" | "prev" | "first" | "last" | "zoomIn" | "zoomOut" | "escape";

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface KeyContext {
  /** Flipping is disabled while the zoom is open. */
  zoomed: boolean;
  /** The key was typed in a text field (the page-number input). */
  editing: boolean;
}

/**
 * Reader shortcut for a key press, or null to let the browser handle it.
 * The caller only asks while focus is inside the reader, so the host page is never hijacked.
 */
export function keyToAction(event: KeyLike, context: KeyContext): KeyAction | null {
  // Leave browser shortcuts (Ctrl +, Alt ←, …) alone.
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === "Escape") return "escape";
  if (context.editing) return null;

  switch (event.key) {
    case "ArrowRight":
      return context.zoomed ? null : "next";
    case "ArrowLeft":
      return context.zoomed ? null : "prev";
    case "Home":
      return context.zoomed ? null : "first";
    case "End":
      return context.zoomed ? null : "last";
    case "+":
    case "=":
      return "zoomIn";
    case "-":
    case "_":
      return "zoomOut";
    default:
      return null;
  }
}
