import { memo, useEffect, useRef } from "react";
import { fillLabel } from "./labels";
import type { FlipbookLabels } from "./labels";
import type { Spread } from "./spread";
import type { ResolvedBook } from "./types";

interface ThumbnailsProps {
  book: ResolvedBook;
  spread: Spread;
  labels: FlipbookLabels;
  onSelect: (page: number) => void;
}

/** Horizontal strip with every page; the visible spread is highlighted and kept in view. */
export const Thumbnails = memo(function Thumbnails({
  book,
  spread,
  labels,
  onSelect,
}: ThumbnailsProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const first = spread[0];

  useEffect(() => {
    const strip = stripRef.current;
    const current = strip?.querySelector<HTMLElement>(`[data-page="${first}"]`);
    if (!strip || !current) return;
    // Scroll the strip itself: scrollIntoView could also scroll the host page.
    strip.scrollLeft = current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2;
  }, [first]);

  return (
    <div className="vgf-thumbs" role="group" aria-label={labels.thumbnails}>
      <div className="vgf-thumbs-strip" ref={stripRef}>
        {book.pages.map((page) => {
          const current = page.n >= spread[0] && page.n <= spread[1];
          return (
            <button
              key={page.n}
              type="button"
              className="vgf-thumb"
              data-page={page.n}
              aria-current={current ? "page" : undefined}
              onClick={() => onSelect(page.n)}
            >
              <img
                className="vgf-thumb-img"
                src={page.thumb}
                alt={fillLabel(labels.pageAlt, { n: page.n })}
                loading="lazy"
                decoding="async"
                draggable={false}
                width={book.pageWidth}
                height={book.pageHeight}
              />
              <span className="vgf-thumb-number" aria-hidden="true">
                {page.n}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
