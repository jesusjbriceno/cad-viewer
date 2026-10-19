import type {
  CadLoadError,
  CadLocale,
  CadScene,
  CadSource,
  CadTheme,
  FormatLoader,
  LoadProgress,
} from "@cadscene/core";
import type { PartDetails, PartInfo, SceneSummary } from "../inspect";
import type { Shading } from "../render/buildScene";
import type { OrbitState, UpAxis, Vec3Like } from "../render/camera";

export interface Cad3DViewerOptions {
  /** Extra 3D format loaders; STL and OBJ are always built in. */
  loaders?: FormatLoader<CadScene>[];
  /**
   * Language of the viewer's own texts (canvas label, `formatError`).
   * Default "es-ES"; any Spanish tag maps to "es-ES", any other tag to "en".
   */
  locale?: string;
  /** Default "dark". */
  theme?: CadTheme;
  /** CSS color that overrides the theme background. */
  background?: string;
  /** Default "shaded". */
  shading?: Shading;
  /** Feature-edge overlay in shaded mode. Default true. */
  edges?: boolean;
  /** World up axis; creation only. Default "z" (CAD convention). */
  upAxis?: UpAxis;
  /** When false, the viewer ignores pointer, wheel and touch input. Default true. */
  interactive?: boolean;
  /** Margin around the model on zoom-to-extents, as a fraction of the view. Default 0.05. */
  zoomPadding?: number;
  /** Device pixel ratio; defaults to `window.devicePixelRatio`. */
  pixelRatio?: number;
  /** Fetch implementation and init used for URL sources (e.g. to add auth headers). */
  fetch?: typeof fetch;
  requestInit?: RequestInit;
}

export interface Layer3DInfo {
  name: string;
  visible: boolean;
  meshCount: number;
  triangleCount: number;
}

export interface Cad3DViewerEvents {
  "load-start": { fileName?: string };
  "load-progress": LoadProgress;
  loaded: { scene: CadScene; fileName?: string };
  error: { error: CadLoadError | Error };
  "camera-change": OrbitState;
  "layers-change": { layers: Layer3DInfo[] };
}

export type Cad3DViewerEventName = keyof Cad3DViewerEvents;
export type Cad3DViewerListener<K extends Cad3DViewerEventName> = (
  payload: Cad3DViewerEvents[K],
) => void;

export interface ExportImage3DOptions {
  /** Output pixels per CSS pixel; defaults to the viewer pixel ratio. */
  scale?: number;
  /** Default "image/png". */
  type?: string;
}

/** Partial camera change; omitted fields keep their current value. */
export interface CameraUpdate {
  target?: Vec3Like;
  azimuth?: number;
  elevation?: number;
  distance?: number;
}

/** Public, read-only 3D viewer API. No method modifies the model. */
export interface Cad3DViewerApi {
  readonly scene: CadScene | null;
  readonly theme: CadTheme;
  readonly locale: CadLocale;
  readonly shading: Shading;
  readonly edges: boolean;

  /** Fetches/reads, parses and displays a model, then frames it from the isometric view. */
  load(source: CadSource, options?: { fileName?: string; signal?: AbortSignal }): Promise<CadScene>;
  /** Displays an already parsed scene. */
  loadScene(scene: CadScene): void;
  clear(): void;

  /** Frames the whole model, keeping the current orientation. */
  zoomExtents(): void;
  getCamera(): OrbitState;
  setCamera(update: CameraUpdate): void;

  /** Model information: parts, layers, triangles, vertices, materials and bounds; null before a load. */
  getSummary(): SceneSummary | null;
  /** Every part with the viewer's current layer visibility. */
  getParts(): PartInfo[];
  /** One part with its material colour and geometry flags; null for an unknown id. */
  getPart(id: number): PartDetails | null;

  getLayers(): Layer3DInfo[];
  setLayerVisible(name: string, visible: boolean): void;
  setAllLayersVisible(visible: boolean): void;

  setTheme(theme: CadTheme): void;
  setLocale(locale: string): void;
  setShading(shading: Shading): void;
  setEdges(visible: boolean): void;

  /** Text of any error in the viewer's language. */
  formatError(error: unknown): string;
  exportImage(options?: ExportImage3DOptions): Promise<Blob>;
  /** Re-reads the container size; called automatically through ResizeObserver. */
  resize(): void;

  on<K extends Cad3DViewerEventName>(event: K, listener: Cad3DViewerListener<K>): () => void;
  off<K extends Cad3DViewerEventName>(event: K, listener: Cad3DViewerListener<K>): void;

  /** Releases the GPU resources, removes the canvas and all listeners. */
  destroy(): void;
}
