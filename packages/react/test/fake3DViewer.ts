import type {
  Cad3DViewerEventName,
  Cad3DViewerEvents,
  Cad3DViewerOptions,
  Layer3DInfo,
} from "@cadscene/3d";
import { vi } from "vitest";

/** Stand-in for the 3D Cad3DViewer: records construction, calls and lets tests emit events. */
export class Fake3DViewer {
  static instances: Fake3DViewer[] = [];
  readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  readonly calls: [string, ...unknown[]][] = [];
  layers = ["0", "A", "B"];
  destroyed = false;
  load = vi.fn(async (...args: unknown[]) => {
    this.calls.push(["load", ...args]);
    return {} as never;
  });

  constructor(
    readonly container: HTMLElement,
    readonly options: Cad3DViewerOptions,
  ) {
    Fake3DViewer.instances.push(this);
  }

  on(event: string, listener: (payload: unknown) => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => set.delete(listener);
  }

  emit<K extends Cad3DViewerEventName>(event: K, payload: Cad3DViewerEvents[K]) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  getLayers(): Layer3DInfo[] {
    return this.layers.map((name) => ({
      name,
      visible: true,
      meshCount: 1,
      triangleCount: 12,
    }));
  }

  setTheme(theme: string) {
    this.calls.push(["setTheme", theme]);
  }

  setLocale(locale: string) {
    this.calls.push(["setLocale", locale]);
  }

  setShading(shading: string) {
    this.calls.push(["setShading", shading]);
  }

  setEdges(visible: boolean) {
    this.calls.push(["setEdges", visible]);
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
