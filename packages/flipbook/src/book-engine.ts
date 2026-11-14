// page-flip ships no types. The reference makes our ambient typings follow this file into any
// program that type-checks it from source (the studio does); an `import` cannot do that.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./page-flip.d.ts" />
import type { PageFlip, PageFlipState } from "page-flip";
import type { PageLevel } from "./lazy-load";
import type { BookLayout } from "./layout";
import { applyLevels, createPage } from "./page-element";
import type { FlipDirection, ResolvedBook } from "./types";

export type EngineState = PageFlipState;

export interface BookEngineOptions {
  /** Empty element owned by the engine; React never renders children into it. */
  host: HTMLElement;
  book: ResolvedBook;
  /** 1-based. */
  startPage: number;
  layout: BookLayout;
  pageAlt: (page: number) => string;
  /** First visible page (1-based) after a turn, a jump or a layout change. */
  onPage: (page: number) => void;
  onState: (state: EngineState) => void;
  /** A fold or flip started in this direction (used to preload its target spread). */
  onFlipStart: (direction: FlipDirection) => void;
  /** A page is being turned by animation: play the sound. Not fired for jumps. */
  onTurn: () => void;
}

export interface BookEngine {
  next(): void;
  prev(): void;
  /** Jump straight to a page (1-based), without animating through the pages between. */
  goTo(page: number): void;
  setLayout(layout: BookLayout): void;
  /** Apply a load plan (index 0 = page 1); `order` lists pages in request order. */
  setLevels(levels: readonly PageLevel[], order: readonly number[]): void;
  /** The visible book element (one or two pages wide). */
  getBlock(): HTMLElement;
  /** Make page-flip forget a touch in progress (a pinch started on the book). */
  cancelTouch(): void;
  destroy(): void;
}

type PageFlipCtor = typeof PageFlip;

/** page-flip touches `window` when evaluated, so it is only ever imported from an effect. */
async function loadPageFlip(): Promise<PageFlipCtor> {
  const mod = (await import("page-flip")) as unknown as {
    PageFlip?: PageFlipCtor;
    default?: { PageFlip?: PageFlipCtor };
  };
  const ctor = mod.PageFlip ?? mod.default?.PageFlip;
  if (!ctor) throw new Error("page-flip did not export PageFlip.");
  return ctor;
}

/**
 * page-flip never stops its requestAnimationFrame loop, even after `destroy()`:
 *   loop = (t) => { this.render(t); requestAnimationFrame(loop); }
 * To end it, the instance's `render` is replaced by a function that makes the very next
 * `requestAnimationFrame` call (the loop re-arming itself, in the same synchronous turn)
 * a no-op, then restores the real one in a microtask, before any other code can run.
 */
function stopRenderLoop(pageFlip: PageFlip): void {
  const render = pageFlip.getRender() as unknown as { render: (timer: number) => void };
  render.render = () => {
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    queueMicrotask(() => {
      window.requestAnimationFrame = original;
    });
  };
}

/**
 * Create the page-flip book inside `options.host`.
 * Resolves to null when `isCancelled()` turns true while page-flip is loading
 * (unmount, or the first pass of React Strict Mode): nothing is created then.
 */
