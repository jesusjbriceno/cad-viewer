# cad-viewer 3D

View-only 3D support: mesh formats first, rendered with three.js in a separate MIT package.
Branch `feat/3d` from `main` at v0.2.0 (`2436655`). Target version: 0.3.0 (additive, new packages).

## Specs

- **S1** — "tenemos que empezar a plantear el soporte para ficheros 3D"
- **S2** — Formats, first wave: "Mallas ligeras: STL + OBJ (Recomendado)" — "Parsers propios, MIT, cero dependencias. Cubre el caso «ver un modelo 3D» con muy poco riesgo y valida toda la cadena (modelo, renderer, visor, wrappers)." Out of scope for this wave: rich materials, scene hierarchy, B-rep.
- **S3** — Renderer: "three.js en paquete aparte (Recomendado)" — `cad-viewer-3d` (MIT) with `three` as a peer dependency. Who only uses 2D must not pay for it. Future kernels stay isolated like the DWG plugin: STEP/IGES via `occt-import-js` (LGPL-2.1) and IFC via `web-ifc` (MPL-2.0), each in its own optional package.
- **S4** — Model and API: "CadScene 3D + Cad3DViewer separados (Recomendado)" — `CadScene`/`CadMesh` live in the MIT core; `Cad3DViewer` and the wrappers live in `cad-viewer-3d`. **`CadDocument`, `Bounds`, `ViewState` and the 2D viewer are not touched**, so there is no 2D regression. Shared conventions: layers, `CadViewerError` codes, locale catalogs, event names.
- **S5** — 0.3.0 scope: "Ver + orbitar + encuadrar + capas + PNG (Recomendado)" — orbit camera, fit, layer visibility, flat shading and wireframe, PNG export. Explicitly **not** in 0.3.0: 3D measurement, section planes, face picking and a parts tree (planned for 0.3.x).
- **S6** — Inherited constraints from the foundation (S7 of `cad-viewer-foundation.md`): core stays MIT with zero runtime dependencies; every non-permissive dependency is an opt-in, separately licensed package; the DWG plugin stays GPL-3.0.
- **S7** — Inherited conventions: the viewer's own texts come from the i18n catalogs (default `es-ES`, fallback `en`), every library error carries a stable `code` + `params` with an English `message`, wrappers are plain TypeScript (no SFC/JSX toolchain), and the sandbox gains a 3D page.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | S4 S6 S7 | Core: `CadScene`, `CadMesh`, materials, `Bounds3`, units and 3D error codes; `cad-viewer-3d` package skeleton (build, LICENSE MIT, README) with `three` as a peer | inline | pending | |
| T2 | S2 S7 | STL loader (binary and ASCII) in `cad-viewer-3d`, with fixtures and tests | inline | pending | |
| T3 | S2 S7 | OBJ loader (vertices, normals, faces, groups → layer/part name), with fixtures and tests | inline | pending | |
| T4 | S3 S5 | three.js scene builder + renderer: geometry batching by material, edge overlay, lights, theme background, wireframe/flat-shaded toggle, PNG export | inline | pending | |
| T5 | S4 S5 S7 | `Cad3DViewer`: orbit camera (azimuth/elevation/distance/target), fit, layer visibility, typed events, localized texts and errors | inline | pending | |
| T6 | S4 S7 | Vue and React `Cad3DViewer` wrappers with the same prop/event conventions as the 2D components | inline | pending | |
| T7 | S2 S5 S7 | Sandbox 3D page (STL + OBJ samples, language selector), docs (READMEs, architecture decisions), CHANGELOG 0.3.0, browser verification | inline | pending | |

Forecast: ~1200–1800 authored lines across 7 units → one PR per task or two, into `feat/3d`, then a release PR to `main`.

## Design notes

- `CadScene` is deliberately small: `meshes[]` (positions/normals/indices, per-mesh material, layer, name), `layers`, `bounds`, `units`, `unsupported`. No textures, no animation, no scene graph in 0.3.0 — OBJ/STL cannot express them and the parts tree is out of scope (S5).
- Both loaders parse on the main thread first (async signature, like the 2D loaders), so a worker can be added later without API breaks.
- Edges are rendered as a separate line overlay from the same geometry, so CAD models keep readable silhouettes in flat shading without extra data from the format.
- three.js is a **peer** dependency: consumers install it, `cad-viewer-3d` never bundles its own copy, and the 2D packages stay free of it.

## Log

- **L1** (user, original request, verbatim): "tenemos que empezar a plantear el soporte para ficheros 3D"
- **L2** (user answers to the scope questionnaire, verbatim option labels): formats "Mallas ligeras: STL + OBJ (Recomendado)"; renderer "three.js en paquete aparte (Recomendado)"; model/API "CadScene 3D + Cad3DViewer separados (Recomendado)"; 0.3.0 scope "Ver + orbitar + encuadrar + capas + PNG (Recomendado)".
- **L3** (evidence, exploration): the current model is planar by contract — `CadEntity` is a 2D union (`packages/core/src/model/types.ts:305`), `Bounds` is `minX/minY/maxX/maxY`, `ViewState` is `center + scale` (`viewer/types.ts:20`), the display list holds XY primitives and `drawFrame(ctx, frame)` paints them; `Point.z` is documented as ignored by the 2D renderer (`model/types.ts:7`). Formats are plugins behind `FormatRegistry`, and `cad-viewer-dwg` already isolates a GPL dependency, which is the pattern the 3D kernels will follow.
- **L4** (evidence, licensing research): `three.js` r186 is MIT (`mrdoob/three.js` LICENSE), `OrbitControls` is an explicit addon, and tree-shaking does not make `WebGLRenderer` small (~150–200 kB gzip typical); `occt-import-js` is LGPL-2.1 (STEP/IGES/BREP → JSON, ~11 MB wasm distributed as a separate replaceable file); `web-ifc` is MPL-2.0. STL and OBJ can be parsed in-house with no dependency. The reference project `mlightcad/cad-viewer` renders through `@mlightcad/three-renderer` (three.js) in its own package, consistent with S3.
