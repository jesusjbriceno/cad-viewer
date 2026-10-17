import { act, cleanup, render } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Fake3DViewer } from "./fake3DViewer";

vi.mock("@jesusjbriceno/cad-viewer-3d", async () => ({
  Cad3DViewer: (await import("./fake3DViewer")).Fake3DViewer,
}));

const { Cad3DViewer, useCad3DViewerRef } = await import("../src/3d");

beforeEach(() => {
  Fake3DViewer.instances = [];
});
afterEach(() => cleanup());

const viewer = () => {
  const instance = Fake3DViewer.instances.at(-1);
  if (!instance) throw new Error("no viewer");
  return instance;
};

describe("<Cad3DViewer> (React)", () => {
  it("renders a full-size container and creates one viewer with the creation options", () => {
    const { container } = render(
      createElement(Cad3DViewer, {
        upAxis: "y",
        interactive: false,
        zoomPadding: 0.2,
        pixelRatio: 2,
        background: "#101010",
        className: "mine",
        id: "v",
      }),
    );
    const element = container.firstElementChild as HTMLElement;
    expect(Fake3DViewer.instances).toHaveLength(1);
    expect(viewer().container).toBe(element);
    expect(element.className).toBe("cad-viewer-3d mine");
    expect(element.id).toBe("v");
    expect(element.style.width).toBe("100%");
    expect(viewer().options).toMatchObject({
      upAxis: "y",
      interactive: false,
      zoomPadding: 0.2,
      pixelRatio: 2,
      background: "#101010",
    });
  });

  it("leaves absent options to the core defaults (locale es-ES, upAxis z)", () => {
    render(createElement(Cad3DViewer, {}));
    expect("locale" in viewer().options).toBe(false);
    expect("upAxis" in viewer().options).toBe(false);
    expect("shading" in viewer().options).toBe(false);
    expect("edges" in viewer().options).toBe(false);
    expect(viewer().callsTo("setLocale")).toEqual([]);
  });

  it("does not leak non-DOM props as attributes", () => {
    const { container } = render(
      createElement(Cad3DViewer, {
        src: "/a.stl",
        fileName: "a.stl",
        hiddenLayers: ["A"],
        locale: "en",
        upAxis: "y",
        shading: "wireframe",
        edges: false,
        onLoadStart: () => {},
      }),
    );
    const element = container.firstElementChild as HTMLElement;
    expect(element.hasAttribute("src")).toBe(false);
    expect(element.hasAttribute("filename")).toBe(false);
    expect(element.hasAttribute("hiddenlayers")).toBe(false);
    expect(element.hasAttribute("locale")).toBe(false);
    expect(element.hasAttribute("upaxis")).toBe(false);
    expect(element.hasAttribute("shading")).toBe(false);
    expect(element.hasAttribute("edges")).toBe(false);
    expect(element.hasAttribute("onloadstart")).toBe(false);
  });

  it("loads src on mount and when src or fileName change", () => {
    const { rerender } = render(createElement(Cad3DViewer, { src: "/a.stl" }));
    expect(viewer().callsTo("load")).toEqual([["/a.stl", {}]]);
    rerender(createElement(Cad3DViewer, { src: "/b.obj", fileName: "b.obj" }));
    expect(viewer().callsTo("load").at(-1)).toEqual(["/b.obj", { fileName: "b.obj" }]);
    rerender(createElement(Cad3DViewer, { src: "/b.obj", fileName: "b.obj" }));
    expect(viewer().callsTo("load")).toHaveLength(2);
  });

  it("does not turn a failed load into an unhandled rejection", async () => {
    const onError = vi.fn();
    const { rerender } = render(createElement(Cad3DViewer, { src: "/a.stl", onError }));
    rerender(createElement(Cad3DViewer, { src: "/b.stl", onError }));
    viewer().load.mockRejectedValueOnce(new Error("boom"));
    rerender(createElement(Cad3DViewer, { src: "/c.stl", onError }));
    await act(async () => {});
    expect(viewer().load).toHaveBeenCalledTimes(3);
    // The wrapper swallows the rejection instead of throwing it globally; real errors reach
    // the user through the viewer's "error" event, forwarded here to onError.
    act(() => viewer().emit("error", { error: new Error("boom") }));
    expect(onError).toHaveBeenCalledWith({ error: new Error("boom") });
  });

  it("calls the latest event callbacks with the payload", () => {
    const first = vi.fn();
    const second = vi.fn();
    const onCameraChange = vi.fn();
    const { rerender } = render(createElement(Cad3DViewer, { onLoadStart: first, onCameraChange }));
    rerender(createElement(Cad3DViewer, { onLoadStart: second, onCameraChange }));
    act(() => {
      viewer().emit("load-start", { fileName: "a.stl" });
      viewer().emit("camera-change", {
        target: { x: 0, y: 0, z: 0 },
        azimuth: 1,
        elevation: 0.5,
        distance: 10,
      });
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ fileName: "a.stl" });
    expect(onCameraChange.mock.calls[0]?.[0]).toMatchObject({ distance: 10 });
    expect(Fake3DViewer.instances).toHaveLength(1);
  });

  it("forwards load-progress, loaded, error and layers-change", () => {
    const onLoadProgress = vi.fn();
    const onLoaded = vi.fn();
    const onError = vi.fn();
    const onLayersChange = vi.fn();
    render(createElement(Cad3DViewer, { onLoadProgress, onLoaded, onError, onLayersChange }));
    act(() => {
      viewer().emit("load-progress", { phase: "parse" });
      viewer().emit("loaded", { scene: {} as never, fileName: "a.stl" });
      viewer().emit("error", { error: new Error("x") });
      viewer().emit("layers-change", { layers: [] });
    });
    expect(onLoadProgress).toHaveBeenCalledWith({ phase: "parse" });
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({ error: new Error("x") });
    expect(onLayersChange).toHaveBeenCalledWith({ layers: [] });
  });

  it("applies reactive theme, locale, shading and edges without recreating the viewer", () => {
    const { rerender } = render(createElement(Cad3DViewer, { theme: "dark" }));
    rerender(
      createElement(Cad3DViewer, {
        theme: "light",
        locale: "en",
        shading: "wireframe",
        edges: false,
      }),
    );
    expect(Fake3DViewer.instances).toHaveLength(1);
    expect(viewer().callsTo("setTheme").at(-1)).toEqual(["light"]);
    expect(viewer().callsTo("setLocale").at(-1)).toEqual(["en"]);
    expect(viewer().callsTo("setShading").at(-1)).toEqual(["wireframe"]);
    // `edges: false` is applied, not skipped as falsy.
    expect(viewer().callsTo("setEdges").at(-1)).toEqual([false]);
  });

  it("applies hiddenLayers by content (not array identity) and after each load", () => {
    const { rerender } = render(createElement(Cad3DViewer, { hiddenLayers: ["A", "Missing"] }));
    expect(viewer().callsTo("setLayerVisible")).toEqual([["A", false]]);
    rerender(createElement(Cad3DViewer, { hiddenLayers: ["A", "Missing"] }));
    expect(viewer().callsTo("setLayerVisible")).toHaveLength(1);
    act(() => viewer().emit("loaded", { scene: {} as never }));
    expect(viewer().callsTo("setLayerVisible")).toEqual([
      ["A", false],
      ["A", false],
    ]);
    rerender(createElement(Cad3DViewer, { hiddenLayers: ["B"] }));
    expect(viewer().callsTo("setLayerVisible").at(-1)).toEqual(["B", false]);
  });

  it("exposes the viewer through a ref and destroys it on unmount", () => {
    let handle: ReturnType<typeof useCad3DViewerRef> | undefined;
    function Host() {
      handle = useCad3DViewerRef();
      return createElement(Cad3DViewer, { ref: handle });
    }
    const { unmount } = render(createElement(Host));
    expect(handle?.current).toBe(viewer());
    unmount();
    expect(viewer().destroyed).toBe(true);
  });

  it("is clean under StrictMode double mounting", () => {
    const { unmount } = render(
      createElement(StrictMode, null, createElement(Cad3DViewer, { src: "/a.stl" })),
    );
    const alive = Fake3DViewer.instances.filter((instance) => !instance.destroyed);
    expect(alive).toHaveLength(1);
    expect(alive[0]?.callsTo("load")).toEqual([["/a.stl", {}]]);
    unmount();
    expect(Fake3DViewer.instances.every((instance) => instance.destroyed)).toBe(true);
  });
});
