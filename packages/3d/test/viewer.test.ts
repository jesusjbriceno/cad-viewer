// @vitest-environment happy-dom
import {
  CadLoadError,
  type CadMesh,
  type CadScene,
  CadViewerError,
  createEmptyScene,
  type FormatLoader,
  formatCadError,
  sceneBounds,
} from "@cadscene/core";
import { Color, type PerspectiveCamera, type Scene } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitDistance, ISOMETRIC } from "../src/render/camera";
import { Cad3DViewer } from "../src/viewer/Cad3DViewer";
import type {
  Cad3DViewerEventName,
  Cad3DViewerEvents,
  Cad3DViewerOptions,
} from "../src/viewer/types";

const { FakeRenderer } = vi.hoisted(() => {
  /** Stand-in for WebGLRenderer (happy-dom has no WebGL): records calls and the last frame. */
  class FakeRenderer {
    static instances: FakeRenderer[] = [];
    static fail = false;
    readonly calls: [string, ...unknown[]][] = [];
    readonly domElement: HTMLCanvasElement;
    lastScene: unknown;
    lastCamera: unknown;
    private ratio = 1;

    constructor(parameters: { canvas: HTMLCanvasElement }) {
      if (FakeRenderer.fail) throw new Error("Error creating WebGL context.");
      this.domElement = parameters.canvas;
      FakeRenderer.instances.push(this);
    }
    setPixelRatio(ratio: number) {
      this.ratio = ratio;
      this.calls.push(["setPixelRatio", ratio]);
    }
    getPixelRatio() {
      return this.ratio;
    }
    setSize(width: number, height: number, updateStyle?: boolean) {
      this.calls.push(["setSize", width, height, updateStyle]);
    }
    render(scene: unknown, camera: unknown) {
      this.lastScene = scene;
      this.lastCamera = camera;
      this.calls.push(["render", this.ratio]);
    }
    dispose() {
      this.calls.push(["dispose"]);
    }
  }
  return { FakeRenderer };
});

vi.mock("three", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three")>()),
  WebGLRenderer: FakeRenderer,
}));

const renderer = () => {
  const instance = FakeRenderer.instances.at(-1);
  if (!instance) throw new Error("no renderer");
  return instance;
};

function cube(name: string, layer: string, offset = 0): CadMesh {
  const v = (x: number, y: number, z: number) => [x + offset, y, z];
  const quads = [
    [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0)],
    [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)],
    [v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(0, 1, 0), v(0, 1, 1), v(0, 0, 1)],
    [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)],
  ];
  const positions = quads.flatMap(([a = [], b = [], c = [], d = []]) => [
    ...a,
    ...b,
    ...c,
    ...a,
    ...c,
    ...d,
  ]);
  return { name, layer, material: "default", positions: new Float32Array(positions) };
}

/** Two unit cubes: "base" on layer A at x 0..1, "lid" on layer B at x 2..3. */
function model(): CadScene {
  const scene = createEmptyScene("test");
  scene.meshes = [cube("base", "A"), cube("lid", "B", 2)];
  scene.layers.set("A", { name: "A", visible: true });
  scene.layers.set("B", { name: "B", visible: true });
  scene.bounds = sceneBounds(scene.meshes);
  return scene;
}

const ASCII_STL =
  "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n";
const OBJ = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
const encode = (text: string) => new TextEncoder().encode(text);

function setup(options: Cad3DViewerOptions = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const viewer = new Cad3DViewer(container, { pixelRatio: 1, ...options });
  const canvas = container.querySelector("canvas") as HTMLCanvasElement;
  return { container, viewer, canvas };
}

function record<K extends Cad3DViewerEventName>(viewer: Cad3DViewer, ...names: K[]) {
  const events: [K, Cad3DViewerEvents[K]][] = [];
  for (const name of names) viewer.on(name, (payload) => events.push([name, payload]));
  return events;
}

function caught(run: () => unknown): CadViewerError {
  try {
    run();
  } catch (error) {
    return error as CadViewerError;
  }
  throw new Error("expected a throw");
}

