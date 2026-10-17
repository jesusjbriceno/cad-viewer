import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    sourcemap: true,
    // three is a peer dependency: consumers provide it, the bundle never inlines it.
    rollupOptions: { external: (id) => /^(three(\/|$)|@jesusjbriceno\/)/.test(id) },
  },
  test: {
    name: "3d",
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Tests run against the core sources, never a stale build.
    alias: {
      "@jesusjbriceno/cad-viewer-core": fileURLToPath(
        new URL("../core/src/index.ts", import.meta.url),
      ),
    },
  },
});
