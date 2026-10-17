import type {
  CadViewerEventName,
  CadViewerEvents,
  CadViewerOptions,
} from "@jesusjbriceno/cad-viewer-core";
import { vi } from "vitest";

/** Stand-in for the core CadViewer: records construction, calls and lets tests emit events. */
export class FakeViewer {
  static instances: FakeViewer[] = [];
  readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  readonly calls: [string, ...unknown[]][] = [];
  layers = ["0", "A", "B"];
  layouts = ["Model", "Sheet"];
  destroyed = false;
  load = vi.fn(async (...args: unknown[]) => {
    this.calls.push(["load", ...args]);
    return {};
  });

  constructor(
    readonly container: HTMLElement,
    readonly options: CadViewerOptions,
  ) {
    FakeViewer.instances.push(this);
  }

  on(event: string, listener: (payload: unknown) => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => set.delete(listener);
  }

  emit<K extends CadViewerEventName>(event: K, payload: CadViewerEvents[K]) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  getLayers() {
    return this.layers.map((name) => ({
      name,
      color: "#fff",
      visible: true,
      frozen: false,
      entityCount: 0,
    }));
  }

  getLayouts() {
    return this.layouts.map((name, index) => ({ name, isModel: index === 0, active: index === 0 }));
  }

  setTheme(theme: string) {
    this.calls.push(["setTheme", theme]);
  }

  setLocale(locale: string) {
    this.calls.push(["setLocale", locale]);
  }

  setTool(tool: string) {
    this.calls.push(["setTool", tool]);
  }

  setLayout(name: string) {
    this.calls.push(["setLayout", name]);
  }

  setAllLayersVisible(visible: boolean) {
    this.calls.push(["setAllLayersVisible", visible]);
  }

  setLayerVisible(name: string, visible: boolean) {
    this.calls.push(["setLayerVisible", name, visible]);
  }

  destroy() {
    this.destroyed = true;
    this.calls.push(["destroy"]);
  }

  callsTo(name: string) {
    return this.calls.filter(([method]) => method === name).map(([, ...args]) => args);
  }
}
