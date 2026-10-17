/**
 * Neutral 3D scene model. 3D format loaders produce a `CadScene`; the 3D
 * renderer only reads it. It is independent of the planar `CadDocument`, so
 * the 2D model and viewer are unaffected by 3D formats.
 *
 * Conventions: coordinates are model units as stored by the source (STL and
 * OBJ declare no units); geometry is triangles; colors are 0xRRGGBB.
 */

/** Axis-aligned 3D bounds in model units. */
export interface Bounds3 {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface CadMaterial {
  name: string;
  /** Diffuse color as 0xRRGGBB. */
  color: number;
  /** 0..1; opaque when omitted. */
  opacity?: number;
}

/** A triangle mesh: one part of the model, on one layer, with one material. */
export interface CadMesh {
  /** Part name from the source (STL solid name, OBJ object or group). */
  name: string;
  layer: string;
  /** Key of `CadScene.materials`. */
  material: string;
  /** Vertex positions as xyz triplets. */
  positions: Float32Array;
  /** Per-vertex normals, same length as `positions`; the renderer computes them when absent. */
  normals?: Float32Array;
  /** Triangle corners as vertex indices; when absent, every three vertices form a triangle. */
  indices?: Uint32Array;
}

export interface CadSceneLayer {
  name: string;
  visible: boolean;
}

export interface CadScene {
  /** Loader id ("stl", "obj"). */
  format: string;
  /** Unit name when the source declares one; STL and OBJ do not. */
  units?: string;
  layers: Map<string, CadSceneLayer>;
  materials: Map<string, CadMaterial>;
  meshes: CadMesh[];
  /** Bounds of every mesh; null when the scene has no geometry. */
  bounds: Bounds3 | null;
  /** Source statements recognized but not represented, by kind (e.g. OBJ "l" for polylines). */
  unsupported: Map<string, number>;
  /** Free-form source metadata (e.g. the STL header). */
  metadata: Record<string, string>;
}
