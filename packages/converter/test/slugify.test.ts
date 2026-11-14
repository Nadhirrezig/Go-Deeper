import { describe, expect, it } from "vitest";
import { slugify } from "../src/slugify";

describe("slugify", () => {
  it("lowercases, removes accents and keeps a-z0-9 and dashes", () => {
    expect(slugify("Été à Çeşme — Brochure 2026 !")).toBe("ete-a-cesme-brochure-2026");
  });

  it("returns an empty string when nothing is left", () => {
    expect(slugify("مرحبا")).toBe("");
  });
});
