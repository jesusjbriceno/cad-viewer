import { type CadMesh, type CadScene, createEmptyScene, DEFAULT_MATERIAL } from "@cadscene/core";
import { describe, expect, it } from "vitest";
import { describePart, partsOf, summarizeScene } from "../src/inspect";

const mesh = (name: string, layer: string, triangles: number, indexed = false): CadMesh => ({
  name,
  layer,
  material: DEFAULT_MATERIAL.name,
  positions: new Float32Array(triangles * 9),
  ...(indexed ? { indices: new Uint32Array(triangles * 3) } : {}),
});

const sceneWith = (...meshes: CadMesh[]): CadScene => {
  const scene = createEmptyScene("obj");
  scene.meshes.push(...meshes);
  for (const item of meshes) scene.layers.set(item.layer, { name: item.layer, visible: true });
  scene.bounds = { minX: -1, minY: -2, minZ: -3, maxX: 1, maxY: 2, maxZ: 3 };
  return scene;
};

describe("summarizeScene", () => {
  it("counts meshes, layers, triangles, vertices and materials", () => {
    const scene = sceneWith(mesh("walls", "A", 4), mesh("roof", "B", 6, true));
    expect(summarizeScene(scene)).toEqual({
      format: "obj",
      meshCount: 2,
      layerCount: 2,
      triangles: 10,
      vertices: 30,
      materialCount: 1,
      bounds: { minX: -1, minY: -2, minZ: -3, maxX: 1, maxY: 2, maxZ: 3 },
    });
  });

  it("reports units when the source declares them and an empty scene honestly", () => {
    const empty = createEmptyScene("stl");
    expect(summarizeScene(empty)).toMatchObject({ meshCount: 0, triangles: 0, bounds: null });
    const scene = sceneWith(mesh("part", "0", 1));
    scene.units = "mm";
    expect(summarizeScene(scene).units).toBe("mm");
  });
});

describe("partsOf", () => {
  it("lists every part with its layer, material and triangle count", () => {
    const scene = sceneWith(mesh("walls", "A", 4), mesh("roof", "B", 6, true));
    expect(
      partsOf(scene).map((part) => [part.id, part.name, part.layer, part.triangles, part.visible]),
    ).toEqual([
      [0, "walls", "A", 4, true],
      [1, "roof", "B", 6, true],
    ]);
  });

  it("takes visibility from the caller, defaulting to visible", () => {
    const scene = sceneWith(mesh("walls", "A", 1), mesh("roof", "B", 1));
    expect(partsOf(scene, (layer) => layer !== "B").map((part) => part.visible)).toEqual([
      true,
      false,
    ]);
  });
});

describe("describePart", () => {
  it("adds the material colour and the geometry flags", () => {
    const scene = sceneWith(mesh("walls", "A", 4, true));
    expect(describePart(scene, 0)).toMatchObject({
      name: "walls",
      material: "default",
      color: DEFAULT_MATERIAL.color,
      indexed: true,
      hasNormals: false,
    });
  });

  it("returns null for an unknown part", () => {
    expect(describePart(sceneWith(mesh("walls", "A", 1)), 7)).toBeNull();
  });
});
