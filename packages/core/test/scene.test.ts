import { describe, expect, it } from "vitest";
import {
  type CadMesh,
  type CadScene,
  CadViewerError,
  createEmptyScene,
  DEFAULT_MATERIAL,
  type FormatLoader,
  FormatRegistry,
  formatCadError,
  meshBounds,
  sceneBounds,
} from "../src/index";

const mesh = (positions: number[], indices?: number[]): CadMesh => ({
  name: "part",
  layer: "0",
  material: DEFAULT_MATERIAL.name,
  positions: new Float32Array(positions),
  ...(indices ? { indices: new Uint32Array(indices) } : {}),
});

describe("createEmptyScene", () => {
  it("returns a valid scene with only the default material", () => {
    const scene = createEmptyScene("stl");
    expect(scene).toEqual({
      format: "stl",
      layers: new Map(),
      materials: new Map([[DEFAULT_MATERIAL.name, DEFAULT_MATERIAL]]),
      meshes: [],
      bounds: null,
      unsupported: new Map(),
      metadata: {},
    });
    expect(DEFAULT_MATERIAL).toEqual({ name: "default", color: 0xb4bcc4 });
  });

  it("does not share maps between scenes", () => {
    const a = createEmptyScene("stl");
    const b = createEmptyScene("stl");
    a.layers.set("x", { name: "x", visible: true });
    expect(b.layers.size).toBe(0);
    expect(a.materials).not.toBe(b.materials);
  });
});

describe("3D bounds", () => {
  it("meshBounds covers every vertex", () => {
    expect(meshBounds(mesh([1, 2, 3, -4, 5, 0, 2, -1, 9]))).toEqual({
      minX: -4,
      minY: -1,
      minZ: 0,
      maxX: 2,
      maxY: 5,
      maxZ: 9,
    });
  });

  it("meshBounds of an empty mesh is null", () => {
    expect(meshBounds(mesh([]))).toBeNull();
  });

  it("sceneBounds unions every mesh and ignores empty ones", () => {
    expect(sceneBounds([mesh([0, 0, 0, 1, 1, 1]), mesh([]), mesh([-2, 3, 0.5])])).toEqual({
      minX: -2,
      minY: 0,
      minZ: 0,
      maxX: 1,
      maxY: 3,
      maxZ: 1,
    });
    expect(sceneBounds([])).toBeNull();
    expect(sceneBounds([mesh([])])).toBeNull();
  });
});

describe("FormatRegistry with scene loaders", () => {
  it("resolves and runs a loader that produces a CadScene", async () => {
    const stl: FormatLoader<CadScene> = {
      id: "stl",
      extensions: [".stl"],
      canLoad: () => false,
      load: async () => createEmptyScene("stl"),
    };
    const registry = new FormatRegistry<CadScene>([stl]);
    const scene = await registry.load(new Uint8Array([0]), { fileName: "part.STL" });
    expect(scene.format).toBe("stl");
    expect(scene.meshes).toEqual([]);
  });
});

describe("3D error catalog", () => {
  const cases: [CadViewerError, string, string][] = [
    [
      new CadViewerError("stl-truncated", "-", { params: { triangles: 12, bytes: 300 } }),
      "El STL binario declara 12 triángulos pero solo tiene 300 bytes.",
      "Binary STL declares 12 triangles but has only 300 bytes.",
    ],
    [
      new CadViewerError("stl-invalid-number", "-", { params: { line: 7 } }),
      "Número no válido en el STL en la línea 7.",
      "Invalid number in STL at line 7.",
    ],
    [
      new CadViewerError("obj-invalid-number", "-", { params: { line: 4 } }),
      "Número no válido en el OBJ en la línea 4.",
      "Invalid number in OBJ at line 4.",
    ],
    [
      new CadViewerError("obj-invalid-index", "-", { params: { index: "9", line: 12 } }),
      "Índice de vértice «9» no válido en el OBJ en la línea 12.",
      'Invalid vertex index "9" in OBJ at line 12.',
    ],
    [
      new CadViewerError("webgl-unavailable", "-"),
      "WebGL no está disponible en este navegador.",
      "WebGL is not available in this browser.",
    ],
  ];

  it.each(cases)("formats %s in Spanish (Spain) and English", (error, spanish, english) => {
    expect(formatCadError(error, "es-ES")).toBe(spanish);
    expect(formatCadError(error, "en")).toBe(english);
  });

  it("keeps the message when a 3D code misses a required param", () => {
    const error = new CadViewerError("stl-truncated", "Truncated.", { params: { triangles: 1 } });
    expect(formatCadError(error, "es-ES")).toBe("Truncated.");
  });
});
