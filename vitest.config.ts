import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Defaults to node_modules/.vite; overridable so the cache can live outside
  // the repo (e.g. a sandboxed/read-only node_modules during review).
  cacheDir: process.env.VITEST_CACHE_DIR || undefined,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: [],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
