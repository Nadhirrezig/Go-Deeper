import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

const fullscreenElement = (): Element | null => {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
};

export interface FullscreenControls {
  /** Fullscreen by either mechanism. */
  active: boolean;
  /** True in the fallback: fixed, full-viewport mode (iPhone Safari has no Fullscreen API). */
  fixed: boolean;
  toggle: () => void;
  exit: () => void;
}

/** Fullscreen API on `ref`, falling back to a fixed full-viewport mode where unsupported. */
export function useFullscreen(ref: RefObject<HTMLElement | null>): FullscreenControls {
  const [native, setNative] = useState(false);
  const [fixed, setFixed] = useState(false);

  useEffect(() => {
    const sync = (): void => setNative(fullscreenElement() === ref.current);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [ref]);

  // Fallback mode: keep the host page from scrolling behind the reader.
  useEffect(() => {
    if (!fixed) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [fixed]);

  const exit = useCallback(() => {
    setFixed(false);
    if (fullscreenElement()) {
      const doc = document as FullscreenDocument;
      if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => undefined);
      else void doc.webkitExitFullscreen?.();
    }
  }, []);

  const enter = useCallback(() => {
    const element = ref.current as FullscreenElement | null;
    if (!element) return;
    try {
      if (element.requestFullscreen) {
        void element.requestFullscreen().catch(() => setFixed(true));
      } else if (element.webkitRequestFullscreen) {
        void element.webkitRequestFullscreen();
      } else {
        setFixed(true);
      }
    } catch {
      setFixed(true);
    }
  }, [ref]);

  const active = native || fixed;
  const toggle = useCallback(() => (active ? exit() : enter()), [active, enter, exit]);

  return { active, fixed, toggle, exit };
}
