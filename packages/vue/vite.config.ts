import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    // Two entries: the 2D component (index) and the optional 3D one (subpath "/3d"),
    // so 2D-only consumers never import three.js.
    lib: {
      entry: { index: "src/index.ts", "3d": "src/3d.ts" },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
    sourcemap: true,
    rollupOptions: { external: (id) => /^(vue|three(\/|$)|@jesusjbriceno\/)/.test(id) },
  },
  test: {
    name: "vue",
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    // Tests run against the core sources, never a stale build.
    alias: {
      "@jesusjbriceno/cad-viewer-core": fileURLToPath(
        new URL("../core/src/index.ts", import.meta.url),
      ),
      "@jesusjbriceno/cad-viewer-3d": fileURLToPath(new URL("../3d/src/index.ts", import.meta.url)),
    },
  },
});
