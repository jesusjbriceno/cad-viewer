import {
  type Bounds3,
  type CadMesh,
  type CadScene,
  type CadSceneLayer,
  CadViewerError,
  createEmptyScene,
} from "@cadscene/core";

/** JSON form of one material. */
export interface CadMaterialJson {
  name: string;
  color: number;
  opacity?: number;
}

/** JSON form of one mesh: typed arrays become plain number arrays. */
export interface CadMeshJson {
  name: string;
  layer: string;
  material: string;
  positions: number[];
  normals?: number[];
  indices?: number[];
}

/**
 * Language-neutral form of `CadScene`. Converters written in any language emit this document
 * and the JavaScript viewer renders it; see `spec/README.md` for the contract.
 */
export interface CadSceneJson {
  format: string;
  units?: string;
  layers: Record<string, CadSceneLayer>;
  materials: Record<string, CadMaterialJson>;
  meshes: CadMeshJson[];
  bounds: Bounds3 | null;
  unsupported: Record<string, number>;
  metadata: Record<string, string>;
}

function fail(path: string): never {
  throw new CadViewerError("scene-json-invalid", `Invalid CadScene JSON at "${path}".`, {
    params: { path },
  });
}

function numbers(value: unknown, path: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "number" && Number.isFinite(item))
  )
    fail(path);
  return value as number[];
}

function toMesh(raw: unknown, index: number, materials: Map<string, unknown>): CadMesh {
  const at = `meshes[${index}]`;
  const mesh = (raw ?? {}) as Partial<CadMeshJson>;
  const positions = numbers(mesh.positions, `${at}.positions`);
  // Whole vertices are always required; whole triangles only when the mesh is not indexed.
  if (!positions || positions.length === 0 || positions.length % 3 !== 0) fail(`${at}.positions`);

  const material = typeof mesh.material === "string" ? mesh.material : fail(`${at}.material`);
  if (!materials.has(material)) fail(`${at}.material`);

  const normals = numbers(mesh.normals, `${at}.normals`);
  if (normals && normals.length !== positions.length) fail(`${at}.normals`);

  const indices = numbers(mesh.indices, `${at}.indices`);
  if (!indices && positions.length % 9 !== 0) fail(`${at}.positions`);
  if (indices) {
    const vertices = positions.length / 3;
    const outOfRange =
      indices.length % 3 !== 0 ||
      indices.some((value) => !Number.isInteger(value) || value < 0 || value >= vertices);
    if (outOfRange) fail(`${at}.indices`);
  }

  return {
    name: typeof mesh.name === "string" ? mesh.name : "",
    layer: typeof mesh.layer === "string" ? mesh.layer : "",
    material,
    positions: new Float32Array(positions),
    ...(normals ? { normals: new Float32Array(normals) } : {}),
    ...(indices ? { indices: new Uint32Array(indices) } : {}),
  };
}

/** Serializes a scene into plain, JSON-ready data (no Maps, no typed arrays). */
export function sceneToJson(scene: CadScene): CadSceneJson {
  const layers: Record<string, CadSceneLayer> = {};
  for (const [key, layer] of scene.layers)
    layers[key] = { name: layer.name, visible: layer.visible };

  const materials: Record<string, CadMaterialJson> = {};
  for (const [key, material] of scene.materials)
    materials[key] = {
      name: material.name,
      color: material.color,
      ...(material.opacity !== undefined ? { opacity: material.opacity } : {}),
    };

  const meshes: CadMeshJson[] = scene.meshes.map((mesh) => ({
    name: mesh.name,
    layer: mesh.layer,
    material: mesh.material,
    positions: Array.from(mesh.positions),
    ...(mesh.normals ? { normals: Array.from(mesh.normals) } : {}),
    ...(mesh.indices ? { indices: Array.from(mesh.indices) } : {}),
  }));

  return {
    format: scene.format,
    ...(scene.units !== undefined ? { units: scene.units } : {}),
    layers,
    materials,
    meshes,
    bounds: scene.bounds,
    unsupported: Object.fromEntries(scene.unsupported),
    metadata: { ...scene.metadata },
  };
}

/**
 * Reads the interchange document into a `CadScene`, validating structure and references.
 * Throws `CadViewerError` with code `scene-json-invalid` and `{ path }` on malformed input.
 * Unknown properties are ignored, so a converter can annotate its own output.
 */
export function sceneFromJson(json: CadSceneJson): CadScene {
  const source = (json ?? {}) as Partial<CadSceneJson>;
  const format =
    typeof source.format === "string" && source.format !== "" ? source.format : fail("format");
  const scene = createEmptyScene(format);

  if (typeof source.units === "string") scene.units = source.units;

  scene.layers = new Map(
    Object.entries(source.layers ?? {}).map(([key, layer]) => [
      key,
      {
        name: typeof layer?.name === "string" ? layer.name : key,
        visible: layer?.visible !== false,
      },
    ]),
  );

  scene.materials = new Map(
    Object.entries(source.materials ?? {}).map(([key, material]) => [
      key,
      {
        name: typeof material?.name === "string" ? material.name : key,
        color: typeof material?.color === "number" ? material.color : 0,
        ...(material?.opacity !== undefined ? { opacity: material.opacity } : {}),
      },
    ]),
  );

  scene.meshes = (source.meshes ?? []).map((mesh, index) => toMesh(mesh, index, scene.materials));
  scene.bounds = source.bounds ?? null;
  scene.unsupported = new Map(Object.entries(source.unsupported ?? {}));
  scene.metadata = { ...(source.metadata ?? {}) };
  return scene;
}
