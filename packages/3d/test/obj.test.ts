import {
  CadLoadError,
  type CadScene,
  CadViewerError,
  DEFAULT_MATERIAL,
  formatCadError,
  sceneBounds,
} from "@cadscene/core";
import { describe, expect, it } from "vitest";
import { OBJ_MATERIAL_PALETTE, objLoader, parseObj } from "../src/loaders/obj";

const decode = (text: string): Uint8Array => new TextEncoder().encode(text);

function firstMesh(scene: CadScene) {
  const mesh = scene.meshes[0];
  if (!mesh) throw new Error("expected at least one mesh");
  return mesh;
}

function materialOf(scene: CadScene, name: string) {
  const material = scene.materials.get(name);
  if (!material) throw new Error(`expected material "${name}"`);
  return material;
}

function normalsOf(mesh: { normals?: Float32Array }): Float32Array {
  const normals = mesh.normals;
  if (!normals) throw new Error("expected mesh normals");
  return normals;
}

/** Mesh decoded as corner triplets: [[x, y, z], ...], one per triangle vertex. */
function corners(mesh: { positions: Float32Array }): number[][] {
  const result: number[][] = [];
  for (let i = 0; i + 2 < mesh.positions.length; i += 3) {
    result.push([
      mesh.positions[i] as number,
      mesh.positions[i + 1] as number,
      mesh.positions[i + 2] as number,
    ]);
  }
  return result;
}

function expectViewerError(
  fn: () => unknown,
  code: string,
  params: Record<string, string | number>,
): void {
  let error: unknown;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(CadViewerError);
  const cadError = error as CadViewerError;
  expect(cadError.code).toBe(code);
  expect(cadError.params).toEqual(params);
  expect(cadError.message).toBe(formatCadError(cadError, "en"));
}

describe("parseObj — vertices", () => {
  it("reads v with an optional w and ignores extra values (vertex colors)", () => {
    const scene = parseObj("v 1 2 3\nv 4 5 6 1 0.2 0.3\nf 1 2 1\n");
    expect(scene.meshes).toHaveLength(1);
    expect(corners(firstMesh(scene))).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [1, 2, 3],
    ]);
  });

  it("ignores vn and vt statements without counting them as unsupported", () => {
    const scene = parseObj("vn 0 0 1\nvt 0.5 0.5\n");
    expect(scene.meshes).toHaveLength(0);
    expect(scene.unsupported.size).toBe(0);
  });
});

describe("parseObj — faces", () => {
  const syntaxes =
    "v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nvn 0 0 1\nvt 0 0\nf 1 2 3\nf 1/1 2/1 3/1\nf 1//1 2//1 3//1\nf 1/1/1 2/1/1 3/1/1\n";

  it("accepts the four corner syntaxes v, v/vt, v//vn and v/vt/vn", () => {
    const scene = parseObj(syntaxes);
    expect(scene.meshes).toHaveLength(1);
    expect(firstMesh(scene).positions.length).toBe(36);
    expect(scene.unsupported.size).toBe(0);
  });

  it("resolves negative relative indices against the vertices seen so far", () => {
    const scene = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n");
    expect(corners(firstMesh(scene))).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
  });

  it("fan-triangulates a quad into two triangles", () => {
    const scene = parseObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n");
    expect(corners(firstMesh(scene))).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ]);
  });

  it("fan-triangulates a pentagon into three triangles", () => {
    const scene = parseObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv -1 0.5 0\nf 1 2 3 4 5\n");
    expect(firstMesh(scene).positions.length).toBe(27);
  });

  it("skips a face with fewer than 3 corners and counts it as f", () => {
    const scene = parseObj("v 0 0 0\nv 1 0 0\nf 1 2\nf 1\n");
    expect(scene.meshes).toHaveLength(0);
    expect(scene.unsupported.get("f")).toBe(2);
  });
});

