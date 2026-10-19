import { type CadLocale, resolveLocale } from "@jesusjbriceno/cad-viewer-core";

/** Sandbox UI texts. The viewer's own texts come from the library catalogs. */
export interface SandboxMessages {
  languageLabel: string;
  nav: { home: string; vanilla: string; vue: string; react: string; "3d": string; pages: string };
  titles: { home: string; vanilla: string; vue: string; react: string; "3d": string };
  samples: {
    dxf: string;
    dwg: string;
    pumpHouse: string;
    plate: string;
    choose: string;
    label: string;
    credits: string;
  };
  drawing: string;
  openFile: string;
  dropHint: string;
  layout: string;
  layers: string;
  controlledLayers: (prop: string) => string;
  frozen: string;
  showAll: string;
  hideAll: string;
  selection: string;
  measure: string;
  toolbar: string;
  fit: string;
  fitTitle: string;
  zoomInTitle: string;
  zoomOutTitle: string;
  tools: { pan: string; "zoom-window": string; measure: string };
  theme: string;
  exportPng: string;
  dropRegion: string;
  ready: string;
  loading: string;
  loadingFile: (name: string) => string;
  loadingPhase: (phase: string) => string;
  drawingFallback: string;
  loadedSummary: (info: {
    name: string;
    format: string;
    version: string;
    layers: number;
    blocks: number;
  }) => string;
  loadedBy: (info: { name: string; format: string; layers: number; component: string }) => string;
  notDrawn: (list: string) => string;
  noSelection: string;
  pick: { type: string; layer: string; handle: string; block: string; at: string };
  measureHint: string;
  measureInactive: string;
  measureResult: { distance: string; angle: string };
  info: {
    title: string;
    properties: string;
    empty: string;
    summary2d: (i: {
      format: string;
      version: string | undefined;
      units: string | undefined;
      entities: number;
      layers: number;
      blocks: number;
      layouts: number;
    }) => string;
    nothingDrawable: (list: string) => string;
    summary3d: (i: {
      format: string;
      parts: number;
      layers: number;
      triangles: number;
      vertices: number;
      materials: number;
    }) => string;
  };
  credits: {
    title: string;
    intro: string;
    file: string;
    author: string;
    license: string;
    source: string;
    back: string;
    synthetic: string;
  };
  model3d: {
    model: string;
    samples: {
      flange: string;
      house: string;
      torusStl: string;
      torusObj: string;
      label: string;
      choose: string;
    };
    openFile: string;
    dropHint: string;
    dropRegion: string;
    display: string;
    shaded: string;
    wireframe: string;
    edges: string;
    views: string;
    iso: string;
    top: string;
    front: string;
    camera: string;
    cameraReadout: (info: { azimuth: string; elevation: string; distance: string }) => string;
    triangles: (count: number) => string;
    loadedSummary: (info: {
      name: string;
      format: string;
      parts: number;
      layers: number;
      triangles: number;
    }) => string;
  };
}

