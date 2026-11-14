import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { FlipbookManifest } from "@vipgroup/shared";
import { createBookEngine } from "./book-engine";
import type { BookEngine, EngineState } from "./book-engine";
import { hitZone } from "./hit-zone";
import { IconClose } from "./icons";
import { keyToAction } from "./keyboard";
import { fillLabel, mergeLabels } from "./labels";
import type { FlipbookLabels } from "./labels";
import { computeLayout } from "./layout";
import type { BookLayout } from "./layout";
import { computeLoadPlan, loadOrder } from "./lazy-load";
import {
  assertManifest,
  fetchManifest,
  FlipbookError,
  manifestBase,
  resolveBook,
} from "./manifest";
import type { FlipbookErrorCode } from "./manifest";
import type { SearchOutcome } from "./search";
import { resultsLabel, SearchPanel } from "./search-panel";
import { createSingleEngine } from "./single-engine";
import { createPageSound, readSoundPreference, writeSoundPreference } from "./sound";
import type { PageSound } from "./sound";
import { clampPage, formatSpread, neighbourSpread, spreadForPage } from "./spread";
import type { Spread } from "./spread";
import { Thumbnails } from "./thumbnails";
import { Toolbar } from "./toolbar";
import type { FlipbookProps, FlipDirection, ResolvedBook } from "./types";
import { useFullscreen } from "./use-fullscreen";
import { useBookSearch } from "./use-search";
import { MAX_ZOOM, OPEN_ZOOM, panBy, stepScale, zoomAt } from "./zoom-math";
import type { Size, ZoomState } from "./zoom-math";
import { ZoomOverlay } from "./zoom-overlay";

type LoadResult =
  | { ok: true; book: ResolvedBook; manifest: FlipbookManifest }
  | { ok: false; code: FlipbookErrorCode };

const classNames = (...names: (string | false | undefined)[]): string =>
  names.filter(Boolean).join(" ");

/**
 * Page-flip reader for a book produced by `@vipgroup/converter`.
 * Client-only work (fetch, page-flip, audio) happens in effects, so the component can be
 * rendered by a Next.js server page without `dynamic(..., { ssr: false })`.
 */
