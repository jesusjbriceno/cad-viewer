import { dxfLoader } from "../dxf";
import { formatCadError, formatLength } from "../i18n/format";
import { type CadLocale, resolveLocale } from "../i18n/locale";
import { MESSAGES } from "../i18n/messages";
import {
  collectEntities,
  type DocumentSummary,
  type EntityFilter,
  type EntityInfo,
  summarizeDocument,
} from "../inspect";
import { abortError, CadLoadError, viewerError } from "../loaders/errors";
import { FormatRegistry } from "../loaders/registry";
import { colorToCss } from "../model/colors";
import type { Bounds, CadDocument, CadLayout, Color, Point } from "../model/types";
import { drawFrame, type Frame } from "../render/canvasRenderer";
import { buildDisplayList, type DisplayList, type PickTarget } from "../render/displayList";
import type { XY } from "../render/geometry";
import { pickPrimitive } from "../render/pick";
import { attachPointerInput } from "./interaction/pointer";
import { Emitter } from "./internal/emitter";
import { readSource } from "./internal/source";
import type {
  CadSource,
  CadTheme,
  CadViewerApi,
  CadViewerEventName,
  CadViewerListener,
  CadViewerOptions,
  ExportImageOptions,
  LayerInfo,
  LayoutInfo,
  PickResult,
  Unsubscribe,
  ViewerTool,
  ViewState,
} from "./types";

const THEMES: Record<CadTheme, { background: string; foreground: string; highlight: string }> = {
  dark: { background: "#1e1e1e", foreground: "#ffffff", highlight: "#4fc3f7" },
  light: { background: "#ffffff", foreground: "#000000", highlight: "#0078d4" },
};
const MIN_SCALE = 1e-9;
const MAX_SCALE = 1e9;
const PICK_TOLERANCE_PX = 4;
const MIN_ZOOM_WINDOW_PX = 4;
const DEFAULT_ZOOM_FACTOR = 1.25;

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

