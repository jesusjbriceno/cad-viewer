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
- **S8** — "por cierto, tenemos que tener algún sandbox para probar el módulo. Si es necesario, se puede montar un sitio estático en Astro para pruebas. Ten esto es cuenta, si no, no voy a poder validar el componente" Decision: static Astro site with vanilla, Vue and React islands.
- **S7** — Licensing decision: "Núcleo MIT + plugin DWG GPL-3 (Recomendado)" — core/vue/react MIT; optional DWG plugin GPL-3.0 (`@mlightcad/libredwg-web`).

## Tasks

| ID | Specs | Task | Route | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | S1 S2 S7 | Bootstrap: pnpm workspace, TS/Vitest/Biome tooling, licenses, README with seal, CI, architecture doc; create public GitHub repo and push `main` | inline | done | `865518e` (main, pushed), `17e7fbf` (CI, local: push needs `workflow` token scope) |
| T2 | S1 S3 S4 | Core contracts: document model, format-loader plugin API, viewer public API types | inline | done | `c80a044` (branch `feat/t2-core-contracts`) |
| T3 | S3 | Core DXF parser (ASCII) → document model | inline (worker unavailable) | done | `d5c7fc4` (branch `feat/t3-dxf-parser`) |
| T4 | S3 S4 | Core display list + Canvas2D renderer + `CadViewer` (pan/zoom/fit, layers, layouts, theme, pick, measure, PNG export) | inline (worker unavailable) | done | `0f6b4a4` (branch `feat/t4-viewer`) |
| T5 | S3 S7 | `cad-viewer-dwg` GPL-3 plugin: libredwg-web → document model | inline (worker unavailable) | done | `18c449c` (core fix), `37ad9a8` (test alias), `e0befe2` (branch `feat/t5-dwg`) |
| T6 | S1 | `cad-viewer-vue` and `cad-viewer-react` components | inline (worker unavailable) | done | `5832b98` (vue), `dbe8312` (react) (branch `feat/t6-wrappers`) |
| T7 | S1 S2 S4 S8 | Astro static sandbox (vanilla/Vue/React islands, sample DXF/DWG, file picker), README usage docs, seam check, full suite | inline | done | `a15084c` (dwg fix), `54b0318` (docs), `304b046` (sandbox) (branch `feat/t7-sandbox`) |

Delivery forecast: ~4500 authored lines → chained PRs into `feat/foundation` (one slice per task T2–T7).

## Log

- **L1** (user, original request, verbatim):
  > Quiero crear un visor CAD en ts que pueda integrar en sitios tanto VueJS como React como componentes. Aún no hay repo creado, así que hay que crearlo. Quiero que sea público y en el README tenemos que agregar el sello de `gentle-ai`.
  > El componente debe dar soporte a diferentes formatos de ficheros CAD, incluidos DWG. Para ser lo más flexible posible, se puede tomar como referencia algún componente comercial u opensource. Debe tener diferentes capacidades de visualización pero no de edición. Si es necesario usa REA para hacer `reverse engineering` del módulo o componente que tengamos de referencia.