const es: SandboxMessages = {
  languageLabel: "Idioma",
  nav: {
    home: "Inicio",
    vanilla: "Vanilla (core)",
    vue: "Vue",
    react: "React",
    "3d": "3D",
    pages: "Páginas del sandbox",
  },
  titles: { home: "Inicio", vanilla: "Vanilla", vue: "Vue", react: "React", "3d": "3D" },
  samples: {
    dxf: "DXF · muestra R2000 escrita a mano (capas, bloque, presentaciones)",
    dwg: "DWG · ejemplo de LibreDWG (AutoCAD 2013) — amplía el centro",
    pumpHouse: "DXF · planta y sección de caseta de bombeo (CC0, Innerscene)",
    plate: "DXF · placa con círculo de taladros (CC0, Falcon)",
    choose: "Elige una muestra…",
    label: "Dibujos de muestra",
    credits: "Créditos de las muestras",
  },
  drawing: "Dibujo",
  openFile: "Abrir un archivo DXF o DWG",
  dropHint: "…o suelta un archivo .dxf / .dwg sobre el dibujo.",
  layout: "Presentación",
  layers: "Capas",
  controlledLayers: (prop) => `Capas (controladas por ${prop})`,
  frozen: "inutilizada",
  showAll: "Mostrar todas",
  hideAll: "Ocultar todas",
  selection: "Selección",
  measure: "Medición",
  toolbar: "Herramientas del visor",
  fit: "Encuadrar",
  fitTitle: "Zoom a la extensión (0)",
  zoomInTitle: "Acercar (+)",
  zoomOutTitle: "Alejar (−)",
  tools: { pan: "Desplazar / seleccionar", "zoom-window": "Zoom ventana", measure: "Medir" },
  theme: "Tema",
  exportPng: "Exportar PNG",
  dropRegion: "Dibujo (suelta aquí un archivo DXF o DWG)",
  ready: "Listo.",
  loading: "Cargando…",
  loadingFile: (name) => `Cargando ${name}…`,
  loadingPhase: (phase) => `Cargando… (${phase})`,
  drawingFallback: "Dibujo",
  loadedSummary: ({ name, format, version, layers, blocks }) =>
    `${name} · ${format} ${version} · ${layers} capas · ${blocks} bloques`,
  loadedBy: ({ name, format, layers, component }) =>
    `${name} · ${format} · ${layers} capas (dibujado por <CadViewer> para ${component})`,
  notDrawn: (list) => `sin dibujar: ${list}`,
  noSelection: "Nada seleccionado. Haz clic en una entidad.",
  pick: { type: "Tipo", layer: "Capa", handle: "Handle", block: "Bloque", at: "En" },
  measureHint: "Herramienta Medir: haz clic en dos puntos.",
  measureInactive: "Pulsa «Medir» y haz clic en dos puntos para medir una distancia.",
  measureResult: { distance: "Distancia", angle: "Ángulo" },
  info: {
    title: "Información",
    properties: "Propiedades",
    empty: "Carga un dibujo o un modelo para ver su información.",
    summary2d: ({ format, version, units, entities, layers, blocks, layouts }) =>
      `${format}${version ? ` ${version}` : ""}${units ? ` · ${units}` : ""} · ${entities} entidades · ${layers} capas · ${blocks} bloques · ${layouts} presentaciones`,
    nothingDrawable: (list) =>
      `Nada representable en este dibujo: ${list}. El visor 2D solo dibuja geometría plana.`,
    summary3d: ({ format, parts, layers, triangles, vertices, materials }) =>
      `${format} · ${parts} piezas · ${layers} capas · ${triangles} triángulos · ${vertices} vértices · ${materials} materiales`,
  },
  credits: {
    title: "Créditos de las muestras",
    intro:
      "Los dibujos y modelos sintéticos los genera este repositorio. Los archivos reales provienen de terceros y se redistribuyen bajo su licencia, con la procedencia documentada en el repositorio.",
    file: "Archivo",
    author: "Autor",
    license: "Licencia",
    source: "Origen",
    back: "Volver al sandbox",
    synthetic: "Muestras sintéticas de este repositorio:",
  },
  model3d: {
    model: "Modelo",
    samples: {
      flange: "STL · brida con buje (binario, 1536 triángulos)",
      house: "OBJ · casa con grupos y materiales (paredes, tejado, puerta)",
      torusStl: "STL · nudo tórido real (CC0, Falcon, 6144 triángulos)",
      torusObj: "OBJ · nudo tórido real (CC0, Falcon, 6144 triángulos)",
      label: "Modelos de muestra",
      choose: "Elige una muestra…",
    },
    openFile: "Abrir un archivo STL u OBJ",
    dropHint: "…o suelta un archivo .stl / .obj sobre el modelo.",
    dropRegion: "Modelo 3D (suelta aquí un archivo STL u OBJ)",
    display: "Visualización",
    shaded: "Sombreado",
    wireframe: "Alambre",
    edges: "Aristas",
    views: "Vistas",
    iso: "Isométrica",
    top: "Superior",
    front: "Frontal",
    camera: "Cámara",
    cameraReadout: ({ azimuth, elevation, distance }) =>
      `Azimut: ${azimuth}°
Elevación: ${elevation}°
Distancia: ${distance}`,
    triangles: (count) => `${count} triángulos`,
    loadedSummary: ({ name, format, parts, layers, triangles }) =>
      `${name} · ${format} · ${parts} piezas · ${layers} capas · ${triangles} triángulos`,
  },
};

