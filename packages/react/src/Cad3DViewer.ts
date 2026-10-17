import {
  type Cad3DViewerApi,
  type Cad3DViewerEventName,
  type Cad3DViewerEvents,
  type Cad3DViewerOptions,
  type CadScene,
  type CadSource,
  type CadTheme,
  Cad3DViewer as CoreViewer,
  type FormatLoader,
  type Shading,
  type UpAxis,
} from "@jesusjbriceno/cad-viewer-3d";
import {
  createElement,
  type ForwardedRef,
  forwardRef,
  type HTMLAttributes,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

/** Viewer event → React callback prop name. */
const CALLBACKS = {
  "load-start": "onLoadStart",
  "load-progress": "onLoadProgress",
  loaded: "onLoaded",
  error: "onError",
  "camera-change": "onCameraChange",
  "layers-change": "onLayersChange",
} as const satisfies Record<Cad3DViewerEventName, string>;

type CallbackName = (typeof CALLBACKS)[Cad3DViewerEventName];
type CallbackProps = {
  [K in Cad3DViewerEventName as (typeof CALLBACKS)[K]]?: (payload: Cad3DViewerEvents[K]) => void;
};

export interface Cad3DViewerProps
  extends CallbackProps,
    Omit<HTMLAttributes<HTMLDivElement>, CallbackName | "children"> {
  /** URL, File/Blob or bytes; changing it loads the new model. */
  src?: CadSource | null;
  /** Name used to pick the format when `src` has none (e.g. raw bytes). */
  fileName?: string;
  theme?: CadTheme;
  /** Language of the viewer's own texts; default "es-ES", unsupported tags fall back to "en". */
  locale?: string;
  /** Default "shaded". */
  shading?: Shading;
  /** Feature-edge overlay in shaded mode. Default true. */
  edges?: boolean;
  /** Controlled hidden layers (compared by content); every other layer is shown. Applied after each load. */
  hiddenLayers?: string[];
  /** Creation-time options: changing them later does not recreate the viewer. */
  loaders?: FormatLoader<CadScene>[];
  background?: string;
  /** World up axis; creation only. Default "z" (CAD convention). */
  upAxis?: UpAxis;
  interactive?: boolean;
  zoomPadding?: number;
  pixelRatio?: number;
  fetch?: typeof fetch;
  requestInit?: RequestInit;
}

const OPTION_KEYS = [
  "theme",
  "locale",
  "shading",
  "edges",
  "loaders",
  "background",
  "upAxis",
  "interactive",
  "zoomPadding",
  "pixelRatio",
  "fetch",
  "requestInit",
] as const satisfies readonly (keyof Cad3DViewerOptions & keyof Cad3DViewerProps)[];

const NON_DOM_PROPS = new Set<string>([
  ...OPTION_KEYS,
  ...Object.values(CALLBACKS),
  "src",
  "fileName",
  "hiddenLayers",
]);

function applyHiddenLayers(viewer: Cad3DViewerApi, hidden: string[] | undefined): void {
  if (!hidden) return;
  viewer.setAllLayersVisible(true);
  const known = new Set(viewer.getLayers().map((layer) => layer.name));
  for (const name of hidden) if (known.has(name)) viewer.setLayerVisible(name, false);
}

function Cad3DViewerComponent(props: Cad3DViewerProps, ref: ForwardedRef<Cad3DViewerApi | null>) {
  const container = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<Cad3DViewerApi | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(ref, () => viewer as Cad3DViewerApi, [viewer]);

  // Create once per mount (StrictMode mounts twice in development: create → destroy → create).
  useEffect(() => {
    if (!container.current) return;
    const options: Cad3DViewerOptions = {};
    for (const key of OPTION_KEYS) {
      const value = latest.current[key];
      if (value !== undefined) (options as Record<string, unknown>)[key] = value;
    }
    const created = new CoreViewer(container.current, options);
    const unsubscribe = (Object.keys(CALLBACKS) as Cad3DViewerEventName[]).map((event) =>
      created.on(event, (payload) => {
        if (event === "loaded") applyHiddenLayers(created, latest.current.hiddenLayers);
        const callback = latest.current[CALLBACKS[event]] as ((value: unknown) => void) | undefined;
        callback?.(payload);
      }),
    );
    setViewer(created);
    return () => {
      for (const off of unsubscribe) off();
      created.destroy();
      setViewer(null);
    };
  }, []);

  const { src, fileName, theme, locale, shading, edges, hiddenLayers } = props;
  useEffect(() => {
    if (!viewer || src === null || src === undefined) return;
    // Failures are reported through onError; superseded loads are aborted silently.
    viewer.load(src, fileName ? { fileName } : {}).catch(() => {});
  }, [viewer, src, fileName]);
  useEffect(() => {
    if (viewer && theme) viewer.setTheme(theme);
  }, [viewer, theme]);
  useEffect(() => {
    if (viewer && locale) viewer.setLocale(locale);
  }, [viewer, locale]);
  useEffect(() => {
    if (viewer && shading) viewer.setShading(shading);
  }, [viewer, shading]);
  useEffect(() => {
    if (viewer && edges !== undefined) viewer.setEdges(edges);
  }, [viewer, edges]);
  const hiddenKey = hiddenLayers?.join("\u0000");
  // biome-ignore lint/correctness/useExhaustiveDependencies: compared by content through hiddenKey
  useEffect(() => {
    if (viewer) applyHiddenLayers(viewer, latest.current.hiddenLayers);
  }, [viewer, hiddenKey]);

  const domProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props))
    if (!NON_DOM_PROPS.has(key)) domProps[key] = value;
  return createElement("div", {
    ...domProps,
    ref: container,
    className: props.className ? `cad-viewer-3d ${props.className}` : "cad-viewer-3d",
    style: { width: "100%", height: "100%", position: "relative", ...props.style },
  });
}

/**
 * View-only 3D CAD viewer component (STL/OBJ). The viewer is created in an effect
 * (never during SSR) inside a container that fills its parent: give the parent a size.
 * The ref receives the `Cad3DViewerApi` instance (null before mount).
 */
export const Cad3DViewer = forwardRef<Cad3DViewerApi | null, Cad3DViewerProps>(
  Cad3DViewerComponent,
);
Cad3DViewer.displayName = "Cad3DViewer";

/** Typed ref for `<Cad3DViewer ref={...}>`. */
export function useCad3DViewerRef(): RefObject<Cad3DViewerApi | null> {
  return useRef<Cad3DViewerApi | null>(null);
}
