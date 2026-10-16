import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    sourcemap: true,
    rollupOptions: { external: (id) => /^(react|react-dom|@jesusjbriceno\/)/.test(id) },
  },
  test: {
    name: "react",
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    // Tests run against the core sources, never a stale build.
    alias: {
      "@jesusjbriceno/cad-viewer-core": fileURLToPath(
        new URL("../core/src/index.ts", import.meta.url),
      ),
    },
  },
});
