import { type Bounds3, type CadMesh, type CadScene, meshBounds } from "@cadscene/core";

/** One part of a 3D model, as plain data. */
export interface PartInfo {
  /** Index in `scene.meshes`, stable for one scene. */
  id: number;
  name: string;
  layer: string;
  material: string;
  triangles: number;
  vertices: number;
  /** Bounds of this part; null when it has no finite vertices. */
  bounds: Bounds3 | null;
  visible: boolean;
}

/** One part with the material and geometry details an inspector shows. */
export interface PartDetails extends PartInfo {
  /** Material colour as 0xRRGGBB. */
  color: number;
  opacity?: number;
  indexed: boolean;
  hasNormals: boolean;
}

/** What a 3D scene contains, without exposing the scene itself. */
export interface SceneSummary {
  format: string;
  /** Unit name when the source declares one; STL and OBJ do not. */
  units?: string;
  meshCount: number;
  layerCount: number;
  triangles: number;
  vertices: number;
  materialCount: number;
  bounds: Bounds3 | null;
}

function trianglesOf(mesh: CadMesh): number {
  return (mesh.indices?.length ?? mesh.positions.length / 3) / 3;
}

function verticesOf(mesh: CadMesh): number {
  return mesh.positions.length / 3;
}

/** Summarizes a model: parts, layers, triangles, vertices, materials and bounds. */
export function summarizeScene(scene: CadScene): SceneSummary {
  let triangles = 0;
  let vertices = 0;
  for (const mesh of scene.meshes) {
    triangles += trianglesOf(mesh);
    vertices += verticesOf(mesh);
  }
  return {
    format: scene.format,
    ...(scene.units ? { units: scene.units } : {}),
    meshCount: scene.meshes.length,
    layerCount: scene.layers.size,
    triangles,
    vertices,
    materialCount: scene.materials.size,
    bounds: scene.bounds,
  };
}

/**
 * Lists every part. Visibility is the caller's: the scene stores it per layer and
 * the viewer keeps its own layer state, so `isVisible` defaults to "visible".
 */
export function partsOf(
  scene: CadScene,
  isVisible: (layer: string) => boolean = () => true,
): PartInfo[] {
  return scene.meshes.map((mesh, id) => ({
    id,
    name: mesh.name,
    layer: mesh.layer,
    material: mesh.material,
    triangles: trianglesOf(mesh),
    vertices: verticesOf(mesh),
    bounds: meshBounds(mesh),
    visible: isVisible(mesh.layer),
  }));
}

/** Reads one part with its material colour and geometry flags; null for an unknown id. */
export function describePart(
  scene: CadScene,
  id: number,
  isVisible?: (layer: string) => boolean,
): PartDetails | null {
  const part = partsOf(scene, isVisible)[id];
  if (!part) return null;
  const mesh = scene.meshes[id] as CadMesh;
  const material = scene.materials.get(mesh.material);
  return {
    ...part,
    color: material?.color ?? 0,
    ...(material?.opacity !== undefined ? { opacity: material.opacity } : {}),
    indexed: mesh.indices !== undefined,
    hasNormals: mesh.normals !== undefined,
  };
}
