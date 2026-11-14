"use client";

import * as React from "react";

/** Entrance: the folder assembles itself the first time it is on screen. */
export function useEntrance(
  rootRef: React.RefObject<HTMLDivElement | null>,
  appear: boolean,
  appearDelay: number,
): boolean {
  const [entered, setEntered] = React.useState(!appear);
  React.useEffect(() => {
    if (!appear) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setEntered(true);
      return;
    }
    let t = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        t = window.setTimeout(() => setEntered(true), appearDelay);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [rootRef, appear, appearDelay]);
  return entered;
}

/** Pointer: light and parallax follow the cursor, no re-renders. */
export function usePointerLight(rootRef: React.RefObject<HTMLDivElement | null>): void {
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const write = () => {
      raf = 0;
      el.style.setProperty("--gf-px", px.toFixed(3));
      el.style.setProperty("--gf-py", py.toFixed(3));
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width) * 2 - 1;
      py = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(write);
    };
    const leave = () => {
      px = 0;
      py = 0;
      if (!raf) raf = requestAnimationFrame(write);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [rootRef]);
}

export interface DismissOptions {
  open: boolean;
  menuOpen: boolean;
  setOpen: (open: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  keyRef: React.RefObject<HTMLButtonElement | null>;
  hitRef: React.RefObject<HTMLButtonElement | null>;
}

/** Escape and a press outside close whatever is open (the menu first, then the folder). */
export function useDismiss({
  open,
  menuOpen,
  setOpen,
  setMenuOpen,
  rootRef,
  menuRef,
  keyRef,
  hitRef,
}: DismissOptions): void {
  React.useEffect(() => {
    if (!open && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menuOpen) {
        setMenuOpen(false);
        keyRef.current?.focus();
      } else {
        setOpen(false);
        hitRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuOpen && !menuRef.current?.contains(t) && !keyRef.current?.contains(t))
        setMenuOpen(false);
      if (open && !menuOpen && !rootRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, menuOpen, setOpen, setMenuOpen, rootRef, menuRef, keyRef, hitRef]);
}
