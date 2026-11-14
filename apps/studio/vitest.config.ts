import { defineConfig } from "vitest/config";

// Run workspace packages from source (no build needed before `pnpm test`).
const conditions = ["@vipgroup/source", "import", "module", "node", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions, externalConditions: conditions } },
  test: {
    // Server code by default; component tests opt into jsdom with a file comment.
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
