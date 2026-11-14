import { fillLabel } from "./labels";
import type { FlipbookLabels } from "./labels";
import type { ResolvedPage } from "./types";
import type { ZoomState } from "./zoom-math";

interface ZoomOverlayProps {
  /** Pages of the visible spread. */
  pages: ResolvedPage[];
  /** Size of one page at 1×, in CSS px (same as in the book). */
  pageWidth: number;
  pageHeight: number;
  zoom: ZoomState;
  labels: FlipbookLabels;
}

/**
 * The visible page(s) drawn over the book with the zoom-size images.
 * This is the only place `-zoom.webp` files are requested. Purely presentational:
 * the reader owns the gestures (wheel, pinch, drag, double-click).
 */
export function ZoomOverlay({ pages, pageWidth, pageHeight, zoom, labels }: ZoomOverlayProps) {
  return (
    <div className="vgf-zoom" data-zoomed={zoom.scale > 1 ? "true" : "false"}>
      <div
        className="vgf-zoom-content"
        style={{
          width: pageWidth * pages.length,
          height: pageHeight,
          transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
        }}
      >
        {pages.map((page) => (
          <div className="vgf-zoom-page" key={page.n}>
            {/* Already cached: shows at once while the zoom image loads over it. */}
            <img className="vgf-zoom-base" src={page.standard} alt="" draggable={false} />
            <img
              className="vgf-zoom-img"
              src={page.zoom}
              alt={fillLabel(labels.pageAlt, { n: page.n })}
              decoding="async"
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
