# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (`0.x`: APIs may change between minor versions).

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
