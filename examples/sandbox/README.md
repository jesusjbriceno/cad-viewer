# cad-viewer sandbox

Static [Astro](https://astro.build) site to try the viewer by hand. One page per
integration, all with the same toolbar, layer panel, selection and measurement info:

| Page | What it exercises |
| --- | --- |
| `/vanilla/` | `@jesusjbriceno/cad-viewer-core` directly, no framework |
| `/vue/` | `<CadViewer>` from `@jesusjbriceno/cad-viewer-vue` (Astro island, `client:only`) |
| `/react/` | `<CadViewer>` from `@jesusjbriceno/cad-viewer-react` (Astro island, `client:only`) |

Each page loads two sample drawings (a DXF and a DWG) and accepts your own `.dxf` /
`.dwg` files via the file picker or drag & drop. Files are read locally; nothing is
uploaded.

## Run

From the repository root:

```bash
pnpm install
pnpm dev            # astro dev → http://localhost:4321
pnpm sandbox:build  # static site in examples/sandbox/dist
```

The sandbox imports the package **sources** (Vite aliases in `astro.config.mjs`), so
changes in `packages/*/src` show up without a build. `scripts/prepare-assets.mjs` copies
the LibreDWG wasm and the samples into `public/` before `dev` and `build`.

Set `SANDBOX_BASE` (e.g. `/cad-viewer/`) to build for a sub-path such as GitHub Pages.

## License

GPL-3.0, because it bundles the GPL-3.0 DWG plugin (LibreDWG). The sample DWG comes from
the LibreDWG test suite.
