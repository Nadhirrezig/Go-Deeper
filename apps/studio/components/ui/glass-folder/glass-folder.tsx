"use client";

/**
 * Glass Folder Cards — a folder you can actually use, drawn as an object.
 *
 * Three layers, back to front: a back panel holding a piece of artwork, the
 * files the folder contains, and a frosted-glass front panel that blurs
 * whatever sits behind it. Nothing is a picture of a folder; the files are
 * real elements between real panels, so the glass frosts them as they move.
 *
 * - **Rest**: flat and closed. The tops of the files only just show.
 * - **Hover / focus**: the front panel leans toward you on its bottom hinge
 *   and the files lift a little out of the pocket.
 * - **Open** (click, Enter, Space): the panel falls further forward and the
 *   files rise out and fan, each one a button with its name on it.
 * - **Add** (`+`): a new file drops into the folder, the pocket gives a little
 *   under it, and the count rolls over.
 * - **More** (`···`): a frosted menu you can drive from the keyboard.
 *
 * The artwork is generated, not fetched: a domain-warped noise field shaded
 * as a liquid surface, painted once per recipe into a canvas over a few
 * frames and shared between every folder that uses it. Supply `image` to use
 * a picture of your own instead.
 *
 * Self-contained: React is the only import. No CSS file, no images, no fonts.
 *
 * VipGroup Studio changes (design owned by Nadhir — change only on request):
 * - `files` is followed when its content changes; files with an `id` keep
 *   their sheet, and only a file new to the list plays the drop animation.
 * - Every visible and screen-reader string comes from `labels` (French by
 *   default, `GLASS_FOLDER_LABELS_EN` available).
 * - `NewFolderTile`: the empty folder outline with the `+` key, used outside
 *   the folders to create a new one.
 */

import * as React from "react";
import { ArtCanvas } from "./art-canvas";
import { FolderKey } from "./folder-key";
import { FolderMenu } from "./folder-menu";
import { FolderSheet } from "./folder-sheet";
import { BACK_PATH, FRONT_H, FRONT_PATH, H, HEADROOM, MAX_VISIBLE, W } from "./geometry";
import { useDismiss, useEntrance, usePointerLight } from "./hooks";
import { GLASS_FOLDER_LABELS_FR } from "./labels";
import { GlassFolderStyles } from "./folder-styles";
import { track } from "./track-files";
import type { Tracked } from "./track-files";
import type { FolderFile, FolderMenuItem, GlassFolderLabels, GlassFolderProps } from "./types";

const SAMPLE_FILES: FolderFile[] = [
  { name: "Cover — final", meta: "PNG · 4.8 MB", art: "ember" },
  { name: "Moodboard", meta: "24 images", art: "dusk" },
  { name: "Brief.pdf", meta: "PDF · 1.2 MB" },
];

