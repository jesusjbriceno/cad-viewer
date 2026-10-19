import {
  abortError,
  type CadMesh,
  type CadScene,
  CadViewerError,
  createEmptyScene,
  DEFAULT_MATERIAL,
  type FormatLoader,
  type LoaderProbe,
  type LoadOptions,
  sceneBounds,
} from "@cadscene/core";

/** Bytes before the first triangle (80-byte header plus uint32 triangle count). */
const BINARY_PREFIX = 84;
const BYTES_PER_TRIANGLE = 50;
const DEFAULT_SOLID_NAME = "solid";

interface Facet {
  normal: [number, number, number];
  vertices: number[][];
}

interface SolidBuilder {
  name: string;
  positions: number[];
  normals: number[];
}

/** Library error carrying the English catalog message for `stl-truncated`. */
function truncatedError(triangles: number, bytes: number): CadViewerError {
  return new CadViewerError(
    "stl-truncated",
    `Binary STL declares ${triangles} triangles but has only ${bytes} bytes.`,
    { params: { triangles, bytes } },
  );
}

/** Library error carrying the English catalog message for `stl-invalid-number`. */
function invalidNumberError(line: number): CadViewerError {
  return new CadViewerError("stl-invalid-number", `Invalid number in STL at line ${line}.`, {
    params: { line },
  });
}

/** Declared triangle count from bytes 80..83, little-endian. */
function declaredTriangleCount(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
}

/** Binary shape: the count field plus `count` full triangles fit in the file. */
function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.length < BINARY_PREFIX) return false;
  const count = declaredTriangleCount(bytes);
  // A declared count of zero matches almost any binary of 84+ bytes (a DWG was claimed as an
  // empty STL), so sniffing requires real geometry; an .stl file with zero triangles still
  // loads through the extension path.
  return count > 0 && BINARY_PREFIX + BYTES_PER_TRIANGLE * count <= bytes.length;
}

/** Printable header text up to the first NUL, trimmed (may be empty). */
function binaryHeaderText(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < Math.min(80, bytes.length); index++) {
    const byte = bytes[index] as number;
    if (byte === 0) break;
    if (byte >= 0x20 && byte < 0x7f) text += String.fromCharCode(byte);
  }
  return text.trim();
}

/** ASCII when the text starts with `solid` after an optional BOM and whitespace. */
function looksLikeAsciiStl(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 1024));
  return head.trimStart().toLowerCase().startsWith("solid");
}

/**
 * Per-vertex normal for one triangle: the stored facet normal when it is finite
 * and not the zero vector, otherwise the normalized cross product of the edges,
 * or +Z when degenerate.
 */
function triangleNormal(
  facetNormal: [number, number, number],
  vertices: number[][],
): [number, number, number] {
  const [nx, ny, nz] = facetNormal;
  if ([nx, ny, nz].every(Number.isFinite) && (nx !== 0 || ny !== 0 || nz !== 0)) {
    return [nx, ny, nz];
  }
  const [a, b, c] = vertices;
  const ax = (b?.[0] ?? 0) - (a?.[0] ?? 0);
  const ay = (b?.[1] ?? 0) - (a?.[1] ?? 0);
  const az = (b?.[2] ?? 0) - (a?.[2] ?? 0);
  const bx = (c?.[0] ?? 0) - (a?.[0] ?? 0);
  const by = (c?.[1] ?? 0) - (a?.[1] ?? 0);
  const bz = (c?.[2] ?? 0) - (a?.[2] ?? 0);
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const length = Math.hypot(cx, cy, cz);
  if (length === 0 || !Number.isFinite(length)) return [0, 0, 1];
  return [cx / length, cy / length, cz / length];
}

/** Appends one triangle: 9 positions and the same normal on its 3 vertices. */
function pushTriangle(target: SolidBuilder, facet: Facet): void {
  const normal = triangleNormal(facet.normal, facet.vertices);
  for (const vertex of facet.vertices) target.positions.push(...vertex);
  for (let index = 0; index < 3; index++) target.normals.push(...normal);
}

/** Builds a mesh from accumulated triangle data. */
function toMesh(builder: SolidBuilder): CadMesh {
  return {
    name: builder.name,
    layer: "0",
    material: DEFAULT_MATERIAL.name,
    positions: Float32Array.from(builder.positions),
    normals: Float32Array.from(builder.normals),
  };
}

/** Registers the shared layer and computes bounds. */
function finalizeScene(scene: CadScene, meshes: CadMesh[]): CadScene {
  scene.layers.set("0", { name: "0", visible: true });
  scene.meshes = meshes;
  scene.bounds = sceneBounds(meshes);
  return scene;
}

