// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CadLoadError } from "../../src/loaders/errors";
import type { FormatLoader } from "../../src/loaders/types";
import type { CadDocument } from "../../src/model/types";
import type { CadViewerEventName, CadViewerEvents } from "../../src/viewer/types";
import { line } from "../render/helpers";
import { click, documentWith, pointer, setup } from "./setup";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const drawing = () => documentWith([line(0, 0, 100, 50)]);

function record<K extends CadViewerEventName>(
  viewer: ReturnType<typeof setup>["viewer"],
  ...names: K[]
) {
  const events: [K, CadViewerEvents[K]][] = [];
  for (const name of names) viewer.on(name, (payload) => events.push([name, payload]));
  return events;
}

function fakeLoader(load: FormatLoader["load"]): FormatLoader {
  return { id: "fake", extensions: [".fake"], canLoad: () => false, load };
}

describe("CadViewer lifecycle", () => {
  it("adds a focusable canvas to the container", () => {
    const { canvas } = setup();
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it("destroy() removes the canvas and later calls throw", () => {
    const { viewer, container } = setup();
    viewer.destroy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(() => viewer.zoomExtents()).toThrow("CadViewer has been destroyed.");
    expect(() => viewer.loadDocument(drawing())).toThrow("CadViewer has been destroyed.");
  });
});

describe("CadViewer view", () => {
  it("loadDocument() shows the model and zooms to extents with padding", () => {
    const { viewer } = setup();
    const events = record(viewer, "loaded", "layout-change", "layers-change");
    const document = drawing();
    viewer.loadDocument(document);
    expect(viewer.document).toBe(document);
    expect(viewer.activeLayout).toBe("Model");
    const view = viewer.getView();
    expect(view.center).toEqual({ x: 50, y: 25 });
    expect(view.scale).toBeCloseTo(7.2);
    expect(events.map(([name]) => name)).toEqual(["layers-change", "layout-change", "loaded"]);
  });

  it("converts between screen and world coordinates (y up)", () => {
    const { viewer } = setup();
    viewer.loadDocument(drawing());
    expect(viewer.worldToScreen({ x: 50, y: 25 })).toEqual({ x: 400, y: 300 });
    const world = viewer.screenToWorld(472, 228);
    expect(world.x).toBeCloseTo(60);
    expect(world.y).toBeCloseTo(35);
  });

  it("zoomIn/zoomOut scale around the center and emit view-change", () => {
    const { viewer } = setup();
    viewer.loadDocument(drawing());
    const events = record(viewer, "view-change");
    viewer.zoomIn(2);
    expect(viewer.getView().scale).toBeCloseTo(14.4);
    expect(viewer.getView().center).toEqual({ x: 50, y: 25 });
    viewer.zoomOut(2);
    expect(viewer.getView().scale).toBeCloseTo(7.2);
    expect(events).toHaveLength(2);
  });

  it("wheel zoom keeps the world point under the cursor", () => {
    const { viewer, canvas } = setup();
    viewer.loadDocument(drawing());
    const before = viewer.screenToWorld(100, 100);
    const wheel = new WheelEvent("wheel", { deltaY: -200, bubbles: true, cancelable: true });
    // happy-dom's WheelEvent does not carry mouse coordinates.
    Object.defineProperties(wheel, { clientX: { value: 100 }, clientY: { value: 100 } });
    canvas.dispatchEvent(wheel);
    const after = viewer.screenToWorld(100, 100);
    expect(viewer.getView().scale).toBeGreaterThan(7.2);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("dragging pans the view", () => {
    const { viewer, canvas } = setup();
    viewer.loadDocument(drawing());
    pointer(canvas, "pointerdown", 100, 100);
    pointer(canvas, "pointermove", 172, 100);
    pointer(canvas, "pointerup", 172, 100);
    expect(viewer.getView().center.x).toBeCloseTo(40);
  });

  it("getExtents() falls back to the header extents for an empty model", () => {
    const { viewer } = setup();
    viewer.loadDocument(
      documentWith([], (d) => (d.header.extents = { minX: 0, minY: 0, maxX: 10, maxY: 10 })),
    );
    expect(viewer.getExtents()).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});

describe("CadViewer loading", () => {
  it("loads bytes through a registered loader and emits load-start then loaded", async () => {
    const document = drawing();
    const { viewer } = setup({ loaders: [fakeLoader(async () => document)] });
    const events = record(viewer, "load-start", "loaded");
    await expect(viewer.load(new Uint8Array([1]), { fileName: "a.fake" })).resolves.toBe(document);
    expect(events).toEqual([
      ["load-start", { fileName: "a.fake" }],
      ["loaded", { document, fileName: "a.fake" }],
    ]);
  });

  it("takes the file name from a File", async () => {
    const load = vi.fn(async () => drawing());
    const { viewer } = setup({ loaders: [fakeLoader(load)] });
    await viewer.load(new File([new Uint8Array([1, 2])], "plan.fake"));
    expect(load).toHaveBeenCalledWith(
      new Uint8Array([1, 2]),
      expect.objectContaining({ fileName: "plan.fake" }),
    );
  });

  it("parses DXF out of the box", async () => {
    const { viewer } = setup();
    const text =
      "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nA\n10\n0\n20\n0\n11\n5\n21\n5\n0\nENDSEC\n0\nEOF\n";
    const document = await viewer.load(new TextEncoder().encode(text), { fileName: "x.dxf" });
    expect(document.format).toBe("dxf");
    expect(viewer.getLayers().map((layer) => layer.name)).toContain("A");
  });

  it("fetches URLs and reports HTTP failures as fetch-failed, keeping the previous drawing", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 404 }));
    const { viewer } = setup({ fetch: fetch as unknown as typeof globalThis.fetch });
    const previous = drawing();
    viewer.loadDocument(previous);
    const events = record(viewer, "error", "loaded");
    const error = (await viewer
      .load("https://example.com/plans/a.dxf")
      .catch((e: unknown) => e)) as CadLoadError;
    expect(error).toBeInstanceOf(CadLoadError);
    expect(error.code).toBe("fetch-failed");
    expect(error.message).toBe('Failed to fetch "https://example.com/plans/a.dxf": HTTP 404');
    expect(events).toEqual([["error", { error }]]);
    expect(viewer.document).toBe(previous);
  });

  it("names URL sources after their last path segment", async () => {
    const load = vi.fn(async () => drawing());
    const fetch = vi.fn(async () => new Response(new Uint8Array([7])));
    const { viewer } = setup({
      fetch: fetch as unknown as typeof globalThis.fetch,
      loaders: [fakeLoader(load)],
    });
    await viewer.load("https://example.com/files/My%20Plan.fake?v=2");
    expect(load).toHaveBeenCalledWith(
      new Uint8Array([7]),
      expect.objectContaining({ fileName: "My Plan.fake" }),
    );
  });

  it("a newer load aborts the older one, which rejects with aborted and emits nothing", async () => {
    let release: (document: CadDocument) => void = () => {};
    const slow = new Promise<CadDocument>((resolve) => {
      release = resolve;
    });
    const second = drawing();
    const load = vi.fn().mockReturnValueOnce(slow).mockResolvedValueOnce(second);
    const { viewer } = setup({ loaders: [fakeLoader(load)] });
    const events = record(viewer, "loaded", "error");
    const first = viewer.load(new Uint8Array([1]), { fileName: "1.fake" });
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const latest = viewer.load(new Uint8Array([2]), { fileName: "2.fake" });
    release(drawing());
    const firstError = (await first.catch((e: unknown) => e)) as CadLoadError;
    await latest;
    expect(firstError.code).toBe("aborted");
    expect(events).toEqual([["loaded", { document: second, fileName: "2.fake" }]]);
    expect(viewer.document).toBe(second);
  });

  it("clear() removes the document", () => {
    const { viewer } = setup();
    viewer.loadDocument(drawing());
    viewer.clear();
    expect(viewer.document).toBeNull();
    expect(viewer.activeLayout).toBeNull();
    expect(viewer.getLayers()).toEqual([]);
  });
});

describe("CadViewer layers and layouts", () => {
  const layered = () =>
    documentWith(
      [line(0, 0, 1, 1, { layer: "A" }), line(0, 0, 1, 1, { layer: "B" })],
      (document) => {
        document.layers.set("A", {
          name: "A",
          color: { kind: "aci", index: 1 },
          visible: true,
          frozen: false,
          locked: false,
        });
        document.layers.set("B", {
          name: "B",
          color: { kind: "aci", index: 3 },
          visible: false,
          frozen: false,
          locked: false,
        });
        document.layers.set("F", {
          name: "F",
          color: { kind: "aci", index: 5 },
          visible: true,
          frozen: true,
          locked: false,
        });
        document.layouts.push({ name: "Sheet", isModel: false, tabOrder: 1, entities: [] });
      },
    );

  it("reports layers with resolved colors, visibility and counts", () => {
    const { viewer } = setup();
    viewer.loadDocument(layered());
    expect(viewer.getLayers()).toEqual([
      { name: "0", color: "#ffffff", visible: true, frozen: false, entityCount: 0 },
      { name: "A", color: "#ff0000", visible: true, frozen: false, entityCount: 1 },
      { name: "B", color: "#00ff00", visible: false, frozen: false, entityCount: 1 },
      { name: "F", color: "#0000ff", visible: false, frozen: true, entityCount: 0 },
    ]);
  });

  it("the theme decides the color of ACI 7 layers", () => {
    const { viewer } = setup({ theme: "light" });
    viewer.loadDocument(layered());
    expect(viewer.getLayers()[0]?.color).toBe("#000000");
  });

  it("setLayerVisible toggles a layer and emits layers-change", () => {
    const { viewer } = setup();
    viewer.loadDocument(layered());
    const events = record(viewer, "layers-change");
    viewer.setLayerVisible("A", false);
    expect(viewer.getLayers().find((layer) => layer.name === "A")?.visible).toBe(false);
    expect(events).toHaveLength(1);
    viewer.setAllLayersVisible(true);
    expect(viewer.getLayers().every((layer) => layer.visible)).toBe(true);
  });

  it("rejects unknown layers and layouts with exact messages", () => {
    const { viewer } = setup();
    viewer.loadDocument(layered());
    expect(() => viewer.setLayerVisible("Nope", true)).toThrow('Unknown layer "Nope".');
    expect(() => viewer.setLayout("Nope")).toThrow('Unknown layout "Nope".');
  });

  it("switches layouts and emits layout-change", () => {
    const { viewer } = setup();
    viewer.loadDocument(layered());
    const events = record(viewer, "layout-change");
    viewer.setLayout("Sheet");
    expect(viewer.activeLayout).toBe("Sheet");
    expect(viewer.getLayouts()).toEqual([
      { name: "Model", isModel: true, active: false },
      { name: "Sheet", isModel: false, active: true },
    ]);
    expect(events).toEqual([
      ["layout-change", { layout: { name: "Sheet", isModel: false, active: true } }],
    ]);
  });
});

describe("CadViewer picking and tools", () => {
  it("pickAt() finds the entity near the cursor", () => {
    const { viewer } = setup();
    const entity = line(0, 0, 100, 50);
    viewer.loadDocument(documentWith([entity]));
    const onLine = viewer.worldToScreen({ x: 50, y: 25 });
    const pick = viewer.pickAt(onLine.x, onLine.y + 3);
    expect(pick).toMatchObject({ entity, type: "line", layer: "0", blockPath: [] });
    expect(viewer.pickAt(onLine.x, onLine.y + 40)).toBeNull();
  });

  it("a click selects and emits select; clearSelection() clears it", () => {
    const { viewer, canvas } = setup();
    viewer.loadDocument(drawing());
    const events = record(viewer, "select");
    const onLine = viewer.worldToScreen({ x: 50, y: 25 });
    click(canvas, onLine.x, onLine.y);
    expect(viewer.selection?.type).toBe("line");
    viewer.clearSelection();
    expect(viewer.selection).toBeNull();
    expect(events.map(([, payload]) => payload.pick?.type ?? null)).toEqual(["line", null]);
  });

  it("measure tool emits the distance between two clicks", () => {
    const { viewer, canvas } = setup();
    viewer.loadDocument(drawing());
    viewer.setTool("measure");
    const events = record(viewer, "measure");
    const a = viewer.worldToScreen({ x: 0, y: 0 });
    const b = viewer.worldToScreen({ x: 30, y: 40 });
    click(canvas, a.x, a.y);
    click(canvas, b.x, b.y);
    const [[, result] = []] = events;
    expect(result?.distance).toBeCloseTo(50);
    expect(result?.dx).toBeCloseTo(30);
    expect(result?.dy).toBeCloseTo(40);
    expect(result?.angle).toBeCloseTo(Math.atan2(40, 30));
  });

  it("zoom-window zooms into the dragged rectangle and returns to pan", () => {
    const { viewer, canvas } = setup();
    viewer.loadDocument(drawing());
    const events = record(viewer, "tool-change");
    viewer.setTool("zoom-window");
    const a = viewer.worldToScreen({ x: 0, y: 0 });
    const b = viewer.worldToScreen({ x: 10, y: 10 });
    pointer(canvas, "pointerdown", a.x, a.y);
    pointer(canvas, "pointermove", b.x, b.y);
    pointer(canvas, "pointerup", b.x, b.y);
    expect(viewer.getView().center.x).toBeCloseTo(5);
    expect(viewer.getView().center.y).toBeCloseTo(5);
    expect(viewer.tool).toBe("pan");
    expect(events.map(([, payload]) => payload.tool)).toEqual(["zoom-window", "pan"]);
  });

  it("interactive: false ignores pointer input", () => {
    const { viewer, canvas } = setup({ interactive: false });
    viewer.loadDocument(drawing());
    const onLine = viewer.worldToScreen({ x: 50, y: 25 });
    click(canvas, onLine.x, onLine.y);
    expect(viewer.selection).toBeNull();
  });
});

describe("CadViewer events and export", () => {
  it("on() returns an unsubscribe function", () => {
    const { viewer } = setup();
    const listener = vi.fn();
    const off = viewer.on("view-change", listener);
    viewer.loadDocument(drawing());
    off();
    viewer.zoomIn();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not stop the others", () => {
    const { viewer } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const second = vi.fn();
    viewer.on("loaded", () => {
      throw new Error("boom");
    });
    viewer.on("loaded", second);
    viewer.loadDocument(drawing());
    expect(second).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
  });

  it("exportImage() resolves with the canvas blob", async () => {
    const { viewer } = setup();
    viewer.loadDocument(drawing());
    const blob = new Blob(["png"], { type: "image/png" });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(blob),
    );
    await expect(viewer.exportImage()).resolves.toBe(blob);
  });

  it("exportImage() rejects when the browser cannot encode", async () => {
    const { viewer } = setup();
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(null),
    );
    await expect(viewer.exportImage()).rejects.toThrow("Image export failed.");
  });

  it("draws primitives on the canvas", () => {
    const { viewer, context } = setup();
    viewer.loadDocument(drawing());
    expect(context.calls).toContain("lineTo");
    expect(context.calls).toContain("stroke");
  });
});
