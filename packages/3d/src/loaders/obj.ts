import {
  abortError,
  type CadScene,
  CadViewerError,
  createEmptyScene,
  DEFAULT_MATERIAL,
  type FormatLoader,
  type LoaderProbe,
  type LoadOptions,
  sceneBounds,
} from "@cadscene/core";

/**
 * Fixed 8-color palette for OBJ `usemtl` materials. `.mtl` files are not
 * resolved in 0.3.0, so each new material name takes the next color in order
 * of first use (wrapping around after the eighth).
 */
export const OBJ_MATERIAL_PALETTE: readonly number[] = Object.freeze([
  0xe6194b, 0x3cb44b, 0x4363d8, 0xf58231, 0x911eb4, 0x42d4f4, 0xf032e6, 0xffe119,
]);

const HEADER_BYTES = 4096;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const INTEGER = /^[+-]?\d+$/;

function invalidNumber(line: number): never {
  throw new CadViewerError("obj-invalid-number", `Invalid number in OBJ at line ${line}.`, {
    params: { line },
  });
}

function invalidIndex(index: string, line: number): never {
  throw new CadViewerError(
    "obj-invalid-index",
    `Invalid vertex index "${index}" in OBJ at line ${line}.`,
    { params: { index, line } },
  );
}

/** Current `o`/`g`/`usemtl` state; each field persists until its own next statement. */
interface GroupingState {
  object: string | null;
  group: string | null;
  material: string | null;
}

/** Triangles accumulated for one (object, group, material) combination. */
interface MeshAccumulator {
  name: string;
  layer: string;
  material: string;
  positions: number[];
  normals: number[];
}

/** A logical line: joined continuation lines keep their first line number. */
interface SourceLine {
  text: string;
  number: number;
}

/** Splits `text` into logical lines; a trailing `\` continues on the next line. */
function logicalLines(text: string): SourceLine[] {
  const result: SourceLine[] = [];
  let pending: string | null = null;
  let start = 0;
  for (const [index, raw] of text.split(/\r\n|\r|\n/).entries()) {
    if (pending === null) {
      pending = raw;
      start = index + 1;
    } else {
      pending += raw;
    }
    if (raw.endsWith("\\")) {
      pending = pending.slice(0, -1);
    } else {
      result.push({ text: pending, number: start });
      pending = null;
    }
  }
  if (pending !== null) result.push({ text: pending, number: start });
  return result;
}

/** Parses the first three numbers of a `v`/`vn` line; extra values are ignored. */
function parseVector(tokens: string[], line: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < 3; i++) {
    const token = tokens[i];
    const value = Number(token);
    if (token === undefined || !NUMBER.test(token) || !Number.isFinite(value)) invalidNumber(line);
    values.push(value);
  }
  return values;
}

/** Resolves a 1-based OBJ index (negative = relative) to a 0-based position. */
function resolveIndex(token: string, count: number, line: number): number {
  if (!INTEGER.test(token)) invalidIndex(token, line);
  const value = Number(token);
  const index = value > 0 ? value - 1 : count + value;
  if (index < 0 || index >= count) invalidIndex(token, line);
  return index;
}

/** Normalized cross product of (b - a) x (c - a); (0, 0, 1) when degenerate. */
function normalizedCross(a: number[], b: number[], c: number[]): [number, number, number] {
  const [ax = 0, ay = 0, az = 0] = a;
  const [bx = 0, by = 0, bz = 0] = b;
  const [cx = 0, cy = 0, cz = 0] = c;
  const x = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const y = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const z = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length === 0) return [0, 0, 1];
  return [x / length, y / length, z / length];
}

/**
 * Parses OBJ text into a `CadScene`. Statements: `v` (optional `w`, extra
 * values ignored), `vn`, `vt` (ignored), `f` (every corner syntax, negative
 * relative indices, fan triangulation), `o`/`g`/`usemtl` (mesh splitting),
 * `s` and comments (ignored). Any other keyword counts in `unsupported`.
 */