describe("parseObj — objects, groups and materials", () => {
  // Resolved ambiguity: `o`, `g` and `usemtl` each set only their own field and
  // the others persist, so mesh splitting is by (object, group, material) with
  // all three carried over until their own next statement.
  const splitScene =
    "v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\n" +
    "o first\ng walls\nf 2 3 4\n" +
    "usemtl red\nf 1 2 3\n" +
    "o second\ng floors\nusemtl blue\nf 3 4 1\n" +
    "g floors\nf 4 1 2\n" +
    "o third\nf 1 2 3\n";

  it("splits meshes by (object, group, material) in first-appearance order", () => {
    const scene = parseObj(splitScene);
    expect(scene.meshes.map((mesh) => [mesh.name, mesh.layer, mesh.material])).toEqual([
      ["first", "walls", "default"],
      ["first", "walls", "red"],
      ["second", "floors", "blue"],
      ["third", "floors", "blue"],
    ]);
  });

  it("names a mesh after the object, else the group, else default; layer after the group, else 0", () => {
    const byGroup = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\ng roof\nf 1 2 3\n");
    expect(firstMesh(byGroup)).toMatchObject({ name: "roof", layer: "roof", material: "default" });

    const plain = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    expect(firstMesh(plain)).toMatchObject({ name: "default", layer: "0", material: "default" });
  });

  it("puts every used layer in scene.layers as visible", () => {
    const scene = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\ng walls\nf 2 3 4\n");
    expect([...scene.layers.keys()].sort()).toEqual(["0", "walls"]);
    for (const layer of scene.layers.values()) expect(layer.visible).toBe(true);
  });

  it("registers palette materials in order of first use and reuses a repeated name's color", () => {
    const scene = parseObj(
      "v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl alpha\nf 1 2 3\nusemtl beta\nf 1 2 3\nusemtl alpha\nf 1 2 3\n",
    );
    expect([...scene.materials.keys()]).toEqual(["default", "alpha", "beta"]);
    const alpha = materialOf(scene, "alpha");
    const beta = materialOf(scene, "beta");
    expect(alpha.color).toBe(OBJ_MATERIAL_PALETTE[0]);
    expect(beta.color).toBe(OBJ_MATERIAL_PALETTE[1]);
    expect(alpha.color).not.toBe(beta.color);
  });

  it("uses DEFAULT_MATERIAL for faces before any usemtl", () => {
    const scene = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    expect(scene.materials.get("default")).toEqual({ ...DEFAULT_MATERIAL });
    expect(firstMesh(scene).material).toBe(DEFAULT_MATERIAL.name);
  });
});

