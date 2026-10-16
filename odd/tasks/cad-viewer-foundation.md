# cad-viewer foundation

View-only 2D CAD viewer in TypeScript (DWG + DXF), framework-agnostic core with Vue and React components.
Repo: `jesusjbriceno/cad-viewer` (public). Delivery: `chain_strategy=feature-branch-chain`, tracker branch `feat/foundation`.
Design reference: `docs/architecture.md` (written in T1, refined per task).

## Specs

- **S1** — "Quiero crear un visor CAD en ts que pueda integrar en sitios tanto VueJS como React como componentes."
- **S2** — "Aún no hay repo creado, así que hay que crearlo. Quiero que sea público y en el README tenemos que agregar el sello de `gentle-ai`." The seal is the official badge from the gentle-ai README ("Keep the image URL exactly as shown"): `[![Built with Gentle-AI](https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/docs/assets/brand/built-with-gentle-ai.png)](https://github.com/Gentleman-Programming/gentle-ai)`. Repo/scope decision: "jesusjbriceno/cad-viewer, scope @jesusjbriceno" — packages `@jesusjbriceno/cad-viewer-core`, `-vue`, `-react`, `-dwg`.
- **S3** — "El componente debe dar soporte a diferentes formatos de ficheros CAD, incluidos DWG." Scope decision: "2D primero: DWG + DXF (Recomendado)" — 3D formats deferred.
- **S4** — "Debe tener diferentes capacidades de visualización pero no de edición."
- **S5** — "Para ser lo más flexible posible, se puede tomar como referencia algún componente comercial u opensource." Decision: "mlightcad/cad-viewer, leyendo el código (Recomendado)".
- **S6** — "Si es necesario usa REA para hacer `reverse engineering` del módulo o componente que tengamos de referencia." Decision: not necessary; the reference is open source, read as source.
- **S7** — Licensing decision: "Núcleo MIT + plugin DWG GPL-3 (Recomendado)" — core/vue/react MIT; optional DWG plugin GPL-3.0 (`@mlightcad/libredwg-web`).

## Tasks

| ID | Specs | Task | Route | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | S1 S2 S7 | Bootstrap: pnpm workspace, TS/Vitest/Biome tooling, licenses, README with seal, CI, architecture doc; create public GitHub repo and push `main` | inline | pending | |
| T2 | S1 S3 S4 | Core contracts: document model, format-loader plugin API, viewer public API types | inline | pending | |
| T3 | S3 | Core DXF parser (ASCII) → document model | worker (parallel) | pending | |
| T4 | S3 S4 | Core display list + Canvas2D renderer + `CadViewer` (pan/zoom/fit, layers, layouts, theme, pick, measure, PNG export) | worker (parallel) | pending | |
| T5 | S3 S7 | `cad-viewer-dwg` GPL-3 plugin: libredwg-web → document model | worker (parallel) | pending | |
| T6 | S1 | `cad-viewer-vue` and `cad-viewer-react` components | worker (parallel) | pending | |
| T7 | S1 S2 S4 | Playground (vanilla/Vue/React), README usage docs, seam check, full suite | inline | pending | |

Delivery forecast: ~4500 authored lines → chained PRs into `feat/foundation` (one slice per task T2–T7).

## Log

- **L1** (user, original request, verbatim):
  > Quiero crear un visor CAD en ts que pueda integrar en sitios tanto VueJS como React como componentes. Aún no hay repo creado, así que hay que crearlo. Quiero que sea público y en el README tenemos que agregar el sello de `gentle-ai`.
  > El componente debe dar soporte a diferentes formatos de ficheros CAD, incluidos DWG. Para ser lo más flexible posible, se puede tomar como referencia algún componente comercial u opensource. Debe tener diferentes capacidades de visualización pero no de edición. Si es necesario usa REA para hacer `reverse engineering` del módulo o componente que tengamos de referencia.
- **L2** (user answers, questionnaire): formats "2D primero: DWG + DXF (Recomendado)"; DWG licensing "Núcleo MIT + plugin DWG GPL-3 (Recomendado)"; reference "mlightcad/cad-viewer, leyendo el código (Recomendado)"; repo "jesusjbriceno/cad-viewer, scope @jesusjbriceno".
- **L3** (user, delivery): "Cadena sobre una rama feature/tracker (Recomendado)" → `chain_strategy=feature-branch-chain`.
- **L4** (evidence): mlightcad/cad-viewer MIT; @mlightcad/libredwg-web 0.8.0 GPL-3.0 (reads DWG and DXF, ~12 MB unpacked, wasm must be served next to the bundle); @mlightcad/dxf-json GPL-3.0 (not usable in MIT core); dxf-parser MIT but stale since 2024 → core ships its own DXF parser.
- **L5** (decision, design): Canvas2D renderer behind a `Renderer` interface (zero runtime deps in core, native text rendering for any script); WebGL is a later option. Wrappers written as plain-TS components (Vue `defineComponent` + `h`, React function component) so no SFC/JSX toolchain is needed in libraries. TypeScript 6.0.x (TS 7 native compiler skipped for tooling compatibility).
