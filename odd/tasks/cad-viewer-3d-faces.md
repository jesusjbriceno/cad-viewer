# 3D faces from a drawing

Turn the faces a DWG/DXF already carries (`3DFACE`) into a `CadScene` the 3D viewer can orbit.
Client-side, MIT, no new dependency, no server. Branch `feat/3d-faces` from `main` at `29c6390`.

## Specs

- **S1** — "2. ok" → the user approved the `3DFACE` → 3D increment as the next bounded unit.
- **S2** — "lo que hay que hacer es un conversor en un backend" → ACIS (`3DSOLID`) is explicitly
  out of this unit; it needs a converter (see `cad-viewer-backend.md`, decision pending).
- **S3** — Inherited: core and 3D stay MIT with zero runtime dependencies; the library works with
  no server; plain, serializable data at the API boundary.
- **S4** — Inherited: 2D behaviour must not change. `3DFACE` keeps being drawn flat by the 2D
  viewer; this unit only adds a way to see the same faces in 3D.

## Tasks

| ID | Specs | Task | Route | Status |
| --- | --- | --- | --- | --- |
| T1 | S1 S3 | `sceneFromDocument(document)` and `has3dFaces(document)` in `cad-viewer-3d`: triangulate `3DFACE` quads, group by layer, keep Z | inline | done |
| T2 | S1 S3 | Public exports and the API-surface test | inline | done |
| T3 | S4 | End-to-end check with a drawing that has faces; docs and CHANGELOG | inline | done |

## Contracts

- **Faces recognized:** entities with `type === "solid"` **and** `outlineOnly === true` (that is how
  both parsers mark `3DFACE`). Plain `SOLID`/`TRACE` are planar fills and are ignored.
- **Coordinates:** a missing `z` is `0`; nothing is projected, so real 3D faces keep their heights.
- **Triangulation:** 3 points → one triangle; 4 points → `(0,1,2)` and `(0,2,3)`.
- **Grouping:** one mesh per layer, `name` = layer name, `material` = `DEFAULT_MATERIAL.name`,
  non-indexed `positions` (9 floats per triangle). Layers are registered visible.
- **Scene:** `format` = the document format, `bounds` = union of the meshes (`null` when empty),
  `materials` = the default material only.
- **Layout:** the model layout by default; `{ layout }` selects another by name.
- **Out of scope:** `3DSOLID`/ACIS, smoothing, UVs, per-face colours, and any change to the 2D path.

## Log

- **L1** (user, verbatim): "2. ok" — approve the `3DFACE` → 3D unit.
- **L2** (user, verbatim): "lo que hay que hacer es un conversor en un backend" — ACIS handled
  separately; this unit must not attempt it.
- **L3** (evidence): `packages/3d/src/fromDocument/index.ts` exports `sceneFromDocument` and
  `has3dFaces` (plain data, no dependency added); exported from the package index. Tests:
  `packages/3d/test/fromDocument.test.ts` (6 unit cases + 1 end-to-end through `dxfLoader`) and
  the public-API surface test updated. RED observed first (`Cannot find module '../src/fromDocument'`).
  The end-to-end case writes a real DXF text with one `3DFACE` on layer `TERRAIN`, parses it with
  the built-in loader and asserts two triangles and bounds `0..10 x 0..10 x 0..5`. Honest note:
  the shared `CadEntity` type calls this shape `solid` plus `outlineOnly`, so the module documents
  that `3DFACE` is the only face flavour the parsers mark that way.
