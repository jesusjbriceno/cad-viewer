import type { CadLocale } from "../i18n/locale";
import type { CadLoadError } from "../loaders/errors";
import type { FormatLoader, LoadProgress } from "../loaders/types";
import type { Bounds, CadDocument, CadEntity, Point } from "../model/types";

/** A URL (string or `URL`), a `File`/`Blob`, or raw bytes. */
export type CadSource = string | URL | Blob | ArrayBuffer | Uint8Array;

export type CadTheme = "dark" | "light";

/**
 * Primary-button behaviour. Wheel zoom, middle-button pan and touch gestures
 * work with every tool.
 * - `pan`: drag pans, click selects an entity.
 * - `zoom-window`: drag a rectangle to zoom into it, then return to `pan`.
 * - `measure`: click two points to measure the distance between them.
 */
export type ViewerTool = "pan" | "zoom-window" | "measure";

export interface ViewState {
  /** World point at the center of the canvas. */
  center: Point;
  /** CSS pixels per world unit. */
  scale: number;
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
}

export interface LayerInfo {
  name: string;
  /** Resolved CSS color of the layer. */
  color: string;
  visible: boolean;
  frozen: boolean;
  /** Entities on this layer in the active layout, block contents included. */
  entityCount: number;
}

export interface LayoutInfo {
  name: string;
  isModel: boolean;
  active: boolean;
}

export interface PickResult {
  /** The primitive entity under the cursor (inside blocks, the nested entity). */
  entity: CadEntity;
  type: CadEntity["type"];
  /** Effective layer (layer "0" inside a block inherits the insert's layer). */
  layer: string;
  handle?: string;
  /** Block names from the outermost insert down to the entity's block; empty at top level. */
  blockPath: string[];
  /** World coordinates of the picked point. */
  world: Point;
}

export interface MeasureResult {
  from: Point;
  to: Point;
  distance: number;
  dx: number;
  dy: number;
  /** Radians, counter-clockwise from +X. */
  angle: number;
}

export interface CadViewerOptions {
  /** Extra format loaders; DXF is always built in. */
  loaders?: FormatLoader[];
  /**
   * Language of the viewer's own texts (canvas label, measure label, `formatError`).
   * Default "es-ES"; any Spanish tag maps to "es-ES", any other tag to "en".
   */
  locale?: string;
  /** Default "dark". */
  theme?: CadTheme;
  /** CSS color that overrides the theme background. */
  background?: string;
  /** Default "pan". */
  tool?: ViewerTool;
  /** When false, the viewer ignores pointer, wheel and keyboard input. Default true. */
  interactive?: boolean;
  /** CSS font family for drawing texts. Default "sans-serif". */
  fontFamily?: string;
  /** Margin around the drawing on zoom-to-extents, as a fraction of the view. Default 0.05. */
  zoomPadding?: number;
  /** Device pixel ratio; defaults to `window.devicePixelRatio`. */
  pixelRatio?: number;
  /** Fetch implementation and init used for URL sources (e.g. to add auth headers). */
  fetch?: typeof fetch;
  requestInit?: RequestInit;
}

export interface CadViewerEvents {
  "load-start": { fileName?: string };
  "load-progress": LoadProgress;
  loaded: { document: CadDocument; fileName?: string };
  error: { error: CadLoadError | Error };
  "view-change": ViewState;
  "layers-change": { layers: LayerInfo[] };
  "layout-change": { layout: LayoutInfo };
  "tool-change": { tool: ViewerTool };
  hover: { pick: PickResult | null };
  select: { pick: PickResult | null };
  measure: MeasureResult;
}

export type CadViewerEventName = keyof CadViewerEvents;
export type CadViewerListener<K extends CadViewerEventName> = (payload: CadViewerEvents[K]) => void;
export type Unsubscribe = () => void;

export interface ExportImageOptions {
  /** Default "image/png". */
  type?: string;
  /** Output pixels per CSS pixel. Default: the viewer pixel ratio. */
  scale?: number;
  /** Background color; default: the current background. */
  background?: string;
}

/**
 * Public, read-only viewer API. No method modifies the drawing: layer
 * visibility, layout, view and selection are viewer state only.
 */
export interface CadViewerApi {
  readonly document: CadDocument | null;
  readonly theme: CadTheme;
  /** Resolved language of the viewer's own texts. */
  readonly locale: CadLocale;
  readonly tool: ViewerTool;
  /** Active layout name, or null with no document. */
  readonly activeLayout: string | null;
  readonly selection: PickResult | null;

  /** Fetches/reads, parses and displays a drawing, then zooms to extents. */
  load(
    source: CadSource,
    options?: { fileName?: string; signal?: AbortSignal },
  ): Promise<CadDocument>;
  /** Displays an already parsed document (e.g. parsed in a worker). */
  loadDocument(document: CadDocument): void;
  clear(): void;

  zoomExtents(): void;
  /** Zooms around the canvas center; default factor 1.25. */
  zoomIn(factor?: number): void;
  zoomOut(factor?: number): void;
  zoomToBounds(bounds: Bounds): void;
  getView(): ViewState;
  setView(view: { center: Point; scale: number }): void;
  /** World bounds of the active layout, or null when empty. */
  getExtents(): Bounds | null;
  /** Canvas-relative CSS pixels → world, and back. */
  screenToWorld(x: number, y: number): Point;
  worldToScreen(point: Point): { x: number; y: number };

  getLayers(): LayerInfo[];
  setLayerVisible(name: string, visible: boolean): void;
  setAllLayersVisible(visible: boolean): void;

  getLayouts(): LayoutInfo[];
  setLayout(name: string): void;

  setTheme(theme: CadTheme): void;
  /** Changes the language of the viewer's own texts; see `CadViewerOptions.locale`. */
  setLocale(locale: string): void;
  setTool(tool: ViewerTool): void;

  /** Text of any error in the viewer's language (see `formatCadError`). */
  formatError(error: unknown): string;

  /** Entity at canvas-relative CSS pixel coordinates, within a few pixels' tolerance. */
  pickAt(x: number, y: number): PickResult | null;
  clearSelection(): void;

  exportImage(options?: ExportImageOptions): Promise<Blob>;
  /** Re-reads the container size; called automatically through ResizeObserver. */
  resize(): void;

  on<K extends CadViewerEventName>(event: K, listener: CadViewerListener<K>): Unsubscribe;
  off<K extends CadViewerEventName>(event: K, listener: CadViewerListener<K>): void;

  /** Removes the canvas and all listeners. The instance cannot be reused. */
  destroy(): void;
}
