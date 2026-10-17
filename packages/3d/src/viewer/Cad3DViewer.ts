import {
  abortError,
  CadLoadError,
  type CadLocale,
  type CadScene,
  type CadSource,
  type CadTheme,
  CadViewerError,
  FormatRegistry,
  formatCadError,
  readCadSource,
  resolveLocale,
} from "@jesusjbriceno/cad-viewer-core";
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MESSAGES_3D } from "../i18n";
import { BUILT_IN_3D_LOADERS } from "../loaders/builtin";
import { type BuiltScene, buildThreeScene, type Shading } from "../render/buildScene";
import {
  fitDistance,
  ISOMETRIC,
  type OrbitState,
  orbitFromPosition,
  orbitPosition,
  type UpAxis,
} from "../render/camera";
import { Emitter } from "./emitter";
import type {
  Cad3DViewerApi,
  Cad3DViewerEventName,
  Cad3DViewerListener,
  Cad3DViewerOptions,
  CameraUpdate,
  ExportImage3DOptions,
  Layer3DInfo,
} from "./types";

const BACKGROUNDS: Record<CadTheme, string> = { dark: "#1e1e1e", light: "#ffffff" };
const FOV_DEGREES = 45;
const FOV = (FOV_DEGREES * Math.PI) / 180;
const EMPTY_DISTANCE = 10;

