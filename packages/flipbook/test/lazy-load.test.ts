import { describe, expect, it } from "vitest";
import { computeLoadPlan, loadOrder } from "../src/lazy-load";
import type { PageLevel } from "../src/lazy-load";

/** Pages (1-based) holding a given level. */
const pagesAt = (plan: PageLevel[], level: PageLevel): number[] =>
  plan.flatMap((value, index) => (value === level ? [index + 1] : []));

describe("computeLoadPlan", () => {
  it("on open: standard for the visible spread only, thumbs within ±6, nothing beyond", () => {
    const plan = computeLoadPlan({ spread: [1, 1], pageCount: 48, direction: null });
    expect(plan).toHaveLength(48);
    expect(pagesAt(plan, "standard")).toEqual([1]);
    expect(pagesAt(plan, "thumb")).toEqual([2, 3, 4, 5, 6, 7]);
    expect(pagesAt(plan, "none")).toHaveLength(41);
  });

  it("on open at a double spread: both pages are standard", () => {
    const plan = computeLoadPlan({ spread: [10, 11], pageCount: 48, direction: null });
    expect(pagesAt(plan, "standard")).toEqual([10, 11]);
    expect(pagesAt(plan, "thumb")).toEqual([4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17]);
  });

  it("after a flip: standard within ±2 of the spread", () => {
    const plan = computeLoadPlan({ spread: [10, 11], pageCount: 48, direction: "forward" });
    expect(pagesAt(plan, "standard")).toEqual([8, 9, 10, 11, 12, 13]);
    expect(pagesAt(plan, "thumb")).toEqual([4, 5, 6, 7, 14, 15, 16, 17]);
    expect(plan[2]).toBe("none");
    expect(plan[17]).toBe("none");
  });

  it("single mode: ±2 pages around the page", () => {
    const plan = computeLoadPlan({ spread: [5, 5], pageCount: 20, direction: "backward" });
    expect(pagesAt(plan, "standard")).toEqual([3, 4, 5, 6, 7]);
  });

  it("covers the target of a flip in progress, even on the first flip", () => {
    const plan = computeLoadPlan({
      spread: [1, 1],
      pageCount: 48,
      direction: null,
      target: [2, 3],
    });
    expect(pagesAt(plan, "standard")).toEqual([1, 2, 3, 4, 5]);
  });

  it("stays inside the book at both ends", () => {
    const end = computeLoadPlan({ spread: [48, 48], pageCount: 48, direction: "forward" });
    expect(pagesAt(end, "standard")).toEqual([46, 47, 48]);
    expect(pagesAt(end, "thumb")).toEqual([42, 43, 44, 45]);
  });

  it("never contains anything but the three levels (zoom is not part of the plan)", () => {
    const plan = computeLoadPlan({ spread: [4, 5], pageCount: 12, direction: "forward" });
    expect(new Set(plan)).toEqual(new Set(["standard", "thumb", "none"]));
  });
});

describe("loadOrder", () => {
  it("requests the visible spread first, then the pages ahead in the flip direction", () => {
    expect(loadOrder({ spread: [4, 5], pageCount: 8, direction: "forward" })).toEqual([
      4, 5, 6, 7, 8, 3, 2, 1,
    ]);
    expect(loadOrder({ spread: [4, 5], pageCount: 8, direction: "backward" })).toEqual([
      4, 5, 3, 2, 1, 6, 7, 8,
    ]);
  });

  it("lists every page exactly once", () => {
    const order = loadOrder({ spread: [1, 1], pageCount: 10, direction: null });
    expect([...order].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
