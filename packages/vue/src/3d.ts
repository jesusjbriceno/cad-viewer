import type { App, Plugin } from "vue";
import { Cad3DViewer } from "./Cad3DViewer";

export { CAD_3D_VIEWER_EVENTS, Cad3DViewer } from "./Cad3DViewer";

/** Registers `<Cad3DViewer>` globally: `app.use(Cad3DViewerPlugin)`. */
export const Cad3DViewerPlugin: Plugin = {
  install(app: App) {
    app.component("Cad3DViewer", Cad3DViewer);
  },
};

export type {
  Cad3DViewerApi,
  Cad3DViewerEventName,
  Cad3DViewerEvents,
  Cad3DViewerOptions,
  CameraUpdate,
  ExportImage3DOptions,
  Layer3DInfo,
  OrbitState,
  Shading,
  UpAxis,
  Vec3Like,
} from "@cadscene/3d";
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
} from "@cadscene/core";
