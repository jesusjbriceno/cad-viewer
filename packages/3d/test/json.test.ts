import { readFileSync } from "node:fs";
import { type CadViewerError, createEmptyScene, DEFAULT_MATERIAL } from "@cadscene/core";
import { describe, expect, it } from "vitest";
import { type CadSceneJson, sceneFromJson, sceneToJson } from "../src/json";

const scene = () => {
  const value = createEmptyScene("obj");
  value.layers.set("A", { name: "A", visible: true });
  value.layers.set("B", { name: "B", visible: false });
  value.materials.set("wood", { name: "wood", color: 0x8b5a2b, opacity: 0.5 });
  value.meshes.push({
    name: "walls",
    layer: "A",
    material: "wood",
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  });
  value.meshes.push({
    name: "roof",
    layer: "B",
    material: DEFAULT_MATERIAL.name,
    positions: new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
  });
  value.bounds = { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 };
  value.unsupported.set("mtllib", 2);
  value.metadata.header = "sample";
  return value;
};

describe("sceneToJson", () => {
  it("turns maps into objects and typed arrays into plain arrays", () => {
    const json = sceneToJson(scene());
    expect(json.format).toBe("obj");
    expect(json.layers).toEqual({
      A: { name: "A", visible: true },
      B: { name: "B", visible: false },
    });
    expect(json.materials.wood).toEqual({ name: "wood", color: 0x8b5a2b, opacity: 0.5 });
    expect(json.meshes[0]?.positions).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(json.meshes[1]?.indices).toEqual([0, 1, 2, 1, 3, 2]);
    expect(json.unsupported).toEqual({ mtllib: 2 });
    expect(json.metadata).toEqual({ header: "sample" });
    // It is JSON-ready: no typed arrays or Maps survive serialization.
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });

  it("omits optional fields instead of writing undefined", () => {
    const json = sceneToJson(createEmptyScene("stl"));
    expect("units" in json).toBe(false);
    expect(json.bounds).toBeNull();
    expect(json.meshes).toEqual([]);
  });
});

describe("sceneFromJson", () => {
  it("round-trips a scene without losing precision or structure", () => {
    const original = scene();
    const restored = sceneFromJson(sceneToJson(original));
    expect(restored.format).toBe("obj");
    expect(restored.layers).toEqual(original.layers);
    expect(restored.materials).toEqual(original.materials);
    expect(restored.meshes).toHaveLength(2);
    expect(Array.from(restored.meshes[0]!.positions)).toEqual(
      Array.from(original.meshes[0]!.positions),
    );
    expect(Array.from(restored.meshes[1]!.indices ?? [])).toEqual([0, 1, 2, 1, 3, 2]);
    expect(restored.bounds).toEqual(original.bounds);
    expect(restored.unsupported).toEqual(original.unsupported);
    expect(restored.metadata).toEqual(original.metadata);
  });

  it("keeps a scene usable when optional parts are absent", () => {
    const restored = sceneFromJson({
      format: "stl",
      layers: {},
      materials: { default: { name: "default", color: 0xb4bcc4 } },
      meshes: [],
      bounds: null,
      unsupported: {},
      metadata: {},
    });
    expect(restored.meshes).toEqual([]);
    expect(restored.bounds).toBeNull();
    expect(restored.units).toBeUndefined();
  });

  it("ignores unknown properties so a converter can annotate its output", () => {
    const json = sceneToJson(scene());
    const annotated = { ...json, annotations: { source: "netDxf" } };
    const restored = sceneFromJson(annotated);
    expect(restored.meshes).toHaveLength(2);
    expect("annotations" in sceneToJson(restored)).toBe(false);
  });

  it("rejects malformed input with a coded error and the offending path", () => {
    const invalid = (value: unknown) => {
      try {
        sceneFromJson(value as CadSceneJson);
      } catch (error) {
        return error as CadViewerError;
      }
      return undefined;
    };

    expect(invalid({})?.code).toBe("scene-json-invalid");
    expect(invalid({})?.params).toEqual({ path: "format" });
    expect(
      invalid({
        ...sceneToJson(scene()),
        meshes: [{ name: "x", layer: "A", material: "wood", positions: [0, 0, 0, 1] }],
      })?.params,
    ).toEqual({ path: "meshes[0].positions" });
    expect(
      invalid({
        ...sceneToJson(scene()),
        meshes: [
          { name: "x", layer: "A", material: "missing", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
        ],
      })?.params,
    ).toEqual({ path: "meshes[0].material" });
    expect(
      invalid({
        ...sceneToJson(scene()),
        meshes: [
          {
            name: "x",
            layer: "A",
            material: "wood",
            positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            indices: [0, 1, 9],
          },
        ],
      })?.params,
    ).toEqual({ path: "meshes[0].indices" });
  });
});

// Conformance: this fixture is what a converter in any language must be able to produce.
describe("spec fixture", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("../../../spec/fixtures/house.json", import.meta.url), "utf8"),
  ) as CadSceneJson;

  it("reads the committed fixture into a usable scene", () => {
    const restored = sceneFromJson(fixture);
    expect(restored.format).toBe("obj");
    expect(restored.meshes).toHaveLength(3);
    expect([...restored.layers.keys()]).toEqual(["walls", "roof", "door"]);
    const triangles = restored.meshes.reduce(
      (total, mesh) => total + (mesh.indices ? mesh.indices.length : mesh.positions.length / 3) / 3,
      0,
    );
    expect(triangles).toBe(18);
    expect(restored.bounds).not.toBeNull();
  });

  it("re-serializes to the same document", () => {
    expect(sceneToJson(sceneFromJson(fixture))).toEqual(fixture);
  });
});
