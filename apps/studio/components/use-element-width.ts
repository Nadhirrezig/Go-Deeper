"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

/** Width of an element, followed with a ResizeObserver (null before the first measure). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Folder width for a column: min(340, column − 32), never under 240. */
export function folderWidthFor(columnWidth: number | null): number {
  if (columnWidth === null) return 340;
  return Math.max(240, Math.min(340, Math.floor(columnWidth - 32)));
}
