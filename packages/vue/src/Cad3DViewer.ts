import {
  type Cad3DViewerApi,
  type Cad3DViewerEventName,
  type Cad3DViewerEvents,
  type Cad3DViewerOptions,
  type CadScene,
  type CadSource,
  type CadTheme,
  Cad3DViewer as Core3DViewer,
  type FormatLoader,
  type Shading,
  type UpAxis,
} from "@jesusjbriceno/cad-viewer-3d";
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

/** Every 3D viewer event, forwarded with the same name and payload. */
export const CAD_3D_VIEWER_EVENTS = [
  "load-start",
  "load-progress",
  "loaded",
  "error",
  "camera-change",
  "layers-change",
] as const satisfies readonly Cad3DViewerEventName[];

type Emits = { [K in Cad3DViewerEventName]: (payload: Cad3DViewerEvents[K]) => true };
// SAFETY: the object has exactly one always-true validator per name in
// CAD_3D_VIEWER_EVENTS, which lists every Cad3DViewerEventName.
const emits = Object.fromEntries(
  CAD_3D_VIEWER_EVENTS.map((name) => [name, () => true]),
) as unknown as Emits;

// SAFETY: `null` disables Vue's runtime type check (ArrayBuffer/Blob/URL are not
// plain Objects); the PropType still types the prop for TypeScript users.
const anySource = null as unknown as PropType<CadSource | null>;

/**
 * View-only 3D CAD viewer component. The viewer is created on mount (never during
 * SSR) inside a container that fills its parent: give the parent a size.
 */
export const Cad3DViewer = defineComponent({
  name: "Cad3DViewer",
  props: {
    /** URL, File/Blob or bytes; changing it loads the new model. */
    src: { type: anySource, default: null },
    /** Name used to pick the format when `src` has none (e.g. raw bytes). */
    fileName: { type: String, default: undefined },
    theme: { type: String as PropType<CadTheme>, default: undefined },
    /** Language of the viewer's own texts; default "es-ES", unsupported tags fall back to "en". */
    locale: { type: String, default: undefined },
    /** "shaded" (default) or "wireframe". */
    shading: { type: String as PropType<Shading>, default: undefined },
    /** Feature-edge overlay in shaded mode. Default true. */
    edges: { type: Boolean, default: undefined },
    /** Controlled hidden layers; when set, every other layer is shown. Applied after each load. */
    hiddenLayers: { type: Array as PropType<string[]>, default: undefined },
    /** Creation-time options (changing them later does not recreate the viewer). */
    loaders: { type: Array as PropType<FormatLoader<CadScene>[]>, default: undefined },
    /** CSS color that overrides the theme background. */
    background: { type: String, default: undefined },
    /** World up axis; "z" (default, CAD convention) or "y". */
    upAxis: { type: String as PropType<UpAxis>, default: undefined },
    interactive: { type: Boolean, default: true },
    zoomPadding: { type: Number, default: undefined },
    pixelRatio: { type: Number, default: undefined },
    fetch: { type: Function as PropType<typeof fetch>, default: undefined },
    requestInit: { type: Object as PropType<RequestInit>, default: undefined },
  },
  emits,
  setup(props, { emit, expose }) {
    const container = ref<HTMLDivElement | null>(null);
    const viewer = shallowRef<Cad3DViewerApi | null>(null);
    const unsubscribe: (() => void)[] = [];

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
      const options: Cad3DViewerOptions = { interactive: props.interactive };
      for (const key of [
        "theme",
        "locale",
        "shading",
        "edges",
        "loaders",
        "background",
        "upAxis",
        "zoomPadding",
        "pixelRatio",
        "fetch",
        "requestInit",
      ] as const) {
        if (props[key] !== undefined) (options as Record<string, unknown>)[key] = props[key];
      }
      const created = new Core3DViewer(container.value, options);
      viewer.value = created;
      for (const name of CAD_3D_VIEWER_EVENTS) {
        unsubscribe.push(
          created.on(name, (payload) => {
            if (name === "loaded") applyHiddenLayers();
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
      () => props.shading,
      (shading) => shading && viewer.value?.setShading(shading),
    );
    watch(
      () => props.edges,
      // `false` is a valid value, so it is applied unlike the truthy string guards above.
      (edges) => {
        if (edges !== undefined) viewer.value?.setEdges(edges);
      },
    );
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
        class: "cad-viewer-3d",
        style: { width: "100%", height: "100%", position: "relative" },
      });
  },
});
