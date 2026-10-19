import {
  type CadDocument,
  type CadEntity,
  type CadLayout,
  type CadMesh,
  type CadScene,
  createEmptyScene,
  DEFAULT_MATERIAL,
  sceneBounds,
} from "@cadscene/core";

export interface FaceSceneOptions {
  /** Layout name; defaults to the model layout. */
  layout?: string;
}

/** A `3DFACE`: both parsers store it as a solid marked `outlineOnly`. */
type FaceEntity = Extract<CadEntity, { type: "solid" }>;

function is3dFace(entity: CadEntity): entity is FaceEntity {
  return entity.type === "solid" && entity.outlineOnly === true;
}

function layoutOf(document: CadDocument, options: FaceSceneOptions): CadLayout | undefined {
  return options.layout
    ? document.layouts.find((layout) => layout.name === options.layout)
    : document.layouts.find((layout) => layout.isModel);
}

/** True when the drawing carries 3D faces, so a host can offer "view in 3D". */
export function has3dFaces(document: CadDocument, options: FaceSceneOptions = {}): boolean {
  return layoutOf(document, options)?.entities.some(is3dFace) ?? false;
}

/**
 * Builds a `CadScene` from the `3DFACE` entities of a drawing: one mesh per layer, two triangles
 * per quad, heights preserved. Planar `SOLID`/`TRACE` fills and every other entity are ignored,
 * and `3DSOLID` (ACIS) is out of scope — it needs a converter.
 */
export function sceneFromDocument(document: CadDocument, options: FaceSceneOptions = {}): CadScene {
  const scene = createEmptyScene(document.format);
  const layout = layoutOf(document, options);
  if (!layout) return scene;

  const byLayer = new Map<string, number[]>();
  for (const entity of layout.entities) {
    if (!is3dFace(entity)) continue;
    const points = entity.points;
    if (points.length < 3) continue;
    const vertices = byLayer.get(entity.layer) ?? [];
    const push = (point: { x: number; y: number; z?: number }) => {
      vertices.push(point.x, point.y, point.z ?? 0);
    };
    push(points[0] as { x: number; y: number; z?: number });
    push(points[1] as { x: number; y: number; z?: number });
    push(points[2] as { x: number; y: number; z?: number });
    if (points.length >= 4) {
      push(points[0] as { x: number; y: number; z?: number });
      push(points[2] as { x: number; y: number; z?: number });
      push(points[3] as { x: number; y: number; z?: number });
    }
    byLayer.set(entity.layer, vertices);
  }

  const meshes: CadMesh[] = [];
  for (const [layer, vertices] of byLayer) {
    if (vertices.length === 0) continue;
    scene.layers.set(layer, { name: layer, visible: true });
    meshes.push({
      name: layer,
      layer,
      material: DEFAULT_MATERIAL.name,
      positions: new Float32Array(vertices),
    });
  }
  scene.meshes = meshes;
  scene.bounds = sceneBounds(meshes);
  return scene;
}
