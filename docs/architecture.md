# Architecture

**In one minute:** every file format is turned into one neutral `CadDocument`. The
core flattens that document into a display list of world-space primitives, and a
renderer paints the visible part of it on a `<canvas>`. Vue and React components are
thin shells around the same `CadViewer` class. Nothing in the pipeline writes back to
the drawing: the viewer is read-only by construction.

3D models follow the same shape with a different neutral model: a `FormatLoader<CadScene>`
produces a `CadScene` of `CadMesh` parts, `Cad3DViewer` builds three.js objects from it, and
the Vue/React 3D components wrap that viewer behind an optional subpath. The 2D path never
imports three.js.

```text
 File / URL / ArrayBuffer
          │
          ▼
 FormatLoader registry ──► DXF loader (core, MIT)
          │            └─► DWG loader (cad-viewer-dwg, GPL-3.0, LibreDWG/WASM)
          ▼
     CadDocument            neutral model: header, layers, blocks, layouts, entities
          │
          ▼
     DisplayList            world-space polylines, fills and texts, per layer,
          │                 block inserts expanded, colors resolved
          ▼
     Renderer (Canvas2D)    view transform, culling, hit testing
          │
          ▼
     CadViewer              interaction (pan/zoom/pick/measure), events, API
       ├── <CadViewer> Vue 3
       └── <CadViewer> React 18/19
```

```text
 STL / OBJ file, URL or bytes
          │
          ▼
 FormatLoader<CadScene> ──► STL loader (cad-viewer-3d)
          │              └─► OBJ loader (cad-viewer-3d)
          ▼
      CadScene              meshes (positions, normals, indices) + layers + materials
          │
          ▼
      buildThreeScene       one Mesh per part, shared materials, edge overlay
          │
          ▼
      Cad3DViewer           WebGLRenderer, orbit camera, layers, PNG, events
       ├── <Cad3DViewer> Vue 3   (@cadscene/vue/3d)
       └── <Cad3DViewer> React   (@cadscene/react/3d)
```

## Packages and boundaries

| Package | Depends on | License | Owns |
| --- | --- | --- | --- |
| `cad-viewer-core` | nothing at runtime | MIT | model, DXF parser, display list, renderer, `CadViewer`, `CadScene` types |
| `cad-viewer-dwg` | core (peer), `@mlightcad/libredwg-web` | GPL-3.0 | DWG → `CadDocument` adapter |
| `cad-viewer-3d` | core (peer), `three` (peer) | MIT | STL/OBJ parsers, scene builder, `Cad3DViewer` |
| `cad-viewer-vue` | core, `vue` (peer); `cad-viewer-3d` + `three` (optional peers, `/3d`) | MIT | Vue 2D and 3D components |
| `cad-viewer-react` | core, `react` (peer); `cad-viewer-3d` + `three` (optional peers, `/3d`) | MIT | React 2D and 3D components |

Rule: **core never imports a format plugin, a framework or three.js.** Plugins register a
`FormatLoader`; wrappers create a `CadViewer` (2D) or a `Cad3DViewer` (3D). This keeps the
GPL code opt-in, three.js out of 2D bundles, and the core usable from plain JavaScript.
A 2D-only app resolves `@cadscene/vue` and never the `/3d` subpath, so
`three` is never bundled.

## Two viewers, one set of conventions

There is **no single viewer that opens every format**. 2D drawings and 3D models have separate
classes, separate models and separate packages, while sharing their conventions so they do not
feel like two unrelated libraries.

| | 2D | 3D |
| --- | --- | --- |
| Class | `CadViewer` (core) | `Cad3DViewer` (`cad-viewer-3d`) |
| Model | `CadDocument` — planar: `Bounds` is XY, `ViewState` is centre + scale | `CadScene` — `CadMesh` with positions, optional normals and indices, `Bounds3` |
| Backend | Canvas2D, zero runtime dependencies | WebGL through three.js (optional peer) |
| Formats | DXF built in, DWG through the optional GPL plugin, plus registered loaders | STL and OBJ built in, plus registered `FormatLoader<CadScene>` loaders |
| Wrappers | `<CadViewer>` | `<Cad3DViewer>` from the `/3d` subpath |
| Shared | error `code` + `params` with `formatCadError()`/`formatError()`, `es-ES`/`en` catalogs, layers, typed events, PNG export, `CadSource` and `readCadSource()` |

