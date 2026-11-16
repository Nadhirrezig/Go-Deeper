import type { BookEngine, BookEngineOptions } from "./book-engine";
import type { BookLayout } from "./layout";
import { applyLevels, createPage } from "./page-element";
import type { PageElement } from "./page-element";
import {
  DRAG_START,
  dragDirection,
  dragProgress,
  easeInOut,
  easeOut,
  leafAngle,
  remainingDuration,
  shouldComplete,
  turnShading,
} from "./turn-math";
import type { FlipDirection } from "./types";

/**
 * One-page reader (phones in portrait), replacing page-flip's portrait mode, which turns a
 * clone of the page (same image on both sides) and hides backward turns off screen.
 *
 * The turning page ("leaf") rotates in 3D around the spine (left edge), with a white back.
 * Forward: the current page lifts and turns away to the left, revealing the next one.
 * Backward: the previous page comes back from the left and lands on the current one.
 * Pointer events only (one per touch, no emulated mouse events, no hover effects).
 */

interface Turn {
  direction: FlipDirection;
  /** Page shown when the turn completes (1-based). */
  to: number;
  leaf: PageElement;
  under: PageElement;
  progress: number;
  /** True once released / started by a tap: an animation is running to `target`. */
  animating: boolean;
  /** 1: the turn completes, 0: it falls back (released too early). */
  target: 0 | 1;
}

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  /** Recent positions, for the release velocity. */
  samples: { x: number; t: number }[];
  /** False until the movement is clearly horizontal. */
  turning: boolean;
}

const SHOWN_CLASS = "vgf-page--shown";

