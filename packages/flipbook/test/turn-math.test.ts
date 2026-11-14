import { describe, expect, it } from "vitest";
import {
  dragDirection,
  dragProgress,
  leafAngle,
  remainingDuration,
  shouldComplete,
  turnShading,
} from "../src/turn-math";

describe("turn maths (one-page view)", () => {
  it("reads the direction from the drag: right-to-left turns forward", () => {
    expect(dragDirection(-30)).toBe("forward");
    expect(dragDirection(30)).toBe("backward");
  });

  it("maps the drag distance to a 0–1 progress in the turn direction", () => {
    expect(dragProgress(-180, 360, "forward")).toBe(0.5);
    expect(dragProgress(90, 360, "backward")).toBe(0.25);
    expect(dragProgress(50, 360, "forward")).toBe(0);
    expect(dragProgress(-999, 360, "forward")).toBe(1);
    expect(dragProgress(-10, 0, "forward")).toBe(0);
  });

  it("turns forward from 0° to -180° and backward from -180° to 0°", () => {
    expect(leafAngle(0, "forward")).toBeCloseTo(0);
    expect(leafAngle(0.5, "forward")).toBeCloseTo(-90);
    expect(leafAngle(1, "forward")).toBeCloseTo(-180);
    expect(leafAngle(0, "backward")).toBeCloseTo(-180);
    expect(leafAngle(0.5, "backward")).toBeCloseTo(-90);
    expect(leafAngle(1, "backward")).toBeCloseTo(0);
  });

  it("completes a released turn past 30 %, or on a flick, and falls back otherwise", () => {
    expect(shouldComplete(0.4, 0, "forward")).toBe(true);
    expect(shouldComplete(0.2, 0, "forward")).toBe(false);
    // Flick left (negative velocity) completes a forward turn even when short…
    expect(shouldComplete(0.1, -0.8, "forward")).toBe(true);
    // …and a flick back the other way cancels it even when long.
    expect(shouldComplete(0.6, 0.8, "forward")).toBe(false);
    expect(shouldComplete(0.1, 0.8, "backward")).toBe(true);
  });

  it("animates the rest of a turn in proportion, never instantly", () => {
    expect(remainingDuration(0, 1)).toBe(650);
    expect(remainingDuration(0.5, 1)).toBe(325);
    expect(remainingDuration(0.99, 1)).toBe(120);
  });

  it("shades most when the page stands edge-on", () => {
    expect(turnShading(0).leaf).toBeCloseTo(0);
    expect(turnShading(-90).leaf).toBeCloseTo(0.3);
    expect(turnShading(-90).under).toBeCloseTo(0.45);
    expect(turnShading(-180).under).toBeCloseTo(0);
  });
});
