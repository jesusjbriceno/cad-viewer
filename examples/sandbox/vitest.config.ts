import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "sandbox",
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Tests run against the package sources, never a stale build.
    alias: {
      "@jesusjbriceno/cad-viewer-core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
      "@jesusjbriceno/cad-viewer-3d": fileURLToPath(
        new URL("../../packages/3d/src/index.ts", import.meta.url),
      ),
    },
  },
});
