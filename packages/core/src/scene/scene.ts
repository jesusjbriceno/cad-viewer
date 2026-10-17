import type { Bounds3, CadMaterial, CadMesh, CadScene } from "./types";

/** Material used when the source gives none: a light steel gray. */
export const DEFAULT_MATERIAL: Readonly<CadMaterial> = Object.freeze({
  name: "default",
  color: 0xb4bcc4,
});

/** A valid, empty scene: no layers, no meshes, only the default material. */
export function createEmptyScene(format: string): CadScene {
  return {
    format,
    layers: new Map(),
    materials: new Map([[DEFAULT_MATERIAL.name, { ...DEFAULT_MATERIAL }]]),
    meshes: [],
    bounds: null,
    unsupported: new Map(),
    metadata: {},
  };
}

/** Bounds of every vertex of a mesh, or null when it has none. */
export function meshBounds(mesh: CadMesh): Bounds3 | null {
  const { positions } = mesh;
  if (positions.length < 3) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index + 2 < positions.length; index += 3) {
    const x = positions[index] as number;
    const y = positions[index + 1] as number;
    const z = positions[index + 2] as number;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Union of the bounds of every non-empty mesh, or null when there is no geometry. */
export function sceneBounds(meshes: readonly CadMesh[]): Bounds3 | null {
  let result: Bounds3 | null = null;
  for (const mesh of meshes) {
    const bounds = meshBounds(mesh);
    if (!bounds) continue;
    result = result
      ? {
          minX: Math.min(result.minX, bounds.minX),
          minY: Math.min(result.minY, bounds.minY),
          minZ: Math.min(result.minZ, bounds.minZ),
          maxX: Math.max(result.maxX, bounds.maxX),
          maxY: Math.max(result.maxY, bounds.maxY),
          maxZ: Math.max(result.maxZ, bounds.maxZ),
        }
      : bounds;
  }
  return result;
}
