import { readFileSync } from "node:fs";
import { formatCadError } from "@jesusjbriceno/cad-viewer-core";
import { describe, expect, it } from "vitest";
import { OBJ_MATERIAL_PALETTE, objLoader } from "../src/loaders/obj";
import { stlLoader } from "../src/loaders/stl";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

// End-to-end over the sample models shipped with the sandbox (see fixtures/generate.mjs).
describe("sample models", () => {
  it("flange.stl: one binary solid, 1536 triangles, 100 x 100 x 40 mm", async () => {
    const scene = await stlLoader.load(fixture("flange.stl"), { fileName: "flange.stl" });
    expect(scene.format).toBe("stl");
    expect(scene.metadata.header).toBe("cad-viewer sample flange");
    expect(scene.meshes.map((mesh) => [mesh.name, mesh.layer, mesh.positions.length / 9])).toEqual([
      ["cad-viewer sample flange", "0", 1536],
    ]);
    const { bounds } = scene;
    expect(bounds?.minX).toBeCloseTo(-50, 4);
    expect(bounds?.maxX).toBeCloseTo(50, 4);
    expect(bounds?.minY).toBeCloseTo(-50, 4);
    expect(bounds?.maxY).toBeCloseTo(50, 4);
    expect([bounds?.minZ, bounds?.maxZ]).toEqual([0, 40]);
  });

  it("house.obj: one object split into walls, roof and door with palette materials", async () => {
    const scene = await objLoader.load(fixture("house.obj"), { fileName: "house.obj" });
    expect(scene.format).toBe("obj");
    expect(
      scene.meshes.map((mesh) => [mesh.name, mesh.layer, mesh.material, mesh.positions.length / 9]),
    ).toEqual([
      ["House", "walls", "plaster", 10],
      ["House", "roof", "tiles", 6],
      ["House", "door", "wood", 2],
    ]);
    expect([...scene.layers.keys()]).toEqual(["walls", "roof", "door"]);
    expect(["plaster", "tiles", "wood"].map((name) => scene.materials.get(name)?.color)).toEqual(
      OBJ_MATERIAL_PALETTE.slice(0, 3),
    );
    expect(Object.fromEntries(scene.unsupported)).toEqual({ mtllib: 1 });
    expect(scene.bounds).toEqual({
      minX: 0,
      minY: -0.05000000074505806,
      minZ: 0,
      maxX: 8,
      maxY: 6,
      maxZ: 5,
    });
  });

  it("a truncated copy of the STL sample is rejected with a translatable code", async () => {
    const bytes = fixture("flange.stl").subarray(0, 84 + 50 * 10);
    const error = await stlLoader.load(bytes, {}).catch((e: unknown) => e);
    expect(formatCadError(error, "es-ES")).toBe(
      "El STL binario declara 1536 triángulos pero solo tiene 584 bytes.",
    );
  });
});
