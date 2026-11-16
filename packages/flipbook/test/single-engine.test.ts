import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookEngine, BookEngineOptions } from "../src/book-engine";
import { resolveBook } from "../src/manifest";
import { createSingleEngine } from "../src/single-engine";
import { makeManifest } from "./helpers";

const layout = { mode: "single", pageWidth: 360, pageHeight: 509, bookWidth: 360 } as const;

let options: BookEngineOptions;
let engine: BookEngine;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const host = document.createElement("div");
  document.body.appendChild(host);
  options = {
    host,
    book: resolveBook(makeManifest(5), "https://cdn.example.com/b/"),
    startPage: 2,
    layout,
    pageAlt: (n) => `Page ${n}`,
    onPage: vi.fn(),
    onState: vi.fn(),
    onFlipStart: vi.fn(),
    onTurn: vi.fn(),
  };
  const created = await createSingleEngine(options, () => false);
  if (!created) throw new Error("engine not created");
  engine = created;
  await Promise.resolve(); // initial onPage (microtask)
});

afterEach(() => {
  engine.destroy();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const block = () => options.host.querySelector<HTMLElement>(".vgf-book--single")!;
const leaf = () => options.host.querySelector<HTMLElement>(".vgf-leaf")!;
const shownInStack = () =>
  [
    ...options.host.querySelectorAll<HTMLElement>(".vgf-single-stack .vgf-page.vgf-page--shown"),
  ].map((page) => Number(page.dataset.page));
const leafPage = () => leaf().querySelector<HTMLElement>(".vgf-page");

/** Pointer events as a finger produces them (jsdom has no PointerEvent constructor). */
let clock = 0;
function pointer(type: string, x: number, y = 200, id = 1, advanceMs = 16): void {
  clock += advanceMs;
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  // Explicit timestamps: the release velocity (flick or not) is computed from them.
  Object.defineProperty(event, "timeStamp", { value: clock });
  Object.assign(event, { pointerId: id, pointerType: "touch" });
  block().dispatchEvent(event);
}

describe("createSingleEngine (one-page view)", () => {
  it("creates nothing when cancelled (Strict Mode, fast unmount)", async () => {
    const host = document.createElement("div");
    expect(await createSingleEngine({ ...options, host }, () => true)).toBeNull();
    expect(host.childElementCount).toBe(0);
  });

  it("opens on the start page with every page element in place", () => {
    expect(options.host.querySelectorAll(".vgf-page")).toHaveLength(5);
    expect(shownInStack()).toEqual([2]);
    expect(options.onPage).toHaveBeenCalledWith(2);
    expect(block().style.width).toBe("360px");
  });

  it("turns forward: the current page lifts away over the next one, with a white back", () => {
    engine.next();
    expect(options.onTurn).toHaveBeenCalledTimes(1);
    expect(options.onFlipStart).toHaveBeenCalledWith("forward");
    // During the turn: page 2 is the leaf (front face visible), page 3 waits underneath.
    expect(leaf().classList.contains("vgf-page--shown")).toBe(true);
    expect(leafPage()?.dataset.page).toBe("2");
    expect(leafPage()?.classList.contains("vgf-page--shown")).toBe(true);
    expect(shownInStack()).toEqual([3]);
    expect(leaf().querySelector(".vgf-leaf-back")).not.toBeNull();

    vi.advanceTimersByTime(330);
    expect(leaf().style.transform).toMatch(/rotateY\(-\d+/);

    vi.advanceTimersByTime(500);
    expect(options.onPage).toHaveBeenLastCalledWith(3);
    expect(leaf().classList.contains("vgf-page--shown")).toBe(false);
    expect(leafPage()).toBeNull();
    expect(shownInStack()).toEqual([3]);
    expect(options.onState).toHaveBeenLastCalledWith("read");
  });

  it("turns backward: the previous page comes back from the left onto the current one", () => {
    engine.prev();
    expect(options.onFlipStart).toHaveBeenCalledWith("backward");
    expect(leafPage()?.dataset.page).toBe("1");
    expect(shownInStack()).toEqual([2]);
    expect(leaf().style.transform).toBe("rotateY(-180deg)");

    vi.advanceTimersByTime(800);
    expect(options.onPage).toHaveBeenLastCalledWith(1);
    expect(shownInStack()).toEqual([1]);
  });

  it("does nothing past the first or last page", () => {
    engine.goTo(1);
    engine.prev();
    expect(leaf().classList.contains("vgf-page--shown")).toBe(false);
    engine.goTo(5);
    engine.next();
    expect(leaf().classList.contains("vgf-page--shown")).toBe(false);
    expect(options.onTurn).not.toHaveBeenCalled();
  });

  it("completes a short but fast drag (flick)", () => {
    pointer("pointerdown", 330);
    pointer("pointermove", 310, 200, 1, 10);
    pointer("pointermove", 290, 200, 1, 10);
    pointer("pointerup", 290, 200, 1, 10);
    expect(options.onTurn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(800);
    expect(options.onPage).toHaveBeenLastCalledWith(3);
  });

  it("follows a horizontal drag and completes it on release", () => {
    pointer("pointerdown", 330);
    pointer("pointermove", 300);
    expect(options.onState).toHaveBeenLastCalledWith("user_fold");
    pointer("pointermove", 120);
    expect(leafPage()?.dataset.page).toBe("2");
    pointer("pointerup", 120);
    expect(options.onTurn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(800);
    expect(options.onPage).toHaveBeenLastCalledWith(3);
  });

  it("falls back when a short drag is released", () => {
    pointer("pointerdown", 330);
    pointer("pointermove", 318, 200, 1, 150); // slow: no flick
    pointer("pointermove", 310, 200, 1, 150);
    pointer("pointerup", 310, 200, 1, 150);
    vi.advanceTimersByTime(800);
    expect(options.onTurn).not.toHaveBeenCalled();
    expect(options.onPage).toHaveBeenLastCalledWith(2);
    expect(shownInStack()).toEqual([2]);
  });

  it("leaves vertical swipes to the browser (page scroll)", () => {
    pointer("pointerdown", 200, 300);
    pointer("pointermove", 203, 200);
    pointer("pointermove", 120, 150);
    pointer("pointerup", 120, 150);
    vi.advanceTimersByTime(800);
    expect(leaf().classList.contains("vgf-page--shown")).toBe(false);
    expect(options.onPage).toHaveBeenLastCalledWith(2);
  });

  it("drops a drag when a second finger lands (pinch)", () => {
    pointer("pointerdown", 330, 200, 1);
    pointer("pointermove", 200, 200, 1);
    pointer("pointerdown", 100, 200, 2);
    vi.advanceTimersByTime(800);
    expect(options.onTurn).not.toHaveBeenCalled();
    expect(shownInStack()).toEqual([2]);
  });

  it("finishes a running turn at once when another starts (fast repeated taps)", () => {
    engine.next();
    vi.advanceTimersByTime(100);
    engine.next();
    expect(options.onPage).toHaveBeenCalledWith(3);
    vi.advanceTimersByTime(800);
    expect(options.onPage).toHaveBeenLastCalledWith(4);
  });

  it("stops cleanly on destroy", () => {
    engine.next();
    engine.destroy();
    vi.advanceTimersByTime(800);
    expect(options.host.childElementCount).toBe(0);
    expect(options.onPage).not.toHaveBeenCalledWith(3);
  });
});

describe("createSingleEngine timing", () => {
  it("times a turn from its frames, whatever origin they count from", () => {
    // jsdom's frame times count from its window's creation, performance.now() from the process
    // start (seen 0.5 s apart here, more on a slow PC): a turn must not wait for the gap.
    const fakeRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => fakeRaf((time) => callback(time - 5000));
    try {
      engine.next();
      vi.advanceTimersByTime(1500);
      expect(options.onPage).toHaveBeenLastCalledWith(3);
      expect(leaf().classList.contains("vgf-page--shown")).toBe(false);
    } finally {
      window.requestAnimationFrame = fakeRaf;
    }
  });
});
