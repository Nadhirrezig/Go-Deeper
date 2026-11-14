import { copyFile } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // Inline the manifest type so the published .d.ts does not depend on the workspace.
  dts: { resolve: ["@vipgroup/shared"] },
  clean: true,
  sourcemap: true,
  // page-flip stays a separate, lazily imported module (it must never load on the server).
  external: ["react", "react-dom", "react/jsx-runtime", "page-flip"],
  // The reader is a client component; esbuild drops module directives, so add it back.
  banner: { js: '"use client";' },
  // Ship the plain stylesheet as @vipgroup/flipbook/styles.css.
  onSuccess: async () => {
    await copyFile("src/styles.css", "dist/styles.css");
  },
});