function parseBinaryStl(bytes: Uint8Array): CadScene {
  const scene = createEmptyScene("stl");
  const header = binaryHeaderText(bytes);
  scene.metadata.header = header;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = declaredTriangleCount(bytes);
  // The count is known up front: fill typed arrays directly, large files are common.
  const positions = new Float32Array(count * 9);
  const normals = new Float32Array(count * 9);
  for (let triangle = 0; triangle < count; triangle++) {
    const offset = BINARY_PREFIX + BYTES_PER_TRIANGLE * triangle;
    const component = (slot: number): number => view.getFloat32(offset + 4 * slot, true);
    const vertices = [3, 6, 9].map((start) => [
      component(start),
      component(start + 1),
      component(start + 2),
    ]);
    const normal = triangleNormal([component(0), component(1), component(2)], vertices);
    const base = triangle * 9;
    vertices.forEach((vertex, corner) => {
      positions.set(vertex, base + corner * 3);
      normals.set(normal, base + corner * 3);
    });
  }
  const mesh: CadMesh = {
    name: header || DEFAULT_SOLID_NAME,
    layer: "0",
    material: DEFAULT_MATERIAL.name,
    positions,
    normals,
  };
  return finalizeScene(scene, [mesh]);
}

/** Reads finite numbers, failing with `stl-invalid-number` at the 1-based `line`. */
function readNumbers(tokens: string[], line: number): number[] {
  return tokens.map((token) => {
    const value = Number(token);
    if (!Number.isFinite(value)) throw invalidNumberError(line);
    return value;
  });
}

function parseAsciiStl(text: string): CadScene {
  const scene = createEmptyScene("stl");
  const meshes: CadMesh[] = [];
  let solid: SolidBuilder | undefined;
  let facet: Facet | undefined;
  let skippedFacets = 0;

  const flushSolid = (): void => {
    if (!solid) return;
    meshes.push(toMesh(solid));
    solid = undefined;
  };

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, lineIndex) => {
    const line = raw.trim();
    if (!line) return;
    const [keyword, ...rest] = line.split(/\s+/);
    switch ((keyword as string).toLowerCase()) {
      case "solid":
        flushSolid();
        solid = { name: rest.join(" ").trim() || DEFAULT_SOLID_NAME, positions: [], normals: [] };
        break;
      case "facet": {
        // `facet normal x y z`; a missing `normal` clause means a zero normal.
        const values =
          rest.length >= 4 && rest[0]?.toLowerCase() === "normal"
            ? (readNumbers(rest.slice(1, 4), lineIndex + 1) as [number, number, number])
            : ([0, 0, 0] as [number, number, number]);
        facet = { normal: values, vertices: [] };
        break;
      }
      case "vertex":
        facet?.vertices.push(readNumbers(rest, lineIndex + 1));
        break;
      case "endfacet":
        if (facet) {
          if (facet.vertices.length === 3 && solid) pushTriangle(solid, facet);
          else if (facet.vertices.length !== 3) skippedFacets++;
          facet = undefined;
        }
        break;
      case "endsolid":
        flushSolid();
        break;
      default:
        break; // `outer loop`, `endloop` and unknown lines carry no data.
    }
  });
  flushSolid(); // Tolerate a missing `endsolid` at end of file.
  if (skippedFacets > 0) scene.unsupported.set("facet", skippedFacets);
  return finalizeScene(scene, meshes);
}

/**
 * Parses an STL file (binary or ASCII) into a scene. Binary when the declared
 * triangle count fits the file size, ASCII when the text starts with `solid`,
 * otherwise `stl-truncated`.
 */
export function parseStl(bytes: Uint8Array): CadScene {
  if (isBinaryStl(bytes)) return parseBinaryStl(bytes);
  if (looksLikeAsciiStl(bytes)) return parseAsciiStl(new TextDecoder("utf-8").decode(bytes));
  const triangles = bytes.length >= BINARY_PREFIX ? declaredTriangleCount(bytes) : 0;
  throw truncatedError(triangles, bytes.length);
}

/** Built-in loader for binary and ASCII STL. */
export const stlLoader: FormatLoader<CadScene> = {
  id: "stl",
  extensions: [".stl"],

  canLoad({ bytes }: LoaderProbe): boolean {
    return isBinaryStl(bytes) || looksLikeAsciiStl(bytes);
  },

  async load(bytes: Uint8Array, options: LoadOptions): Promise<CadScene> {
    if (options.signal?.aborted) throw abortError();
    options.onProgress?.({ phase: "parse" });
    const scene = parseStl(bytes);
    if (options.signal?.aborted) throw abortError();
    return scene;
  },
};