export function parseObj(text: string): CadScene {
  const scene = createEmptyScene("obj");
  const vertices: number[][] = [];
  const normals: number[][] = [];
  const state: GroupingState = { object: null, group: null, material: null };
  const meshes = new Map<string, MeshAccumulator>();
  let paletteIndex = 0;

  /** Meshes are split by (object, group, material) in first-appearance order. */
  const currentMesh = (): MeshAccumulator => {
    const key = `${state.object ?? ""}\u0000${state.group ?? ""}\u0000${state.material ?? ""}`;
    let mesh = meshes.get(key);
    if (!mesh) {
      mesh = {
        name: state.object ?? state.group ?? "default",
        layer: state.group ?? "0",
        material: state.material ?? DEFAULT_MATERIAL.name,
        positions: [],
        normals: [],
      };
      meshes.set(key, mesh);
      scene.layers.set(mesh.layer, { name: mesh.layer, visible: true });
    }
    return mesh;
  };

  const addFace = (tokens: string[], line: number): void => {
    const corners: { position: number[]; normal: number[] | undefined }[] = [];
    for (const token of tokens) {
      const parts = token.split("/");
      const position =
        vertices[resolveIndex(parts[0] ?? "", vertices.length, line)] ??
        invalidIndex(parts[0] ?? "", line);
      let normal: number[] | undefined;
      // `v//vn` yields an empty vt part; the normal is the third part when present.
      const normalToken = parts.length >= 3 ? parts[2] : undefined;
      if (normalToken) {
        normal =
          normals[resolveIndex(normalToken, normals.length, line)] ??
          invalidIndex(normalToken, line);
      }
      corners.push({ position, normal });
    }
    if (corners.length < 3) {
      scene.unsupported.set("f", (scene.unsupported.get("f") ?? 0) + 1);
      return;
    }
    const mesh = currentMesh();
    const a = corners[0];
    for (let i = 1; i + 1 < corners.length; i++) {
      const b = corners[i];
      const c = corners[i + 1];
      if (!a || !b || !c) continue;
      mesh.positions.push(...a.position, ...b.position, ...c.position);
      // Normals are per vertex: the corners' `vn` when all three have one,
      // otherwise the triangle's flat normal repeated on every vertex.
      if (a.normal && b.normal && c.normal) {
        mesh.normals.push(...a.normal, ...b.normal, ...c.normal);
      } else {
        const flat = normalizedCross(a.position, b.position, c.position);
        mesh.normals.push(...flat, ...flat, ...flat);
      }
    }
  };

  for (const { text: line, number } of logicalLines(text)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const [keywordRaw, ...rest] = trimmed.split(/\s+/);
    const keyword = keywordRaw?.toLowerCase() ?? "";
    switch (keyword) {
      case "v":
        vertices.push(parseVector(rest, number));
        break;
      case "vn":
        normals.push(parseVector(rest, number));
        break;
      case "vt":
        break;
      case "f":
        addFace(rest, number);
        break;
      case "o":
        state.object = rest.join(" ").trim() || null;
        break;
      case "g":
        state.group = rest.join(" ").trim() || null;
        break;
      case "usemtl": {
        const name = rest.join(" ").trim() || null;
        state.material = name;
        if (name !== null && !scene.materials.has(name)) {
          const palette = OBJ_MATERIAL_PALETTE;
          scene.materials.set(name, {
            name,
            color: palette[paletteIndex % palette.length] ?? 0,
          });
          paletteIndex++;
        }
        break;
      }
      case "s":
        break;
      default:
        scene.unsupported.set(keyword, (scene.unsupported.get(keyword) ?? 0) + 1);
    }
  }

  for (const mesh of meshes.values()) {
    if (mesh.positions.length === 0) continue;
    scene.meshes.push({
      name: mesh.name,
      layer: mesh.layer,
      material: mesh.material,
      positions: new Float32Array(mesh.positions),
      normals: new Float32Array(mesh.normals),
    });
  }
  scene.bounds = sceneBounds(scene.meshes);
  return scene;
}

/** The first 4 KiB must contain a `v <number>` line and no NUL byte. */
function looksLikeObj(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, HEADER_BYTES));
  if (head.includes("\0")) return false;
  for (const line of head.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
    const match = /^v\s+(\S+)/.exec(line);
    if (match && NUMBER.test(match[1] ?? "")) return true;
  }
  return false;
}

/** Built-in loader for Wavefront OBJ (geometry only; materials are not resolved). */
export const objLoader: FormatLoader<CadScene> = {
  id: "obj",
  extensions: [".obj"],

  canLoad({ bytes }: LoaderProbe): boolean {
    return looksLikeObj(bytes);
  },

  async load(bytes: Uint8Array, options: LoadOptions): Promise<CadScene> {
    if (options.signal?.aborted) throw abortError();
    options.onProgress?.({ phase: "parse" });
    const scene = parseObj(new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, ""));
    if (options.signal?.aborted) throw abortError();
    return scene;
  },
};