/** Same contract as `createBookEngine`; resolves to null when cancelled before creation. */
export async function createSingleEngine(
  options: BookEngineOptions,
  isCancelled: () => boolean,
): Promise<BookEngine | null> {
  // Same async shape as the page-flip engine, so the reader treats both alike.
  await Promise.resolve();
  if (isCancelled()) return null;

  const { host, book } = options;
  const pageCount = book.pageCount;

  const block = document.createElement("div");
  block.className = "vgf-book vgf-book--single";

  const stack = document.createElement("div");
  stack.className = "vgf-single-stack";

  const underShadow = document.createElement("div");
  underShadow.className = "vgf-turn-shadow";

  const leafEl = document.createElement("div");
  leafEl.className = "vgf-leaf";
  const leafShade = document.createElement("div");
  leafShade.className = "vgf-leaf-shade";
  const leafBack = document.createElement("div");
  leafBack.className = "vgf-leaf-back";
  leafEl.append(leafShade, leafBack);

  block.append(stack, underShadow, leafEl);
  host.replaceChildren(block);

  const pages = book.pages.map((page) => createPage(page.n, options.pageAlt(page.n)));
  for (const page of pages) stack.appendChild(page.element);

  let layout: BookLayout = options.layout;
  let current = Math.min(Math.max(options.startPage, 1), pageCount);
  let turn: Turn | null = null;
  let drag: Drag | null = null;
  let frame = 0;
  let destroyed = false;

  const pageAt = (n: number): PageElement | undefined => pages[n - 1];

  const applyLayout = (next: BookLayout): void => {
    layout = next;
    block.style.width = `${next.pageWidth}px`;
    block.style.height = `${next.pageHeight}px`;
    block.style.perspective = `${Math.round(next.pageWidth * 4)}px`;
  };

  /** Show exactly these pages in the stack (the leaf page lives in the leaf meanwhile). */
  const show = (...visible: (PageElement | undefined)[]): void => {
    for (const page of pages) {
      page.element.classList.toggle(SHOWN_CLASS, visible.includes(page));
    }
  };

  const draw = (progress: number): void => {
    if (!turn) return;
    turn.progress = progress;
    const angle = leafAngle(progress, turn.direction);
    const shading = turnShading(angle);
    leafEl.style.transform = `rotateY(${angle}deg)`;
    leafShade.style.opacity = String(shading.leaf);
    underShadow.style.opacity = String(shading.under);
  };

  const startTurn = (direction: FlipDirection): boolean => {
    if (turn) finishNow();
    const to = direction === "forward" ? current + 1 : current - 1;
    if (to < 1 || to > pageCount) return false;
    const leaf = direction === "forward" ? pageAt(current) : pageAt(to);
    const under = direction === "forward" ? pageAt(to) : pageAt(current);
    if (!leaf || !under) return false;

    turn = { direction, to, leaf, under, progress: 0, animating: false, target: 1 };
    // `show` hides every other page, so it must run before the leaf page is shown.
    show(under);
    // Leaf face first, so the shade and the white back stay on top of it.
    leafEl.insertBefore(leaf.element, leafShade);
    leaf.element.classList.add(SHOWN_CLASS);
    leafEl.classList.add(SHOWN_CLASS);
    block.dataset.turning = direction;
    draw(0);
    options.onFlipStart(direction);
    return true;
  };

  const endTurn = (completed: boolean): void => {
    if (!turn) return;
    const { leaf, to } = turn;
    turn = null;
    window.cancelAnimationFrame(frame);
    stack.appendChild(leaf.element);
    leafEl.classList.remove(SHOWN_CLASS);
    leafEl.style.transform = "";
    underShadow.style.opacity = "0";
    delete block.dataset.turning;
    if (completed) current = to;
    show(pageAt(current));
    options.onState("read");
    if (completed) options.onPage(current);
  };

  /** Jump to the end of a running turn (a new turn or a jump interrupts it). */
  function finishNow(): void {
    if (!turn) return;
    endTurn(turn.animating && turn.target === 1);
  }

  const animateTo = (target: 0 | 1, ease: (t: number) => number): void => {
    if (!turn) return;
    const active = turn;
    active.animating = true;
    active.target = target;
    const from = active.progress;
    const duration = remainingDuration(from, target);
    // Timed from the first frame's own timestamp: frame times and performance.now() can count
    // from different origins (they do in jsdom), and mixing them stalls the turn.
    let started: number | undefined;
    const step = (now: number): void => {
      if (destroyed || turn !== active) return;
      started ??= now;
      const t = Math.min((now - started) / duration, 1);
      draw(from + (target - from) * ease(t));
      if (t < 1) frame = window.requestAnimationFrame(step);
      else endTurn(target === 1);
    };
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(step);
  };

  const turnBy = (direction: FlipDirection): void => {
    if (destroyed || !startTurn(direction)) return;
    options.onTurn();
    options.onState("flipping");
    animateTo(1, easeInOut);
  };

  // --- Finger / mouse drag ------------------------------------------------------------------
  const releaseDrag = (cancelled: boolean): void => {
    const ended = drag;
    drag = null;
    if (!ended?.turning || !turn || turn.animating) return;
    const [a, b] = [ended.samples[0], ended.samples[ended.samples.length - 1]];
    const velocity = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
    const complete = !cancelled && shouldComplete(turn.progress, velocity, turn.direction);
    if (complete) options.onTurn();
    options.onState("flipping");
    animateTo(complete ? 1 : 0, easeOut);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (drag) {
      // A second finger: a pinch, not a page turn.
      releaseDrag(true);
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (turn?.animating) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      samples: [{ x: event.clientX, t: event.timeStamp }],
      turning: false,
    };
    if (event.pointerType === "mouse") block.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.turning) {
      if (Math.abs(dx) > DRAG_START && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (!startTurn(dragDirection(dx))) {
          drag = null; // No page that way (first or last page).
          return;
        }
        drag.turning = true;
        options.onState("user_fold");
      } else if (Math.abs(dy) > DRAG_START) {
        drag = null; // Vertical: the browser scrolls the host page (touch-action: pan-y).
        return;
      } else {
        return;
      }
    }
    if (!turn) return;
    drag.samples.push({ x: event.clientX, t: event.timeStamp });
    // Keep the last ~100 ms for the release velocity.
    while (drag.samples.length > 2 && event.timeStamp - (drag.samples[0]?.t ?? 0) > 100) {
      drag.samples.shift();
    }
    draw(dragProgress(dx, layout.pageWidth, turn.direction));
    event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (drag && event.pointerId === drag.pointerId) releaseDrag(false);
  };
  const onPointerCancel = (event: PointerEvent): void => {
    if (drag && event.pointerId === drag.pointerId) releaseDrag(true);
  };

  block.addEventListener("pointerdown", onPointerDown);
  block.addEventListener("pointermove", onPointerMove);
  block.addEventListener("pointerup", onPointerUp);
  block.addEventListener("pointercancel", onPointerCancel);

  applyLayout(options.layout);
  show(pageAt(current));
  // Like page-flip, report the opening page once the book is in place.
  queueMicrotask(() => {
    if (!destroyed) options.onPage(current);
  });

  return {
    next: () => turnBy("forward"),
    prev: () => turnBy("backward"),
    goTo(page) {
      if (destroyed) return;
      const target = Math.min(Math.max(page, 1), pageCount);
      if (turn) endTurn(false);
      drag = null;
      current = target;
      show(pageAt(current));
      options.onPage(current);
    },
    setLayout(next) {
      if (!destroyed) applyLayout(next);
    },
    setLevels(levels, order) {
      if (!destroyed) applyLevels(pages, book, levels, order);
    },
    getBlock: () => block,
    cancelTouch() {
      if (!destroyed) releaseDrag(true);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.cancelAnimationFrame(frame);
      block.removeEventListener("pointerdown", onPointerDown);
      block.removeEventListener("pointermove", onPointerMove);
      block.removeEventListener("pointerup", onPointerUp);
      block.removeEventListener("pointercancel", onPointerCancel);
      host.replaceChildren();
    },
  };
}
