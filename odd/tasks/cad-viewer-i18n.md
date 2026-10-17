# cad-viewer i18n

Multi-language support for the viewer, its components and the sandbox: Spanish (Spain) first, English second.
Branch `feat/i18n` from `main` at v0.1.0 (`465de0b`). Target version: 0.2.0 (minor).

## Specs

- **S1** — "soporte multi-idioma con español de España como idioma principal y secundario inglés"
- **S2** — "Superficies a cubrir: textos visibles del core (aria-label del canvas, etiqueta de medición, mensajes), una opción `locale` en `CadViewer` y en los componentes Vue y React (por defecto `es-ES`, con fallback a `en`), la UI del sandbox con selector de idioma, y la documentación de cómo usarlo."
- **S3** — "Mantén la API retrocompatible o márcalo como cambio de versión menor."
- **S4** — Library error messages (`CadLoadError`, "Unknown layer…", etc.): "¿se traducen directamente o pasan a códigos estables con un texto traducido aparte?" — **pending user decision** (asked before any code).

## Tasks

| ID | Specs | Task | Route | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | S1 S2 S3 S4 | Core: es-ES/en message catalogs, locale resolution (default `es-ES`, fallback `en`), `locale` option and runtime setter on `CadViewer`, localized canvas `aria-label` and measure label, error handling per S4 | inline | blocked (S4) | |
| T2 | S2 S3 | Vue and React components: `locale` prop forwarded to the core viewer, reactive updates | inline | pending | |
| T3 | S2 | Sandbox: language selector, Spanish/English UI texts on every page | inline | pending | |
| T4 | S2 S3 | Docs: README/core README usage, CHANGELOG `0.2.0` entry (minor, behavior change of the default language) | inline | pending | |

## Log

- **L1** (user, original request, verbatim):
  > Siguiente cambio, para mañana, soporte multi-idioma con español de España como idioma principal y secundario inglés
- **L2** (user, session instructions, verbatim): "Es un feature nuevo: crea `odd/tasks/cad-viewer-i18n.md` con su espejo en Engram, una rama desde main ya con la v0.1.0, y aplica ODD con test-first. ANTES de escribir código, hazme una sola pregunta de producto: los mensajes de error de la librería (`CadLoadError`, "Unknown layer…", etc.), ¿se traducen directamente o pasan a códigos estables con un texto traducido aparte? Hoy se comprueban textualmente en los tests y forman parte de la API pública. Propón una opción recomendada. Superficies a cubrir: textos visibles del core (aria-label del canvas, etiqueta de medición, mensajes), una opción `locale` en `CadViewer` y en los componentes Vue y React (por defecto `es-ES`, con fallback a `en`), la UI del sandbox con selector de idioma, y la documentación de cómo usarlo. Mantén la API retrocompatible o márcalo como cambio de versión menor."
- **L3** (evidence, exploration): user-visible core strings: canvas `aria-label` "CAD drawing" (`CadViewer.ts:108`), measure label from `formatLength` (`CadViewer.ts:625`). Errors: `CadLoadError` already carries a stable `code` (`unsupported-format`, `parse-error`, `fetch-failed`, `aborted`) plus an English message; the rest are plain `Error`s with text only ("Unknown layer", "Unknown layout", "CadViewer has been destroyed.", "Image export failed.", "Binary DXF is not supported yet.", DXF tokenizer line errors, DWG "LibreDWG could not read the file."). The format registry and loaders run without a viewer, so they do not know any locale. 14 test assertions check message text.
