import { copyFile } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
  // The reader is a client component; esbuild drops module directives, so add it back.
  banner: { js: '"use client";' },
  // Ship the plain stylesheet as @vipgroup/flipbook/styles.css.
  onSuccess: async () => {
    await copyFile("src/styles.css", "dist/styles.css");
  },
});
