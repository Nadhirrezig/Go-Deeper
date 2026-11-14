import { describe, expect, it } from "vitest";
import { joinTextItems } from "../src/text";

const item = (str: string, x: number, y: number, width: number, hasEOL = false) => ({
  str,
  hasEOL,
  transform: [12, 0, 0, 12, x, y],
  width,
  height: 12,
});

describe("joinTextItems", () => {
  it("uses hasEOL for line breaks and collapses whitespace", () => {
    const text = joinTextItems([item("Hello   ", 0, 100, 40, true), item("  world", 0, 80, 40)]);
    expect(text).toBe("Hello\nworld");
  });

  it("adds a space between separate boxes and keeps split words together", () => {
    const text = joinTextItems([
      item("Avion", 0, 100, 30),
      item("Trans", 60, 100, 30),
      item("fert", 90, 100, 20),
    ]);
    expect(text).toBe("Avion Transfert");
  });

  it("skips overlapping duplicates (fake bold)", () => {
    expect(joinTextItems([item("Inclus", 0, 100, 36), item("Inclus", 0.3, 100, 36)])).toBe(
      "Inclus",
    );
  });

  it("ignores marked-content items", () => {
    expect(joinTextItems([{ type: "beginMarkedContent" }, item("ok", 0, 0, 10)])).toBe("ok");
  });
});
