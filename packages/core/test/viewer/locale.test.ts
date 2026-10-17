// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CadViewerError } from "../../src/loaders/errors";
import { line } from "../render/helpers";
import { click, documentWith, setup } from "./setup";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const drawing = () => documentWith([line(0, 0, 100, 50)]);

/** Measures from (0, 0) to (7.5, 10): 12.5 drawing units. */
function measure(setupResult: ReturnType<typeof setup>) {
  const { viewer, canvas, context } = setupResult;
  viewer.loadDocument(drawing());
  viewer.setTool("measure");
  const a = viewer.worldToScreen({ x: 0, y: 0 });
  const b = viewer.worldToScreen({ x: 7.5, y: 10 });
  click(canvas, a.x, a.y);
  click(canvas, b.x, b.y);
  const fillText = vi.fn();
  context.fillText = fillText;
  return () => fillText.mock.calls.map(([text]) => text as string);
}

describe("CadViewer locale", () => {
  it("defaults to Spanish (Spain) for the canvas label and language", () => {
    const { viewer, canvas } = setup();
    expect(viewer.locale).toBe("es-ES");
    expect(canvas.getAttribute("aria-label")).toBe("Dibujo CAD");
    expect(canvas.getAttribute("lang")).toBe("es-ES");
  });

  it("accepts English and resolves regional or unsupported tags", () => {
    expect(setup({ locale: "en" }).viewer.locale).toBe("en");
    document.body.innerHTML = "";
    expect(setup({ locale: "en-GB" }).viewer.locale).toBe("en");
    document.body.innerHTML = "";
    const { viewer, canvas } = setup({ locale: "fr" });
    expect(viewer.locale).toBe("en");
    expect(canvas.getAttribute("aria-label")).toBe("CAD drawing");
    expect(canvas.getAttribute("lang")).toBe("en");
  });

  it("setLocale() relabels the canvas and redraws the measure label", () => {
    const result = setup();
    const texts = measure(result);
    const { viewer, canvas } = result;
    viewer.setLocale("en");
    expect(viewer.locale).toBe("en");
    expect(canvas.getAttribute("aria-label")).toBe("CAD drawing");
    expect(canvas.getAttribute("lang")).toBe("en");
    expect(texts()).toContain("Distance: 12.5");
  });

  it("formats the measure label with the locale's words and decimal separator", () => {
    const result = setup();
    const texts = measure(result);
    result.viewer.zoomIn();
    expect(texts()).toContain("Distancia: 12,5");
  });

  it("setLocale() leaves everything else untouched and throws once destroyed", () => {
    const { viewer } = setup();
    viewer.loadDocument(drawing());
    const view = viewer.getView();
    viewer.setLocale("en");
    expect(viewer.getView()).toEqual(view);
    expect(viewer.document).not.toBeNull();
    viewer.destroy();
    expect(() => viewer.setLocale("es-ES")).toThrow("CadViewer has been destroyed.");
  });

  it("formatError() uses the viewer locale", () => {
    const { viewer } = setup();
    const error = new CadViewerError("unknown-layer", 'Unknown layer "X".', {
      params: { name: "X" },
    });
    expect(viewer.formatError(error)).toBe("La capa «X» no existe.");
    viewer.setLocale("en");
    expect(viewer.formatError(error)).toBe('Unknown layer "X".');
  });
});

describe("CadViewer errors carry codes", () => {
  it("unknown layers and layouts", () => {
    const { viewer } = setup();
    viewer.loadDocument(drawing());
    const layer = (() => {
      try {
        viewer.setLayerVisible("Nope", true);
      } catch (error) {
        return error as CadViewerError;
      }
    })();
    expect(layer).toBeInstanceOf(CadViewerError);
    expect(layer?.code).toBe("unknown-layer");
    expect(layer?.params).toEqual({ name: "Nope" });
    const layout = (() => {
      try {
        viewer.setLayout("Nope");
      } catch (error) {
        return error as CadViewerError;
      }
    })();
    expect(layout?.code).toBe("unknown-layout");
    expect(layout?.params).toEqual({ name: "Nope" });
  });

  it("a destroyed viewer", () => {
    const { viewer } = setup();
    viewer.destroy();
    const error = (() => {
      try {
        viewer.zoomExtents();
      } catch (caught) {
        return caught as CadViewerError;
      }
    })();
    expect(error).toBeInstanceOf(CadViewerError);
    expect(error?.code).toBe("destroyed");
  });

  it("a failed image export", async () => {
    const { viewer } = setup();
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(null),
    );
    const error = (await viewer.exportImage().catch((e: unknown) => e)) as CadViewerError;
    expect(error).toBeInstanceOf(CadViewerError);
    expect(error.code).toBe("image-export-failed");
    expect(error.message).toBe("Image export failed.");
  });

  it("an HTTP fetch failure records the URL and the status", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 404 }));
    const { viewer } = setup({ fetch: fetch as unknown as typeof globalThis.fetch });
    const error = (await viewer.load("https://x/a.dxf").catch((e: unknown) => e)) as CadViewerError;
    expect(error.code).toBe("fetch-failed");
    expect(error.params).toEqual({ url: "https://x/a.dxf", status: 404 });
    expect(viewer.formatError(error)).toBe("No se ha podido descargar «https://x/a.dxf»: HTTP 404");
  });

  it("a network fetch failure records the URL and the reason", async () => {
    const fetch = vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")));
    const { viewer } = setup({ fetch: fetch as unknown as typeof globalThis.fetch });
    const error = (await viewer.load("https://x/a.dxf").catch((e: unknown) => e)) as CadViewerError;
    expect(error.code).toBe("fetch-failed");
    expect(error.params).toEqual({ url: "https://x/a.dxf", reason: "Failed to fetch" });
    expect(error.message).toBe('Failed to fetch "https://x/a.dxf": Failed to fetch');
  });
});
