# CadScene JSON — the interchange contract

A language-neutral JSON form of `CadScene`, so converters written in any language (.NET, Python,
Go, or a service wrapping a commercial ACIS converter) can feed the JavaScript viewer without
sharing code. Branch `feat/scene-json` from `main` at `f9fd071`.

## Specs

- **S1** — "3. ok, dale" → the multi-language monorepo is approved; the contract is the shared
  artifact and the first slice.
- **S2** — "2. lo voy a integrar en diferentes aplicaciones backend, la mayoría son .net" → the
  contract must be consumable from .NET first, so it stays plain JSON (no binary framing).
- **S3** — "A" → the ACIS converter returns this same JSON through an optional service; nothing
  here requires a server.
- **S4** — Inherited: MIT, no runtime dependency added, plain serializable data at the boundary.

## Tasks

| ID | Specs | Task | Route | Status |
| --- | --- | --- | --- | --- |
| T1 | S1 S4 | `sceneToJson()` / `sceneFromJson()` in `@cadscene/3d`, with structural validation and a coded error | inline | in progress |
| T2 | S1 S2 | `spec/cadscene.schema.json` + `spec/README.md` describing the contract for other languages | inline | pending |
| T3 | S1 S4 | Conformance fixtures under `spec/fixtures/` and a test that round-trips them | inline | pending |
| T4 | S3 | Wire the optional ACIS converter (option A) on top of this codec | inline | pending |

## Contracts

- **Shape:** `{ format, units?, layers: Record<string, {name, visible}>, materials:
  Record<string, {name, color, opacity?}>, meshes: [{name, layer, material, positions: number[],
  normals?: number[], indices?: number[]}], bounds: Bounds3 | null, unsupported: Record<string,
  number>, metadata: Record<string, string> }`.
- **Numbers:** typed arrays become plain number arrays. A value that came from a `Float32Array`
  survives the round trip exactly, because every float32 is representable as a double.
- **Validation on read:** the codec is strict — it rejects a missing `format`, a mesh whose
  `positions.length` is not a multiple of 9, an `indices` length that is not a multiple of 3 or
  points past its `positions`, and a `material` that is not in `materials`. Failures throw
  `CadViewerError` with code `scene-json-invalid` and `{ path }` (a dotted path into the document).
- **Leniency:** unknown extra properties are ignored on read and dropped on write, so a converter
  can add its own annotations without breaking the viewer. `bounds` may be `null`.
- **Out of scope:** streaming, binary buffers, UVs, textures.

## Log

- **L1** (user, verbatim): "3. ok, dale"
- **L2** (user, verbatim): "2. lo voy a integrar en diferentes aplicaciones backend, la mayoría son .net, pero podría plantear convertir el repo en monorepo e implementar librerías de conversión para diferentes tecnologías: .net, python, Go, node, ..."
- **L3** (user, verbatim, on the ACIS path): "A"
