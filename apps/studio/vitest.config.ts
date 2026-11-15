import { defineConfig } from "vitest/config";

// Run workspace packages from source (no build needed before `pnpm test`).
const conditions = ["@vipgroup/source", "import", "module", "node", "default"];

export default defineConfig({
  resolve: { conditions },
  // Vitest also hands the server conditions to Node (`--conditions`), where "import" would make
  // CommonJS packages require each other's ES modules (pg → pg-pool). Node adds "import" or
  // "require" by itself, so only the workspace's own condition is listed here.
  ssr: {
    resolve: {
      conditions: ["@vipgroup/source", "node", "development|production"],
      externalConditions: ["@vipgroup/source"],
    },
  },
  test: {
    // Server code by default; component tests opt into jsdom with a file comment.
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
