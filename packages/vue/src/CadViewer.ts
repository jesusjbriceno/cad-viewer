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
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  type PropType,
  ref,
  shallowRef,
  watch,
} from "vue";

/** Every viewer event, forwarded with the same name and payload. */
export const CAD_VIEWER_EVENTS = [
  "load-start",
  "load-progress",
  "loaded",
  "error",
  "view-change",
  "layers-change",
  "layout-change",
  "tool-change",
  "hover",
  "select",
  "measure",
] as const satisfies readonly CadViewerEventName[];

type Emits = { [K in CadViewerEventName]: (payload: CadViewerEvents[K]) => true };
// SAFETY: the object has exactly one always-true validator per name in
// CAD_VIEWER_EVENTS, which lists every CadViewerEventName.
const emits = Object.fromEntries(
  CAD_VIEWER_EVENTS.map((name) => [name, () => true]),
) as unknown as Emits;

// SAFETY: `null` disables Vue's runtime type check (ArrayBuffer/Blob/URL are not
// plain Objects); the PropType still types the prop for TypeScript users.
const anySource = null as unknown as PropType<CadSource | null>;

/**
 * View-only CAD viewer component. The viewer is created on mount (never during
 * SSR) inside a container that fills its parent: give the parent a size.
 */
export const CadViewer = defineComponent({
  name: "CadViewer",
  props: {
    /** URL, File/Blob or bytes; changing it loads the new drawing. */
    src: { type: anySource, default: null },
    /** Name used to pick the format when `src` has none (e.g. raw bytes). */
    fileName: { type: String, default: undefined },
    theme: { type: String as PropType<CadTheme>, default: undefined },
    /** Language of the viewer's own texts; default "es-ES", unsupported tags fall back to "en". */
    locale: { type: String, default: undefined },
    tool: { type: String as PropType<ViewerTool>, default: undefined },
    /** Controlled active layout; applied after each load. */
    layout: { type: String, default: undefined },
    /** Controlled hidden layers; when set, every other layer is shown. Applied after each load. */
    hiddenLayers: { type: Array as PropType<string[]>, default: undefined },
    /** Creation-time options (changing them later does not recreate the viewer). */
    loaders: { type: Array as PropType<FormatLoader[]>, default: undefined },
    background: { type: String, default: undefined },
    interactive: { type: Boolean, default: true },
    fontFamily: { type: String, default: undefined },
    zoomPadding: { type: Number, default: undefined },
    pixelRatio: { type: Number, default: undefined },
    fetch: { type: Function as PropType<typeof fetch>, default: undefined },
    requestInit: { type: Object as PropType<RequestInit>, default: undefined },
  },
  emits,
  setup(props, { emit, expose }) {
    const container = ref<HTMLDivElement | null>(null);
    const viewer = shallowRef<CadViewerApi | null>(null);
    const unsubscribe: (() => void)[] = [];

    const applyLayout = () => {
      const current = viewer.value;
      if (!current || !props.layout) return;
      if (current.getLayouts().some((layout) => layout.name === props.layout))
        current.setLayout(props.layout);
    };
    const applyHiddenLayers = () => {
      const current = viewer.value;
      if (!current || !props.hiddenLayers) return;
      current.setAllLayersVisible(true);
      const known = new Set(current.getLayers().map((layer) => layer.name));
      for (const name of props.hiddenLayers)
        if (known.has(name)) current.setLayerVisible(name, false);
    };
    const load = () => {
      const current = viewer.value;
      if (!current || props.src === null || props.src === undefined) return;
      // Failures are reported through the "error" event; superseded loads are aborted silently.
      current.load(props.src, props.fileName ? { fileName: props.fileName } : {}).catch(() => {});
    };

    onMounted(() => {
      if (!container.value) return;
      const options: CadViewerOptions = { interactive: props.interactive };
      for (const key of [
        "theme",
        "locale",
        "tool",
        "loaders",
        "background",
        "fontFamily",
        "zoomPadding",
        "pixelRatio",
        "fetch",
        "requestInit",
      ] as const) {
        if (props[key] !== undefined) (options as Record<string, unknown>)[key] = props[key];
      }
      const created = new CoreViewer(container.value, options);
      viewer.value = created;
      for (const name of CAD_VIEWER_EVENTS) {
        unsubscribe.push(
          created.on(name, (payload) => {
            if (name === "loaded") {
              applyLayout();
              applyHiddenLayers();
            }
            (emit as (event: string, value: unknown) => void)(name, payload);
          }),
        );
      }
      load();
    });

    watch(() => [props.src, props.fileName], load);
    watch(
      () => props.theme,
      (theme) => theme && viewer.value?.setTheme(theme),
    );
    watch(
      () => props.locale,
      (locale) => locale && viewer.value?.setLocale(locale),
    );
    watch(
      () => props.tool,
      (tool) => tool && viewer.value?.setTool(tool),
    );
    watch(() => props.layout, applyLayout);
    watch(() => props.hiddenLayers?.join("\u0000"), applyHiddenLayers);

    onBeforeUnmount(() => {
      for (const off of unsubscribe.splice(0)) off();
      viewer.value?.destroy();
      viewer.value = null;
    });

    expose({ viewer });
    return () =>
      h("div", {
        ref: container,
        class: "cad-viewer",
        style: { width: "100%", height: "100%", position: "relative" },
      });
  },
});
