import type { Cad3DViewerEventName, Cad3DViewerEvents, Cad3DViewerListener } from "./types";

/** Typed event emitter; a throwing listener does not stop the others. */
export class Emitter {
  private readonly listeners = new Map<Cad3DViewerEventName, Set<(payload: unknown) => void>>();

  on<K extends Cad3DViewerEventName>(event: K, listener: Cad3DViewerListener<K>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as (payload: unknown) => void);
    this.listeners.set(event, set);
    return () => this.off(event, listener);
  }

  off<K extends Cad3DViewerEventName>(event: K, listener: Cad3DViewerListener<K>): void {
    this.listeners.get(event)?.delete(listener as (payload: unknown) => void);
  }

  emit<K extends Cad3DViewerEventName>(event: K, payload: Cad3DViewerEvents[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        listener(payload);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
