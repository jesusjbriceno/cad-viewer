import { act, cleanup, render } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeViewer } from "../../vue/test/fakeViewer";

vi.mock("@jesusjbriceno/cad-viewer-core", async () => ({
  CadViewer: (await import("../../vue/test/fakeViewer")).FakeViewer,
}));

const { CadViewer, useCadViewerRef } = await import("../src");

beforeEach(() => {
  FakeViewer.instances = [];
});
afterEach(() => cleanup());

const viewer = () => {
  const instance = FakeViewer.instances.at(-1);
  if (!instance) throw new Error("no viewer");
  return instance;
};

describe("<CadViewer> (React)", () => {
  it("renders a full-size container and creates one viewer with the creation options", () => {
    const { container } = render(
      createElement(CadViewer, {
        theme: "light",
        tool: "measure",
        interactive: false,
        fontFamily: "Inter",
        className: "mine",
        id: "v",
      }),
    );
    const element = container.firstElementChild as HTMLElement;
    expect(FakeViewer.instances).toHaveLength(1);
    expect(viewer().container).toBe(element);
    expect(element.className).toBe("cad-viewer mine");
    expect(element.id).toBe("v");
    expect(element.style.width).toBe("100%");
    expect(viewer().options).toMatchObject({
      theme: "light",
      tool: "measure",
      interactive: false,
      fontFamily: "Inter",
    });
  });

  it("loads src on mount and when src or fileName change", () => {
    const { rerender } = render(createElement(CadViewer, { src: "/a.dxf" }));
    expect(viewer().callsTo("load")).toEqual([["/a.dxf", {}]]);
    rerender(createElement(CadViewer, { src: "/b.dwg", fileName: "b.dwg" }));
    expect(viewer().callsTo("load").at(-1)).toEqual(["/b.dwg", { fileName: "b.dwg" }]);
    rerender(createElement(CadViewer, { src: "/b.dwg", fileName: "b.dwg" }));
    expect(viewer().callsTo("load")).toHaveLength(2);
  });

  it("calls the latest event callbacks with the payload", () => {
    const first = vi.fn();
    const second = vi.fn();
    const onMeasure = vi.fn();
    const { rerender } = render(createElement(CadViewer, { onSelect: first, onMeasure }));
    rerender(createElement(CadViewer, { onSelect: second, onMeasure }));
    const pick = {
      entity: {},
      type: "line",
      layer: "0",
      blockPath: [],
      world: { x: 0, y: 0 },
    } as never;
    act(() => {
      viewer().emit("select", { pick });
      viewer().emit("measure", {
        from: { x: 0, y: 0 },
        to: { x: 3, y: 4 },
        distance: 5,
        dx: 3,
        dy: 4,
        angle: 0.9,
      });
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ pick });
    expect(onMeasure.mock.calls[0]?.[0]).toMatchObject({ distance: 5 });
    expect(FakeViewer.instances).toHaveLength(1);
  });

  it("forwards loaded, error and layers-change", () => {
    const onLoaded = vi.fn();
    const onError = vi.fn();
    const onLayersChange = vi.fn();
    render(createElement(CadViewer, { onLoaded, onError, onLayersChange }));
    act(() => {
      viewer().emit("loaded", { document: {} as never });
      viewer().emit("error", { error: new Error("x") });
      viewer().emit("layers-change", { layers: [] });
    });
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({ error: new Error("x") });
    expect(onLayersChange).toHaveBeenCalledWith({ layers: [] });
  });

  it("applies reactive theme, tool and layout without recreating the viewer", () => {
    const { rerender } = render(createElement(CadViewer, { theme: "dark" }));
    rerender(createElement(CadViewer, { theme: "light", tool: "zoom-window", layout: "Sheet" }));
    expect(FakeViewer.instances).toHaveLength(1);
    expect(viewer().callsTo("setTheme").at(-1)).toEqual(["light"]);
    expect(viewer().callsTo("setTool").at(-1)).toEqual(["zoom-window"]);
    expect(viewer().callsTo("setLayout").at(-1)).toEqual(["Sheet"]);
  });

  it("applies hiddenLayers by content (not array identity) and after each load", () => {
    const { rerender } = render(createElement(CadViewer, { hiddenLayers: ["A", "Missing"] }));
    expect(viewer().callsTo("setLayerVisible")).toEqual([["A", false]]);
    rerender(createElement(CadViewer, { hiddenLayers: ["A", "Missing"] }));
    expect(viewer().callsTo("setLayerVisible")).toHaveLength(1);
    act(() => viewer().emit("loaded", { document: {} as never }));
    expect(viewer().callsTo("setLayerVisible")).toEqual([
      ["A", false],
      ["A", false],
    ]);
    rerender(createElement(CadViewer, { hiddenLayers: ["B"] }));
    expect(viewer().callsTo("setLayerVisible").at(-1)).toEqual(["B", false]);
  });

  it("exposes the viewer through a ref and destroys it on unmount", () => {
    let handle: ReturnType<typeof useCadViewerRef> | undefined;
    function Host() {
      handle = useCadViewerRef();
      return createElement(CadViewer, { ref: handle });
    }
    const { unmount } = render(createElement(Host));
    expect(handle?.current).toBe(viewer());
    unmount();
    expect(viewer().destroyed).toBe(true);
  });

  it("is clean under StrictMode double mounting", () => {
    const { unmount } = render(
      createElement(StrictMode, null, createElement(CadViewer, { src: "/a.dxf" })),
    );
    const alive = FakeViewer.instances.filter((instance) => !instance.destroyed);
    expect(alive).toHaveLength(1);
    expect(alive[0]?.callsTo("load")).toEqual([["/a.dxf", {}]]);
    unmount();
    expect(FakeViewer.instances.every((instance) => instance.destroyed)).toBe(true);
  });
});