beforeEach(() => {
  FakeRenderer.instances = [];
  FakeRenderer.fail = false;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Cad3DViewer lifecycle", () => {
  it("adds a labelled, focusable canvas sized to the container", () => {
    const { canvas } = setup();
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.getAttribute("aria-label")).toBe("Modelo 3D");
    expect(canvas.getAttribute("lang")).toBe("es-ES");
    expect(renderer().domElement).toBe(canvas);
    expect(renderer().calls).toContainEqual(["setSize", 800, 600, false]);
  });

  it("follows the locale option and setLocale(), and formats errors in it", () => {
    const { viewer, canvas } = setup({ locale: "en-GB" });
    expect(viewer.locale).toBe("en");
    expect(canvas.getAttribute("aria-label")).toBe("3D model");
    const error = new CadViewerError(
      "webgl-unavailable",
      "WebGL is not available in this browser.",
    );
    expect(viewer.formatError(error)).toBe("WebGL is not available in this browser.");
    viewer.setLocale("es");
    expect(viewer.locale).toBe("es-ES");
    expect(canvas.getAttribute("aria-label")).toBe("Modelo 3D");
    expect(canvas.getAttribute("lang")).toBe("es-ES");
    expect(viewer.formatError(error)).toBe("WebGL no está disponible en este navegador.");
  });

  it("throws webgl-unavailable and leaves no canvas behind when WebGL cannot start", () => {
    FakeRenderer.fail = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const error = caught(() => new Cad3DViewer(container));
    expect(error).toBeInstanceOf(CadViewerError);
    expect(error.code).toBe("webgl-unavailable");
    expect(error.message).toBe(formatCadError(error, "en"));
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("destroy() disposes the renderer, removes the canvas and later calls throw", () => {
    const { viewer, container } = setup();
    viewer.loadScene(model());
    viewer.destroy();
    expect(renderer().calls).toContainEqual(["dispose"]);
    expect(container.querySelector("canvas")).toBeNull();
    const error = caught(() => viewer.zoomExtents());
    expect(error.code).toBe("destroyed");
    expect(error.message).toBe("CadViewer has been destroyed.");
    viewer.destroy();
  });

  it("enables orbit controls only when interactive", () => {
    expect(setup().canvas.style.touchAction).toBe("none");
    document.body.innerHTML = "";
    expect(setup({ interactive: false }).canvas.style.touchAction).not.toBe("none");
  });
});

describe("Cad3DViewer camera", () => {
  it("loadScene() shows the model from the isometric view, fitted to its bounds", () => {
    const { viewer } = setup();
    const events = record(viewer, "layers-change", "loaded", "camera-change");
    const scene = model();
    viewer.loadScene(scene);
    expect(viewer.scene).toBe(scene);
    const camera = viewer.getCamera();
    expect(camera.target.x).toBeCloseTo(1.5);
    expect(camera.target.y).toBeCloseTo(0.5);
    expect(camera.target.z).toBeCloseTo(0.5);
    expect(camera.azimuth).toBeCloseTo(ISOMETRIC.azimuth);
    expect(camera.elevation).toBeCloseTo(ISOMETRIC.elevation);
    expect(camera.distance).toBeCloseTo(
      fitDistance(Math.sqrt(11) / 2, Math.PI / 4, 800 / 600, 0.05),
    );
    expect(events.map(([name]) => name)).toEqual(["camera-change", "layers-change", "loaded"]);
    expect(renderer().lastScene).toBeDefined();
  });

  it("setCamera() merges a partial orbit and emits camera-change", () => {
    const { viewer } = setup();
    viewer.loadScene(model());
    const events = record(viewer, "camera-change");
    viewer.setCamera({ azimuth: 1, elevation: 0.2 });
    const camera = viewer.getCamera();
    expect(camera.azimuth).toBeCloseTo(1);
    expect(camera.elevation).toBeCloseTo(0.2);
    expect(camera.target.x).toBeCloseTo(1.5);
    expect(events).toHaveLength(1);
    expect(events[0]?.[1].azimuth).toBeCloseTo(1);
  });

  it("zoomExtents() keeps the orientation and refits the target and distance", () => {
    const { viewer } = setup();
    viewer.loadScene(model());
    const fitted = viewer.getCamera().distance;
    viewer.setCamera({ azimuth: 2, distance: 500, target: { x: 9, y: 9, z: 9 } });
    viewer.zoomExtents();
    const camera = viewer.getCamera();
    expect(camera.azimuth).toBeCloseTo(2);
    expect(camera.distance).toBeCloseTo(fitted);
    expect(camera.target.x).toBeCloseTo(1.5);
  });

  it("frames the origin when there is no geometry", () => {
    const { viewer } = setup();
    viewer.loadScene(createEmptyScene("test"));
    const camera = viewer.getCamera();
    expect(camera.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(camera.distance).toBeGreaterThan(0);
  });

  it("uses Z-up by default and Y-up on request", () => {
    setup().viewer.loadScene(model());
    expect((renderer().lastCamera as PerspectiveCamera).up.toArray()).toEqual([0, 0, 1]);
    document.body.innerHTML = "";
    setup({ upAxis: "y" }).viewer.loadScene(model());
    expect((renderer().lastCamera as PerspectiveCamera).up.toArray()).toEqual([0, 1, 0]);
  });
});

describe("Cad3DViewer layers and display", () => {
  it("lists layers with mesh and triangle counts", () => {
    const { viewer } = setup();
    expect(viewer.getLayers()).toEqual([]);
    viewer.loadScene(model());
    expect(viewer.getLayers()).toEqual([
      { name: "A", visible: true, meshCount: 1, triangleCount: 12 },
      { name: "B", visible: true, meshCount: 1, triangleCount: 12 },
    ]);
  });

  it("toggles layers, emits layers-change and rejects unknown layers with a code", () => {
    const { viewer } = setup();
    viewer.loadScene(model());
    const events = record(viewer, "layers-change");
    viewer.setLayerVisible("B", false);
    expect(viewer.getLayers().map((layer) => layer.visible)).toEqual([true, false]);
    viewer.setAllLayersVisible(false);
    expect(viewer.getLayers().every((layer) => !layer.visible)).toBe(true);
    viewer.setAllLayersVisible(true);
    expect(events).toHaveLength(3);
    const error = caught(() => viewer.setLayerVisible("Nope", true));
    expect(error.code).toBe("unknown-layer");
    expect(error.params).toEqual({ name: "Nope" });
    expect(error.message).toBe(formatCadError(error, "en"));
    expect(events).toHaveLength(3);
  });

  it("switches shading and edges, keeping the state readable", () => {
    const { viewer } = setup({ shading: "wireframe", edges: false });
    expect([viewer.shading, viewer.edges]).toEqual(["wireframe", false]);
    viewer.loadScene(model());
    viewer.setShading("shaded");
    viewer.setEdges(true);
    expect([viewer.shading, viewer.edges]).toEqual(["shaded", true]);
  });

  it("paints the theme background, and a background option overrides it", () => {
    const { viewer } = setup();
    viewer.loadScene(model());
    const background = () => ((renderer().lastScene as Scene).background as Color).getHex();
    expect(viewer.theme).toBe("dark");
    expect(background()).toBe(new Color("#1e1e1e").getHex());
    viewer.setTheme("light");
    expect(background()).toBe(0xffffff);
    document.body.innerHTML = "";
    setup({ background: "#336699" }).viewer.loadScene(model());
    expect(background()).toBe(0x336699);
  });
});

describe("Cad3DViewer loading", () => {
  it("loads STL and OBJ bytes through the built-in loaders", async () => {
    const { viewer } = setup();
    const events = record(viewer, "load-start", "load-progress", "loaded");
    const stl = await viewer.load(encode(ASCII_STL), { fileName: "part.stl" });
    expect(stl.format).toBe("stl");
    const obj = await viewer.load(encode(OBJ), { fileName: "part.obj" });
    expect(obj.format).toBe("obj");
    expect(viewer.scene).toBe(obj);
    expect(events.filter(([name]) => name === "load-start").map(([, p]) => p)).toEqual([
      { fileName: "part.stl" },
      { fileName: "part.obj" },
    ]);
    expect(events.filter(([name]) => name === "loaded").map(([, p]) => p)).toEqual([
      { scene: stl, fileName: "part.stl" },
      { scene: obj, fileName: "part.obj" },
    ]);
  });

  it("rejects unknown formats with unsupported-format, emits error and keeps the model", async () => {
    const { viewer } = setup();
    const previous = model();
    viewer.loadScene(previous);
    const events = record(viewer, "error", "loaded");
    const error = (await viewer
      .load(new Uint8Array([0, 1, 2]), { fileName: "x.step" })
      .catch((e: unknown) => e)) as CadLoadError;
    expect(error).toBeInstanceOf(CadLoadError);
    expect(error.code).toBe("unsupported-format");
    expect(events).toEqual([["error", { error }]]);
    expect(viewer.scene).toBe(previous);
  });

  it("a newer load aborts the older one silently", async () => {
    const slow: FormatLoader<CadScene> = {
      id: "slow",
      extensions: [".slow"],
      canLoad: () => false,
      load: () => new Promise((resolve) => setTimeout(() => resolve(model()), 20)),
    };
    const { viewer } = setup({ loaders: [slow] });
    const events = record(viewer, "error", "loaded");
    const first = viewer.load(new Uint8Array([1]), { fileName: "a.slow" });
    const second = viewer.load(new Uint8Array([2]), { fileName: "b.slow" });
    const error = (await first.catch((e: unknown) => e)) as CadLoadError;
    await second;
    expect(error.code).toBe("aborted");
    expect(events.map(([name]) => name)).toEqual(["loaded"]);
  });

  it("clear() removes the model and its layers", () => {
    const { viewer } = setup();
    viewer.loadScene(model());
    const events = record(viewer, "layers-change");
    viewer.clear();
    expect(viewer.scene).toBeNull();
    expect(viewer.getLayers()).toEqual([]);
    expect(events).toEqual([["layers-change", { layers: [] }]]);
  });
});

describe("Cad3DViewer image export", () => {
  it("renders at the requested scale, restores the pixel ratio and resolves the blob", async () => {
    const { viewer } = setup();
    viewer.loadScene(model());
    const blob = new Blob(["png"], { type: "image/png" });
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(blob));
    renderer().calls.length = 0;
    await expect(viewer.exportImage({ scale: 2 })).resolves.toBe(blob);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(renderer().calls).toEqual([
      ["setPixelRatio", 2],
      ["setSize", 800, 600, false],
      ["render", 2],
      ["setPixelRatio", 1],
      ["setSize", 800, 600, false],
      ["render", 1],
    ]);
  });

  it("rejects with image-export-failed when the browser cannot encode", async () => {
    const { viewer } = setup();
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(null),
    );
    const error = (await viewer.exportImage().catch((e: unknown) => e)) as CadViewerError;
    expect(error).toBeInstanceOf(CadViewerError);
    expect(error.code).toBe("image-export-failed");
    expect(error.message).toBe("Image export failed.");
  });
});
