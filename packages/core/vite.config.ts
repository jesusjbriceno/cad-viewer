import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["@jesusjbriceno/source"] },
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    sourcemap: true,
    rollupOptions: { external: [] },
  },
  test: { name: "core", environment: "node", include: ["test/**/*.test.ts"] },
});
