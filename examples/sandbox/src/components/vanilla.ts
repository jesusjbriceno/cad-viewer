import {
  type CadLocale,
  type CadTheme,
  CadViewer,
  describeEntity,
  type LayerInfo,
  type MeasureResult,
  type PickResult,
  type ViewerTool,
} from "@jesusjbriceno/cad-viewer-core";
import { currentLocale, messages, onLocaleChange, type SandboxMessages } from "../lib/i18n";
import { describeMeasure, describePick, downloadBlob, LOADERS, SAMPLES } from "../lib/shared";

const $ = <T extends HTMLElement>(root: ParentNode, selector: string) =>
  root.querySelector(selector) as T;

/** Mounts the vanilla sandbox UI (toolbar, panels, status) around a core CadViewer. */
export function mountVanillaSandbox(root: HTMLElement): CadViewer {
  const host = $<HTMLDivElement>(root, ".viewer-host");
  const status = $<HTMLDivElement>(root, ".status");
  const samples = $<HTMLSelectElement>(root, "[data-samples]");
  const fileInput = $<HTMLInputElement>(root, "[data-file]");
  const layouts = $<HTMLSelectElement>(root, "[data-layouts]");
  const layerList = $<HTMLUListElement>(root, "[data-layers]");
  const selection = $<HTMLPreElement>(root, "[data-selection]");
  const measure = $<HTMLPreElement>(root, "[data-measure]");
  const summary = $<HTMLPreElement>(root, "[data-summary]");
  const properties = $<HTMLPreElement>(root, "[data-properties]");

  let locale: CadLocale = currentLocale();
  const viewer = new CadViewer(host, { loaders: LOADERS, locale });
  let theme: CadTheme = "dark";
  let pick: PickResult | null = null;
  let measured: MeasureResult | null = null;
  // Status kept as a function of the texts so a language change can redraw it.
  let statusText: (t: SandboxMessages) => string = (t) => t.ready;
  let statusError = false;

  const renderStatus = () => {
    status.textContent = statusText(messages(locale));
    status.classList.toggle("error", statusError);
  };
  const setStatus = (text: (t: SandboxMessages) => string, error = false) => {
    statusText = text;
    statusError = error;
    renderStatus();
  };
  const load = (source: string | File) => {
    viewer.load(source).catch(() => {});
  };

  const renderSamples = () => {
    const t = messages(locale);
    const selected = samples.value;
    samples.replaceChildren(
      new Option(t.samples.choose, ""),
      ...SAMPLES.map((sample) => new Option(t.samples[sample.key], sample.url)),
    );
    samples.value = selected;
  };
  samples.addEventListener("change", () => samples.value && load(samples.value));
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) load(file);
  });
  host.addEventListener("dragover", (event) => {
    event.preventDefault();
    host.classList.add("dragging");
  });
  host.addEventListener("dragleave", () => host.classList.remove("dragging"));
  host.addEventListener("drop", (event) => {
    event.preventDefault();
    host.classList.remove("dragging");
    const file = event.dataTransfer?.files[0];
    if (file) load(file);
  });

  const renderLayers = (layers: LayerInfo[]) => {
    const t = messages(locale);
    layerList.replaceChildren(
      ...layers.map((layer) => {
        const item = document.createElement("li");
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = layer.visible;
        box.addEventListener("change", () => viewer.setLayerVisible(layer.name, box.checked));
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = layer.color;
        const name = document.createElement("span");
        name.textContent = layer.frozen ? `${layer.name} (${t.frozen})` : layer.name;
        const count = document.createElement("span");
        count.className = "count";
        count.textContent = String(layer.entityCount);
        label.append(box, swatch, name, count);
        item.append(label);
        return item;
      }),
    );
  };
  const renderLayouts = () => {
    layouts.replaceChildren(
      ...viewer
        .getLayouts()
        .map((layout) => new Option(layout.name, layout.name, false, layout.active)),
    );
  };
  const renderInfo = () => {
    selection.textContent = describePick(pick, locale);
    measure.textContent = describeMeasure(measured, locale);
  };
  // Model information: what the drawing contains, and the properties of the picked entity.
  const renderModelInfo = () => {
    const t = messages(locale);
    const stats = viewer.getSummary();
    if (!stats) {
      summary.textContent = t.info.empty;
      properties.textContent = t.info.empty;
      return;
    }
    summary.textContent = t.info.summary2d({
      format: stats.format.toUpperCase(),
      version: stats.version,
      units: stats.units,
      entities: stats.entityCount,
      layers: stats.layerCount,
      blocks: stats.blockCount,
      layouts: stats.layoutCount,
    });
    properties.textContent =
      pick && viewer.document
        ? Object.entries(describeEntity(pick.entity, viewer.document).properties)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join("\n")
        : t.noSelection;
  };

  layouts.addEventListener("change", () => viewer.setLayout(layouts.value));

  viewer.on("load-start", ({ fileName }) =>
    setStatus((t) => (fileName ? t.loadingFile(fileName) : t.loading)),
  );
  viewer.on("load-progress", ({ phase }) => setStatus((t) => t.loadingPhase(phase)));
  viewer.on("loaded", ({ document, fileName }) => {
    const unsupported = [...document.unsupported]
      .map(([type, count]) => `${type}×${count}`)
      .join(", ");
    setStatus(
      (t) =>
        t.loadedSummary({
          name: fileName ?? t.drawingFallback,
          format: document.format.toUpperCase(),
          version: document.header.version ?? "",
          layers: document.layers.size,
          blocks: document.blocks.size,
        }) + (unsupported ? ` · ${t.notDrawn(unsupported)}` : ""),
    );
    renderLayouts();
    renderModelInfo();
  });
  // The viewer translates library errors from their stable code into its current language.
  viewer.on("error", ({ error }) => setStatus(() => viewer.formatError(error), true));
  viewer.on("layers-change", ({ layers }) => renderLayers(layers));
  viewer.on("layout-change", () => renderLayouts());
  viewer.on("select", ({ pick: next }) => {
    pick = next;
    renderInfo();
    renderModelInfo();
  });
  viewer.on("measure", (result) => {
    measured = result;
    renderInfo();
  });

  const toolButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-tool]")];
  const syncTools = (tool: ViewerTool) => {
    for (const button of toolButtons)
      button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
  };
  viewer.on("tool-change", ({ tool }) => syncTools(tool));
  syncTools(viewer.tool);

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (button.dataset.tool) viewer.setTool(button.dataset.tool as ViewerTool);
    else if (action === "fit") viewer.zoomExtents();
    else if (action === "zoom-in") viewer.zoomIn();
    else if (action === "zoom-out") viewer.zoomOut();
    else if (action === "theme") {
      theme = theme === "dark" ? "light" : "dark";
      viewer.setTheme(theme);
      renderLayers(viewer.getLayers());
    } else if (action === "png")
      viewer.exportImage({ scale: 2 }).then((blob) => downloadBlob(blob, "drawing.png"));
    else if (action === "show-all") viewer.setAllLayersVisible(true);
    else if (action === "hide-all") viewer.setAllLayersVisible(false);
  });

  // Static labels are translated by the layout script; dynamic texts are redrawn here.
  onLocaleChange((next) => {
    locale = next;
    viewer.setLocale(next);
    renderSamples();
    renderLayers(viewer.getLayers());
    renderInfo();
    renderModelInfo();
    renderStatus();
  });

  renderSamples();
  renderInfo();
  renderModelInfo();
  renderStatus();
  const first = SAMPLES[0];
  if (first) load(first.url);
  return viewer;
}
