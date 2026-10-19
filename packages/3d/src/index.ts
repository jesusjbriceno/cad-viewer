export type {
  Bounds3,
  CadLocale,
  CadMaterial,
  CadMesh,
  CadScene,
  CadSceneLayer,
  CadSource,
  CadTheme,
  FormatLoader,
} from "@jesusjbriceno/cad-viewer-core";
export { type FaceSceneOptions, has3dFaces, sceneFromDocument } from "./fromDocument";
export {
  describePart,
  type PartDetails,
  type PartInfo,
  partsOf,
  type SceneSummary,
  summarizeScene,
} from "./inspect";
export { BUILT_IN_3D_LOADERS } from "./loaders/builtin";
export { OBJ_MATERIAL_PALETTE, objLoader, parseObj } from "./loaders/obj";
export { parseStl, stlLoader } from "./loaders/stl";
export type { Shading } from "./render/buildScene";
export { ISOMETRIC, type OrbitState, type UpAxis, type Vec3Like } from "./render/camera";
export { Cad3DViewer } from "./viewer/Cad3DViewer";
export type * from "./viewer/types";