export function Flipbook(props: FlipbookProps) {
  const { manifestUrl, manifest, baseUrl, onReady, className } = props;
  const labels = useMemo(() => mergeLabels(props.labels), [props.labels]);
  const [attempt, setAttempt] = useState(0);
  // One object per thing to load: results are matched to it, so stale loads are ignored.
  const source = useMemo(
    () => ({ manifestUrl, manifest, baseUrl, attempt }),
    [manifestUrl, manifest, baseUrl, attempt],
  );
  const [loaded, setLoaded] = useState<{ source: object; result: LoadResult } | null>(null);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const controller = new AbortController();
    const load = async (): Promise<LoadResult> => {
      const documentUrl = window.location.href;
      if (source.manifest) {
        const valid = assertManifest(source.manifest);
        const base = manifestBase({ baseUrl: source.baseUrl ?? "./" }, documentUrl);
        return { ok: true, manifest: valid, book: resolveBook(valid, base) };
      }
      const url = manifestBase({ manifestUrl: source.manifestUrl ?? "" }, documentUrl);
      const fetched = await fetchManifest(url, controller.signal);
      return { ok: true, manifest: fetched, book: resolveBook(fetched, url) };
    };
    void load()
      .catch((error: unknown): LoadResult => ({
        ok: false,
        code: error instanceof FlipbookError ? error.code : "load",
      }))
      .then((result) => {
        if (controller.signal.aborted) return;
        setLoaded({ source, result });
        if (result.ok) onReadyRef.current?.(result.manifest);
      });
    return () => controller.abort();
  }, [source]);

  const result = loaded?.source === source ? loaded.result : null;

  if (!result) {
    return (
      <div
        className={classNames("vgf-root", className)}
        role="region"
        aria-label={labels.loading}
        aria-busy="true"
        data-status="loading"
      >
        <div className="vgf-stage">
          <div className="vgf-skeleton vgf-skeleton--generic" role="status">
            <span className="vgf-sr-only">{labels.loading}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div
        className={classNames("vgf-root", className)}
        role="region"
        aria-label={labels.errorLoad}
        data-status="error"
      >
        <div className="vgf-stage">
          <div className="vgf-error" role="alert">
            <p>{result.code === "version" ? labels.errorVersion : labels.errorLoad}</p>
            {result.code === "load" && (
              <button
                type="button"
                className="vgf-button vgf-button--text"
                onClick={() => setAttempt((n) => n + 1)}
              >
                {labels.retry}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Reader
      key={result.book.id}
      book={result.book}
      labels={labels}
      className={className}
      startPage={props.startPage}
      sound={props.sound}
      download={props.download ?? true}
      search={props.search ?? true}
      onPageChange={props.onPageChange}
    />
  );
}

interface ReaderProps {
  book: ResolvedBook;
  labels: FlipbookLabels;
  className?: string;
  startPage?: number;
  sound?: boolean;
  download: boolean;
  search: boolean;
  onPageChange?: (page: number) => void;
}

/** Reader width from which search opens as a side panel instead of a bottom sheet. */
export const SIDE_PANEL_MIN_WIDTH = 720;

interface Point {
  x: number;
  y: number;
}

/** Distance and midpoint of the first two active pointers. */
function measurePinch(pointers: Map<number, Point>): { distance: number; x: number; y: number } {
  const [a, b] = [...pointers.values()];
  if (!a || !b) return { distance: 0, x: 0, y: 0 };
  return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

const isInteractive = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest("button, input, a, .vgf-thumbs") !== null;

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** The reader itself, mounted once the manifest is loaded. Never rendered on the server. */
function Reader({
  book,
  labels,
  className,
  startPage,
  sound,
  download,
  search: searchEnabled,
  onPageChange,
}: ReaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const { pageCount } = book;
  const pageRatio = book.pageWidth / book.pageHeight;

  const [areaSize, setAreaSize] = useState<Size | null>(null);
  const layout = useMemo<BookLayout | null>(
    () => (areaSize ? computeLayout(areaSize.width, areaSize.height, pageRatio) : null),
    [areaSize, pageRatio],
  );
  const hasLayout = layout !== null;
  const mode = layout?.mode ?? "double";

  const [page, setPage] = useState(() => clampPage(startPage ?? 1, pageCount));
  const [spreadFirst, spreadLast] = spreadForPage(page, pageCount, mode);
  const spread = useMemo<Spread>(() => [spreadFirst, spreadLast], [spreadFirst, spreadLast]);

  const [engine, setEngine] = useState<BookEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [engineState, setEngineState] = useState<EngineState>("read");
  const [direction, setDirection] = useState<FlipDirection | null>(null);
  const [target, setTarget] = useState<Spread | null>(null);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => readSoundPreference(sound ?? true));
  const [announcement, setAnnouncement] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [wide, setWide] = useState(true);
  const search = useBookSearch(book.search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const fullscreen = useFullscreen(rootRef);
  const zoomed = zoom !== null;

  const soundRef = useRef<PageSound | null>(null);
  const gesture = useRef({
    pointers: new Map<number, Point>(),
    pinch: null as { distance: number; x: number; y: number } | null,
    down: { x: 0, y: 0 },
    lastTap: { time: 0, x: 0, y: 0 },
  });
  // Latest values for callbacks that are created once (engine events, native listeners).
  const live = useRef({ page, mode, layout, labels, soundOn, zoomed, engine, onPageChange });
  useEffect(() => {
    live.current = { page, mode, layout, labels, soundOn, zoomed, engine, onPageChange };
  });

  // --- Size: fit the book to its container -------------------------------------------------
  useEffect(() => {
    const root = rootRef.current;
    const area = areaRef.current;
    if (!root || !area) return;
    const measure = (): void => {
      const width = area.clientWidth;
      const height = area.clientHeight;
      // Height the reader needs at this width, capped at 85vh: used by the default CSS height
      // so the reader hugs the book instead of leaving empty bands (ignored if the host sets one).
      const chrome = root.clientHeight - height;
      const natural = computeLayout(width, window.innerHeight * 0.85 - chrome, pageRatio);
      if (natural) {
        root.style.setProperty("--vgf-natural-height", `${natural.pageHeight + chrome}px`);
      }
      setAreaSize((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
      setWide(root.clientWidth >= SIDE_PANEL_MIN_WIDTH);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(area);
    window.addEventListener("resize", measure);
    const frame = window.requestAnimationFrame(measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.cancelAnimationFrame(frame);
    };
  }, [pageRatio]);

  // --- Engine: page-flip for two pages, our own page turn for one page --------------------
  // page-flip's one-page mode turns a clone of the page (same image on both sides) and runs
  // backward turns off screen; phones in portrait get `createSingleEngine` instead.
  // A mode change (rotating the phone, resizing) rebuilds the engine at the current page.
  useEffect(() => {
    const host = hostRef.current;
    const initialLayout = live.current.layout;
    if (!host || !hasLayout || !initialLayout) return;
    let cancelled = false;
    let created: BookEngine | null = null;

    const spreadOf = (first: number): Spread => spreadForPage(first, pageCount, live.current.mode);

    const createEngine = mode === "single" ? createSingleEngine : createBookEngine;
    void createEngine(
      {
        host,
        book,
        startPage: live.current.page,
        layout: initialLayout,
        pageAlt: (n) => fillLabel(live.current.labels.pageAlt, { n }),
        onPage: (next) => {
          const previous = live.current.page;
          setTarget(null);
          if (next === previous) return;
          live.current.page = next;
          setPage(next);
          setDirection(next > previous ? "forward" : "backward");
          setAnnouncement(
            fillLabel(live.current.labels.announce, {
              page: formatSpread(spreadOf(next)),
              total: pageCount,
            }),
          );
          live.current.onPageChange?.(next);
        },
        onState: (state) => {
          setEngineState(state);
          if (state === "read") setTarget(null);
        },
        onFlipStart: (flipDirection) => {
          const current = spreadOf(live.current.page);
          setTarget(neighbourSpread(current, pageCount, live.current.mode, flipDirection));
        },
        onTurn: () => {
          if (!live.current.soundOn) return;
          soundRef.current ??= createPageSound();
          soundRef.current.play();
        },
      },
      () => cancelled,
    )
      .then((instance) => {
        if (!instance) return;
        if (cancelled) {
          instance.destroy();
          return;
        }
        created = instance;
        setEngine(instance);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      created?.destroy();
      setEngine((current) => (current === created ? null : current));
      setEngineState("read");
    };
  }, [book, hasLayout, pageCount, mode]);

  useEffect(() => {
    if (engine && layout) engine.setLayout(layout);
  }, [engine, layout]);

  // --- Lazy loading ------------------------------------------------------------------------
  useEffect(() => {
    if (!engine) return;
    const input = { spread, pageCount, direction, target };
    engine.setLevels(computeLoadPlan(input), loadOrder(input));
  }, [engine, spread, pageCount, direction, target]);

  useEffect(
    () => () => {
      soundRef.current?.dispose();
      soundRef.current = null;
    },
    [],
  );

  // --- Zoom --------------------------------------------------------------------------------
  const zoomGeometry = useCallback(() => {
    const stage = stageRef.current;
    const current = live.current.layout;
    if (!stage || !current) return null;
    const rect = stage.getBoundingClientRect();
    const [first, last] = spreadForPage(live.current.page, pageCount, current.mode);
    return {
      centre: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      viewport: { width: rect.width, height: rect.height },
      content: { width: current.pageWidth * (last - first + 1), height: current.pageHeight },
    };
  }, [pageCount]);

  /** Set the scale (around a screen point when given). Scale 1 closes the zoom. */
  const zoomTo = useCallback(
    (nextScale: number | ((scale: number) => number), clientPoint?: Point) => {
      const geometry = zoomGeometry();
      if (!geometry) return;
      const point = clientPoint
        ? { x: clientPoint.x - geometry.centre.x, y: clientPoint.y - geometry.centre.y }
        : { x: 0, y: 0 };
      setZoom((current) => {
        const base = current ?? { scale: 1, x: 0, y: 0 };
        const scale = typeof nextScale === "function" ? nextScale(base.scale) : nextScale;
        const next = zoomAt(base, scale, point, geometry.content, geometry.viewport);
        return next.scale <= 1.001 ? null : next;
      });
    },
    [zoomGeometry],
  );

  const panZoom = useCallback(
    (dx: number, dy: number) => {
      const geometry = zoomGeometry();
      if (!geometry) return;
      setZoom((current) =>
        current ? panBy(current, dx, dy, geometry.content, geometry.viewport) : current,
      );
    },
    [zoomGeometry],
  );

  // Ctrl + wheel (and trackpad pinch) zooms; a native listener is needed to preventDefault.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = Math.max(-60, Math.min(60, event.deltaY));
      zoomTo((scale) => scale * Math.exp(-delta * 0.01), { x: event.clientX, y: event.clientY });
    };
    const onTouchMove = (event: TouchEvent): void => {
      // Two fingers, or any touch while zoomed, belong to the reader, not to page scrolling.
      if (event.touches.length > 1 || live.current.zoomed) event.preventDefault();
    };
    const onTouchStart = (event: TouchEvent): void => {
      if (event.touches.length < 2) return;
      // A pinch: hide the second finger from page-flip (capture phase, before its listener)
      // and make it drop the first one, so no page is dragged or swiped while pinching.
      event.stopPropagation();
      live.current.engine?.cancelTouch();
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchstart", onTouchStart, { capture: true });
    };
  }, [zoomTo]);

  // --- Pointer gestures on the stage (pinch, pan, edge clicks, double-click) ----------------
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = gesture.current;
    state.down = { x: event.clientX, y: event.clientY };
    if (isInteractive(event.target)) return;

    // page-flip cancels the default mousedown, so focus the reader ourselves:
    // keyboard shortcuts only work while focus is inside it.
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) {
      // Focus taken with the mouse or a finger: no focus ring (see styles.css).
      root.dataset.pointerFocus = "true";
      root.focus({ preventScroll: true });
    }
    if (live.current.soundOn) {
      soundRef.current ??= createPageSound();
      soundRef.current.unlock();
    }

    const isTouch = event.pointerType === "touch";
    if (!isTouch && !(live.current.zoomed && event.button === 0)) return;
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!isTouch) event.currentTarget.setPointerCapture(event.pointerId);
    if (state.pointers.size === 2) state.pinch = measurePinch(state.pointers);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = gesture.current;
    const previous = state.pointers.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    state.pointers.set(event.pointerId, point);

    if (state.pointers.size >= 2 && state.pinch) {
      const now = measurePinch(state.pointers);
      if (now.distance > 0 && state.pinch.distance > 0) {
        const factor = now.distance / state.pinch.distance;
        zoomTo((scale) => scale * factor, { x: now.x, y: now.y });
        panZoom(now.x - state.pinch.x, now.y - state.pinch.y);
      }
      state.pinch = now;
    } else if (state.pointers.size === 1 && live.current.zoomed) {
      panZoom(point.x - previous.x, point.y - previous.y);
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = gesture.current;
    state.pointers.delete(event.pointerId);
    if (state.pointers.size < 2) state.pinch = null;
  };

  const onStageClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const state = gesture.current;
    if (isInteractive(event.target)) return;
    // A drag (page turn or pan) also ends with a click: ignore it.
    if (Math.hypot(event.clientX - state.down.x, event.clientY - state.down.y) > 6) return;

    const now = event.timeStamp;
    const doubleTap =
      now - state.lastTap.time < 350 &&
      Math.hypot(event.clientX - state.lastTap.x, event.clientY - state.lastTap.y) < 40;
    state.lastTap = doubleTap
      ? { time: 0, x: 0, y: 0 }
      : { time: now, x: event.clientX, y: event.clientY };

    if (live.current.zoomed) {
      if (doubleTap) setZoom(null);
      return;
    }
    if (!engine || !layout) return;
    const rect = engine.getBlock().getBoundingClientRect();
    const zone = hitZone(
      event.clientX - rect.left,
      event.clientY - rect.top,
      { width: rect.width, height: rect.height, pageWidth: layout.pageWidth },
      layout.mode,
    );
    // Corners are handled by page-flip itself (two-page mode only).
    if (zone === "prev") engine.prev();
    else if (zone === "next") engine.next();
    else if (zone === "middle" && doubleTap) {
      zoomTo(OPEN_ZOOM, { x: event.clientX, y: event.clientY });
    }
  };

  // --- Commands ----------------------------------------------------------------------------
  const goPrevious = useCallback(() => engine?.prev(), [engine]);
  const goNext = useCallback(() => engine?.next(), [engine]);
  const jumpTo = useCallback((target: number) => engine?.goTo(target), [engine]);
  const zoomIn = useCallback(() => zoomTo((scale) => stepScale(scale, 1)), [zoomTo]);
  const zoomOut = useCallback(() => zoomTo((scale) => stepScale(scale, -1)), [zoomTo]);
  const toggleThumbnails = useCallback(() => {
    setThumbnailsOpen((open) => !open);
    setSearchOpen(false);
  }, []);

  // --- Search ------------------------------------------------------------------------------
  const searchLayout = wide ? "side" : "sheet";
  const loadSearch = search.load;
  const openSearch = useCallback(() => {
    loadSearch(); // First open fetches search.json; later opens reuse it.
    setSearchOpen(true);
    setThumbnailsOpen(false);
    // Already open (Ctrl+F again): just go back to the input.
    searchInputRef.current?.focus();
  }, [loadSearch]);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const toggleSearch = useCallback(
    () => (searchOpen ? closeSearch() : openSearch()),
    [searchOpen, openSearch, closeSearch],
  );

  // Focus the input on open, and give it back to the toolbar button on close.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus({ preventScroll: true });
    else if (wasOpen.current) searchButtonRef.current?.focus({ preventScroll: true });
    wasOpen.current = searchOpen;
  }, [searchOpen]);

  // The active row belongs to one list of results: a new list starts on its first row.
  const outcome = search.outcome;
  const [active, setActive] = useState<{ outcome: SearchOutcome | null; index: number }>({
    outcome: null,
    index: 0,
  });
  const activeResult = active.outcome === outcome ? active.index : 0;
  const setActiveResult = useCallback((index: number) => setActive({ outcome, index }), [outcome]);

  const selectResult = useCallback(
    (index: number) => {
      const result = outcome?.results[index];
      if (!result) return;
      setActiveResult(index);
      jumpTo(result.page);
      // Bottom sheet: get out of the way of the page. Side panel: stays open.
      if (searchLayout === "sheet") closeSearch();
    },
    [outcome, setActiveResult, jumpTo, searchLayout, closeSearch],
  );

  const searchAnnouncement =
    !searchOpen || !outcome
      ? ""
      : outcome.total === 0
        ? labels.searchNoResults
        : resultsLabel(labels, outcome.total);
  const toggleSound = useCallback(() => {
    const next = !live.current.soundOn;
    writeSoundPreference(next);
    setSoundOn(next);
  }, []);

  // Keys act only while focus is inside the reader: the host page is never hijacked.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    // Keyboard in use: show the focus ring again.
    delete event.currentTarget.dataset.pointerFocus;
    const action = keyToAction(event, { zoomed, editing: isEditable(event.target) });
    if (!action) return;
    if (action === "search") {
      // Search turned off: let the browser's own find run.
      if (!searchEnabled) return;
      openSearch();
    } else if (action === "escape") {
      const inSearch = event.target instanceof Element && event.target.closest(".vgf-search");
      if (searchOpen && (inSearch || !zoomed)) closeSearch();
      else if (zoomed) setZoom(null);
      else if (thumbnailsOpen) setThumbnailsOpen(false);
      else if (fullscreen.fixed) fullscreen.exit();
      else return; // Native fullscreen: the browser handles Escape itself.
    } else if (action === "next") goNext();
    else if (action === "prev") goPrevious();
    else if (action === "first") jumpTo(1);
    else if (action === "last") jumpTo(pageCount);
    else if (action === "zoomIn") zoomIn();
    else zoomOut();
    event.preventDefault();
  };

  // In double mode a lone cover (front or back) is slid to the centre while at rest.
  const alone = spread[0] === spread[1];
  const shift =
    mode === "double" && alone && engineState !== "flipping"
      ? spread[0] === 1
        ? "front"
        : "back"
      : "none";

  return (
    <div
      ref={rootRef}
      className={classNames(
        "vgf-root",
        fullscreen.active && "vgf-root--fullscreen",
        fullscreen.fixed && "vgf-root--fixed",
        className,
      )}
      role="region"
      aria-label={book.title}
      tabIndex={0}
      data-status={failed ? "error" : engine ? "ready" : "loading"}
      data-mode={mode}
      data-zoomed={zoomed ? "true" : "false"}
      data-search={searchOpen ? searchLayout : undefined}
      onKeyDown={onKeyDown}
    >
      {/* Stage and search panel share this row (side panel) or column (bottom sheet): the
          book area shrinks when the panel opens and the book re-fits (ResizeObserver). */}
      <div className="vgf-body" data-layout={searchLayout}>
        <div
          ref={stageRef}
          className="vgf-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClick={onStageClick}
        >
          <div ref={areaRef} className="vgf-book-area">
            <div className="vgf-book-shift" data-shift={shift}>
              {/* Owned by the engine: React renders nothing inside. */}
              <div ref={hostRef} className="vgf-book-host" />
            </div>
            {!engine && !failed && layout && (
              <div
                className="vgf-skeleton"
                role="status"
                style={{ width: layout.bookWidth, height: layout.pageHeight }}
              >
                <span className="vgf-sr-only">{labels.loading}</span>
              </div>
            )}
            {failed && (
              <div className="vgf-error" role="alert">
                <p>{labels.errorLoad}</p>
              </div>
            )}
          </div>

          {zoom && layout && (
            <ZoomOverlay
              pages={book.pages.slice(spread[0] - 1, spread[1])}
              pageWidth={layout.pageWidth}
              pageHeight={layout.pageHeight}
              zoom={zoom}
              labels={labels}
            />
          )}

          {thumbnailsOpen && !zoomed && (
            <Thumbnails book={book} spread={spread} labels={labels} onSelect={jumpTo} />
          )}

          {fullscreen.fixed && (
            <button
              type="button"
              className="vgf-button vgf-close"
              aria-label={labels.close}
              title={labels.close}
              onClick={fullscreen.exit}
            >
              <IconClose />
            </button>
          )}
        </div>

        {searchOpen && searchEnabled && (
          <SearchPanel
            labels={labels}
            layout={searchLayout}
            status={search.status}
            query={search.query}
            outcome={outcome}
            tooShort={search.tooShort}
            activeIndex={activeResult}
            inputRef={searchInputRef}
            onQuery={search.setQuery}
            onActive={setActiveResult}
            onSelect={selectResult}
            onRetry={search.retry}
            onClose={closeSearch}
          />
        )}
      </div>

      <Toolbar
        labels={labels}
        spread={spread}
        pageCount={pageCount}
        canFlip={engine !== null && !zoomed}
        ready={engine !== null}
        zoomed={zoomed}
        canZoomIn={(zoom?.scale ?? 1) < MAX_ZOOM}
        thumbnailsOpen={thumbnailsOpen}
        fullscreen={fullscreen.active}
        soundOn={soundOn}
        search={
          searchEnabled
            ? { open: searchOpen, onToggle: toggleSearch, buttonRef: searchButtonRef }
            : null
        }
        download={download ? { href: book.pdf, fileName: `${book.slug || "document"}.pdf` } : null}
        onPrevious={goPrevious}
        onNext={goNext}
        onJump={jumpTo}
        onToggleThumbnails={toggleThumbnails}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onToggleFullscreen={fullscreen.toggle}
        onToggleSound={toggleSound}
      />

      <div className="vgf-sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="vgf-sr-only" aria-live="polite" aria-atomic="true">
        {searchAnnouncement}
      </div>
    </div>
  );
}
