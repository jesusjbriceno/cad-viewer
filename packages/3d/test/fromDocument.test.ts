import {
  type CadDocument,
  type CadEntity,
  createEmptyDocument,
  createModelLayout,
  dxfLoader,
} from "@jesusjbriceno/cad-viewer-core";
import { describe, expect, it } from "vitest";
import { has3dFaces, sceneFromDocument } from "../src/fromDocument";

const base = { layer: "0", color: { kind: "byLayer" } } as const;

const face = (points: [number, number, number?][], layer = "0"): CadEntity => ({
  ...base,
  layer,
  type: "solid",
  outlineOnly: true,
  points: points.map(([x, y, z]) => (z === undefined ? { x, y } : { x, y, z })),
});

const documentWith = (...entities: CadEntity[]): CadDocument => {
  const document = createEmptyDocument("dxf");
  document.layouts[0]?.entities.push(...entities);
  return document;
};

const trianglesOf = (positions: Float32Array) => positions.length / 9;

describe("has3dFaces", () => {
  it("detects 3DFACE entities and ignores planar fills", () => {
    expect(
      has3dFaces(
        documentWith(
          face([
            [0, 0],
            [1, 0],
            [1, 1],
          ]),
        ),
      ),
    ).toBe(true);
    expect(
      has3dFaces(
        documentWith({
          ...base,
          type: "solid",
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
          ],
        }),
      ),
    ).toBe(false);
    expect(has3dFaces(documentWith())).toBe(false);
  });
});

describe("sceneFromDocument", () => {
  it("triangulates a quad and keeps its height", () => {
    const scene = sceneFromDocument(
      documentWith(
        face([
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 5],
          [0, 10, 5],
        ]),
      ),
    );
    expect(scene.format).toBe("dxf");
    expect(scene.meshes).toHaveLength(1);
    expect(trianglesOf(scene.meshes[0]!.positions)).toBe(2);
    // Two triangles over the quad: 6 vertices, 18 floats.
    expect(Array.from(scene.meshes[0]!.positions.slice(0, 9))).toEqual([
      0, 0, 0, 10, 0, 0, 10, 10, 5,
    ]);
    expect(scene.bounds).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 5 });
  });

  it("triangulates a triangle and defaults a missing z to 0", () => {
    const scene = sceneFromDocument(
      documentWith(
        face([
          [0, 0],
          [2, 0],
          [0, 2],
        ]),
      ),
    );
    expect(trianglesOf(scene.meshes[0]!.positions)).toBe(1);
    expect(Array.from(scene.meshes[0]!.positions)).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0]);
  });

  it("groups faces by layer with the default material and visible layers", () => {
    const scene = sceneFromDocument(
      documentWith(
        face(
          [
            [0, 0, 0],
            [1, 0, 0],
            [1, 1, 0],
          ],
          "TERRAIN",
        ),
        face(
          [
            [0, 0, 1],
            [1, 0, 1],
            [1, 1, 1],
          ],
          "WALLS",
        ),
      ),
    );
    expect(scene.meshes.map((mesh) => [mesh.name, mesh.layer, mesh.material])).toEqual([
      ["TERRAIN", "TERRAIN", "default"],
      ["WALLS", "WALLS", "default"],
    ]);
    expect([...scene.layers.keys()]).toEqual(["TERRAIN", "WALLS"]);
    expect(scene.layers.get("WALLS")?.visible).toBe(true);
  });

  it("ignores planar fills and other entities", () => {
    const scene = sceneFromDocument(
      documentWith(
        {
          ...base,
          type: "solid",
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        { ...base, type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      ),
    );
    expect(scene.meshes).toEqual([]);
    expect(scene.bounds).toBeNull();
  });

  it("can read a named layout and reports an empty scene for an unknown one", () => {
    const document = documentWith(
      face([
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ]),
    );
    document.layouts.push({ ...createModelLayout(), name: "Layout1", isModel: false, tabOrder: 1 });
    expect(sceneFromDocument(document, { layout: "Model" }).meshes).toHaveLength(1);
    expect(sceneFromDocument(document, { layout: "Layout1" }).meshes).toEqual([]);
    expect(sceneFromDocument(document, { layout: "Nope" }).meshes).toEqual([]);
  });
});

// End to end: a real DXF text goes through the built-in parser, then into a 3D scene.
describe("sceneFromDocument — end to end from a DXF file", () => {
  const dxf = [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
    "3DFACE",
    "8",
    "TERRAIN",
    "10",
    "0",
    "20",
    "0",
    "30",
    "0",
    "11",
    "10",
    "21",
    "0",
    "31",
    "0",
    "12",
    "10",
    "22",
    "10",
    "32",
    "5",
    "13",
    "0",
    "23",
    "10",
    "33",
    "5",
    "0",
    "ENDSEC",
    "0",
    "EOF",
    "",
  ].join("\n");

  it("turns a parsed 3DFACE into two triangles at its real height", async () => {
    const document = await dxfLoader.load(new TextEncoder().encode(dxf), {
      fileName: "terrain.dxf",
    });
    expect(has3dFaces(document)).toBe(true);
    const scene = sceneFromDocument(document);
    expect(scene.meshes).toHaveLength(1);
    expect(scene.meshes[0]?.layer).toBe("TERRAIN");
    expect(scene.meshes[0]!.positions.length / 9).toBe(2);
    expect(scene.bounds).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 5 });
  });
});
