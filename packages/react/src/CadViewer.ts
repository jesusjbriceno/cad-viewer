import {
  type CadSource,
  type CadTheme,
  type CadViewerApi,
  type CadViewerEventName,
  type CadViewerEvents,
  type CadViewerOptions,
  CadViewer as CoreViewer,
  type FormatLoader,
  type ViewerTool,
} from "@cadscene/core";
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
  "view-change": "onViewChange",
  "layers-change": "onLayersChange",
  "layout-change": "onLayoutChange",
  "tool-change": "onToolChange",
  hover: "onHover",
  select: "onSelect",
  measure: "onMeasure",
} as const satisfies Record<CadViewerEventName, string>;

type CallbackName = (typeof CALLBACKS)[CadViewerEventName];
type CallbackProps = {
  [K in CadViewerEventName as (typeof CALLBACKS)[K]]?: (payload: CadViewerEvents[K]) => void;
};

export interface CadViewerProps
  extends CallbackProps,
    Omit<HTMLAttributes<HTMLDivElement>, CallbackName | "children"> {
  /** URL, File/Blob or bytes; changing it loads the new drawing. */
  src?: CadSource | null;
  /** Name used to pick the format when `src` has none (e.g. raw bytes). */
  fileName?: string;
  theme?: CadTheme;
  /** Language of the viewer's own texts; default "es-ES", unsupported tags fall back to "en". */
  locale?: string;
  tool?: ViewerTool;
  /** Controlled active layout; applied after each load. */
  layout?: string;
  /** Controlled hidden layers (compared by content); every other layer is shown. Applied after each load. */
  hiddenLayers?: string[];
  /** Creation-time options: changing them later does not recreate the viewer. */
  loaders?: FormatLoader[];
  background?: string;
  interactive?: boolean;
  fontFamily?: string;
  zoomPadding?: number;
  pixelRatio?: number;
  fetch?: typeof fetch;
  requestInit?: RequestInit;
}

const OPTION_KEYS = [
  "theme",
  "locale",
  "tool",
  "loaders",
  "background",
  "interactive",
  "fontFamily",
  "zoomPadding",
  "pixelRatio",
  "fetch",
  "requestInit",
] as const satisfies readonly (keyof CadViewerOptions & keyof CadViewerProps)[];

const NON_DOM_PROPS = new Set<string>([
  ...OPTION_KEYS,
  ...Object.values(CALLBACKS),
  "src",
  "fileName",
  "layout",
  "hiddenLayers",
]);

function applyLayout(viewer: CadViewerApi, layout: string | undefined): void {
  if (layout && viewer.getLayouts().some((entry) => entry.name === layout))
    viewer.setLayout(layout);
}

function applyHiddenLayers(viewer: CadViewerApi, hidden: string[] | undefined): void {
  if (!hidden) return;
  viewer.setAllLayersVisible(true);
  const known = new Set(viewer.getLayers().map((layer) => layer.name));
  for (const name of hidden) if (known.has(name)) viewer.setLayerVisible(name, false);
}

function CadViewerComponent(props: CadViewerProps, ref: ForwardedRef<CadViewerApi | null>) {
  const container = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<CadViewerApi | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(ref, () => viewer as CadViewerApi, [viewer]);

  // Create once per mount (StrictMode mounts twice in development: create → destroy → create).
  useEffect(() => {
    if (!container.current) return;
    const options: CadViewerOptions = {};
    for (const key of OPTION_KEYS) {
      const value = latest.current[key];
      if (value !== undefined) (options as Record<string, unknown>)[key] = value;
    }
    const created = new CoreViewer(container.current, options);
    const unsubscribe = (Object.keys(CALLBACKS) as CadViewerEventName[]).map((event) =>
      created.on(event, (payload) => {
        if (event === "loaded") {
          applyLayout(created, latest.current.layout);
          applyHiddenLayers(created, latest.current.hiddenLayers);
        }
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

  const { src, fileName, theme, locale, tool, layout, hiddenLayers } = props;
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
    if (viewer && tool) viewer.setTool(tool);
  }, [viewer, tool]);
  useEffect(() => {
    if (viewer) applyLayout(viewer, layout);
  }, [viewer, layout]);
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
    className: props.className ? `cad-viewer ${props.className}` : "cad-viewer",
    style: { width: "100%", height: "100%", position: "relative", ...props.style },
  });
}

/**
 * View-only CAD viewer component. The viewer is created in an effect (never
 * during SSR) inside a container that fills its parent: give the parent a size.
 * The ref receives the `CadViewerApi` instance (null before mount).
 */
export const CadViewer = forwardRef<CadViewerApi | null, CadViewerProps>(CadViewerComponent);
CadViewer.displayName = "CadViewer";

/** Typed ref for `<CadViewer ref={...}>`. */
export function useCadViewerRef(): RefObject<CadViewerApi | null> {
  return useRef<CadViewerApi | null>(null);
}
