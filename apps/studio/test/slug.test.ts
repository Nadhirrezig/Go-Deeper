import { isValidSlug, slugify, uniqueSlug } from "@vipgroup/shared";
import { describe, expect, it } from "vitest";

describe("slugs", () => {
  it("slugifies titles: lowercase, accents removed, dashes", () => {
    expect(slugify("Brochure Été 2026 — Maroc !")).toBe("brochure-ete-2026-maroc");
    expect(slugify("مرحبا")).toBe("");
  });

  it("suggests the first free -2, -3… suffix", () => {
    expect(uniqueSlug("brochure", new Set())).toBe("brochure");
    expect(uniqueSlug("brochure", new Set(["brochure"]))).toBe("brochure-2");
    expect(uniqueSlug("brochure", new Set(["brochure", "brochure-2", "brochure-3"]))).toBe(
      "brochure-4",
    );
    // Already numbered: continue the number instead of adding "-2-2".
    expect(uniqueSlug("brochure-2", new Set(["brochure", "brochure-2"]))).toBe("brochure-3");
    expect(uniqueSlug("", new Set())).toBe("flipbook");
  });

  it("validates slugs", () => {
    expect(isValidSlug("brochure-ete-2026")).toBe(true);
    expect(isValidSlug("Brochure")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
    expect(isValidSlug("-a")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });
});
