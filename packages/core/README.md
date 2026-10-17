# @jesusjbriceno/cad-viewer-core

Framework-agnostic, **view-only** 2D CAD viewer engine for the browser. Reads **DXF**
out of the box (any ASCII version), renders on a `<canvas>` with zero runtime
dependencies, and accepts format plugins such as the optional
[DWG loader](../dwg/README.md).

## Install

```bash
pnpm add @jesusjbriceno/cad-viewer-core
```

## Usage

```ts
import { CadViewer } from "@jesusjbriceno/cad-viewer-core";

const viewer = new CadViewer(document.querySelector("#viewer")!, { theme: "dark" });
viewer.on("select", ({ pick }) => console.log(pick?.type, pick?.layer));
await viewer.load("/drawings/plan.dxf"); // URL, File/Blob, ArrayBuffer or Uint8Array
```

The viewer fills its container (give it a size) and follows its size changes.

## Capabilities

| Area | What you get |
| --- | --- |
| Navigation | Drag to pan, wheel/pinch zoom at the cursor, double-click or <kbd>0</kbd> to fit, <kbd>+</kbd>/<kbd>-</kbd>, zoom window |
| Layers | `getLayers()` with colors and counts, `setLayerVisible()`, `setAllLayersVisible()` |
| Layouts | Model and paper space (`getLayouts()`, `setLayout()`), viewports show model space |
| Inspection | Hover and click picking with type, layer, handle and block path |
| Measuring | `measure` tool: distance, Δx, Δy and angle between two points |
| Output | `exportImage()` → PNG `Blob` of the current view |
| Theme | `dark` / `light` backgrounds; ACI 7 follows the theme |

No API mutates the drawing.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `loaders` | `[]` | Extra `FormatLoader`s (DXF is built in). |
| `theme` | `"dark"` | `"dark"` or `"light"`. |
| `background` | theme | CSS color overriding the theme background. |
| `tool` | `"pan"` | `"pan"`, `"zoom-window"` or `"measure"`. |
| `interactive` | `true` | `false` ignores pointer, wheel and keyboard input. |
| `fontFamily` | `"sans-serif"` | CSS font family for drawing texts. |
| `zoomPadding` | `0.05` | Margin on zoom-to-extents, as a fraction of the view. |
| `pixelRatio` | `devicePixelRatio` | Backing-store resolution. |
| `fetch`, `requestInit` | global `fetch` | Used for URL sources (e.g. auth headers). |

## Events

`load-start`, `load-progress`, `loaded`, `error`, `view-change`, `layers-change`,
`layout-change`, `tool-change`, `hover`, `select`, `measure`. `on()` returns an
unsubscribe function. A newer `load()` aborts an older one; aborted loads reject with a
`CadLoadError` whose `code` is `"aborted"` and emit no `error` event.

## Writing a format plugin

```ts
import type { FormatLoader } from "@jesusjbriceno/cad-viewer-core";

export const myLoader: FormatLoader = {
  id: "my",
  extensions: [".my"],
  canLoad: ({ bytes }) => bytes[0] === 0x4d,
  load: async (bytes, { signal, onProgress }) => {
    /* parse and return a CadDocument */
  },
};
```

Loaders produce the neutral `CadDocument` model documented in
[`src/model/types.ts`](src/model/types.ts).

## DXF coverage

Lines, circles, arcs, ellipses, (LW)polylines with bulges and widths, splines (incl.
NURBS), points, texts, multiline texts, block inserts with attributes and MINSERT
grids, tables, solids/traces/3D faces, hatches (solid and pattern), dimensions, leaders,
viewports, rays and construction lines; layers, line types, line weights, text styles
and layouts. Binary DXF, 3D solids, regions, meshes and multileaders are not drawn
(they are counted in `document.unsupported`).

## License

MIT.
