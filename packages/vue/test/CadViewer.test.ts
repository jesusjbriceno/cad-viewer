import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { FakeViewer } from "./fakeViewer";

vi.mock("@cadscene/core", async () => ({
  CadViewer: (await import("./fakeViewer")).FakeViewer,
}));

const { CadViewer, CadViewerPlugin } = await import("../src");

beforeEach(() => {
  FakeViewer.instances = [];
});
afterEach(() => {
  document.body.innerHTML = "";
});

const viewer = () => {
  const instance = FakeViewer.instances.at(-1);
  if (!instance) throw new Error("no viewer");
  return instance;
};

describe("<CadViewer> (Vue)", () => {
  it("renders a full-size container and creates one viewer with the creation options", () => {
    const loaders = [
      { id: "x", extensions: [".x"], canLoad: () => false, load: async () => ({}) as never },
    ];
    const wrapper = mount(CadViewer, {
      props: { theme: "light", tool: "measure", interactive: false, loaders, fontFamily: "Inter" },
    });
    expect(FakeViewer.instances).toHaveLength(1);
    expect(viewer().container).toBe(wrapper.element);
    expect(wrapper.classes()).toContain("cad-viewer");
    expect((wrapper.element as HTMLElement).style.width).toBe("100%");
    expect(viewer().options).toMatchObject({
      theme: "light",
      tool: "measure",
      interactive: false,
      loaders,
      fontFamily: "Inter",
    });
  });

  it("is interactive by default", () => {
    mount(CadViewer);
    expect(viewer().options.interactive).not.toBe(false);
  });

  it("loads src on mount and again when src or fileName change", async () => {
    const wrapper = mount(CadViewer, { props: { src: "/a.dxf" } });
    expect(viewer().callsTo("load")).toEqual([["/a.dxf", {}]]);
    await wrapper.setProps({ src: "/b.dwg", fileName: "b.dwg" });
    expect(viewer().callsTo("load").at(-1)).toEqual(["/b.dwg", { fileName: "b.dwg" }]);
  });

  it("does not surface a failed load as an unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    mount(CadViewer, { props: { src: "/bad.dxf" } });
    viewer().load.mockRejectedValueOnce(new Error("bad"));
    await flushPromises();
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("forwards viewer events as Vue events with their payload", async () => {
    const wrapper = mount(CadViewer);
    const pick = {
      entity: {},
      type: "line",
      layer: "0",
      blockPath: [],
      world: { x: 0, y: 0 },
    } as never;
    viewer().emit("loaded", { document: {} as never });
    viewer().emit("error", { error: new Error("x") });
    viewer().emit("select", { pick });
    viewer().emit("measure", {
      from: { x: 0, y: 0 },
      to: { x: 3, y: 4 },
      distance: 5,
      dx: 3,
      dy: 4,
      angle: 0.9,
    });
    viewer().emit("layers-change", { layers: [] });
    await nextTick();
    expect(wrapper.emitted("loaded")).toHaveLength(1);
    expect(wrapper.emitted("error")?.[0]).toEqual([{ error: new Error("x") }]);
    expect(wrapper.emitted("select")?.[0]).toEqual([{ pick }]);
    const [measured] = (wrapper.emitted("measure") ?? [[]])[0] as [{ distance: number }?];
    expect(measured?.distance).toBe(5);
    expect(wrapper.emitted("layers-change")).toHaveLength(1);
  });

  it("applies reactive theme, tool and layout without recreating the viewer", async () => {
    const wrapper = mount(CadViewer, { props: { theme: "dark" } });
    await wrapper.setProps({ theme: "light", tool: "zoom-window", layout: "Sheet" });
    expect(FakeViewer.instances).toHaveLength(1);
    expect(viewer().callsTo("setTheme")).toEqual([["light"]]);
    expect(viewer().callsTo("setTool")).toEqual([["zoom-window"]]);
    expect(viewer().callsTo("setLayout")).toEqual([["Sheet"]]);
  });

  it("passes locale at creation and applies changes without recreating the viewer", async () => {
    const wrapper = mount(CadViewer, { props: { locale: "en" } });
    expect(viewer().options.locale).toBe("en");
    await wrapper.setProps({ locale: "es-ES" });
    expect(FakeViewer.instances).toHaveLength(1);
    expect(viewer().callsTo("setLocale")).toEqual([["es-ES"]]);
  });

  it("leaves the locale to the core default (es-ES) when the prop is absent", () => {
    mount(CadViewer);
    expect("locale" in viewer().options).toBe(false);
    expect(viewer().callsTo("setLocale")).toEqual([]);
  });

  it("applies hiddenLayers on change and re-applies them after each load", async () => {
    const wrapper = mount(CadViewer, { props: { hiddenLayers: ["A", "Missing"] } });
    viewer().emit("loaded", { document: {} as never });
    expect(viewer().callsTo("setAllLayersVisible")).toEqual([[true]]);
    expect(viewer().callsTo("setLayerVisible")).toEqual([["A", false]]);
    await wrapper.setProps({ hiddenLayers: ["B"] });
    expect(viewer().callsTo("setLayerVisible").at(-1)).toEqual(["B", false]);
  });

  it("applies the controlled layout after a load when it exists", () => {
    mount(CadViewer, { props: { layout: "Sheet" } });
    viewer().emit("loaded", { document: {} as never });
    expect(viewer().callsTo("setLayout")).toEqual([["Sheet"]]);
  });

  it("exposes the viewer instance and destroys it on unmount", () => {
    const wrapper = mount(CadViewer);
    expect((wrapper.vm as unknown as { viewer: unknown }).viewer).toBe(viewer());
    wrapper.unmount();
    expect(viewer().destroyed).toBe(true);
  });

  it("works as a template ref inside a parent component", async () => {
    const parentRef = ref<{ viewer: unknown } | null>(null);
    const Parent = defineComponent({ setup: () => () => h(CadViewer, { ref: parentRef }) });
    mount(Parent);
    await nextTick();
    expect(parentRef.value?.viewer).toBe(viewer());
  });

  it("CadViewerPlugin registers the component globally", () => {
    const app = createApp({ render: () => null });
    app.use(CadViewerPlugin);
    expect(app.component("CadViewer")).toBe(CadViewer);
  });
});