- **L2** (user answers, questionnaire): formats "2D primero: DWG + DXF (Recomendado)"; DWG licensing "Núcleo MIT + plugin DWG GPL-3 (Recomendado)"; reference "mlightcad/cad-viewer, leyendo el código (Recomendado)"; repo "jesusjbriceno/cad-viewer, scope @jesusjbriceno".
- **L3** (user, delivery): "Cadena sobre una rama feature/tracker (Recomendado)" → `chain_strategy=feature-branch-chain`.
- **L4** (evidence): mlightcad/cad-viewer MIT; @mlightcad/libredwg-web 0.8.0 GPL-3.0 (reads DWG and DXF, ~12 MB unpacked, wasm must be served next to the bundle); @mlightcad/dxf-json GPL-3.0 (not usable in MIT core); dxf-parser MIT but stale since 2024 → core ships its own DXF parser.
- **L5** (decision, design): Canvas2D renderer behind a `Renderer` interface (zero runtime deps in core, native text rendering for any script); WebGL is a later option. Wrappers written as plain-TS components (Vue `defineComponent` + `h`, React function component) so no SFC/JSX toolchain is needed in libraries. TypeScript 6.0.x (TS 7 native compiler skipped for tooling compatibility).
- **L6** (evidence, T1): lint/typecheck/test/build green on empty skeletons. `gh repo create --push` rejected `.github/workflows/ci.yml` ("refusing to allow an OAuth App to create or update workflow ... without `workflow` scope"); CI split into local commit `17e7fbf`. RDD assess on `17e7fbf`: high (shell_source); native START stopped `managed_assets_outdated` (continuation `gentle-ai sync`, writes outside the project → held for user decision).
- **L7** (evidence, T2): RED (missing modules) → GREEN 34/34 (`vitest --project core`); one wrong expected value in my test (ACI 249 is 0x4C262F, not 0x4C264C) fixed. Assess `d2e8970`: medium → deferred to slice; caught an accidentally committed `.vitest/json/output.json`, removed and ignored.
- **L8** (evidence): the four parallel `gentle-ai-worker` runs (T3–T6) all failed with "assistant reported an error" after 10–29 turns and wrote no files (clean tree). Per policy the unavailable subagents are not retried; T3–T6 are implemented inline, sequentially (T3 → T4 → T5 → T6).
- **L9** (evidence, T3): RED (missing modules + 54 failing) → GREEN 117/117 core tests incl. end-to-end over hand-written fixture `sample-r2000.dxf` (CRLF, kept with `*.dxf -text`). Bug found by a test: the tokenizer trimmed trailing spaces, corrupting MTEXT chunks — values are now verbatim. Assess `d5c7fc4`: medium → deferred to slice.
- **L10** (user, verbatim): "por cierto, tenemos que tener algún sandbox para probar el módulo. Si es necesario, se puede montar un sitio estático en Astro para pruebas. Ten esto es cuenta, si no, no voy a poder validar el componente" → S8 added; T7 becomes an Astro sandbox (replaces the planned Vite playground).
- **L11** (evidence, T4/T5 prep): T4 `0f6b4a4` 216/216, medium → deferred to slice (commit also carries Biome reformatting of T3 files). Real-world smoke: LibreDWG `example_2000.dxf` (1.4 MB) parses in 94 ms. DWG probe on `example_2013.dwg`: read returns non-fatal error bitmask 68 (only ≥128 is critical), angles in radians, lineweight is the DWG enum (29 ByLayer, 30 ByBlock, 31 Default), LWPOLYLINE may carry a zero normal (core fixed in follow-up commit), `db.entities` also contains ATTRIB/ATTDEF and paper VIEWPORTs → route by `ownerBlockRecordSoftId`.
- **L12** (evidence, T5): RED (missing modules) → GREEN 261/261 across core+dwg, incl. end-to-end read of LibreDWG `example_2013.dwg` (AC1027, 3 layouts, block `bloko`). Found: Vitest node env ignores `resolve.conditions` (SSR resolution), so the dwg tests silently ran against a stale core `dist` → replaced by an explicit `test.alias` to core sources. Assess `e0befe2` range: medium → deferred to slice.
- **L13** (evidence, T7): Astro 7 sandbox builds 4 static pages (static output, islands with `client:only`); imports package *sources* through Vite aliases, no build step. Verified in a real browser (headless Edge through REA `capture_browser_scenario`, screenshots + console + page-errors): vanilla + Vue + React pages render the DXF sample, `Hide all`/`Show all` toggle every layer, `Theme` switches dark→light (background, AGC 7 layers and texts follow), and the DWG sample loads through the wasm. Only console noise: a favicon 404 (fixed) and LibreDWG's non-fatal `error code: 68` warning. While verifying, the DWG `ACAD_TABLE` mapping was found wrong in practice (libredwg-web 0.8 leaves R2010+ tables empty) → fixed in `a15084c` with a test.
- **L14** (evidence, T7 seam check): `pnpm lint`, `pnpm typecheck`, `pnpm test` (15 files, 281 tests) and `pnpm build` all green after the whole stack. Bundle sizes: core 69 kB (21 kB gzip), dwg adapter 15 kB (5 kB gzip, LibreDWG/wasm loaded lazily), vue/react thin wrappers.
- **L15** (method): the four parallel `gentle-ai-worker` runs failed with a bare "assistant reported an error" and wrote nothing; per policy they were not retried and T3–T6 were implemented inline. Later minimal health probes of the same agents succeeded, so the failure was transient (likely provider concurrency), not configuration.
- **L16** (user, verbatim): "ok, está bien, podemos liberar una primera versión, pasando por release. v0.1.0. Siguiente cambio, para mañana, soporte multi-idioma con español de España como idioma principal y secundario inglés" → release v0.1.0 authorized. Prepared on branch `release/v0.1.0` (`fb79df2`: CHANGELOG, `publishConfig.exports` so published packages expose only `dist`; lint/typecheck/281 tests/build green). Push blocked: gh token scopes are `gist, read:org, repo` (no `workflow`), and every branch contains `.github/workflows/ci.yml`. i18n is the next feature (not started).
