import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["@jesusjbriceno/source"] },
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    sourcemap: true,
    rollupOptions: { external: (id) => /^(react|react-dom|@jesusjbriceno\/)/.test(id) },
  },
  test: { name: "react", environment: "happy-dom", include: ["test/**/*.test.ts"] },
});
