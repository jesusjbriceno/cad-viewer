import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    sourcemap: true,
  },
  test: { name: "core", environment: "node", include: ["test/**/*.test.ts"] },
});
