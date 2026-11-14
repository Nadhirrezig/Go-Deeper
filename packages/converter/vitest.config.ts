import { defineConfig } from "vitest/config";

// Run workspace packages from source (no build needed before `pnpm test`).
const conditions = ["@vipgroup/source", "import", "module", "node", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions, externalConditions: conditions } },
  test: {
    // Rendering real PDFs takes a few seconds per test.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
