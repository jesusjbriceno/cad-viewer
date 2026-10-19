import {
  CadLoadError,
  CadViewerError,
  DEFAULT_MATERIAL,
  formatCadError,
  type LoadOptions,
  sceneBounds,
} from "@jesusjbriceno/cad-viewer-core";
import { describe, expect, it, vi } from "vitest";
import { parseStl, stlLoader } from "../src/loaders/stl";

/** Builds a little-endian binary STL: 80-byte header, count, 50 bytes per triangle. */
function binaryStl(header: string, triangles: number[][]): Uint8Array {
  const bytes = new Uint8Array(84 + 50 * triangles.length);
  for (let index = 0; index < Math.min(header.length, 80); index++) {
    bytes[index] = header.charCodeAt(index);
  }
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((triangle, index) => {
    const offset = 84 + 50 * index;
    triangle.forEach((value, component) => {
      view.setFloat32(offset + 4 * component, value, true);
    });
  });
  return bytes;
}

/** A triangle is [normal(3), v0(3), v1(3), v2(3)]. */
const UP_TRIANGLE = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];

function asciiStl(body: string): Uint8Array {
  return new TextEncoder().encode(body);
}

/** Asserts a thrown error is a CadViewerError with the given code, params and English message. */
function expectError(fn: () => unknown, code: string, params: unknown): CadViewerError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CadViewerError);
  const error = caught as CadViewerError;
  expect(error.code).toBe(code);
  expect(error.params).toEqual(params);
  expect(error.message).toBe(formatCadError(error, "en"));
  return error;
}

describe("binary STL", () => {
  it("parses into one named mesh with facet normals, layer, material and bounds", () => {
    const scene = parseStl(
      binaryStl("gear housing", [UP_TRIANGLE, [0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 0]]),
    );
    expect(scene.format).toBe("stl");
    expect(scene.meshes).toHaveLength(1);
    const mesh = scene.meshes[0] as (typeof scene.meshes)[number];
    expect(mesh.name).toBe("gear housing");
    expect(scene.metadata.header).toBe("gear housing");
    expect(mesh.positions).toHaveLength(18);
    expect(Array.from(mesh.positions as unknown as number[])).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0,
    ]);
    expect(Array.from(mesh.normals as unknown as number[])).toEqual([
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    ]);
    expect(mesh.layer).toBe("0");
    expect(mesh.material).toBe(DEFAULT_MATERIAL.name);
    expect(scene.layers.get("0")).toEqual({ name: "0", visible: true });
    expect(scene.materials.get(DEFAULT_MATERIAL.name)).toEqual({ ...DEFAULT_MATERIAL });
    expect(scene.bounds).toEqual(sceneBounds(scene.meshes));
    expect(scene.bounds).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 });
    expect(scene.unsupported.size).toBe(0);
  });

  it("is detected by size even when the 80-byte header starts with 'solid'", () => {
    const scene = parseStl(binaryStl("solid looks like ascii", [UP_TRIANGLE]));
    expect(scene.meshes).toHaveLength(1);
    expect(scene.meshes[0]?.name).toBe("solid looks like ascii");
  });

  it("accepts trailing bytes after the last triangle", () => {
    const bytes = binaryStl("padded", [UP_TRIANGLE]);
    const withTrailing = new Uint8Array(bytes.length + 7);
    withTrailing.set(bytes);
    withTrailing.set([1, 2, 3, 4, 5, 6, 7], bytes.length);
    const scene = parseStl(withTrailing);
    expect(scene.meshes[0]?.positions).toHaveLength(9);
  });

  it("falls back to the name 'solid' for an empty header", () => {
    const scene = parseStl(binaryStl("", [UP_TRIANGLE]));
    expect(scene.meshes[0]?.name).toBe("solid");
  });

  it("reads the header up to the first NUL and trims it", () => {
    const scene = parseStl(binaryStl("  trimmed\u0000junk", [UP_TRIANGLE]));
    expect(scene.meshes[0]?.name).toBe("trimmed");
    expect(scene.metadata.header).toBe("trimmed");
  });

  it("recomputes the normal as the normalized cross product when the stored one is zero", () => {
    // (1,2,0) × (0,0,3) = (6,-3,0), normalized ≈ (0.8944, -0.4472, 0).
    const scene = parseStl(binaryStl("cross", [[0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 3]]));
    const normals = Array.from(scene.meshes[0]?.normals as unknown as number[]);
    expect(normals).toHaveLength(9);
    expect(normals[0]).toBeCloseTo(6 / Math.sqrt(45), 6);
    expect(normals[1]).toBeCloseTo(-3 / Math.sqrt(45), 6);
    expect(normals[2]).toBeCloseTo(0, 6);
  });
});

