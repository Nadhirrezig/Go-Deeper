/** The subset of a pdfjs `TextItem` the joiner needs. */
export interface TextItemLike {
  str: string;
  hasEOL: boolean;
  /** [a, b, c, d, x, y] in PDF units. */
  transform?: number[];
  width?: number;
  height?: number;
}

function isTextItem(item: unknown): item is TextItemLike {
  return typeof item === "object" && item !== null && "str" in item && "hasEOL" in item;
}

interface Placed {
  str: string;
  x: number;
  y: number;
  end: number;
  size: number;
}

function place(item: TextItemLike): Placed | undefined {
  const t = item.transform;
  if (!t || t.length < 6) return undefined;
  const [a = 0, b = 0, c = 0, d = 0, x = 0, y = 0] = t;
  const size = item.height || Math.hypot(c, d) || Math.hypot(a, b) || 1;
  return { str: item.str, x, y, end: x + (item.width ?? 0), size };
}

/**
 * Join pdfjs `getTextContent()` items into plain text.
 * - `hasEOL` becomes a line break.
 * - A space is added between items that are visually apart (gap or other baseline),
 *   so separate text boxes don't glue together ("Avion" + "Transfert").
 * - Overlapping duplicates (same text at the same spot, used for fake bold) are skipped.
 * - Repeated whitespace is collapsed, blank lines dropped, result trimmed.
 */
export function joinTextItems(items: readonly unknown[]): string {
  let raw = "";
  let prev: Placed | undefined;
  for (const item of items) {
    if (!isTextItem(item)) continue;
    const cur = place(item);
    if (prev && cur && item.str) {
      const tolerance = Math.max(1, cur.size * 0.2);
      const duplicate =
        cur.str === prev.str &&
        Math.abs(cur.x - prev.x) < tolerance &&
        Math.abs(cur.y - prev.y) < tolerance;
      if (duplicate) continue;
      const otherLine = Math.abs(cur.y - prev.y) > cur.size * 0.5;
      // Left-to-right: gap after the previous item. Right-to-left (Arabic): gap before it.
      const gap = cur.x >= prev.x ? cur.x - prev.end : prev.x - cur.end;
      const apart = otherLine || gap > cur.size * 0.15;
      if (apart && !/\s$/.test(raw) && !/^\s/.test(cur.str)) raw += " ";
    }
    raw += item.str;
    if (item.hasEOL) raw += "\n";
    if (cur && item.str) prev = cur;
  }
  return raw
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