const en: SandboxMessages = {
  languageLabel: "Language",
  nav: {
    home: "Overview",
    vanilla: "Vanilla (core)",
    vue: "Vue",
    react: "React",
    "3d": "3D",
    pages: "Sandbox pages",
  },
  titles: { home: "Overview", vanilla: "Vanilla", vue: "Vue", react: "React", "3d": "3D" },
  samples: {
    dxf: "DXF · hand-written R2000 sample (layers, block, layouts)",
    dwg: "DWG · LibreDWG example (AutoCAD 2013) — zoom into the center",
    pumpHouse: "DXF · pump house plan and section (CC0, Innerscene)",
    plate: "DXF · bolt-circle plate (CC0, Falcon)",
    choose: "Choose a sample…",
    label: "Sample drawings",
    credits: "Sample credits",
  },
  drawing: "Drawing",
  openFile: "Open a DXF or DWG file",
  dropHint: "…or drop a .dxf / .dwg file on the drawing.",
  layout: "Layout",
  layers: "Layers",
  controlledLayers: (prop) => `Layers (controlled by ${prop})`,
  frozen: "frozen",
  showAll: "Show all",
  hideAll: "Hide all",
  selection: "Selection",
  measure: "Measure",
  toolbar: "Viewer tools",
  fit: "Fit",
  fitTitle: "Zoom to extents (0)",
  zoomInTitle: "Zoom in (+)",
  zoomOutTitle: "Zoom out (−)",
  tools: { pan: "Pan / select", "zoom-window": "Zoom window", measure: "Measure" },
  theme: "Theme",
  exportPng: "Export PNG",
  dropRegion: "Drawing (drop a DXF or DWG file here)",
  ready: "Ready.",
  loading: "Loading…",
  loadingFile: (name) => `Loading ${name}…`,
  loadingPhase: (phase) => `Loading… (${phase})`,
  drawingFallback: "Drawing",
  loadedSummary: ({ name, format, version, layers, blocks }) =>
    `${name} · ${format} ${version} · ${layers} layers · ${blocks} blocks`,
  loadedBy: ({ name, format, layers, component }) =>
    `${name} · ${format} · ${layers} layers (rendered by <CadViewer> for ${component})`,
  notDrawn: (list) => `not drawn: ${list}`,
  noSelection: "Nothing selected. Click an entity.",
  pick: { type: "Type", layer: "Layer", handle: "Handle", block: "Block", at: "At" },
  measureHint: "Measure tool: click two points.",
  measureInactive: "Press «Measure» and click two points to measure a distance.",
  measureResult: { distance: "Distance", angle: "Angle" },
  info: {
    title: "Information",
    properties: "Properties",
    empty: "Load a drawing or a model to see its information.",
    summary2d: ({ format, version, units, entities, layers, blocks, layouts }) =>
      `${format}${version ? ` ${version}` : ""}${units ? ` · ${units}` : ""} · ${entities} entities · ${layers} layers · ${blocks} blocks · ${layouts} layouts`,
    nothingDrawable: (list) =>
      `Nothing representable in this drawing: ${list}. The 2D viewer only draws planar geometry.`,
    summary3d: ({ format, parts, layers, triangles, vertices, materials }) =>
      `${format} · ${parts} parts · ${layers} layers · ${triangles} triangles · ${vertices} vertices · ${materials} materials`,
  },
  credits: {
    title: "Sample credits",
    intro:
      "The synthetic drawings and models are generated by this repository. The real files come from third parties and are redistributed under their license, with the provenance documented in the repository.",
    file: "File",
    author: "Author",
    license: "License",
    source: "Source",
    back: "Back to the sandbox",
    synthetic: "Synthetic samples from this repository:",
  },
  model3d: {
    model: "Model",
    samples: {
      flange: "STL · flanged hub (binary, 1536 triangles)",
      house: "OBJ · house with groups and materials (walls, roof, door)",
      torusStl: "STL · real torus knot (CC0, Falcon, 6144 triangles)",
      torusObj: "OBJ · real torus knot (CC0, Falcon, 6144 triangles)",
      label: "Sample models",
      choose: "Choose a sample…",
    },
    openFile: "Open an STL or OBJ file",
    dropHint: "…or drop a .stl / .obj file on the model.",
    dropRegion: "3D model (drop an STL or OBJ file here)",
    display: "Display",
    shaded: "Shaded",
    wireframe: "Wireframe",
    edges: "Edges",
    views: "Views",
    iso: "Isometric",
    top: "Top",
    front: "Front",
    camera: "Camera",
    cameraReadout: ({ azimuth, elevation, distance }) =>
      `Azimuth: ${azimuth}°
Elevation: ${elevation}°
Distance: ${distance}`,
    triangles: (count) => `${count} triangles`,
    loadedSummary: ({ name, format, parts, layers, triangles }) =>
      `${name} · ${format} · ${parts} parts · ${layers} layers · ${triangles} triangles`,
  },
};