describe("ASCII STL", () => {
  it("parses with a BOM and leading whitespace into one mesh", () => {
    const scene = parseStl(
      asciiStl(
        "\uFEFF\n  solid bracket\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid bracket\n",
      ),
    );
    expect(scene.format).toBe("stl");
    expect(scene.meshes).toHaveLength(1);
    expect(scene.meshes[0]?.name).toBe("bracket");
    expect(scene.meshes[0]?.positions).toHaveLength(9);
    expect(Array.from(scene.meshes[0]?.normals as unknown as number[])).toEqual([
      0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]);
    expect(scene.meshes[0]?.layer).toBe("0");
    expect(scene.meshes[0]?.material).toBe(DEFAULT_MATERIAL.name);
    expect(scene.layers.get("0")).toEqual({ name: "0", visible: true });
    expect(scene.bounds).toEqual(sceneBounds(scene.meshes));
  });

  it("creates one mesh per solid block with its own name", () => {
    const scene = parseStl(
      asciiStl(
        "solid left\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid left\nsolid right\nfacet normal 0 0 1\nouter loop\nvertex 5 0 0\nvertex 6 0 0\nvertex 5 1 0\nendloop\nendfacet\nendsolid right\n",
      ),
    );
    expect(scene.meshes.map((mesh) => mesh.name)).toEqual(["left", "right"]);
    expect(scene.meshes[0]?.positions).toHaveLength(9);
    expect(scene.meshes[1]?.positions).toHaveLength(9);
    expect(scene.bounds).toEqual(sceneBounds(scene.meshes));
    expect(scene.bounds).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 6, maxY: 1, maxZ: 0 });
  });

  it("accepts case-insensitive keywords", () => {
    const scene = parseStl(
      asciiStl(
        "SOLID Up\nFACET NORMAL 0 0 1\nOUTER LOOP\nVERTEX 0 0 0\nVERTEX 1 0 0\nVERTEX 0 1 0\nENDLOOP\nENDFACET\nENDSOLID Up\n",
      ),
    );
    expect(scene.meshes).toHaveLength(1);
    expect(scene.meshes[0]?.name).toBe("Up");
    expect(scene.meshes[0]?.positions).toHaveLength(9);
  });

  it("falls back to the name 'solid' when the solid line has no name", () => {
    const scene = parseStl(
      asciiStl(
        "solid\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid\n",
      ),
    );
    expect(scene.meshes).toHaveLength(1);
    expect(scene.meshes[0]?.name).toBe("solid");
  });

  it("skips facets with 2 or 4 vertices and counts them as unsupported 'facet'", () => {
    const scene = parseStl(
      asciiStl(
        "solid skip\n" +
          "facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nendloop\nendfacet\n" +
          "facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nvertex 1 1 0\nendloop\nendfacet\n" +
          "facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\n" +
          "endsolid skip\n",
      ),
    );
    expect(scene.meshes[0]?.positions).toHaveLength(9);
    expect(scene.unsupported.get("facet")).toBe(2);
  });

  it("uses (0, 0, 1) for a degenerate triangle", () => {
    const scene = parseStl(
      asciiStl(
        "solid degenerate\nfacet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 1 1 1\nvertex 2 2 2\nendloop\nendfacet\nendsolid degenerate\n",
      ),
    );
    expect(Array.from(scene.meshes[0]?.normals as unknown as number[])).toEqual([
      0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]);
  });
});

describe("STL errors", () => {
  it("throws stl-truncated when the declared count exceeds the data", () => {
    const bytes = new Uint8Array(84 + 50 * 2);
    for (const [index, char] of [..."short"].entries()) bytes[index] = char.charCodeAt(0);
    new DataView(bytes.buffer).setUint32(80, 5, true);
    expectError(() => parseStl(bytes), "stl-truncated", { triangles: 5, bytes: 184 });
  });

  it("throws stl-truncated with 0 triangles for a short non-ASCII file", () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expectError(() => parseStl(bytes), "stl-truncated", { triangles: 0, bytes: 15 });
  });

  it("throws stl-invalid-number with the 1-based line", () => {
    const text = [
      "solid bad",
      "facet normal 0 0 1",
      "outer loop",
      "vertex 0 0 0",
      "vertex 1 0 0",
      "vertex oops 1 0",
      "endloop",
      "endfacet",
      "endsolid bad",
    ].join("\n");
    expectError(() => parseStl(asciiStl(text)), "stl-invalid-number", { line: 6 });
  });
});

describe("stlLoader", () => {
  it("exposes id and extensions", () => {
    expect(stlLoader.id).toBe("stl");
    expect(stlLoader.extensions).toEqual([".stl"]);
  });

  it("canLoad accepts binary, ASCII and a binary header starting with 'solid', rejects garbage", () => {
    expect(stlLoader.canLoad({ bytes: binaryStl("binary", [UP_TRIANGLE]) })).toBe(true);
    expect(stlLoader.canLoad({ bytes: binaryStl("solid binary", [UP_TRIANGLE]) })).toBe(true);
    expect(
      stlLoader.canLoad({
        bytes: asciiStl("solid thing\nfacet normal 0 0 1\nendsolid thing\n"),
      }),
    ).toBe(true);
    expect(stlLoader.canLoad({ bytes: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) })).toBe(
      false,
    );
  });

  it("canLoad rejects a binary that declares zero triangles", () => {
    // Any file of 84+ bytes whose bytes 80..83 are zero used to be claimed as an empty STL,
    // which made a DWG load as "0 triangles" instead of failing as unsupported.
    const zeroTriangles = new Uint8Array(200);
    expect(stlLoader.canLoad({ bytes: zeroTriangles })).toBe(false);
  });

  it("loads bytes into a scene and reports the parse phase", () => {
    const onProgress = vi.fn();
    const options: LoadOptions = { onProgress };
    const scene = parseStl(binaryStl("load", [UP_TRIANGLE]));
    expect(scene.format).toBe("stl");
    return stlLoader.load(binaryStl("load", [UP_TRIANGLE]), options).then((loaded) => {
      expect(loaded.format).toBe("stl");
      expect(loaded.meshes).toHaveLength(1);
      expect(onProgress).toHaveBeenCalledWith({ phase: "parse" });
    });
  });

  it("rejects with an aborted CadLoadError when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let caught: unknown;
    try {
      await stlLoader.load(binaryStl("aborted", [UP_TRIANGLE]), {
        signal: controller.signal,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CadLoadError);
    expect((caught as CadLoadError).code).toBe("aborted");
  });
});
