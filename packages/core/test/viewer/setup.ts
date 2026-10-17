import { vi } from "vitest";
import { createEmptyDocument } from "../../src/model/document";
import type { CadDocument, CadEntity } from "../../src/model/types";
import { CadViewer } from "../../src/viewer/CadViewer";
import type { CadViewerOptions } from "../../src/viewer/types";

export interface FakeContext {
  calls: string[];
  [key: string]: unknown;
}

/** Recording stand-in for CanvasRenderingContext2D (happy-dom has no canvas). */
export function fakeContext(): FakeContext {
  const state: FakeContext = {
    calls: [],
    measureText: (text: string) => ({ width: text.length * 10 }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  return new Proxy(state, {
    get(target, property) {
      if (property in target) return target[property as string];
      return (..._args: unknown[]) => {
        target.calls.push(String(property));
      };
    },
    set(target, property, value) {
      target[property as string] = value;
      return true;
    },
  });
}

export function documentWith(
  entities: CadEntity[],
  configure?: (document: CadDocument) => void,
): CadDocument {
  const document = createEmptyDocument("test");
  const model = document.layouts[0];
  if (model) model.entities = entities;
  configure?.(document);
  return document;
}

export function setup(options: CadViewerOptions = {}) {
  const context = fakeContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const viewer = new CadViewer(container, { pixelRatio: 1, ...options });
  const canvas = container.querySelector("canvas") as HTMLCanvasElement;
  return { container, viewer, canvas, context };
}

export function pointer(
  canvas: HTMLCanvasElement,
  type: string,
  x: number,
  y: number,
  extra: PointerEventInit = {},
) {
  canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      pointerId: 1,
      bubbles: true,
      ...extra,
    }),
  );
}

export function click(canvas: HTMLCanvasElement, x: number, y: number) {
  pointer(canvas, "pointerdown", x, y);
  pointer(canvas, "pointerup", x, y);
}
