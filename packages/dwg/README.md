# @jesusjbriceno/cad-viewer-dwg

DWG support for [`@jesusjbriceno/cad-viewer-core`](../core): a format loader that reads
`.dwg` files in the browser with [LibreDWG](https://www.gnu.org/software/libredwg/)
compiled to WebAssembly ([`@mlightcad/libredwg-web`](https://github.com/mlightcad/libredwg-web)).

> [!IMPORTANT]
> **This package is GPL-3.0**, because LibreDWG is. The rest of cad-viewer is MIT and
> works without it (DXF is built in). If you ship this plugin, the combined work you
> distribute must comply with the GPL-3.0 — typically, you must make your application's
> source available under the same license. Keep it out of your bundle if that is not an
> option for you.

## Install

```bash
pnpm add @jesusjbriceno/cad-viewer-core @jesusjbriceno/cad-viewer-dwg
```

## Usage

```ts
import { CadViewer } from "@jesusjbriceno/cad-viewer-core";
import { createDwgLoader } from "@jesusjbriceno/cad-viewer-dwg";

const viewer = new CadViewer(document.querySelector("#viewer")!, {
  loaders: [createDwgLoader({ wasmUrl: "/libredwg/" })],
});
await viewer.load("/drawings/plan.dwg");
```

With the Vue or React components, pass the same loader through the `loaders` prop.

### Serving `libredwg-web.wasm`

LibreDWG needs its `.wasm` file (~10 MB, loaded once, on the first DWG). Copy it from
`node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm` to a public folder and pass
that folder (with a trailing slash) as `wasmUrl`. With Vite, for example:

```ts
// vite.config.ts — serve the wasm from /libredwg/
import { viteStaticCopy } from "vite-plugin-static-copy";

export default {
  plugins: [
    viteStaticCopy({
      targets: [{ src: "node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm", dest: "libredwg" }],
    }),
  ],
};
```

LibreDWG is imported lazily: apps that never open a DWG never download it.

## API

| Export | Description |
| --- | --- |
| `createDwgLoader(options?)` | Creates the loader. `options.wasmUrl`: where the wasm is served. `options.libredwg`: a ready instance or factory (tests, custom builds). |
| `dwgLoader` | A loader with default options. |
| `convertDwgDatabase(db, options?)` | Pure adapter from a libredwg-web `DwgDatabase` to a `CadDocument`. |

The loader reports `onProgress` phases `init`, `parse` and `convert`, honours abort
signals between phases, and always frees LibreDWG's native memory.

## Supported content

Lines, circles, arcs, ellipses, light-weight and 2D/3D polylines (bulges and widths),
splines, points, texts and multiline texts, block references with attributes (and
MINSERT grids), tables, solids, traces, 3D faces (outline), hatches (solid and pattern),
dimensions, leaders, rays, construction lines and paper-space viewports, with layers,
line types, line weights, text styles and layouts.

## Known limitations

- 3D solids, regions, meshes, multileaders, multilines, tolerances, images and wipeouts are
  counted in `document.unsupported` but not drawn.
- True colors that also carry an ACI index are shown with their true color only when
  LibreDWG reports them as true colors.
- External references (xrefs) are not resolved.
- Parsing runs on the main thread; very large drawings can block the UI while loading.

## License

[GPL-3.0](LICENSE).