function sourceName(source: CadSource): string | undefined {
  if (typeof File !== "undefined" && source instanceof File) return source.name;
  if (typeof source === "string" || source instanceof URL) {
    try {
      const segment = new URL(String(source), "http://localhost/").pathname
        .split("/")
        .filter(Boolean)
        .at(-1);
      return segment ? decodeURIComponent(segment) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * View-only CAD viewer bound to a container element. It renders into its own
 * `<canvas>`, sized to the container, and never modifies the loaded drawing:
 * layer visibility, layout, view and selection are viewer state only.
 */
export class CadViewer implements CadViewerApi {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly registry: FormatRegistry;
  private readonly emitter = new Emitter();
  private readonly pixelRatio: number;
  private readonly detachInput: (() => void) | undefined;
  private readonly resizeObserver: ResizeObserver | undefined;

  private currentDocument: CadDocument | null = null;
  private layout: CadLayout | null = null;
  private currentTheme: CadTheme;
  private currentLocale: CadLocale;
  private currentTool: ViewerTool;
  private currentSelection: PickResult | null = null;
  private selectedTarget: PickTarget | null = null;
  private hoveredTarget: PickTarget | null = null;
  private readonly lists = new Map<CadLayout, DisplayList>();
  private readonly layerVisible = new Map<string, boolean>();
  private chainVisibility = new WeakMap<DisplayList, boolean[]>();
  private center: XY = { x: 0, y: 0 };
  private scale = 1;
  private width = 300;
  private height = 150;
  private measure: { from?: XY; to?: XY; cursor?: XY } = {};
  private rectangle: { x: number; y: number; width: number; height: number } | undefined;
  private frameRequested = false;
  private hoverQueued: XY | null = null;
  private loadController: AbortController | null = null;
  private destroyed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: CadViewerOptions = {},
  ) {
    this.registry = new FormatRegistry([dxfLoader, ...(options.loaders ?? [])]);
    this.currentTheme = options.theme ?? "dark";
    this.currentLocale = resolveLocale(options.locale);
    this.currentTool = options.tool ?? "pan";
    this.pixelRatio = options.pixelRatio ?? (globalThis.devicePixelRatio || 1);

    const canvas = container.ownerDocument.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    Object.assign(canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      touchAction: "none",
      outline: "none",
    });
    container.appendChild(canvas);
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.applyLocale();

    if (options.interactive !== false) {
      this.detachInput = attachPointerInput(canvas, {
        dragMode: () => (this.currentTool === "zoom-window" ? "rectangle" : "pan"),
        pan: (dx, dy) => this.panBy(dx, dy),
        zoomAt: (x, y, factor) => this.zoomAt(x, y, factor),
        tap: (x, y) => this.onTap(x, y),
        hover: (x, y) => this.onHover(x, y),
        leave: () => this.setHovered(null),
        rectangle: (from, to, done) => this.onRectangle(from, to, done),
        doubleTap: () => this.zoomExtents(),
        key: (key) => this.onKey(key),
      });
    }
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.destroyed) this.resize();
      });
      this.resizeObserver.observe(container);
    }
    this.measureSize();
    this.requestRender();
  }

  get document(): CadDocument | null {
    return this.currentDocument;
  }

  get theme(): CadTheme {
    return this.currentTheme;
  }

  get locale(): CadLocale {
    return this.currentLocale;
  }

  get tool(): ViewerTool {
    return this.currentTool;
  }

  get activeLayout(): string | null {
    return this.layout?.name ?? null;
  }

  get selection(): PickResult | null {
    return this.currentSelection;
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  async load(
    source: CadSource,
    options: { fileName?: string; signal?: AbortSignal } = {},
  ): Promise<CadDocument> {
    this.assertAlive();
    this.loadController?.abort();
    const controller = new AbortController();
    this.loadController = controller;
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort", () => controller.abort(), { once: true });

    const initialName = options.fileName ?? sourceName(source);
    this.emitter.emit("load-start", initialName ? { fileName: initialName } : {});
    try {
      const read = await readSource(source, {
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
        ...(this.options.requestInit ? { requestInit: this.options.requestInit } : {}),
        signal: controller.signal,
      });
      if (controller.signal.aborted) throw abortError();
      const fileName = options.fileName ?? read.fileName ?? initialName;
      const document = await this.registry.load(read.bytes, {
        ...(fileName ? { fileName } : {}),
        signal: controller.signal,
        onProgress: (progress) => {
          if (this.loadController === controller) this.emitter.emit("load-progress", progress);
        },
      });
      if (controller.signal.aborted || this.destroyed) throw abortError();
      this.show(document, fileName);
      return document;
    } catch (error) {
      const aborted =
        controller.signal.aborted || (error instanceof CadLoadError && error.code === "aborted");
      if (aborted)
        throw error instanceof CadLoadError && error.code === "aborted" ? error : abortError();
      const failure = error instanceof Error ? error : new Error(String(error));
      if (!this.destroyed) this.emitter.emit("error", { error: failure });
      throw failure;
    } finally {
      if (this.loadController === controller) this.loadController = null;
    }
  }

  loadDocument(document: CadDocument): void {
    this.assertAlive();
    this.loadController?.abort();
    this.show(document);
  }

  clear(): void {
    this.assertAlive();
    this.loadController?.abort();
    this.currentDocument = null;
    this.layout = null;
    this.resetState();
    this.emitter.emit("layers-change", { layers: [] });
    this.requestRender();
  }

  private show(document: CadDocument, fileName?: string): void {
    this.currentDocument = document;
    this.layout = document.layouts.find((layout) => layout.isModel) ?? document.layouts[0] ?? null;
    this.resetState();
    for (const layer of document.layers.values())
      this.layerVisible.set(layer.name, layer.visible && !layer.frozen);
    this.zoomExtents();
    this.emitter.emit("layers-change", { layers: this.getLayers() });
    if (this.layout) this.emitter.emit("layout-change", { layout: this.layoutInfo(this.layout) });
    this.emitter.emit("loaded", fileName ? { document, fileName } : { document });
  }

  private resetState(): void {
    this.lists.clear();
    this.layerVisible.clear();
    this.chainVisibility = new WeakMap();
    this.currentSelection = null;
    this.selectedTarget = null;
    this.hoveredTarget = null;
    this.measure = {};
    this.rectangle = undefined;
  }

  // ── View ─────────────────────────────────────────────────────────────────

  getView(): ViewState {
    return {
      center: { ...this.center },
      scale: this.scale,
      width: this.width,
      height: this.height,
    };
  }

  setView(view: { center: Point; scale: number }): void {
    this.assertAlive();
    this.center = { x: view.center.x, y: view.center.y };
    this.scale = clampScale(view.scale);
    this.viewChanged();
  }

  zoomExtents(): void {
    this.assertAlive();
    const extents = this.getExtents();
    if (extents) {
      this.zoomToBounds(extents);
    } else {
      this.center = { x: 0, y: 0 };
      this.scale = 1;
      this.viewChanged();
    }
  }

  zoomToBounds(bounds: Bounds): void {
    this.assertAlive();
    const padding = this.options.zoomPadding ?? 0.05;
    const width = Math.max(0, bounds.maxX - bounds.minX);
    const height = Math.max(0, bounds.maxY - bounds.minY);
    const fitX = width > 0 ? (this.width * (1 - 2 * padding)) / width : Number.POSITIVE_INFINITY;
    const fitY = height > 0 ? (this.height * (1 - 2 * padding)) / height : Number.POSITIVE_INFINITY;
    const fit = Math.min(fitX, fitY);
    this.center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    if (Number.isFinite(fit)) this.scale = clampScale(fit);
    this.viewChanged();
  }

  zoomIn(factor = DEFAULT_ZOOM_FACTOR): void {
    this.assertAlive();
    this.zoomAt(this.width / 2, this.height / 2, factor);
  }

  zoomOut(factor = DEFAULT_ZOOM_FACTOR): void {
    this.assertAlive();
    this.zoomAt(this.width / 2, this.height / 2, 1 / factor);
  }

  getExtents(): Bounds | null {
    if (!this.layout || !this.currentDocument) return null;
    const list = this.currentList();
    if (list?.bounds) return { ...list.bounds };
    const fallback = this.layout.isModel ? this.currentDocument.header.extents : this.layout.limits;
    return fallback ? { ...fallback } : null;
  }

  screenToWorld(x: number, y: number): Point {
    return {
      x: this.center.x + (x - this.width / 2) / this.scale,
      y: this.center.y - (y - this.height / 2) / this.scale,
    };
  }

  worldToScreen(point: Point): { x: number; y: number } {
    return {
      x: (point.x - this.center.x) * this.scale + this.width / 2,
      y: this.height / 2 - (point.y - this.center.y) * this.scale,
    };
  }

  private zoomAt(x: number, y: number, factor: number): void {
    const anchor = this.screenToWorld(x, y);
    this.scale = clampScale(this.scale * factor);
    this.center = {
      x: anchor.x - (x - this.width / 2) / this.scale,
      y: anchor.y + (y - this.height / 2) / this.scale,
    };
    this.viewChanged();
  }

  private panBy(dx: number, dy: number): void {
    this.center = { x: this.center.x - dx / this.scale, y: this.center.y + dy / this.scale };
    this.viewChanged();
  }

  private viewChanged(): void {
    this.emitter.emit("view-change", this.getView());
    this.requestRender();
  }

  // ── Layers and layouts ───────────────────────────────────────────────────

  /** Model information: counts, layers, blocks, layouts and the saved extents. */
  getSummary(): DocumentSummary | null {
    return this.document ? summarizeDocument(this.document) : null;
  }

  /** Lists the entities of one layout (model space by default) as plain data. */
  getEntities(filter: EntityFilter = {}): EntityInfo[] {
    return this.document ? collectEntities(this.document, filter) : [];
  }

  getLayers(): LayerInfo[] {
    if (!this.currentDocument) return [];
    const counts = this.currentList()?.layerCounts;
    return [...this.currentDocument.layers.values()].map((layer) => ({
      name: layer.name,
      color: this.cssColor(layer.color),
      visible: this.layerVisible.get(layer.name) ?? true,
      frozen: layer.frozen,
      entityCount: counts?.get(layer.name) ?? 0,
    }));
  }

  setLayerVisible(name: string, visible: boolean): void {
    this.assertAlive();
    if (!this.currentDocument?.layers.has(name)) throw viewerError("unknown-layer", { name });
    this.layerVisible.set(name, visible);
    this.layersChanged();
  }

  setAllLayersVisible(visible: boolean): void {
    this.assertAlive();
    for (const name of this.layerVisible.keys()) this.layerVisible.set(name, visible);
    this.layersChanged();
  }

  getLayouts(): LayoutInfo[] {
    return (this.currentDocument?.layouts ?? []).map((layout) => this.layoutInfo(layout));
  }

  setLayout(name: string): void {
    this.assertAlive();
    const layout = this.currentDocument?.layouts.find((candidate) => candidate.name === name);
    if (!layout) throw viewerError("unknown-layout", { name });
    if (layout === this.layout) return;
    this.layout = layout;
    this.currentSelection = null;
    this.selectedTarget = null;
    this.hoveredTarget = null;
    this.measure = {};
    this.zoomExtents();
    this.emitter.emit("layout-change", { layout: this.layoutInfo(layout) });
    this.emitter.emit("layers-change", { layers: this.getLayers() });
  }

  private layoutInfo(layout: CadLayout): LayoutInfo {
    return { name: layout.name, isModel: layout.isModel, active: layout === this.layout };
  }

  private layersChanged(): void {
    this.chainVisibility = new WeakMap();
    this.emitter.emit("layers-change", { layers: this.getLayers() });
    this.requestRender();
  }

  private listFor(layout: CadLayout): DisplayList {
    let list = this.lists.get(layout);
    if (!list && this.currentDocument) {
      list = buildDisplayList(this.currentDocument, layout);
      this.lists.set(layout, list);
    }
    return list as DisplayList;
  }

  private currentList(): DisplayList | null {
    return this.layout && this.currentDocument ? this.listFor(this.layout) : null;
  }

  private isVisible = (list: DisplayList, chain: number): boolean => {
    let cache = this.chainVisibility.get(list);
    if (!cache) {
      cache = list.chains.map((layers) =>
        layers.every((layer) => this.layerVisible.get(layer) !== false),
      );
      this.chainVisibility.set(list, cache);
    }
    return cache[chain] ?? true;
  };

  // ── Theme, language, tools, picking ──────────────────────────────────────

  setTheme(theme: CadTheme): void {
    this.assertAlive();
    this.currentTheme = theme;
    this.requestRender();
  }

  setLocale(locale: string): void {
    this.assertAlive();
    const resolved = resolveLocale(locale);
    if (resolved === this.currentLocale) return;
    this.currentLocale = resolved;
    this.applyLocale();
    this.requestRender();
  }

  formatError(error: unknown): string {
    return formatCadError(error, this.currentLocale);
  }

  private applyLocale(): void {
    this.canvas.setAttribute("lang", this.currentLocale);
    this.canvas.setAttribute("aria-label", MESSAGES[this.currentLocale].canvasLabel);
  }

  setTool(tool: ViewerTool): void {
    this.assertAlive();
    if (tool === this.currentTool) return;
    this.currentTool = tool;
    this.measure = {};
    this.rectangle = undefined;
    this.emitter.emit("tool-change", { tool });
    this.requestRender();
  }

  pickAt(x: number, y: number): PickResult | null {
    this.assertAlive();
    const target = this.targetAt(x, y);
    return target ? this.toPick(target, this.screenToWorld(x, y)) : null;
  }

  clearSelection(): void {
    this.assertAlive();
    if (!this.currentSelection) return;
    this.currentSelection = null;
    this.selectedTarget = null;
    this.emitter.emit("select", { pick: null });
    this.requestRender();
  }

  private targetAt(x: number, y: number): PickTarget | null {
    const list = this.currentList();
    if (!list) return null;
    const world = this.screenToWorld(x, y);
    const primitive = pickPrimitive(
      list,
      world.x,
      world.y,
      PICK_TOLERANCE_PX / this.scale,
      (chain) => this.isVisible(list, chain),
    );
    return primitive?.target ?? null;
  }

  private toPick(target: PickTarget, world: Point): PickResult {
    const { entity } = target;
    return {
      entity,
      type: entity.type,
      layer: target.layer,
      ...(entity.handle !== undefined ? { handle: entity.handle } : {}),
      blockPath: [...target.blockPath],
      world,
    };
  }

  private onTap(x: number, y: number): void {
    this.canvas.focus?.();
    const world = this.screenToWorld(x, y);
    if (this.currentTool === "measure") {
      if (!this.measure.from || this.measure.to) {
        this.measure = { from: world };
      } else {
        const from = this.measure.from;
        this.measure = { from, to: world };
        const dx = world.x - from.x;
        const dy = world.y - from.y;
        this.emitter.emit("measure", {
          from,
          to: world,
          distance: Math.hypot(dx, dy),
          dx,
          dy,
          angle: Math.atan2(dy, dx),
        });
      }
      this.requestRender();
      return;
    }
    if (this.currentTool !== "pan") return;
    const target = this.targetAt(x, y);
    this.selectedTarget = target;
    this.currentSelection = target ? this.toPick(target, world) : null;
    this.emitter.emit("select", { pick: this.currentSelection });
    this.requestRender();
  }

  private onHover(x: number, y: number): void {
    if (this.currentTool === "measure" && this.measure.from && !this.measure.to) {
      this.measure.cursor = this.screenToWorld(x, y);
      this.requestRender();
    }
    const queued = this.hoverQueued !== null;
    this.hoverQueued = { x, y };
    if (queued) return;
    this.schedule(() => {
      const point = this.hoverQueued;
      this.hoverQueued = null;
      if (point && !this.destroyed) this.setHovered(this.targetAt(point.x, point.y), point);
    });
  }

  private setHovered(target: PickTarget | null, point?: XY): void {
    if (target === this.hoveredTarget) return;
    this.hoveredTarget = target;
    const pick = target && point ? this.toPick(target, this.screenToWorld(point.x, point.y)) : null;
    this.emitter.emit("hover", { pick });
    this.requestRender();
  }

  private onRectangle(from: XY, to: XY, done: boolean): void {
    if (!done) {
      this.rectangle = {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        width: Math.abs(to.x - from.x),
        height: Math.abs(to.y - from.y),
      };
      this.requestRender();
      return;
    }
    this.rectangle = undefined;
    if (
      Math.abs(to.x - from.x) >= MIN_ZOOM_WINDOW_PX &&
      Math.abs(to.y - from.y) >= MIN_ZOOM_WINDOW_PX
    ) {
      const a = this.screenToWorld(from.x, from.y);
      const b = this.screenToWorld(to.x, to.y);
      this.zoomToBounds({
        minX: Math.min(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x),
        maxY: Math.max(a.y, b.y),
      });
    }
    this.setTool("pan");
  }

  private onKey(key: string): boolean {
    if (key === "+" || key === "=") this.zoomIn();
    else if (key === "-" || key === "_") this.zoomOut();
    else if (key === "0" || key === "Home") this.zoomExtents();
    else if (key === "Escape") {
      this.measure = {};
      this.rectangle = undefined;
      this.clearSelection();
      this.requestRender();
    } else return false;
    return true;
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  exportImage(options: ExportImageOptions = {}): Promise<Blob> {
    this.assertAlive();
    const scale = options.scale ?? this.pixelRatio;
    const canvas = this.container.ownerDocument.createElement("canvas");
    canvas.width = Math.max(1, Math.round(this.width * scale));
    canvas.height = Math.max(1, Math.round(this.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return Promise.reject(viewerError("image-export-failed", {}));
    drawFrame(context, {
      ...this.frame(),
      pixelRatio: scale,
      ...(options.background ? { background: options.background } : {}),
      hovered: null,
      selected: null,
    });
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(viewerError("image-export-failed", {}))),
        options.type ?? "image/png",
      );
    });
  }

  resize(): void {
    this.assertAlive();
    this.measureSize();
    this.viewChanged();
  }

  private measureSize(): void {
    this.width = this.container.clientWidth || 300;
    this.height = this.container.clientHeight || 150;
    this.canvas.width = Math.max(1, Math.round(this.width * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.round(this.height * this.pixelRatio));
  }

  private cssColor(color: Color): string {
    const foreground = THEMES[this.currentTheme].foreground;
    if (color.kind === "aci" && color.index === 7) return foreground;
    return colorToCss(color) ?? foreground;
  }

  private frame(): Frame {
    const theme = THEMES[this.currentTheme];
    const list = this.currentList();
    const model = this.currentDocument?.layouts.find((layout) => layout.isModel);
    const measureLabel =
      this.measure.from && this.measure.to
        ? MESSAGES[this.currentLocale].measureLabel(
            formatLength(
              Math.hypot(
                this.measure.to.x - this.measure.from.x,
                this.measure.to.y - this.measure.from.y,
              ),
              this.currentLocale,
            ),
          )
        : undefined;
    const measureTo = this.measure.to ?? this.measure.cursor;
    return {
      list,
      modelList: list && !list.isModel && model ? this.listFor(model) : null,
      view: { center: this.center, scale: this.scale, width: this.width, height: this.height },
      pixelRatio: this.pixelRatio,
      background: this.options.background ?? theme.background,
      foreground: theme.foreground,
      highlight: theme.highlight,
      fontFamily: this.options.fontFamily ?? "sans-serif",
      isVisible: this.isVisible,
      hovered: this.hoveredTarget,
      selected: this.selectedTarget,
      overlay: {
        ...(this.measure.from
          ? {
              measure: {
                from: this.measure.from,
                ...(measureTo ? { to: measureTo } : {}),
                ...(measureLabel ? { label: measureLabel } : {}),
              },
            }
          : {}),
        ...(this.rectangle ? { rectangle: this.rectangle } : {}),
      },
    };
  }

  private schedule(callback: () => void): void {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => callback());
    else setTimeout(callback, 16);
  }

  private requestRender(): void {
    if (this.destroyed || this.frameRequested) return;
    this.frameRequested = true;
    this.schedule(() => {
      this.frameRequested = false;
      if (!this.destroyed && this.context) drawFrame(this.context, this.frame());
    });
  }

  // ── Events and teardown ──────────────────────────────────────────────────

  on<K extends CadViewerEventName>(event: K, listener: CadViewerListener<K>): Unsubscribe {
    this.assertAlive();
    return this.emitter.on(event, listener);
  }

  off<K extends CadViewerEventName>(event: K, listener: CadViewerListener<K>): void {
    this.emitter.off(event, listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.loadController?.abort();
    this.detachInput?.();
    this.resizeObserver?.disconnect();
    this.emitter.clear();
    this.canvas.remove();
    this.destroyed = true;
    this.currentDocument = null;
    this.layout = null;
    this.lists.clear();
  }

  private assertAlive(): void {
    if (this.destroyed) throw viewerError("destroyed", {});
  }
}
