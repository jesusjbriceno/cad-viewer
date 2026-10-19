# cad-viewer model information

Expose the model itself, not just the picture: layers, parts, properties and measurements,
for 2D drawings and 3D models. Branch `feat/information` from `main` at `29c6390`.

## Specs

- **S1** — "lo que más me gusta es que permite mayor acceso a información de los modelos o
  piezas en pantalla, como las capas, etc."
- **S2** — "No quiero que revientes el código como tal, quiero que aportemos valor a la
  librería" — the reference is CADViewer (commercial); we take the *idea* of surfaced
  information, never its code. Clean-room, our own model.
- **S3** — "que no sea solo un visor que permita mover las piezas, si no, poder acceder a sus
  diferentes capas"
- **S4** — "Si es viable acceder a la información del modelo (capas, medidas, ...) ...
  adelante, es lo que hecho en falta, información."
- **S5** — Inherited: core stays MIT with zero runtime dependencies, no server; typed API and
  typed events; no 2D regression.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | S1 S3 S4 | Core inspection module: `summarizeDocument`, `collectEntities`, `describeEntity` (properties + measurements) with plain-data types | inline | done | see L5 |
| T2 | S1 S4 | `CadViewer.getSummary()` and `getEntities(filter)` delegating to the module | inline | done | see L5 |
| T3 | S1 S4 | 3D: `summarizeScene`, `describePart`, `Cad3DViewer.getSummary()` and `getParts()` | inline | done | see L5 |
| T4 | S1 S3 | Sandbox inspector panel (2D and 3D) driven by the new API | inline | done | see L5 |
| T5 | S1 S5 | Docs: README, CHANGELOG and the API in the architecture note | inline | done | see L5 |

## Contracts (binding)

- **Plain data only.** Everything returned is JSON-serializable; no DOM, no class instances, no
  viewer state. Labels stay in the UI: core returns keys and values, the sandbox translates.
- **`summarizeDocument(document): DocumentSummary`** — `format`, `version`, `units`,
  `entityCount` (top-level entities of every layout), `countsByType`, `layerCount`,
  `blockCount`, `layoutCount`, `bounds` (union of all layouts, `null` when empty).
- **`collectEntities(document, filter?): EntityInfo[]`** — top-level entities of the selected
  layout (default: model space), optionally filtered by `layer` and `type`; each item carries
  `type`, `layer`, `handle?`, `color` (CSS), `visible`, and the entity itself is **not** exposed.
  Block contents are summarized by the document summary (block counts), not flattened here.
- **`describeEntity(entity): EntityDetails`** — `type`, `layer`, `handle?`, `color`, plus
  `properties`: a per-type record of the meaningful fields, including derived measurements
  where they are exact: `line.length`, `circle.radius/diameter/area`, `arc.radius/length`,
  `polyline.length` (straight segments plus bulge arcs), `text.value/height`.
- **`summarizeScene(scene): SceneSummary`** — `format`, `meshCount`, `layerCount`, `triangles`,
  `vertices`, `materialCount`, `bounds` (`Bounds3`), `units`.
- **`getParts()`** — per mesh: `id`, `name`, `layer`, `material`, `triangles`, `vertices`,
  `bounds`, `visible`. `describePart(scene, id)` adds the material color and the raw counts.
- Errors stay the existing `CadViewerError` codes; no new error paths are introduced.

## Log

- **L1** (user, original request, verbatim): "lo que más me gusta es que permite mayor acceso a información de los modelos o piezas en pantalla, como las capas, etc."
- **L2** (user, verbatim): "No quiero que revientes el código como tal, quiero que aportemos valor a la librería, que no sea solo un visor que permita mover las piezas, si no, poder acceder a sus diferentes capas y eso es lo que tiene CAD Viewer frente a otras."
- **L3** (user, verbatim): "Si es viable acceder a la información del modelo (capas, medidas, ...) sin necesidad de reventar CAD Viewer, adelante, es lo que hecho en falta, información."
- **L4** (decision, scope): information access comes first; annotations/redlining and drawing
  compare (the other CADViewer-inspired candidates) stay queued behind it.
- **L5** (evidence, delivery): core gained `packages/core/src/inspect/` (`summarizeDocument`,
  `collectEntities`, `describeEntity`, plain-data types) exported from the package index;
  `CadViewer` gained `getSummary()`/`getEntities()` and `CadViewerApi` their signatures. The 3D
  package gained `packages/3d/src/inspect/` (`summarizeScene`, `partsOf`, `describePart`) and
  `Cad3DViewer.getSummary()`, `getParts()` and `getPart(id)` (visibility taken from the viewer's
  layer state). Sandbox: the 2D page shows the drawing summary plus the picked entity's
  properties (falling back to "nothing selected"), and the 3D page shows the scene summary plus
  one row per part (name, layer, material, triangles). Tests added: `packages/core/test/inspect.test.ts`
  (11), `packages/core/test/viewer/inspect.test.ts` (3), `packages/3d/test/inspect.test.ts` (6),
  and the public-API test updated for the three new exports. RED was observed for each unit
  (`summarizeDocument is not a function`, `viewer.getSummary is not a function`). Full repository:
  lint 0, build 0, typecheck 0, **495 tests / 30 files**, sandbox build 0. Browser (headless
  Edge, dev server on 127.0.0.1:4321): the 2D page renders `DXF AC1015 · mm · 8 entidades ·
  4 capas · 4 bloques · 3 presentaciones`; the 3D page renders `OBJ · 3 piezas · 3 capas ·
  18 triángulos · 54 vértices · 4 materiales` and the three parts (`walls · plaster · 10`,
  `roof · tiles · 6`, `door · wood · 2`). The only console output is Vite's HMR debug lines.
  Two corrections during the work: a test asserted a colour for a layer missing from the table
  (unknown, not invented: `undefined`, then `#ff0000` once the layer exists), and the properties
  panel initially reused the "no drawing" message while a drawing was loaded.
