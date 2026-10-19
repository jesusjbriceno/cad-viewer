import {
  Cad3DViewer,
  type Cad3DViewerApi,
  type Layer3DInfo,
  type Shading,
} from "@jesusjbriceno/cad-viewer-3d";
import type { CadLocale, CadTheme } from "@jesusjbriceno/cad-viewer-core";
import { currentLocale, messages, onLocaleChange, type SandboxMessages } from "../lib/i18n";
import { downloadBlob, MODELS } from "../lib/shared";

const $ = <T extends HTMLElement>(root: ParentNode, selector: string) =>
  root.querySelector(selector) as T;

const ISO = { azimuth: Math.PI / 4, elevation: Math.atan(1 / Math.SQRT2) };

function degrees(radians: number): string {
  return String(Math.round((radians * 180) / Math.PI));
}

/** Mounts the vanilla 3D sandbox UI (toolbar, panels, status) around a Cad3DViewer. */
export function mountModel3DSandbox(root: HTMLElement): Cad3DViewerApi {
  const host = $<HTMLDivElement>(root, ".viewer-host");
  const status = $<HTMLDivElement>(root, ".status");
  const samples = $<HTMLSelectElement>(root, "[data-models]");
  const fileInput = $<HTMLInputElement>(root, "[data-file]");
  const layerList = $<HTMLUListElement>(root, "[data-layers]");
  const camera = $<HTMLPreElement>(root, "[data-camera]");
  const summary = $<HTMLPreElement>(root, "[data-summary]");
  const parts = $<HTMLUListElement>(root, "[data-parts]");

  let locale: CadLocale = currentLocale();
  const viewer = new Cad3DViewer(host, { locale });
  let theme: CadTheme = "dark";
  let shading: Shading = "shaded";
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
  const load = (source: string | File, fileName?: string) => {
    viewer.load(source, fileName ? { fileName } : {}).catch(() => {});
  };

  const renderSamples = () => {
    const t = messages(locale);
    const selected = samples.value;
    samples.replaceChildren(
      new Option(t.model3d.samples.choose, ""),
      ...MODELS.map((model) => new Option(t.model3d.samples[model.key], model.url)),
    );
    samples.value = selected;
  };
  samples.addEventListener("change", () => {
    const model = MODELS.find((candidate) => candidate.url === samples.value);
    if (model) load(model.url, model.fileName);
  });
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

  const renderLayers = (layers: Layer3DInfo[]) => {
    const t = messages(locale);
    layerList.replaceChildren(
      ...layers.map((layer) => {
        const item = document.createElement("li");
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = layer.visible;
        box.addEventListener("change", () => viewer.setLayerVisible(layer.name, box.checked));
        const name = document.createElement("span");
        name.textContent = layer.name;
        const count = document.createElement("span");
        count.className = "count";
        count.textContent = `${layer.meshCount} · ${t.model3d.triangles(layer.triangleCount)}`;
        label.append(box, name, count);
        item.append(label);
        return item;
      }),
    );
  };

  // Model information: what the scene contains, and one row per part.
  const renderInfo = () => {
    const t = messages(locale);
    const stats = viewer.getSummary();
    summary.textContent = stats
      ? t.info.summary3d({
          format: stats.format.toUpperCase(),
          parts: stats.meshCount,
          layers: stats.layerCount,
          triangles: stats.triangles,
          vertices: stats.vertices,
          materials: stats.materialCount,
        })
      : t.info.empty;
    parts.replaceChildren(
      ...viewer.getParts().map((part) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = part.name;
        const detail = document.createElement("span");
        detail.className = "count";
        detail.textContent = `${part.layer} · ${part.material} · ${t.model3d.triangles(part.triangles)}`;
        item.append(name, detail);
        return item;
      }),
    );
  };

  const renderCamera = () => {
    const t = messages(locale);
    const state = viewer.getCamera();
    camera.textContent = t.model3d.cameraReadout({
      azimuth: degrees(state.azimuth),
      elevation: degrees(state.elevation),
      distance: state.distance.toFixed(2),
    });
  };

  viewer.on("load-start", ({ fileName }) =>
    setStatus((t) => (fileName ? t.loadingFile(fileName) : t.loading)),
  );
  viewer.on("load-progress", ({ phase }) => setStatus((t) => t.loadingPhase(phase)));
  viewer.on("loaded", ({ scene, fileName }) => {
    const triangles = scene.meshes.reduce(
      (total, mesh) => total + (mesh.indices ? mesh.indices.length : mesh.positions.length / 3) / 3,
      0,
    );
    setStatus((t) =>
      t.model3d.loadedSummary({
        name: fileName ?? t.model3d.model,
        format: scene.format.toUpperCase(),
        parts: scene.meshes.length,
        layers: scene.layers.size,
        triangles,
      }),
    );
    renderLayers(viewer.getLayers());
    renderInfo();
    renderCamera();
  });
  // The viewer translates library errors from their stable code into its current language.
  viewer.on("error", ({ error }) => setStatus(() => viewer.formatError(error), true));
  viewer.on("layers-change", ({ layers }) => {
    renderLayers(layers);
    renderInfo();
  });
  viewer.on("camera-change", () => renderCamera());

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "fit") {
      viewer.zoomExtents();
      renderCamera();
    } else if (action === "iso") viewer.setCamera(ISO);
    else if (action === "top") viewer.setCamera({ azimuth: 0, elevation: Math.PI / 2 - 0.001 });
    else if (action === "front") viewer.setCamera({ azimuth: 0, elevation: 0 });
    else if (action === "shading") {
      shading = shading === "shaded" ? "wireframe" : "shaded";
      viewer.setShading(shading);
      button.setAttribute("aria-pressed", String(shading === "wireframe"));
      button.textContent = messages(locale).model3d[shading];
    } else if (action === "edges") viewer.setEdges(button.getAttribute("aria-pressed") !== "true");
    else if (action === "theme") {
      theme = theme === "dark" ? "light" : "dark";
      viewer.setTheme(theme);
    } else if (action === "png")
      viewer.exportImage({ scale: 2 }).then((blob) => downloadBlob(blob, "model.png"));
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
    renderCamera();
    renderStatus();
  });

  renderSamples();
  renderInfo();
  renderCamera();
  renderStatus();
  // `?model=<sample file name>` deep-links one sample, e.g. /3d/?model=house.obj.
  const requested = new URLSearchParams(location.search).get("model");
  const known = MODELS.find((model) => model.fileName === requested);
  // `?model=` accepts a sample file name or any URL/path (e.g. /samples-local/part.stl).
  if (known) {
    samples.value = known.url;
    load(known.url, known.fileName);
  } else if (requested) {
    load(requested, requested.split("/").pop() || undefined);
  } else {
    const initial = MODELS[0];
    if (initial) {
      samples.value = initial.url;
      load(initial.url, initial.fileName);
    }
  }
  return viewer;
}