Both viewers take a **container element** and create their own `<canvas>` inside it; neither uses
an iframe. Giving the container a size is the only layout requirement.

Why separate: the planar model is 2D by contract, so adding a 3D camera and Z bounds to it would
have forced every 2D call site to change (see the decisions table). Keeping three.js out of the
2D packages also means an app that only shows drawings never pays for WebGL.

**Not implemented:** a wrapper that sniffs the file and mounts the right viewer. Today the host
application decides, which is a few lines:

```ts
const is3D = /\.(stl|obj)$/i.test(file.name);
const viewer = is3D ? new Cad3DViewer(element) : new CadViewer(element);
await viewer.load(file);
```

A future `auto` wrapper would reuse both registries' `canLoad` hooks to pick the viewer and
expose a shared subset (`load`, layers, theme, PNG) without merging the models.

## Decisions

| Decision | Why | Revisit when |
| --- | --- | --- |
| One neutral `CadDocument` for every format | Renderer and UI are written once; formats are adapters | A format needs data the model cannot express |
| Own DXF parser in core | The maintained JS parsers are GPL (`dxf-json`) or stale (`dxf-parser`) | Never needed so far |
| DWG via LibreDWG in a separate GPL package | The only free DWG reader; isolation keeps core MIT | A permissive DWG reader appears |
| Canvas2D renderer behind a `Renderer` interface | Zero runtime deps, native text for every script, simple hit testing | Drawings above ~500k segments feel slow → add a WebGL renderer |
| Wrappers as plain TypeScript (`defineComponent` + `h`, function components) | Libraries build with `tsc` + Vite, no SFC/JSX toolchain | — |
| Stable error codes + separate translation (`CadViewerError.code`/`params`) | `error.message` stays English and unchanged for logs and existing checks, loaders and the registry need no locale, and a UI can translate from the code | Every new error must register a code and a catalog entry |
| Built-in catalogs (`es-ES` default, `en` fallback) instead of an i18n dependency | Zero runtime deps in core, tiny surface (viewer texts and error messages), works without a bundler plugin | Plural rules beyond `es`/`en` need a real formatter later |
| ESM only, TypeScript 6 | Modern bundlers; TS 7 native compiler not yet supported by the tooling | Tooling supports TS 7 |
| 3D in its own package with `three` as a peer | `three` (WebGLRenderer ~150–200 kB gzip) has no place in a 2D bundle; a peer keeps a single copy in the host app | A second 3D consumer makes a bundled copy attractive |
| Separate `CadScene` instead of extending `CadDocument` | The planar model is 2D by contract (`Bounds` is XY, `ViewState` is center+scale); sharing it would force 2D call sites to change | A unified 3D model is needed (e.g. Z in entities) |
| Own STL and OBJ parsers | Both formats are simple enough to parse in-house, which keeps MIT and zero runtime dependencies | A richer format needs a maintained third-party parser |
| OBJ materials from a fixed palette | `.mtl` resolution needs a second fetch per model and a texture pipeline; a palette keeps 0.3.0 honest about what it shows | Real material support arrives with textures |

## Non-goals (v0)

- Editing of any kind (the API exposes no mutation of the drawing).
- B-rep 3D formats (STEP, IGES, IFC) — the mesh formats shipped in 0.3.0; the kernels stay
  isolated like the DWG plugin (`occt-import-js`, LGPL-2.1; `web-ifc`, MPL-2.0).
- 3D measurement, section planes, face picking and a parts tree.
- glTF, textures and animation.
- SHX fonts — texts render with web fonts.
- Parsing in a Web Worker — loaders are `async`, so this can be added without API breaks.

## Reference

Feature set and package split were informed by
[mlightcad/cad-viewer](https://github.com/mlightcad/cad-viewer) (MIT), read as source.
No code was copied.
