import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Rendering real PDFs takes a few seconds per test.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