const MESSAGES: Record<CadLocale, SandboxMessages> = { "es-ES": es, en };

/** Languages offered by the selector, in display order. */
export const LANGUAGES: { locale: CadLocale; label: string }[] = [
  { locale: "es-ES", label: "Español" },
  { locale: "en", label: "English" },
];

export function messages(locale: CadLocale): SandboxMessages {
  return MESSAGES[locale];
}

const STORAGE_KEY = "cad-viewer-sandbox:locale";
const EVENT = "sandbox-locale-change";

/** Language chosen in the selector; Spanish (Spain) until the user picks another. */
export function currentLocale(): CadLocale {
  try {
    return resolveLocale(globalThis.localStorage?.getItem(STORAGE_KEY));
  } catch {
    return resolveLocale(undefined);
  }
}

/** Stores the language and notifies every listener on the page. */
export function changeLocale(locale: string): void {
  const resolved = resolveLocale(locale);
  try {
    localStorage.setItem(STORAGE_KEY, resolved);
  } catch {
    // Private mode: the choice lasts until the next page load.
  }
  window.dispatchEvent(new CustomEvent<CadLocale>(EVENT, { detail: resolved }));
}

/** Calls `listener` on every language change; returns the unsubscribe function. */
export function onLocaleChange(listener: (locale: CadLocale) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<CadLocale>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

function lookup(locale: CadLocale, path: string): string | undefined {
  let value: unknown = MESSAGES[locale];
  for (const part of path.split(".")) value = (value as Record<string, unknown>)?.[part];
  return typeof value === "string" ? value : undefined;
}

/**
 * Translates static markup: `data-i18n` (text), `data-i18n-aria` (aria-label),
 * `data-i18n-title` (title) hold message paths such as "nav.home"; elements with
 * `data-locale-block` are shown only for their locale. Also sets `<html lang>`.
 */
export function translatePage(locale: CadLocale, root: ParentNode = document): void {
  document.documentElement.lang = locale;
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const text = lookup(locale, element.dataset.i18n ?? "");
    if (text !== undefined) element.textContent = text;
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-aria]")) {
    const text = lookup(locale, element.dataset.i18nAria ?? "");
    if (text !== undefined) element.setAttribute("aria-label", text);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    const text = lookup(locale, element.dataset.i18nTitle ?? "");
    if (text !== undefined) element.title = text;
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-locale-block]"))
    element.hidden = element.dataset.localeBlock !== locale;
}
