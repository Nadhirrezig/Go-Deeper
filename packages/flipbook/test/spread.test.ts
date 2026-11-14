import { describe, expect, it } from "vitest";
import {
  clampPage,
  formatSpread,
  neighbourSpread,
  parsePageInput,
  spreadForPage,
} from "../src/spread";

describe("spreadForPage", () => {
  it("shows one page at a time in single mode", () => {
    expect(spreadForPage(1, 10, "single")).toEqual([1, 1]);
    expect(spreadForPage(7, 10, "single")).toEqual([7, 7]);
  });

  it("keeps the cover alone, then pairs pages in double mode", () => {
    expect(spreadForPage(1, 10, "double")).toEqual([1, 1]);
    expect(spreadForPage(2, 10, "double")).toEqual([2, 3]);
    expect(spreadForPage(3, 10, "double")).toEqual([2, 3]);
    expect(spreadForPage(8, 10, "double")).toEqual([8, 9]);
  });

  it("leaves a last even page alone", () => {
    expect(spreadForPage(10, 10, "double")).toEqual([10, 10]);
    expect(spreadForPage(9, 9, "double")).toEqual([8, 9]);
  });

  it("clamps out-of-range pages", () => {
    expect(spreadForPage(99, 10, "double")).toEqual([10, 10]);
    expect(spreadForPage(-3, 10, "single")).toEqual([1, 1]);
    expect(clampPage(Number.NaN, 10)).toBe(1);
  });
});

describe("neighbourSpread", () => {
  it("gives the spread a flip leads to", () => {
    expect(neighbourSpread([1, 1], 10, "double", "forward")).toEqual([2, 3]);
    expect(neighbourSpread([4, 5], 10, "double", "backward")).toEqual([2, 3]);
    expect(neighbourSpread([4, 4], 10, "single", "forward")).toEqual([5, 5]);
  });

  it("returns null at the ends of the book", () => {
    expect(neighbourSpread([1, 1], 10, "double", "backward")).toBeNull();
    expect(neighbourSpread([10, 10], 10, "double", "forward")).toBeNull();
  });
});

describe("page indicator", () => {
  it("formats a spread", () => {
    expect(formatSpread([1, 1])).toBe("1");
    expect(formatSpread([2, 3])).toBe("2–3");
  });

  it("parses what the user types", () => {
    expect(parsePageInput("12", 48)).toBe(12);
    expect(parsePageInput("  7 ", 48)).toBe(7);
    expect(parsePageInput("12–13", 48)).toBe(12);
    expect(parsePageInput("p. 5", 48)).toBe(5);
  });

  it("clamps to the book and rejects text without a number", () => {
    expect(parsePageInput("0", 48)).toBe(1);
    expect(parsePageInput("999", 48)).toBe(48);
    expect(parsePageInput("", 48)).toBeNull();
    expect(parsePageInput("abc", 48)).toBeNull();
  });
});