function sourceName(source: CadSource): string | undefined {
  if (typeof File !== "undefined" && source instanceof File) return source.name;
  if (typeof source !== "string" && !(source instanceof URL)) return undefined;
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

function triangleCount(scene: CadScene, layer: string): number {
  let count = 0;
  for (const mesh of scene.meshes)
    if (mesh.layer === layer) count += (mesh.indices?.length ?? mesh.positions.length / 3) / 3;
  return count;
}

/**
 * View-only 3D model viewer bound to a container element. It renders a
 * `CadScene` with three.js into its own `<canvas>`, sized to the container,
 * and never modifies the model: layers, shading and camera are viewer state.
 */
export class Cad3DViewer implements Cad3DViewerApi {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly registry: FormatRegistry<CadScene>;
  private readonly emitter = new Emitter();
  private readonly threeScene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls | null;
  private readonly target = new Vector3();
  private readonly up: UpAxis;
  private readonly pixelRatio: number;
  private readonly resizeObserver: ResizeObserver | undefined;

  private currentScene: CadScene | null = null;
  private built: BuiltScene | null = null;
  private readonly layerVisible = new Map<string, boolean>();
  private currentTheme: CadTheme;
  private currentLocale: CadLocale;
  private currentShading: Shading;
  private edgesOn: boolean;
  private radius = 0;
  private width = 300;
  private height = 150;
  private frameRequested = false;
  private silentControls = false;
  private loadController: AbortController | null = null;
  private destroyed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: Cad3DViewerOptions = {},
  ) {
    this.registry = new FormatRegistry<CadScene>([
      ...BUILT_IN_3D_LOADERS,
      ...(options.loaders ?? []),
    ]);
    this.currentTheme = options.theme ?? "dark";
    this.currentLocale = resolveLocale(options.locale);
    this.currentShading = options.shading ?? "shaded";
    this.edgesOn = options.edges ?? true;
    this.up = options.upAxis ?? "z";
    this.pixelRatio = options.pixelRatio ?? (globalThis.devicePixelRatio || 1);

    const canvas = container.ownerDocument.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    Object.assign(canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      outline: "none",
    });
    container.appendChild(canvas);
    this.canvas = canvas;
    this.applyLocale();
    try {
      this.renderer = new WebGLRenderer({ canvas, antialias: true });
    } catch (cause) {
      canvas.remove();
      throw new CadViewerError("webgl-unavailable", "WebGL is not available in this browser.", {
        params: {},
        cause,
      });
    }
    this.renderer.setPixelRatio(this.pixelRatio);

    this.camera = new PerspectiveCamera(FOV_DEGREES, 1, 0.01, 1000);
    if (this.up === "z") this.camera.up.set(0, 0, 1);
    const sky = new HemisphereLight(0xffffff, 0x8a8f99, 1.6);
    sky.position.copy(this.camera.up);
    // A headlight: it follows the camera, so the side you look at is always lit.
    const key = new DirectionalLight(0xffffff, 1.8);
    key.position.set(0.4, 0.6, 1);
    this.camera.add(key);
    this.threeScene.add(sky, this.camera);
    this.applyTheme();

    if (options.interactive !== false) {
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.screenSpacePanning = true;
      this.controls.addEventListener("change", () => {
        if (this.silentControls) return;
        this.cameraChanged();
      });
    } else {
      this.controls = null;
    }
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.destroyed) this.resize();
      });
      this.resizeObserver.observe(container);
    }
    this.measureSize();
    this.placeCamera({ target: { x: 0, y: 0, z: 0 }, ...ISOMETRIC, distance: EMPTY_DISTANCE });
    this.requestRender();
  }

  get scene(): CadScene | null {
    return this.currentScene;
  }

  get theme(): CadTheme {
    return this.currentTheme;
  }

  get locale(): CadLocale {
    return this.currentLocale;
  }

  get shading(): Shading {
    return this.currentShading;
  }

  get edges(): boolean {
    return this.edgesOn;
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  async load(
    source: CadSource,
    options: { fileName?: string; signal?: AbortSignal } = {},
  ): Promise<CadScene> {
    this.assertAlive();
    this.loadController?.abort();
    const controller = new AbortController();
    this.loadController = controller;
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener("abort", () => controller.abort(), { once: true });

    const initialName = options.fileName ?? sourceName(source);
    this.emitter.emit("load-start", initialName ? { fileName: initialName } : {});
    try {
      const read = await readCadSource(source, {
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
        ...(this.options.requestInit ? { requestInit: this.options.requestInit } : {}),
        signal: controller.signal,
      });
      if (controller.signal.aborted) throw abortError();
      const fileName = options.fileName ?? read.fileName ?? initialName;
      const scene = await this.registry.load(read.bytes, {
        ...(fileName ? { fileName } : {}),
        signal: controller.signal,
        onProgress: (progress) => {
          if (this.loadController === controller) this.emitter.emit("load-progress", progress);
        },
      });
      if (controller.signal.aborted || this.destroyed) throw abortError();
      this.show(scene, fileName);
      return scene;
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

  loadScene(scene: CadScene): void {
    this.assertAlive();
    this.loadController?.abort();
    this.show(scene);
  }

  clear(): void {
    this.assertAlive();
    this.loadController?.abort();
    this.removeModel();
    this.currentScene = null;
    this.radius = 0;
    this.emitter.emit("layers-change", { layers: [] });
    this.requestRender();
  }

  private show(scene: CadScene, fileName?: string): void {
    this.removeModel();
    this.currentScene = scene;
    for (const layer of scene.layers.values()) this.layerVisible.set(layer.name, layer.visible);
    this.built = buildThreeScene(scene, { shading: this.currentShading, edges: this.edgesOn });
    this.threeScene.add(this.built.root);
    this.fit(ISOMETRIC);
    this.emitter.emit("layers-change", { layers: this.getLayers() });
    this.emitter.emit("loaded", fileName ? { scene, fileName } : { scene });
  }

  private removeModel(): void {
    if (this.built) {
      this.threeScene.remove(this.built.root);
      this.built.dispose();
      this.built = null;
    }
    this.layerVisible.clear();
  }

  // ── Camera ───────────────────────────────────────────────────────────────

  zoomExtents(): void {
    this.assertAlive();
    const { azimuth, elevation } = this.getCamera();
    this.fit({ azimuth, elevation });
  }

  getCamera(): OrbitState {
    const target = this.controls?.target ?? this.target;
    return orbitFromPosition(this.camera.position, target, this.up);
  }

  setCamera(update: CameraUpdate): void {
    this.assertAlive();
    this.placeCamera({ ...this.getCamera(), ...update });
    this.cameraChanged();
  }

  private fit(orientation: { azimuth: number; elevation: number }): void {
    const bounds = this.currentScene?.bounds;
    if (!bounds) {
      this.radius = 0;
      this.setCamera({ target: { x: 0, y: 0, z: 0 }, ...orientation, distance: EMPTY_DISTANCE });
      return;
    }
    const target = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    };
    this.radius =
      Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ) /
      2;
    const padding = this.options.zoomPadding ?? 0.05;
    const distance = fitDistance(this.radius, FOV, this.width / this.height, padding);
    this.setCamera({ target, ...orientation, distance });
  }

  private placeCamera(state: OrbitState): void {
    const position = orbitPosition(state, this.up);
    this.camera.position.set(position.x, position.y, position.z);
    this.target.set(state.target.x, state.target.y, state.target.z);
    this.camera.lookAt(this.target);
    if (this.controls) {
      this.controls.target.copy(this.target);
      this.silentControls = true;
      this.controls.update();
      this.silentControls = false;
    }
  }

  private cameraChanged(): void {
    // Keep the depth range proportional to the view so close-ups and whole models both work.
    const distance = this.camera.position.distanceTo(this.controls?.target ?? this.target);
    this.camera.near = Math.max(distance * 1e-3, 1e-6);
    this.camera.far = distance * 2 + this.radius * 4 + 1;
    this.camera.updateProjectionMatrix();
    this.emitter.emit("camera-change", this.getCamera());
    this.requestRender();
  }

  // ── Layers and display ───────────────────────────────────────────────────

  getLayers(): Layer3DInfo[] {
    const scene = this.currentScene;
    if (!scene) return [];
    return [...scene.layers.values()].map((layer) => ({
      name: layer.name,
      visible: this.layerVisible.get(layer.name) ?? true,
      meshCount: scene.meshes.filter((mesh) => mesh.layer === layer.name).length,
      triangleCount: triangleCount(scene, layer.name),
    }));
  }

  setLayerVisible(name: string, visible: boolean): void {
    this.assertAlive();
    if (!this.layerVisible.has(name))
      throw new CadViewerError("unknown-layer", `Unknown layer "${name}".`, { params: { name } });
    this.layerVisible.set(name, visible);
    this.built?.setLayerVisible(name, visible);
    this.layersChanged();
  }

  setAllLayersVisible(visible: boolean): void {
    this.assertAlive();
    for (const name of this.layerVisible.keys()) {
      this.layerVisible.set(name, visible);
      this.built?.setLayerVisible(name, visible);
    }
    this.layersChanged();
  }

  private layersChanged(): void {
    this.emitter.emit("layers-change", { layers: this.getLayers() });
    this.requestRender();
  }

  setTheme(theme: CadTheme): void {
    this.assertAlive();
    this.currentTheme = theme;
    this.applyTheme();
    this.requestRender();
  }

  setLocale(locale: string): void {
    this.assertAlive();
    const resolved = resolveLocale(locale);
    if (resolved === this.currentLocale) return;
    this.currentLocale = resolved;
    this.applyLocale();
  }

  setShading(shading: Shading): void {
    this.assertAlive();
    this.currentShading = shading;
    this.built?.setShading(shading);
    this.requestRender();
  }

  setEdges(visible: boolean): void {
    this.assertAlive();
    this.edgesOn = visible;
    this.built?.setEdges(visible);
    this.requestRender();
  }

  formatError(error: unknown): string {
    return formatCadError(error, this.currentLocale);
  }

  private applyTheme(): void {
    this.threeScene.background = new Color(
      this.options.background ?? BACKGROUNDS[this.currentTheme],
    );
  }

  private applyLocale(): void {
    this.canvas.setAttribute("lang", this.currentLocale);
    this.canvas.setAttribute("aria-label", MESSAGES_3D[this.currentLocale].canvasLabel);
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  exportImage(options: ExportImage3DOptions = {}): Promise<Blob> {
    this.assertAlive();
    const scale = options.scale ?? this.pixelRatio;
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.render(this.threeScene, this.camera);
    // toBlob snapshots the drawing buffer synchronously, so restoring right after is safe.
    const blob = new Promise<Blob>((resolve, reject) => {
      this.canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(
                new CadViewerError("image-export-failed", "Image export failed.", { params: {} }),
              ),
        options.type ?? "image/png",
      );
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.render(this.threeScene, this.camera);
    return blob;
  }

  resize(): void {
    this.assertAlive();
    this.measureSize();
    this.requestRender();
  }

  private measureSize(): void {
    this.width = this.container.clientWidth || 300;
    this.height = this.container.clientHeight || 150;
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  private requestRender(): void {
    if (this.destroyed || this.frameRequested) return;
    this.frameRequested = true;
    const draw = () => {
      this.frameRequested = false;
      if (!this.destroyed) this.renderer.render(this.threeScene, this.camera);
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(draw);
    else setTimeout(draw, 16);
  }

  // ── Events and teardown ──────────────────────────────────────────────────

  on<K extends Cad3DViewerEventName>(event: K, listener: Cad3DViewerListener<K>): () => void {
    this.assertAlive();
    return this.emitter.on(event, listener);
  }

  off<K extends Cad3DViewerEventName>(event: K, listener: Cad3DViewerListener<K>): void {
    this.emitter.off(event, listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.loadController?.abort();
    this.controls?.dispose();
    this.resizeObserver?.disconnect();
    this.removeModel();
    this.renderer.dispose();
    this.emitter.clear();
    this.canvas.remove();
    this.destroyed = true;
    this.currentScene = null;
  }

  private assertAlive(): void {
    if (this.destroyed)
      throw new CadViewerError("destroyed", "CadViewer has been destroyed.", { params: {} });
  }
}
