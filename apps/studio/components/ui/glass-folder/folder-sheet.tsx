"use client";

import * as React from "react";
import { hashString, rng } from "./art";
import { ArtCanvas } from "./art-canvas";
import { SHEET_H, SHEET_W, fanSlot } from "./geometry";
import type { ArtPreset, ArtRecipe, FolderFile } from "./types";

export interface FolderSheetProps {
  file: FolderFile;
  /** Stable sheet id (see track-files). Seeds the sheet's small random offset. */
  id: number;
  /** Position in the visible stack (0 = back) and the stack's size. */
  position: number;
  visibleCount: number;
  /** Plays the drop animation. */
  dropping: boolean;
  /** Pixel density for generated art. */
  density: number;
  onDropEnd: () => void;
  onSelect: () => void;
}

/** One file of the folder: a sheet of paper, an artwork or an image, as a link or a button. */
export function FolderSheet({
  file,
  id,
  position,
  visibleCount,
  dropping,
  density,
  onDropEnd,
  onSelect,
}: FolderSheetProps) {
  const slot = fanSlot(position, visibleCount);
  const jitter = rng(hashString(file.name) + id);
  const picture = !!(file.art || file.image);
  const inner = (
    <>
      {picture ? (
        file.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- plain <img> inside a CSS-scaled stage
          <img
            className="gf-sheet-art"
            src={file.image}
            alt=""
            width={SHEET_W}
            height={SHEET_H}
            draggable={false}
          />
        ) : (
          <ArtCanvas
            className="gf-sheet-art"
            art={file.art as ArtPreset | ArtRecipe}
            seed={hashString(file.name) % 997}
            w={SHEET_W}
            h={SHEET_H}
            density={Math.min(density, 1.25)}
            priority={1}
          />
        )
      ) : (
        <span className="gf-lines" aria-hidden="true">
          <i style={{ width: "86%" }} />
          <i style={{ width: "92%" }} />
          <i style={{ width: "64%" }} />
          <i style={{ width: "88%" }} />
          <i style={{ width: "42%" }} />
        </span>
      )}
      <span className="gf-sheet-head">
        <span className="gf-sheet-name">{file.name}</span>
        {file.meta ? <span className="gf-sheet-meta">{file.meta}</span> : null}
      </span>
    </>
  );
  const common = {
    className: "gf-sheet" + (picture ? " gf-sheet--art" : "") + (dropping ? " gf-sheet--drop" : ""),
    style: {
      "--gf-slot": slot,
      "--gf-depth": visibleCount - 1 - position,
      "--gf-jx": ((jitter() - 0.5) * 10).toFixed(2) + "px",
      "--gf-jr": ((jitter() - 0.5) * 3.2).toFixed(2) + "deg",
      zIndex: position + 1,
    } as React.CSSProperties,
    onAnimationEnd: dropping ? onDropEnd : undefined,
  };
  return (
    <div role="listitem" className="gf-sheet-slot">
      {file.href ? (
        <a {...common} href={file.href} onClick={onSelect}>
          {inner}
        </a>
      ) : (
        <button {...common} type="button" onClick={onSelect}>
          {inner}
        </button>
      )}
    </div>
  );
}