export default function GlassFolder({
  label: labelProp,
  meta,
  tone = "light",
  art = "aurora",
  seed = 3,
  image,
  files: filesProp,
  labels: labelsProp,
  action = "add",
  onAdd,
  onFilesChange,
  menu = [],
  labelPlacement = "bottom-left",
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  onFileSelect,
  width = 340,
  appear = true,
  appearDelay = 0,
  className,
  style,
}: GlassFolderProps) {
  const uid = React.useId().replace(/:/g, "");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const filesRef = React.useRef<HTMLDivElement>(null);
  const hitRef = React.useRef<HTMLButtonElement>(null);
  const keyRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const L: GlassFolderLabels = { ...GLASS_FOLDER_LABELS_FR, ...labelsProp };
  const label = labelProp ?? L.folder;

  // ids survive re-renders so a newly added file is the only one that animates in
  const [list, setList] = React.useState<Tracked>(() => track(null, filesProp ?? SAMPLE_FILES));
  const files = list.files;
  // Sheets playing the drop animation: every file new to the list, not only the last one.
  const [dropping, setDropping] = React.useState<ReadonlySet<number>>(() => new Set());
  const [bump, setBump] = React.useState(0);

  // Follow `files` when its content changes (not merely its reference), using
  // React's "adjust state while rendering" pattern rather than an effect.
  const filesSig = filesProp ? JSON.stringify(filesProp) : "";
  const [syncedSig, setSyncedSig] = React.useState(filesSig);
  if (filesProp && filesSig !== syncedSig) {
    setSyncedSig(filesSig);
    const nextList = track(list, filesProp);
    const before = new Set(list.ids);
    const fresh = nextList.ids.filter((id) => !before.has(id));
    setList(nextList);
    if (fresh.length) {
      setDropping((current) => new Set([...current, ...fresh]));
      setBump((b) => b + 1);
    }
  }

  const [openState, setOpenState] = React.useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  const [menuOpen, setMenuOpen] = React.useState(false);
  const k = width / W;
  const density =
    Math.min(1.5, Math.max(1, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1)) *
    k;

  const entered = useEntrance(rootRef, appear, appearDelay);
  usePointerLight(rootRef);

  // ---- closed files are out of the tab order ------------------------------
  React.useEffect(() => {
    filesRef.current?.toggleAttribute("inert", !open);
  }, [open]);

  useDismiss({ open, menuOpen, setOpen, setMenuOpen, rootRef, menuRef, keyRef, hitRef });

  const addFile = () => {
    const made = onAdd?.(files);
    const file: FolderFile = made || { name: L.untitled + " " + (files.length + 1) };
    const next = [...files, file];
    const nextList = track(list, next);
    setList(nextList);
    const added = nextList.ids[nextList.ids.length - 1]!;
    setDropping((current) => new Set([...current, added]));
    setBump((b) => b + 1);
    onFilesChange?.(next);
  };

  const menuItems: FolderMenuItem[] = [
    { label: open ? L.closeFolder : L.openFolder, onSelect: () => setOpen(!open) },
    ...menu,
  ];

  // the newest files sit at the front of the stack, nearest the glass
  const start = Math.max(0, files.length - MAX_VISIBLE);
  const visible = files.slice(start);
  const count = files.length;
  const metaLine = meta ?? L.count(count);

  return (
    <div
      ref={rootRef}
      className={"gf-root" + (className ? " " + className : "")}
      data-tone={tone}
      data-open={open || undefined}
      data-entered={entered || undefined}
      data-place={labelPlacement}
      style={{ width, height: (H + HEADROOM) * k, ...style }}
    >
      <GlassFolderStyles />
      <div
        className="gf-stage"
        style={{ transform: "translateY(" + HEADROOM * k + "px) scale(" + k + ")" }}
      >
        <div className="gf-tilt">
          <div className="gf-shadow" aria-hidden="true" />

          {/* back panel and its artwork */}
          <div
            className="gf-back"
            style={{ clipPath: "path('" + BACK_PATH + "')" }}
            aria-hidden="true"
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- plain <img> inside a CSS-scaled stage
              <img
                className="gf-art"
                src={image}
                alt=""
                width={W + 24}
                height={H + 24}
                draggable={false}
              />
            ) : art !== "none" ? (
              <ArtCanvas
                className="gf-art"
                art={art}
                seed={seed}
                w={W + 24}
                h={H + 24}
                density={density}
                priority={0}
              />
            ) : null}
            <div className="gf-back-sheen" />
          </div>
          <svg className="gf-rim gf-back-rim" viewBox={"0 0 " + W + " " + H} aria-hidden="true">
            <path d={BACK_PATH} />
          </svg>

          {/* the frosted front panel, hinged on its bottom edge */}
          <div
            key={bump}
            className={"gf-front" + (bump ? " gf-front--bump" : "")}
            style={{ clipPath: "path('" + FRONT_PATH + "')" }}
          >
            <div className="gf-tint" aria-hidden="true" />
            <div className="gf-spec" aria-hidden="true" />
            <svg
              className="gf-rim gf-front-rim"
              viewBox={"0 0 " + W + " " + FRONT_H}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={"gf-rim-" + uid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
                  <stop offset="0.35" stopColor="#fff" stopOpacity="0.35" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
                </linearGradient>
              </defs>
              <path d={FRONT_PATH} stroke={"url(#gf-rim-" + uid + ")"} />
            </svg>
            <button
              ref={hitRef}
              type="button"
              className="gf-hit"
              aria-expanded={open}
              aria-label={(open ? L.close : L.open) + " " + label + ", " + L.count(count)}
              onClick={() => {
                setMenuOpen(false);
                setOpen(!open);
              }}
            />
            <div className="gf-label">
              <span className="gf-title">{label}</span>
              <span className="gf-meta" key={metaLine}>
                {metaLine}
              </span>
            </div>
          </div>

          {/* the contents: after the glass in tab order, beneath it on screen */}
          <div
            ref={filesRef}
            className="gf-files"
            role="list"
            aria-label={L.contents + " " + label}
          >
            {visible.map((file, v) => {
              const id = list.ids[start + v]!;
              return (
                <FolderSheet
                  key={id}
                  file={file}
                  id={id}
                  position={v}
                  visibleCount={visible.length}
                  dropping={dropping.has(id)}
                  density={density}
                  onDropEnd={() =>
                    setDropping((current) => {
                      const next = new Set(current);
                      next.delete(id);
                      return next;
                    })
                  }
                  onSelect={() => onFileSelect?.(file, start + v)}
                />
              );
            })}
          </div>

          {action !== "none" ? (
            <FolderKey
              action={action}
              keyRef={keyRef}
              ariaLabel={(action === "add" ? L.addFile : L.moreOptions) + " " + label}
              menuId={"gf-menu-" + uid}
              menuOpen={menuOpen}
              bump={bump}
              onClick={() => (action === "add" ? addFile() : setMenuOpen((m) => !m))}
            />
          ) : null}

          {action === "more" ? (
            <FolderMenu
              id={"gf-menu-" + uid}
              ariaLabel={L.options + " " + label}
              open={menuOpen}
              items={menuItems}
              menuRef={menuRef}
              onClose={() => {
                setMenuOpen(false);
                keyRef.current?.focus();
              }}
              onDismiss={() => setMenuOpen(false)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
