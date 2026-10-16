import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["@jesusjbriceno/source"] },
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    sourcemap: true,
    rollupOptions: { external: (id) => /^@(jesusjbriceno|mlightcad)\//.test(id) },
  },
  test: { name: "dwg", environment: "node", include: ["test/**/*.test.ts"] },
});
