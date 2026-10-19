import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    sourcemap: true,
    rollupOptions: { external: (id) => /^@(jesusjbriceno|mlightcad)\//.test(id) },
  },
  test: {
    name: "dwg",
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Tests run against the core sources, never a stale build.
    alias: {
      "@cadscene/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
});
