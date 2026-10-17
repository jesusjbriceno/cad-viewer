# Architecture

**In one minute:** every file format is turned into one neutral `CadDocument`. The
core flattens that document into a display list of world-space primitives, and a
renderer paints the visible part of it on a `<canvas>`. Vue and React components are
thin shells around the same `CadViewer` class. Nothing in the pipeline writes back to
the drawing: the viewer is read-only by construction.

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

## Packages and boundaries

| Package | Depends on | License | Owns |
| --- | --- | --- | --- |
| `cad-viewer-core` | nothing at runtime | MIT | model, DXF parser, display list, renderer, `CadViewer` |
| `cad-viewer-dwg` | core (peer), `@mlightcad/libredwg-web` | GPL-3.0 | DWG → `CadDocument` adapter |
| `cad-viewer-vue` | core, `vue` (peer) | MIT | Vue component + composable |
| `cad-viewer-react` | core, `react` (peer) | MIT | React component + hook |

Rule: **core never imports a format plugin or a framework.** Plugins register a
`FormatLoader`; wrappers create a `CadViewer`. This keeps the GPL code opt-in and the
core usable from plain JavaScript.

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

## Non-goals (v0)

- Editing of any kind (the API exposes no mutation of the drawing).
- 3D formats (STEP, IGES, IFC, STL, glTF) — planned after 2D is solid.
- SHX fonts — texts render with web fonts.
- Parsing in a Web Worker — loaders are `async`, so this can be added without API breaks.

## Reference

Feature set and package split were informed by
[mlightcad/cad-viewer](https://github.com/mlightcad/cad-viewer) (MIT), read as source.
No code was copied.
