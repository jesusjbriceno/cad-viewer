import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { CAD_3D_VIEWER_EVENTS } from "../src/Cad3DViewer";
import { Fake3DViewer } from "./fake3DViewer";

vi.mock("@cadscene/3d", async () => ({
  Cad3DViewer: (await import("./fake3DViewer")).Fake3DViewer,
}));

const { Cad3DViewer, Cad3DViewerPlugin } = await import("../src/3d");

beforeEach(() => {
  Fake3DViewer.instances = [];
});
afterEach(() => {
  document.body.innerHTML = "";
});

const viewer = () => {
  const instance = Fake3DViewer.instances.at(-1);
  if (!instance) throw new Error("no viewer");
  return instance;
};

describe("<Cad3DViewer> (Vue)", () => {
  it("renders a full-size container and creates one viewer with the creation options", () => {
    const loaders = [
      { id: "x", extensions: [".x"], canLoad: () => false, load: async () => ({}) as never },
    ];
    const fetchImpl = (async () => new Response(null)) as unknown as typeof fetch;
    const wrapper = mount(Cad3DViewer, {
      props: {
        theme: "light",
        background: "#fafafa",
        upAxis: "y",
        interactive: false,
        shading: "wireframe",
        edges: false,
        loaders,
        zoomPadding: 0.2,
        pixelRatio: 2,
        fetch: fetchImpl,
        requestInit: { headers: { authorization: "x" } },
      },
    });
    expect(Fake3DViewer.instances).toHaveLength(1);
    expect(viewer().container).toBe(wrapper.element);
    expect(wrapper.classes()).toContain("cad-viewer-3d");
    expect((wrapper.element as HTMLElement).style.width).toBe("100%");
    expect(viewer().options).toMatchObject({
      theme: "light",
      background: "#fafafa",
      upAxis: "y",
      interactive: false,
      shading: "wireframe",
      edges: false,
      loaders,
      zoomPadding: 0.2,
      pixelRatio: 2,
      fetch: fetchImpl,
      requestInit: { headers: { authorization: "x" } },
    });
  });

  it("is interactive by default", () => {
    mount(Cad3DViewer);
    expect(viewer().options.interactive).not.toBe(false);
  });

  it("does not pass absent options, leaving the core defaults in place", () => {
    mount(Cad3DViewer);
    expect("locale" in viewer().options).toBe(false);
    expect("theme" in viewer().options).toBe(false);
    expect("shading" in viewer().options).toBe(false);
    expect("edges" in viewer().options).toBe(false);
    expect("background" in viewer().options).toBe(false);
    expect("upAxis" in viewer().options).toBe(false);
    expect("loaders" in viewer().options).toBe(false);
    expect(viewer().callsTo("setLocale")).toEqual([]);
  });

  it("loads src on mount and again when src or fileName change", async () => {
    const wrapper = mount(Cad3DViewer, { props: { src: "/a.stl" } });
    expect(viewer().callsTo("load")).toEqual([["/a.stl", {}]]);
    await wrapper.setProps({ src: "/b.obj", fileName: "b.obj" });
    expect(viewer().callsTo("load").at(-1)).toEqual(["/b.obj", { fileName: "b.obj" }]);
  });

  it("does not surface a failed load as an unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const wrapper = mount(Cad3DViewer, { props: { src: "/a.stl" } });
    // Mount already performed the first load, so arm the mock and trigger a *next*
    // one: otherwise the rejection below is never exercised and the test is vacuous.
    viewer().load.mockRejectedValue(new Error("bad"));
    await wrapper.setProps({ src: "/bad.stl" });
    await flushPromises();
    process.off("unhandledRejection", unhandled);
    // Counted on the mock: mockRejectedValue replaces the fake's recording implementation.
    expect(viewer().load.mock.calls).toHaveLength(2);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("forwards every viewer event as a Vue event with its payload", async () => {
    const wrapper = mount(Cad3DViewer);
    const payloads: Record<string, unknown> = {
      "load-start": { fileName: "a.stl" },
      "load-progress": { phase: "parse" },
      loaded: { scene: { meshes: [] } as never, fileName: "a.stl" },
      error: { error: new Error("x") },
      "camera-change": { azimuth: 0.5, elevation: 0.3, distance: 10, target: { x: 0, y: 0, z: 0 } },
      "layers-change": { layers: [{ name: "0", visible: true, meshCount: 1, triangleCount: 12 }] },
    };
    for (const name of CAD_3D_VIEWER_EVENTS) {
      viewer().emit(name, payloads[name] as never);
    }
    await nextTick();
    expect(CAD_3D_VIEWER_EVENTS).toEqual([
      "load-start",
      "load-progress",
      "loaded",
      "error",
      "camera-change",
      "layers-change",
    ]);
    for (const name of CAD_3D_VIEWER_EVENTS) {
      expect(wrapper.emitted(name)).toHaveLength(1);
      expect(wrapper.emitted(name)?.[0]).toEqual([payloads[name]]);
    }
  });

  it("applies reactive theme, locale, shading and edges without recreating the viewer", async () => {
    const wrapper = mount(Cad3DViewer, { props: { theme: "dark", locale: "en" } });
    await wrapper.setProps({
      theme: "light",
      locale: "es-ES",
      shading: "wireframe",
      edges: false,
    });
    expect(Fake3DViewer.instances).toHaveLength(1);
    expect(viewer().callsTo("setTheme")).toEqual([["light"]]);
    expect(viewer().callsTo("setLocale")).toEqual([["es-ES"]]);
    expect(viewer().callsTo("setShading")).toEqual([["wireframe"]]);
    expect(viewer().callsTo("setEdges")).toEqual([[false]]);
  });

  it("applies hiddenLayers on change and re-applies them after each load, ignoring unknown names", async () => {
    const wrapper = mount(Cad3DViewer, { props: { hiddenLayers: ["A", "Missing"] } });
    viewer().emit("loaded", { scene: { meshes: [] } as never });
    expect(viewer().callsTo("setAllLayersVisible")).toEqual([[true]]);
    expect(viewer().callsTo("setLayerVisible")).toEqual([["A", false]]);
    viewer().emit("loaded", { scene: { meshes: [] } as never });
    expect(viewer().callsTo("setAllLayersVisible")).toEqual([[true], [true]]);
    expect(viewer().callsTo("setLayerVisible").at(-1)).toEqual(["A", false]);
    await wrapper.setProps({ hiddenLayers: ["B"] });
    expect(viewer().callsTo("setLayerVisible").at(-1)).toEqual(["B", false]);
  });

  it("exposes the viewer instance and destroys it on unmount", () => {
    const wrapper = mount(Cad3DViewer);
    expect((wrapper.vm as unknown as { viewer: unknown }).viewer).toBe(viewer());
    wrapper.unmount();
    expect(viewer().destroyed).toBe(true);
  });

  it("works as a template ref inside a parent component", async () => {
    const parentRef = ref<{ viewer: unknown } | null>(null);
    const Parent = defineComponent({ setup: () => () => h(Cad3DViewer, { ref: parentRef }) });
    mount(Parent);
    await nextTick();
    expect(parentRef.value?.viewer).toBe(viewer());
  });

  it("Cad3DViewerPlugin registers the component globally", () => {
    const app = createApp({ render: () => null });
    app.use(Cad3DViewerPlugin);
    expect(app.component("Cad3DViewer")).toBe(Cad3DViewer);
  });
});
