import { describe, expect, it } from "vitest";
import { version } from "./index";

describe("@vipgroup/converter", () => {
  it("exports a semver version string", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
