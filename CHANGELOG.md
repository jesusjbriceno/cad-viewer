# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (`0.x`: APIs may change between minor versions).

## [Unreleased]

### Added

- **Real third-party sample assets** for the sandbox, both 2D and 3D: a pump-house plan and a
  bolt-circle plate (DXF) and a torus knot as binary STL and as OBJ, all **CC0**. Each file is
  recorded with its author, license, source URL and SHA-256 in
  `examples/sandbox/samples/samples.json`, listed in `SOURCES.md`, and shown on a new **credits
  page** in the sandbox.
- **`sandbox` Vitest project** (`examples/sandbox/test/samples.test.ts`): every bundled asset
  must be listed, keep its recorded size and hash, appear in `SOURCES.md`, and still parse with
  its loader (layers and entities for DXF, triangles and bounds for STL/OBJ).

### Notes

- The licensing rule for future samples is written down: CC0 or CC BY only, attributed through
  the manifest and the credits page. GPL and CC BY-SA assets would need their own isolated
  directory and an explicit decision.

## [0.3.0] - 2026-10-17

3D models: a new optional package renders **STL** and **Wavefront OBJ** meshes with
three.js. The 2D packages are unchanged and do not depend on three.js.

### Added

- **`@jesusjbriceno/cad-viewer-3d`** (MIT, `three` as a **peer** dependency)
  - `Cad3DViewer`: orbit/pan/zoom camera, fit that keeps the orientation, Z-up by default
    (`upAxis: "y"` available), shaded or wireframe display, feature-edge overlay, dark and
    light backgrounds, layer visibility, PNG export, typed events and `formatError()`.
  - **STL** parser (binary and ASCII, several `solid` blocks become several parts) and
    **OBJ** parser (`v`, `vn`, `f` with every corner syntax and negative indices, `o`/`g`/
    `usemtl` → parts, groups and materials). Both parse in-house with no runtime dependency.
  - `parseStl`, `parseObj`, `stlLoader`, `objLoader`, `BUILT_IN_3D_LOADERS` and
    `OBJ_MATERIAL_PALETTE` for custom pipelines and plugin registration.
- **`CadScene`, `CadMesh`, `CadMaterial`, `CadSceneLayer` and `Bounds3`** in the core, with
  `createEmptyScene()`, `DEFAULT_MATERIAL`, `meshBounds()` and `sceneBounds()`. The planar
  `CadDocument`, `Bounds`, `ViewState` and the 2D viewer are untouched.
- **`readCadSource()`** exported from the core: the URL/File/bytes reader shared by both
  viewers, for custom loaders.
- **Vue and React `Cad3DViewer`** components in a separate `/3d` subpath
  (`@jesusjbriceno/cad-viewer-vue/3d`, `@jesusjbriceno/cad-viewer-react/3d`), with the same
  prop and event conventions as the 2D components. `cad-viewer-3d` and `three` are
  **optional** peers, so 2D-only apps never resolve them.
- **New error codes** (translated in both catalogs): `stl-truncated`, `stl-invalid-number`,
  `obj-invalid-number`, `obj-invalid-index`, `webgl-unavailable`.
- **Sandbox 3D page** with STL and OBJ samples, layer and camera panels, view presets and
  PNG export.

### Notes

- OBJ `.mtl` files are not resolved in 0.3.0: each `usemtl` name gets a distinct color from
  a fixed eight-color palette, and `mtllib` is reported in `scene.unsupported`.
- `FormatLoader` and `FormatRegistry` are now generic (`FormatLoader<T = CadDocument>`), so a
  3D loader is a `FormatLoader<CadScene>` while every 2D use keeps compiling unchanged.
- Out of scope for this release: 3D measurement, section planes, face picking and a parts
  tree.

## [0.2.0] - 2026-10-17

Internationalization: **Spanish (Spain) is the default language**, English is the fallback.

### Added

- **Language catalogs** in the core (`es-ES`, `en`, `DEFAULT_LOCALE = "es-ES"`,
  `FALLBACK_LOCALE = "en"`, `resolveLocale()`): any Spanish tag (`es`, `es-MX`) resolves to
  `es-ES`, any other tag to `en`.
- **`locale` option on `CadViewer`**, plus the reactive `locale` getter, `setLocale()` and
  `formatError()`.
- **Localized viewer texts**: the canvas `aria-label` and `lang`, and the measure label
  (`Distancia: 12,5` / `Distance: 12.5` — the number now follows the locale separator).
- **Stable error codes**: every library error is a `CadViewerError` (`CadLoadError` for
  loads) with `code` and `params`, and `formatCadError(error, locale)` / `viewer.formatError()`
  return its text in the chosen language.
- **`locale` prop** on the Vue and React components (reactive; passed to the viewer at
  creation and applied through `setLocale()` on later changes).
- **Sandbox language selector** (Spanish/English), remembered in `localStorage`; the whole
  UI and the viewer follow it.

### Changed

- **Behavior:** the viewer is in Spanish (Spain) unless you pass `locale`. Canvas texts and
  the measure label are no longer hardcoded English.
- Error `message` strings remain in English for logs and are now also the fallback text of
  `formatCadError()` when a translation needs parameters that were not supplied.

### Unchanged

- `error.message`, error classes' inheritance (`CadLoadError extends CadViewerError extends
  Error`) and every existing option, prop, method and event stay source compatible.

## [0.1.0] - 2026-10-17

First public release: a view-only 2D CAD viewer for the web.

### Added

- **`@jesusjbriceno/cad-viewer-core`** (MIT)
  - Neutral `CadDocument` model and a `FormatLoader` plugin API with a `FormatRegistry`.
  - Built-in ASCII DXF parser (all versions; UTF-8 and ANSI code pages): lines, circles,
    arcs, ellipses, (LW)polylines with bulges and widths, splines/NURBS, points, texts,
    multiline texts, block inserts with attributes and MINSERT grids, tables, solids,
    hatches (solid and pattern), dimensions, leaders, viewports, rays and xlines; layers,
    line types, line weights, text styles and layouts.
  - Canvas2D renderer with spatial culling, OCS (arbitrary axis) support and paper-space
    viewports showing model space.
  - `CadViewer`: pan, wheel/pinch zoom, zoom to extents, zoom window, layer visibility,
    layout switching, dark/light themes, hover and click picking, distance measurement,
    PNG export, typed events and abortable loading from URLs, files or bytes.
- **`@jesusjbriceno/cad-viewer-dwg`** (GPL-3.0): optional DWG loader backed by LibreDWG
  (`@mlightcad/libredwg-web`), loaded lazily.
- **`@jesusjbriceno/cad-viewer-vue`**: `<CadViewer>` component and `CadViewerPlugin` for Vue 3.
- **`@jesusjbriceno/cad-viewer-react`**: `<CadViewer>` component and `useCadViewerRef` for
  React 18/19.
- Astro sandbox (`examples/sandbox`) with vanilla, Vue and React pages, sample drawings and
  drag & drop of local files.
- CI workflow: lint, typecheck, tests and build.

### Known limitations

- Binary DXF, 3D solids, regions, meshes, multileaders, multilines, images and wipeouts are
  not drawn (they are counted in `document.unsupported`).
- R2010+ DWG tables are not decoded by libredwg-web 0.8.
- External references are not resolved; parsing runs on the main thread.

[0.2.0]: https://github.com/jesusjbriceno/cad-viewer/releases/tag/v0.2.0
[0.1.0]: https://github.com/jesusjbriceno/cad-viewer/releases/tag/v0.1.0
