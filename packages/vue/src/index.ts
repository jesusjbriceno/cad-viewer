import type { App, Plugin } from "vue";
import { CadViewer } from "./CadViewer";

export { CAD_VIEWER_EVENTS, CadViewer } from "./CadViewer";

/** Registers `<CadViewer>` globally: `app.use(CadViewerPlugin)`. */
export const CadViewerPlugin: Plugin = {
  install(app: App) {
    app.component("CadViewer", CadViewer);
  },
};

export type {
  CadLocale,
  CadSource,
  CadTheme,
  CadViewerApi,
  CadViewerEvents,
  FormatLoader,
  LayerInfo,
  LayoutInfo,
  MeasureResult,
  PickResult,
  ViewerTool,
  ViewState,
} from "@cadscene/core";
