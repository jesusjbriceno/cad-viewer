import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import vue from "@astrojs/vue";
import { defineConfig } from "astro/config";

const source = (pkg) =>
  fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url));

// Static sandbox. SANDBOX_BASE sets the base path when hosted under a sub-path
// (e.g. "/cad-viewer/" on GitHub Pages).
export default defineConfig({
  output: "static",
  base: process.env.SANDBOX_BASE ?? "/",
  // Bind IPv4 loopback explicitly. Bare "localhost" resolves to ::1 first, and on machines
  // where IPv6 loopback is blocked the dev server starts but nothing can connect to it.
  // Use SANDBOX_HOST=0.0.0.0 to expose the sandbox on the LAN.
  server: { host: process.env.SANDBOX_HOST ?? "127.0.0.1" },
  integrations: [vue(), react()],
  vite: {
    resolve: {
      // Work on the package sources directly: no build step, instant reloads.
      alias: {
        "@jesusjbriceno/cad-viewer-core": source("core"),
        "@jesusjbriceno/cad-viewer-dwg": source("dwg"),
        "@jesusjbriceno/cad-viewer-vue": source("vue"),
        "@jesusjbriceno/cad-viewer-react": source("react"),
      },
      // The wrappers resolve vue/react from their own folders: keep a single copy.
      dedupe: ["vue", "react", "react-dom"],
    },
    optimizeDeps: { exclude: ["@mlightcad/libredwg-web"] },
  },
});
