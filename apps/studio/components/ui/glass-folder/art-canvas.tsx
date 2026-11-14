"use client";

import * as React from "react";
import { recipeOf } from "./art";
import { paint } from "./painter";
import type { ArtPreset, ArtRecipe } from "./types";

export function ArtCanvas({
  art,
  seed,
  w,
  h,
  density,
  priority,
  className,
}: {
  art: ArtPreset | ArtRecipe;
  seed: number;
  w: number;
  h: number;
  density: number;
  priority: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const recipe = recipeOf(art);
  const key = JSON.stringify(recipe);
  const pw = Math.round(w * density);
  const ph = Math.round(h * density);
  // Ready means "the canvas holds the artwork for these exact inputs": when an input
  // changes, `ready` turns false at once, without resetting state inside the effect.
  const paintKey = [key, seed, pw, ph].join("|");
  const [paintedKey, setPaintedKey] = React.useState<string | null>(null);
  const ready = paintedKey === paintKey;

  React.useEffect(() => {
    let live = true;
    paint(JSON.parse(key) as ArtRecipe, seed, pw, ph, priority).then((src) => {
      const c = ref.current;
      if (!live || !c) return;
      c.width = src.width;
      c.height = src.height;
      c.getContext("2d")?.drawImage(src, 0, 0);
      setPaintedKey([key, seed, pw, ph].join("|"));
    });
    return () => {
      live = false;
    };
  }, [key, seed, pw, ph, priority]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      data-ready={ready || undefined}
      style={{ width: w, height: h, maxWidth: "none" }}
    />
  );
}