export async function createBookEngine(
  options: BookEngineOptions,
  isCancelled: () => boolean,
): Promise<BookEngine | null> {
  const PageFlipClass = await loadPageFlip();
  if (isCancelled()) return null;

  const { host, book } = options;
  const lastIndex = book.pageCount - 1;

  // page-flip removes its root element on destroy, so it gets an element of its own.
  const block = document.createElement("div");
  block.className = "vgf-book";
  host.replaceChildren(block);

  const pages = book.pages.map((page) => createPage(page.n, options.pageAlt(page.n)));

  const applyBlockSize = (layout: BookLayout): void => {
    block.style.width = `${layout.bookWidth}px`;
    block.style.height = `${layout.pageHeight}px`;
    block.style.minWidth = "0";
    block.style.minHeight = "0";
  };
  applyBlockSize(options.layout);

  const startIndex = Math.min(Math.max(options.startPage - 1, 0), lastIndex);
  const pageFlip = new PageFlipClass(block, {
    startPage: startIndex,
    // "stretch" without autoSize: the block (sized by us) decides the page size.
    size: "stretch",
    autoSize: false,
    width: book.pageWidth,
    height: book.pageHeight,
    // page-flip shows one page when the block is narrower than 2 × minWidth:
    // minWidth = our page width selects exactly the mode `computeLayout` chose.
    minWidth: options.layout.pageWidth,
    maxWidth: 100_000,
    minHeight: 1,
    maxHeight: 100_000,
    usePortrait: true,
    showCover: true,
    mobileScrollSupport: true,
    drawShadow: true,
    maxShadowOpacity: 0.35,
    flippingTime: 700,
    swipeDistance: 30,
    showPageCorners: true,
    // Clicks turn the page on corners only; the reader adds the edge strips itself,
    // which keeps the middle of the page free for double-click zoom.
    disableFlipByClick: true,
    clickEventForward: true,
    useMouseEvents: true,
  });
  // The constructor sets min sizes from the settings; the block size is ours.
  applyBlockSize(options.layout);

  // `disableFlipByClick` also blocks page-flip's own flipNext/flipPrev (buttons, keys and its
  // swipe gesture) whenever their start point is not on a corner, which is always the case
  // for flipPrev in single-page mode. Lift the rule for the duration of those calls.
  const settings = pageFlip.getSettings();
  const allowed =
    (flip: (corner?: "top" | "bottom") => void) =>
    (corner?: "top" | "bottom"): void => {
      settings.disableFlipByClick = false;
      try {
        flip(corner);
      } finally {
        settings.disableFlipByClick = true;
      }
    };
  pageFlip.flipNext = allowed(pageFlip.flipNext.bind(pageFlip));
  pageFlip.flipPrev = allowed(pageFlip.flipPrev.bind(pageFlip));

  let destroyed = false;
  let jumping = false;
  let state: EngineState = "read";
  let soundPlayed = false;

  const direction = (): FlipDirection =>
    pageFlip.getRender().getDirection() === 1 ? "backward" : "forward";

  pageFlip.on("flip", (event) => {
    if (destroyed) return;
    // A drag released past the middle turns the page without a "flipping" state.
    if (!jumping && state === "user_fold" && !soundPlayed) {
      soundPlayed = true;
      options.onTurn();
    }
    options.onPage(Number(event.data) + 1);
  });

  pageFlip.on("changeState", (event) => {
    if (destroyed) return;
    state = event.data as EngineState;
    if (state === "read") soundPlayed = false;
    if (state === "flipping" && !soundPlayed) {
      soundPlayed = true;
      options.onTurn();
    }
    options.onState(state);
    if (state !== "read") {
      // "user_fold" is announced before page-flip has set the direction: read it right after.
      queueMicrotask(() => {
        if (!destroyed && state !== "read") options.onFlipStart(direction());
      });
    }
  });

  pageFlip.loadFromHTML(pages.map((page) => page.element));

  return {
    next: () => {
      if (!destroyed) pageFlip.flipNext();
    },
    prev: () => {
      if (!destroyed) pageFlip.flipPrev();
    },
    goTo(page) {
      if (destroyed) return;
      const index = Math.min(Math.max(page - 1, 0), lastIndex);
      jumping = true;
      try {
        pageFlip.turnToPage(index);
      } finally {
        jumping = false;
      }
    },
    setLayout(layout) {
      // A mode change replaces the engine; React may still hand the old one a last layout.
      if (destroyed) return;
      applyBlockSize(layout);
      settings.minWidth = layout.pageWidth;
      jumping = true;
      try {
        // Re-fits the pages; switches between one and two pages when the mode changed.
        pageFlip.update();
      } finally {
        jumping = false;
      }
    },
    setLevels(levels, order) {
      if (!destroyed) applyLevels(pages, book, levels, order);
    },
    getBlock: () => block,
    cancelTouch() {
      if (destroyed) return;
      // Private field of page-flip's UI: clearing it makes the pending touch a no-op.
      (pageFlip.getUI() as { touchPoint?: unknown }).touchPoint = null;
      pageFlip.userStop({ x: 0, y: 0 }, true);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopRenderLoop(pageFlip);
      pageFlip.destroy();
      host.replaceChildren();
    },
  };
}
