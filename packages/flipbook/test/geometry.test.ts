import { describe, expect, it } from "vitest";
import { hitZone } from "../src/hit-zone";
import { keyToAction } from "../src/keyboard";
import { computeLayout } from "../src/layout";
import { clampZoom, panBy, stepScale, zoomAt } from "../src/zoom-math";

describe("computeLayout", () => {
  const ratio = 1000 / 1414;

  it("uses two pages on a wide container", () => {
    const layout = computeLayout(1200, 640, ratio);
    expect(layout?.mode).toBe("double");
    expect(layout?.bookWidth).toBe((layout?.pageWidth ?? 0) * 2);
    expect(layout?.pageHeight).toBeLessThanOrEqual(641);
  });

  it("uses one page on a phone in portrait", () => {
    const layout = computeLayout(390, 600, ratio);
    expect(layout).toMatchObject({ mode: "single", pageWidth: 390, bookWidth: 390 });
  });

  it("uses two pages on a phone in landscape", () => {
    expect(computeLayout(844, 330, ratio)?.mode).toBe("double");
  });

  it("keeps the page ratio and fits inside the container", () => {
    const layout = computeLayout(800, 500, ratio);
    expect(layout).not.toBeNull();
    if (!layout) return;
    expect(layout.bookWidth).toBeLessThanOrEqual(800);
    expect(layout.pageWidth / layout.pageHeight).toBeCloseTo(ratio, 1);
  });

  it("returns null while the container has no size", () => {
    expect(computeLayout(0, 600, ratio)).toBeNull();
    expect(computeLayout(600, 0, ratio)).toBeNull();
  });
});

describe("hitZone", () => {
  const double = { width: 1000, height: 700, pageWidth: 500 };
  const single = { width: 500, height: 700, pageWidth: 500 };

  it("finds corners, edge strips and the middle in double mode", () => {
    expect(hitZone(990, 690, double, "double")).toBe("corner");
    expect(hitZone(10, 10, double, "double")).toBe("corner");
    expect(hitZone(20, 350, double, "double")).toBe("prev");
    expect(hitZone(980, 350, double, "double")).toBe("next");
    expect(hitZone(500, 350, double, "double")).toBe("middle");
    expect(hitZone(300, 350, double, "double")).toBe("middle");
  });

  it("has a wide tap zone on each side and no corners in single mode", () => {
    expect(hitZone(490, 690, single, "single")).toBe("next");
    expect(hitZone(400, 350, single, "single")).toBe("next");
    expect(hitZone(10, 690, single, "single")).toBe("prev");
    expect(hitZone(100, 10, single, "single")).toBe("prev");
    expect(hitZone(250, 350, single, "single")).toBe("middle");
  });

  it("reports clicks outside the book", () => {
    expect(hitZone(-5, 10, double, "double")).toBe("outside");
    expect(hitZone(500, 800, double, "double")).toBe("outside");
  });
});

describe("zoom maths", () => {
  const content = { width: 800, height: 600 };
  const viewport = { width: 1000, height: 600 };

  it("steps through 1 · 1.5 · 2 · 2.5 · 3 and stops at the limits", () => {
    expect(stepScale(1, 1)).toBe(1.5);
    expect(stepScale(2.6, 1)).toBe(3);
    expect(stepScale(3, 1)).toBe(3);
    expect(stepScale(2.6, -1)).toBe(2.5);
    expect(stepScale(1.5, -1)).toBe(1);
    expect(stepScale(1, -1)).toBe(1);
  });

  it("keeps the point under the cursor in place", () => {
    const next = zoomAt({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 }, content, viewport);
    // Content point (100, 50) at 1× is now at 100 = x + 100 × 2.
    expect(next).toEqual({ scale: 2, x: -100, y: -50 });
  });

  it("clamps the scale to 1–3 and the pan to the content", () => {
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 9, { x: 0, y: 0 }, content, viewport).scale).toBe(3);
    expect(clampZoom({ scale: 2, x: 5000, y: -5000 }, content, viewport)).toEqual({
      scale: 2,
      x: 300,
      y: -300,
    });
    // Content smaller than the viewport on an axis stays centred on it.
    expect(panBy({ scale: 1, x: 0, y: 0 }, 50, 50, content, viewport)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });
});

describe("keyToAction", () => {
  const reading = { zoomed: false, editing: false };

  it("maps the reader keys", () => {
    expect(keyToAction({ key: "ArrowRight" }, reading)).toBe("next");
    expect(keyToAction({ key: "ArrowLeft" }, reading)).toBe("prev");
    expect(keyToAction({ key: "Home" }, reading)).toBe("first");
    expect(keyToAction({ key: "End" }, reading)).toBe("last");
    expect(keyToAction({ key: "+" }, reading)).toBe("zoomIn");
    expect(keyToAction({ key: "-" }, reading)).toBe("zoomOut");
    expect(keyToAction({ key: "Escape" }, reading)).toBe("escape");
  });

  it("ignores other keys and browser shortcuts", () => {
    expect(keyToAction({ key: "a" }, reading)).toBeNull();
    expect(keyToAction({ key: "+", ctrlKey: true }, reading)).toBeNull();
    expect(keyToAction({ key: "ArrowLeft", altKey: true }, reading)).toBeNull();
  });

  it("disables flipping while zoomed, but not zoom keys or Escape", () => {
    const zoomed = { zoomed: true, editing: false };
    expect(keyToAction({ key: "ArrowRight" }, zoomed)).toBeNull();
    expect(keyToAction({ key: "End" }, zoomed)).toBeNull();
    expect(keyToAction({ key: "-" }, zoomed)).toBe("zoomOut");
    expect(keyToAction({ key: "Escape" }, zoomed)).toBe("escape");
  });

  it("leaves typing alone in the page field", () => {
    const editing = { zoomed: false, editing: true };
    expect(keyToAction({ key: "ArrowLeft" }, editing)).toBeNull();
    expect(keyToAction({ key: "-" }, editing)).toBeNull();
    expect(keyToAction({ key: "Escape" }, editing)).toBe("escape");
  });
});
