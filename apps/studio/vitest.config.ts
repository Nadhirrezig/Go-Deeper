import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Server code by default; component tests opt into jsdom with a file comment.
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