describe("parseObj — normals", () => {
  it("uses the vn of every corner when each corner has one", () => {
    const scene = parseObj(
      "v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nvn 0 1 0\nvn 1 0 0\nf 1//1 2//2 3//3\n",
    );
    expect([...normalsOf(firstMesh(scene))]).toEqual([0, 0, 1, 0, 1, 0, 1, 0, 0]);
  });

  it("uses the flat triangle normal on every vertex when some corner lacks a vn", () => {
    const scene = parseObj("v 0 0 0\nv 2 0 0\nv 0 2 0\nvn 0 0 1\nf 1 2 3\n");
    expect([...normalsOf(firstMesh(scene))]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it("computes a normalized flat normal for a skewed triangle", () => {
    const scene = parseObj("v 0 0 0\nv 1 0 0\nv 1 1 1\nf 1 2 3\n");
    // Float32 storage rounds 1 / sqrt(2); fround gives the exact stored value.
    const s = Math.fround(1 / Math.sqrt(2));
    expect([...normalsOf(firstMesh(scene))]).toEqual([0, -s, s, 0, -s, s, 0, -s, s]);
  });
});

describe("parseObj — statements and structure", () => {
  it("ignores s statements and comments", () => {
    const scene = parseObj("# a comment\nv 0 0 0\nv 1 0 0\nv 0 1 0\ns 2\ns off\nf 1 2 3\n");
    expect(scene.meshes).toHaveLength(1);
    expect(scene.unsupported.size).toBe(0);
  });

  it("continues a line ending with a backslash", () => {
    const scene = parseObj("v 0 0 0\nv 1 0 \\\n0\nv 0 1 0\nf 1 2 3\n");
    expect(corners(firstMesh(scene))).toContainEqual([1, 0, 0]);
  });

  it("reports a continued line by the number of its first physical line", () => {
    const error = (() => {
      try {
        parseObj("v 0 0 0\n\\\nv 1 x 0\n");
      } catch (caught) {
        return caught as CadViewerError;
      }
    })();
    expect(error?.code).toBe("obj-invalid-number");
    expect(error?.params).toEqual({ line: 2 });
  });

  it("counts mtllib, l, p and unknown keywords in unsupported by keyword", () => {
    const scene = parseObj(
      "mtllib model.mtl\nl 1 2\nl 1 2 3\np 1\np 1\np 2\ncurv 0 1 2\nsurf 0 1 2\nmystery foo bar\n",
    );
    expect(Object.fromEntries(scene.unsupported)).toEqual({
      mtllib: 1,
      l: 2,
      p: 3,
      curv: 1,
      surf: 1,
      mystery: 1,
    });
  });

  it("does not emit empty meshes for objects or groups without faces", () => {
    const scene = parseObj("v 0 0 0\no empty\ng lonely\nv 1 1 1\n");
    expect(scene.meshes).toHaveLength(0);
  });

  it("sets format to obj and bounds to sceneBounds of the meshes", () => {
    const scene = parseObj("v 0 0 0\nv 1 2 3\nv -1 5 2\nf 1 2 3\n");
    expect(scene.format).toBe("obj");
    expect(scene.bounds).toEqual(sceneBounds(scene.meshes));
    expect(scene.bounds).toEqual({ minX: -1, minY: 0, minZ: 0, maxX: 1, maxY: 5, maxZ: 3 });
  });

  it("returns a valid empty scene for an empty file", () => {
    const scene = parseObj("");
    expect(scene.format).toBe("obj");
    expect(scene.meshes).toHaveLength(0);
    expect(scene.bounds).toBeNull();
  });
});

describe("parseObj — errors", () => {
  it("throws obj-invalid-number for a bad number in v and in vn", () => {
    expectViewerError(() => parseObj("v 1 2 three\n"), "obj-invalid-number", { line: 1 });
    expectViewerError(() => parseObj("v 0 0 0\nvn 1 x 3\n"), "obj-invalid-number", { line: 2 });
  });

  it("throws obj-invalid-index for index 0 with the raw token", () => {
    expectViewerError(() => parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 0 2 3\n"), "obj-invalid-index", {
      index: "0",
      line: 4,
    });
  });

  it("throws obj-invalid-index for a non-integer token with the raw token", () => {
    expectViewerError(
      () => parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1.5 2 3\n"),
      "obj-invalid-index",
      {
        index: "1.5",
        line: 4,
      },
    );
    expectViewerError(
      () => parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf abc 2 3\n"),
      "obj-invalid-index",
      {
        index: "abc",
        line: 4,
      },
    );
  });

  it("throws obj-invalid-index for out-of-range positive and negative indices", () => {
    expectViewerError(() => parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 4 2 3\n"), "obj-invalid-index", {
      index: "4",
      line: 4,
    });
    expectViewerError(
      () => parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -4 2 3\n"),
      "obj-invalid-index",
      {
        index: "-4",
        line: 4,
      },
    );
  });
});

describe("objLoader", () => {
  it("exposes id and extensions", () => {
    expect(objLoader.id).toBe("obj");
    expect(objLoader.extensions).toEqual([".obj"]);
  });

  it("decodes UTF-8, stripping the BOM, with a non-ASCII group name", async () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...decode("v 0 0 0\nv 1 0 0\nv 0 1 0\ng pared\nf 1 2 3\n"),
    ]);
    const scene = await objLoader.load(bytes, {});
    expect(firstMesh(scene)).toMatchObject({ name: "pared", layer: "pared" });
  });

  it("canLoad accepts OBJ text", () => {
    expect(objLoader.canLoad({ bytes: decode("v 1 2 3\nf 1 1 1\n") })).toBe(true);
  });

  it("canLoad rejects text without a v line in the first 4 KiB", () => {
    const long = `# ${"x".repeat(4100)}\nv 1 2 3\n`;
    expect(objLoader.canLoad({ bytes: decode(long) })).toBe(false);
  });

  it("canLoad rejects bytes containing a NUL", () => {
    const bytes = decode("v 1 2 3\n");
    bytes[0] = 0;
    expect(objLoader.canLoad({ bytes })).toBe(false);
  });

  it("reports onProgress with the parse phase", async () => {
    const phases: string[] = [];
    await objLoader.load(decode("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"), {
      onProgress: (progress) => phases.push(progress.phase),
    });
    expect(phases).toEqual(["parse"]);
  });

  it("rejects an already aborted signal with a CadLoadError aborted code", async () => {
    const controller = new AbortController();
    controller.abort();
    const bytes = decode("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    await expect(objLoader.load(bytes, { signal: controller.signal })).rejects.toThrow(
      CadLoadError,
    );
    await expect(objLoader.load(bytes, { signal: controller.signal })).rejects.toMatchObject({
      code: "aborted",
    });
  });
});

describe("parseObj — regression guards", () => {
  it("keeps the default material untouched in the scene", () => {
    const scene = parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    expect(scene.materials.get("default")).toEqual({ name: "default", color: 0xb4bcc4 });
  });
});
