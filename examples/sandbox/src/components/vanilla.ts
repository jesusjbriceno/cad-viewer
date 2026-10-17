import {
  type CadTheme,
  CadViewer,
  type LayerInfo,
  type ViewerTool,
} from "@jesusjbriceno/cad-viewer-core";
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

  const viewer = new CadViewer(host, { loaders: LOADERS });
  let theme: CadTheme = "dark";

  const setStatus = (text: string, error = false) => {
    status.textContent = text;
    status.classList.toggle("error", error);
  };
  const load = (source: string | File) => {
    viewer.load(source).catch(() => {});
  };

  for (const sample of SAMPLES) samples.add(new Option(sample.label, sample.url));
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
        name.textContent = layer.frozen ? `${layer.name} (frozen)` : layer.name;
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
  layouts.addEventListener("change", () => viewer.setLayout(layouts.value));

  viewer.on("load-start", ({ fileName }) => setStatus(`Loading ${fileName ?? "drawing"}…`));
  viewer.on("load-progress", ({ phase }) => setStatus(`Loading… (${phase})`));
  viewer.on("loaded", ({ document, fileName }) => {
    const unsupported = [...document.unsupported]
      .map(([type, count]) => `${type}×${count}`)
      .join(", ");
    setStatus(
      `${fileName ?? "Drawing"} · ${document.format.toUpperCase()} ${document.header.version ?? ""} · ${document.layers.size} layers · ${document.blocks.size} blocks` +
        (unsupported ? ` · not drawn: ${unsupported}` : ""),
    );
    renderLayouts();
  });
  viewer.on("error", ({ error }) => setStatus(error.message, true));
  viewer.on("layers-change", ({ layers }) => renderLayers(layers));
  viewer.on("layout-change", () => renderLayouts());
  viewer.on("select", ({ pick }) => {
    selection.textContent = describePick(pick);
  });
  viewer.on("measure", (result) => {
    measure.textContent = describeMeasure(result);
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

  selection.textContent = describePick(null);
  measure.textContent = describeMeasure(null);
  const first = SAMPLES[0];
  if (first) load(first.url);
  return viewer;
}
