import type { CadViewerEventName, CadViewerEvents, CadViewerListener, Unsubscribe } from "../types";

/** Typed event emitter; a throwing listener is reported and does not stop the others. */
export class Emitter {
  private readonly listeners = new Map<
    CadViewerEventName,
    Set<CadViewerListener<CadViewerEventName>>
  >();

  on<K extends CadViewerEventName>(event: K, listener: CadViewerListener<K>): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as CadViewerListener<CadViewerEventName>);
    return () => this.off(event, listener);
  }

  off<K extends CadViewerEventName>(event: K, listener: CadViewerListener<K>): void {
    this.listeners.get(event)?.delete(listener as CadViewerListener<CadViewerEventName>);
  }

  emit<K extends CadViewerEventName>(event: K, payload: CadViewerEvents[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        (listener as CadViewerListener<K>)(payload);
      } catch (error) {
        console.error("CadViewer listener failed:", event, error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
