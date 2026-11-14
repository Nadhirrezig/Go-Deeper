"use client";

import * as React from "react";
// Reuses the folder's outline paths, stylesheet and `+` key (exported by glass-folder)
// instead of copying them, so the tile always matches the folders next to it.
import {
  BACK_PATH,
  FRONT_H,
  FRONT_PATH,
  GlassFolderStyles,
  H,
  HEADROOM,
  PlusGlyph,
  W,
} from "./glass-folder";

// ---------------------------------------------------------------------------
// New-folder tile: an empty folder outline with the `+` key, the same size and
// key as a folder, so it sits at the end of a row of folders. It does one
// thing: ask the page to create a folder.

export type NewFolderTileProps = {
  /** Called on click, Enter or Space. */
  onCreate?: () => void;
  /** Accessible name of the tile. */
  ariaLabel?: string;
  /** Title on the outline. */
  title?: string;
  /** Second line on the outline. */
  hint?: string;
  tone?: "light" | "dark";
  /** Width in px, as for `GlassFolder`. */
  width?: number;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function NewFolderTile({
  onCreate,
  ariaLabel = "Créer un dossier",
  title = "Nouveau dossier",
  hint = "Organiser les flipbooks",
  tone = "light",
  width = 340,
  disabled = false,
  className,
  style,
}: NewFolderTileProps) {
  const k = width / W;
  return (
    <div
      className={"gf-root gf-new" + (className ? " " + className : "")}
      data-tone={tone}
      data-entered
      data-place="bottom-left"
      style={{ width, height: (H + HEADROOM) * k, ...style }}
    >
      <GlassFolderStyles />
      <style href="vipgroup-new-folder-tile" precedence="medium">
        {NEW_CSS}
      </style>
      <div
        className="gf-stage"
        style={{ transform: "translateY(" + HEADROOM * k + "px) scale(" + k + ")" }}
      >
        <svg className="gf-new-shape" viewBox={"0 0 " + W + " " + H} aria-hidden="true">
          <path d={BACK_PATH} />
        </svg>
        <div
          className="gf-new-glass"
          style={{ clipPath: "path('" + FRONT_PATH + "')" }}
          aria-hidden="true"
        />
        <svg
          className="gf-new-shape gf-new-front"
          viewBox={"0 0 " + W + " " + FRONT_H}
          aria-hidden="true"
        >
          <path d={FRONT_PATH} />
        </svg>
        <div className="gf-label" aria-hidden="true">
          <span className="gf-title">{title}</span>
          <span className="gf-meta">{hint}</span>
        </div>
        <span className="gf-key gf-key--add" aria-hidden="true">
          <PlusGlyph />
        </span>
        <button
          type="button"
          className="gf-new-hit"
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => onCreate?.()}
        />
      </div>
    </div>
  );
}

const NEW_CSS = `
.gf-new-shape {
  position: absolute;
  left: 0;
  top: 0;
  width: 340px;
  height: 272px;
  max-width: none;
  overflow: visible;
  pointer-events: none;
  fill: rgba(255, 255, 255, .22);
  stroke: rgba(20, 20, 22, .26);
  stroke-width: 1.5;
  stroke-dasharray: 7 7;
  transition: stroke .35s var(--gf-ease), fill .35s var(--gf-ease);
}
.gf-new-front { top: 74px; height: 198px; fill: none; }
.gf-new-glass {
  position: absolute;
  left: 0;
  top: 74px;
  width: 340px;
  height: 198px;
  background: rgba(255, 255, 255, .34);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  backdrop-filter: blur(14px) saturate(1.3);
  transform-origin: 50% 100%;
  transform: perspective(760px) rotateX(var(--gf-hinge));
  transition: transform .8s var(--gf-spring), background .35s var(--gf-ease);
  pointer-events: none;
}
.gf-new .gf-label { z-index: 11; }
.gf-new .gf-meta { animation: none; }
.gf-new-hit {
  all: unset;
  position: absolute;
  inset: 0;
  z-index: 13;
  cursor: pointer;
  border-radius: 22px;
}
.gf-new-hit:focus-visible { outline: 2px solid #4c8dff; outline-offset: 4px; }
.gf-new-hit:disabled { cursor: not-allowed; }
.gf-new:has(.gf-new-hit:disabled) { opacity: .5; }
.gf-new:hover .gf-new-shape,
.gf-new:focus-within .gf-new-shape { stroke: rgba(20, 20, 22, .5); fill: rgba(255, 255, 255, .4); }
.gf-new:hover .gf-new-front,
.gf-new:focus-within .gf-new-front { fill: none; }
.gf-new:hover .gf-new-glass,
.gf-new:focus-within .gf-new-glass { background: rgba(255, 255, 255, .5); }
.gf-new:hover .gf-key,
.gf-new:focus-within .gf-key { transform: translateY(-2px); }
.gf-new:active .gf-key { transform: scale(.93); transition-duration: .12s; }
.gf-new[data-tone="dark"] .gf-new-shape { fill: rgba(255, 255, 255, .04); stroke: rgba(245, 245, 247, .28); }
.gf-new[data-tone="dark"] .gf-new-front { fill: none; }
.gf-new[data-tone="dark"] .gf-new-glass { background: rgba(18, 18, 20, .45); }
.gf-new[data-tone="dark"]:hover .gf-new-shape { stroke: rgba(245, 245, 247, .55); }
`;
