import { type CadMaterial, type CadMesh, type CadScene, DEFAULT_MATERIAL } from "@cadscene/core";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
} from "three";

export type Shading = "shaded" | "wireframe";

export interface BuildOptions {
  shading?: Shading;
  /** Feature-edge overlay in shaded mode. Default true. */
  edges?: boolean;
  /** Edge color as 0xRRGGBB. */
  edgeColor?: number;
  /** Faces meeting at less than this angle (degrees) share no drawn edge. Default 30. */
  edgeThresholdAngle?: number;
}

/** three.js objects for a `CadScene`, with the viewer-state switches that act on them. */
export interface BuiltScene {
  readonly root: Group;
  readonly shading: Shading;
  setLayerVisible(name: string, visible: boolean): void;
  setShading(shading: Shading): void;
  setEdges(visible: boolean): void;
  setEdgeColor(color: number): void;
  /** Releases every GPU resource and empties `root`. */
  dispose(): void;
}

export const DEFAULT_EDGE_COLOR = 0x1a1a1a;
const DEFAULT_EDGE_THRESHOLD = 30;

interface Part {
  layer: string;
  mesh: Mesh;
  edges: LineSegments;
}

function geometryOf(mesh: CadMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  if (mesh.indices) geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  if (mesh.normals && mesh.normals.length === mesh.positions.length)
    geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  else geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Builds the three.js scene graph once; layer, shading and edge changes only toggle flags. */
export function buildThreeScene(scene: CadScene, options: BuildOptions = {}): BuiltScene {
  const root = new Group();
  root.name = scene.format;
  const layerVisible = new Map(
    [...scene.layers.values()].map((layer) => [layer.name, layer.visible]),
  );
  const materials = new Map<string, MeshLambertMaterial>();
  const edgeMaterial = new LineBasicMaterial({ color: options.edgeColor ?? DEFAULT_EDGE_COLOR });
  const threshold = options.edgeThresholdAngle ?? DEFAULT_EDGE_THRESHOLD;
  const parts: Part[] = [];
  let shading: Shading = options.shading ?? "shaded";
  let edgesOn = options.edges ?? true;

  const materialFor = (name: string): MeshLambertMaterial => {
    const source: CadMaterial =
      scene.materials.get(name) ?? scene.materials.get(DEFAULT_MATERIAL.name) ?? DEFAULT_MATERIAL;
    let material = materials.get(source.name);
    if (!material) {
      const opacity = source.opacity ?? 1;
      material = new MeshLambertMaterial({
        color: source.color,
        opacity,
        transparent: opacity < 1,
        // STL/OBJ winding is often inconsistent: light both faces.
        side: DoubleSide,
        // Push faces back so the edge overlay is not z-fighting with them.
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      materials.set(source.name, material);
    }
    return material;
  };

  const apply = () => {
    for (const material of materials.values()) material.wireframe = shading === "wireframe";
    for (const part of parts) {
      part.mesh.visible = layerVisible.get(part.layer) !== false;
      part.edges.visible = edgesOn && shading === "shaded";
    }
  };

  for (const source of scene.meshes) {
    if (source.positions.length < 9) continue;
    const geometry = geometryOf(source);
    const mesh = new Mesh(geometry, materialFor(source.material));
    mesh.name = source.name;
    const edges = new LineSegments(new EdgesGeometry(geometry, threshold), edgeMaterial);
    edges.name = `${source.name} edges`;
    mesh.add(edges);
    root.add(mesh);
    parts.push({ layer: source.layer, mesh, edges });
  }
  apply();

  return {
    root,
    get shading() {
      return shading;
    },
    setLayerVisible(name, visible) {
      if (!layerVisible.has(name)) return;
      layerVisible.set(name, visible);
      apply();
    },
    setShading(next) {
      shading = next;
      apply();
    },
    setEdges(visible) {
      edgesOn = visible;
      apply();
    },
    setEdgeColor(color) {
      edgeMaterial.color.setHex(color);
    },
    dispose() {
      for (const part of parts) {
        part.mesh.geometry.dispose();
        part.edges.geometry.dispose();
      }
      for (const material of materials.values()) material.dispose();
      edgeMaterial.dispose();
      parts.length = 0;
      root.clear();
    },
  };
}
