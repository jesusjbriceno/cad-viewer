import type { CadViewerApi, CadViewerOptions } from "./types";

const notImplemented = (): never => {
  throw new Error("CadViewer is not implemented yet.");
};

/**
 * View-only CAD viewer bound to a container element. Implemented in T4; this
 * placeholder pins the constructor signature and the `CadViewerApi` contract.
 */
export class CadViewer implements CadViewerApi {
  readonly document = null;
  readonly theme = "dark" as const;
  readonly tool = "pan" as const;
  readonly activeLayout = null;
  readonly selection = null;

  constructor(
    readonly container: HTMLElement,
    readonly options: CadViewerOptions = {},
  ) {}

  load = notImplemented;
  loadDocument = notImplemented;
  clear = notImplemented;
  zoomExtents = notImplemented;
  zoomIn = notImplemented;
  zoomOut = notImplemented;
  zoomToBounds = notImplemented;
  getView = notImplemented;
  setView = notImplemented;
  getExtents = notImplemented;
  screenToWorld = notImplemented;
  worldToScreen = notImplemented;
  getLayers = notImplemented;
  setLayerVisible = notImplemented;
  setAllLayersVisible = notImplemented;
  getLayouts = notImplemented;
  setLayout = notImplemented;
  setTheme = notImplemented;
  setTool = notImplemented;
  pickAt = notImplemented;
  clearSelection = notImplemented;
  exportImage = notImplemented;
  resize = notImplemented;
  on = notImplemented;
  off = notImplemented;
  destroy = notImplemented;
}
