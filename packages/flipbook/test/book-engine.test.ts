import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBookEngine } from "../src/book-engine";
import type { BookEngineOptions } from "../src/book-engine";
import { resolveBook } from "../src/manifest";
import * as fake from "./fake-page-flip";
import { makeManifest } from "./helpers";

vi.mock("page-flip", async () => {
  const { FakePageFlip } = await import("./fake-page-flip");
  return { PageFlip: FakePageFlip };
});

const BASE = "https://cdn.example.com/b/";
const layout = { mode: "double", pageWidth: 400, pageHeight: 566, bookWidth: 800 } as const;

function makeOptions(overrides: Partial<BookEngineOptions> = {}): BookEngineOptions {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return {
    host,
    book: resolveBook(makeManifest(12), BASE),
    startPage: 1,
    layout,
    pageAlt: (n) => `Page ${n}`,
    onPage: vi.fn(),
    onState: vi.fn(),
    onFlipStart: vi.fn(),
    onTurn: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  fake.instances.length = 0;
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("createBookEngine", () => {
  it("creates nothing when cancelled while page-flip loads (Strict Mode, fast unmount)", async () => {
    const options = makeOptions();
    const engine = await createBookEngine(options, () => true);
    expect(engine).toBeNull();
    expect(fake.instances).toHaveLength(0);
    expect(options.host.childElementCount).toBe(0);
  });

  it("builds one element per page and sizes the book itself", async () => {
    const options = makeOptions({ startPage: 5 });
    const engine = await createBookEngine(options, () => false);
    const instance = fake.instances[0]!;

    expect(engine?.getBlock().style.width).toBe("800px");
    expect(engine?.getBlock().style.height).toBe("566px");
    expect(options.host.querySelectorAll(".vgf-page")).toHaveLength(12);
    expect(instance.settings).toMatchObject({
      startPage: 4,
      minWidth: 400,
      disableFlipByClick: true,
    });

    // A layout change resizes the block and tells page-flip which mode to use.
    engine?.setLayout({ mode: "single", pageWidth: 300, pageHeight: 425, bookWidth: 300 });
    expect(engine?.getBlock().style.width).toBe("300px");
    expect(instance.settings.minWidth).toBe(300);
    expect(instance.updates).toBe(1);
  });

  it("applies image levels: standard over thumb, thumb only, or nothing", async () => {
    const options = makeOptions();
    const engine = await createBookEngine(options, () => false);
    const images = (n: number) => {
      const page = options.host.querySelector(`.vgf-page[data-page="${n}"]`)!;
      return {
        thumb: page.querySelector(".vgf-page-thumb")!.getAttribute("src"),
        image: page.querySelector(".vgf-page-img")!.getAttribute("src"),
      };
    };
    const order = Array.from({ length: 12 }, (_, i) => i + 1);

    engine?.setLevels(["standard", "thumb", "none"], order);
    expect(images(1)).toEqual({
      thumb: `${BASE}pages/001-thumb.webp`,
      image: `${BASE}pages/001.webp`,
    });
    expect(images(2)).toEqual({ thumb: `${BASE}pages/002-thumb.webp`, image: null });
    expect(images(3)).toEqual({ thumb: null, image: null });

    // Moving away releases the images again.
    engine?.setLevels(["none", "standard"], order);
    expect(images(1)).toEqual({ thumb: null, image: null });
    expect(images(2).image).toBe(`${BASE}pages/002.webp`);
    expect(options.host.querySelector('img[src*="-zoom"]')).toBeNull();
  });

  it("lifts page-flip's corner-only click rule just for next() and prev()", async () => {
    const engine = await createBookEngine(makeOptions(), () => false);
    const instance = fake.instances[0]!;
    engine?.next();
    engine?.prev();
    expect(instance.nextCalls).toHaveLength(1);
    expect(instance.prevCalls).toHaveLength(1);
    expect(instance.clickRuleDuringFlip).toEqual([false, false]);
    expect(instance.settings.disableFlipByClick).toBe(true);
  });

  it("reports turns (1-based) and plays the sound for animated turns only", async () => {
    const options = makeOptions();
    const engine = await createBookEngine(options, () => false);
    const instance = fake.instances[0]!;

    instance.emit("changeState", "flipping");
    instance.emit("flip", 2);
    instance.emit("changeState", "read");
    expect(options.onTurn).toHaveBeenCalledTimes(1);
    expect(options.onPage).toHaveBeenLastCalledWith(3);

    // A drag that turns the page never enters "flipping".
    instance.emit("changeState", "user_fold");
    instance.emit("flip", 4);
    instance.emit("changeState", "read");
    expect(options.onTurn).toHaveBeenCalledTimes(2);

    // Jumps are silent.
    engine?.goTo(9);
    expect(instance.turnCalls).toEqual([8]);
    expect(options.onPage).toHaveBeenLastCalledWith(9);
    expect(options.onTurn).toHaveBeenCalledTimes(2);
  });

  it("drops a touch in progress when asked (pinch)", async () => {
    const engine = await createBookEngine(makeOptions(), () => false);
    engine?.cancelTouch();
    expect(fake.instances[0]!.ui.touchPoint).toBeNull();
  });

  it("destroys page-flip and stops its animation loop without leaving rAF patched", async () => {
    const options = makeOptions();
    const engine = await createBookEngine(options, () => false);
    const instance = fake.instances[0]!;
    const realRaf = window.requestAnimationFrame;

    engine?.destroy();
    expect(instance.destroyed).toBe(true);
    expect(options.host.childElementCount).toBe(0);

    // page-flip's loop is `render(t); requestAnimationFrame(loop)`: that re-arm must be swallowed…
    const loop = vi.fn();
    instance.renderer.render(0);
    expect(window.requestAnimationFrame(loop)).toBe(0);
    // …and the real function is back before anything else can run.
    await Promise.resolve();
    expect(window.requestAnimationFrame).toBe(realRaf);
    expect(loop).not.toHaveBeenCalled();

    // Events arriving after destroy are ignored.
    instance.emit("flip", 3);
    expect(options.onPage).not.toHaveBeenCalled();
  });
});
