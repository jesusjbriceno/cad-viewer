# The `CadScene` interchange contract

Converters written in any language emit a **`CadScene` JSON document**; `@cadscene/3d` reads it and
the viewer renders it. The contract is the JSON, not the code: nothing here requires a server, a
runtime dependency or a specific language.

- **Schema:** [`cadscene.schema.json`](cadscene.schema.json) (JSON Schema draft 2020-12).
- **Fixtures:** [`fixtures/`](fixtures/) — real documents produced by the reference parsers, used as
  conformance cases.
- **Reference implementation:** `sceneToJson()` / `sceneFromJson()` in `@cadscene/3d`.

## Shape

```json
{
  "format": "obj",
  "units": "mm",
  "layers": { "0": { "name": "0", "visible": true } },
  "materials": { "default": { "name": "default", "color": 11844804 } },
  "meshes": [
    {
      "name": "walls",
      "layer": "0",
      "material": "default",
      "positions": [0, 0, 0, 1, 0, 0, 0, 1, 0],
      "normals": [0, 0, 1, 0, 0, 1, 0, 0, 1],
      "indices": [0, 1, 2]
    }
  ],
  "bounds": { "minX": 0, "minY": 0, "minZ": 0, "maxX": 1, "maxY": 1, "maxZ": 0 },
  "unsupported": { "mtllib": 1 },
  "metadata": { "header": "sample" }
}
```

Rules a converter must satisfy:

1. `format` is a non-empty string identifying the converter (`"obj"`, `"dwg-acis"`, …).
2. `positions` is a flat `xyz` array: a whole number of vertices. Without `indices` its length is
   also a multiple of 9 (whole triangles).
3. `normals`, when present, has the same length as `positions`.
4. `indices`, when present, has a length that is a multiple of 3 and every value is below
   `positions.length / 3`. Non-indexed meshes are fine.
5. Every `mesh.material` exists in `materials`; every `mesh.layer` is listed in `layers`.
6. `bounds` is the union of the meshes, or `null` for an empty scene.
7. Numbers are plain JSON numbers. A `Float32Array` value survives a round trip exactly, because
   every float32 is representable as a double.

Unknown properties are **allowed** (annotate your output freely) and are dropped when the reference
implementation re-serializes. `CadViewerError` with code `scene-json-invalid` and `{ path }` is what
the reader throws on malformed input, with a dotted path such as `meshes[0].positions`.

## Why this shape

- **Least common denominator.** Every language can produce and consume it: .NET (`System.Text.Json`),
  Python (`json`), Go (`encoding/json`), Node.
- **No shared runtime.** A .NET or Go converter does not need our parsers; it needs to emit this.
- **Reuses the viewer.** The same `Cad3DViewer` renders meshes from any source, including a service
  that wraps a commercial ACIS converter (the chosen option A).

## Validating

Until a language-specific library exists, validate against the schema with any draft-2020-12
validator, then round-trip the document through the fixtures as an extra check. The TypeScript
reader enforces the rules above at runtime, so a fixture that passes `sceneFromJson()` is safe for
the viewer.
