import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tokenize } from "../src/dxf/tokenizer";
import {
  CadLoadError,
  CadViewerError,
  createEmptyDocument,
  DEFAULT_LOCALE,
  dxfLoader,
  FALLBACK_LOCALE,
  FormatRegistry,
  formatCadError,
  getModelLayout,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "../src/index";

const bytes = new Uint8Array([1, 2, 3]);

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("resolveLocale", () => {
  it("defaults to Spanish (Spain) and falls back to English", () => {
    expect(DEFAULT_LOCALE).toBe("es-ES");
    expect(FALLBACK_LOCALE).toBe("en");
    expect(SUPPORTED_LOCALES).toEqual(["es-ES", "en"]);
  });

  it.each([
    [undefined, "es-ES"],
    ["", "es-ES"],
    ["es-ES", "es-ES"],
    ["es", "es-ES"],
    ["ES_es", "es-ES"],
    ["es-MX", "es-ES"],
    [" ", "es-ES"],
    ["	", "es-ES"],
    ["en", "en"],
    ["en-GB", "en"],
    ["EN-us", "en"],
    ["fr-FR", "en"],
    ["zz", "en"],
  ])("resolves %j to %s", (input, expected) => {
    expect(resolveLocale(input)).toBe(expected);
  });
});

describe("library errors carry stable codes and params", () => {
  it("CadLoadError is a CadViewerError and an Error", () => {
    const error = new CadLoadError("aborted", "Loading was aborted.");
    expect(error).toBeInstanceOf(CadViewerError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CadLoadError");
    expect(error.code).toBe("aborted");
    expect(error.params).toBeUndefined();
  });

  it("unsupported-format names the file", async () => {
    const error = (await new FormatRegistry([])
      .load(bytes, { fileName: "x.step" })
      .catch((e: unknown) => e)) as CadLoadError;
    expect(error.code).toBe("unsupported-format");
    expect(error.params).toEqual({ fileName: "x.step" });
    expect(error.message).toBe('No loader can open "x.step".');
  });

  it("unsupported-format without a file name keeps the old message", async () => {
    const error = (await new FormatRegistry([])
      .load(bytes)
      .catch((e: unknown) => e)) as CadLoadError;
    expect(error.params).toEqual({});
    expect(error.message).toBe('No loader can open "file".');
  });

  it("parse-error records the file, the format and the reason", async () => {
    const boom = new Error("bad group code");
    const registry = new FormatRegistry([
      { id: "dxf", extensions: [".dxf"], canLoad: () => false, load: () => Promise.reject(boom) },
    ]);
    const error = (await registry
      .load(bytes, { fileName: "a.dxf" })
      .catch((e: unknown) => e)) as CadLoadError;
    expect(error.code).toBe("parse-error");
    expect(error.params).toEqual({ fileName: "a.dxf", format: "dxf", reason: "bad group code" });
    expect(error.cause).toBe(boom);
  });

  it("DXF tokenizer errors carry the offending value and line", () => {
    const invalid = caught(() => tokenize("0\nSECTION\nabc\nX\n")) as CadViewerError;
    expect(invalid).toBeInstanceOf(CadViewerError);
    expect(invalid.code).toBe("dxf-invalid-group-code");
    expect(invalid.params).toEqual({ value: "abc", line: 3 });
    expect(invalid.message).toBe('Invalid group code "abc" at line 3.');

    const missing = caught(() => tokenize("0\nSECTION\n2\n")) as CadViewerError;
    expect(missing.code).toBe("dxf-missing-value");
    expect(missing.params).toEqual({ groupCode: 2, line: 3 });
    expect(missing.message).toBe("Missing value for group code 2 at line 3.");
  });

  it("binary DXF is rejected with a code", async () => {
    const error = (await dxfLoader
      .load(new TextEncoder().encode("AutoCAD Binary DXF\r\n\u001a\u0000"), {})
      .catch((e: unknown) => e)) as CadViewerError;
    expect(error).toBeInstanceOf(CadViewerError);
    expect(error.code).toBe("dxf-binary-unsupported");
    expect(error.message).toBe("Binary DXF is not supported yet.");
  });

  it("a document without a model layout is rejected with a code", () => {
    const document = createEmptyDocument("test");
    document.layouts = [];
    const error = caught(() => getModelLayout(document)) as CadViewerError;
    expect(error.code).toBe("no-model-layout");
    expect(error.message).toBe("Document has no model layout.");
  });
});

describe("formatCadError", () => {
  const cases: [CadViewerError, string, string][] = [
    [
      new CadLoadError("unsupported-format", "-", { params: { fileName: "x.step" } }),
      "No hay ningún cargador que pueda abrir «x.step».",
      'No loader can open "x.step".',
    ],
    [
      new CadLoadError("unsupported-format", "-", { params: {} }),
      "No hay ningún cargador que pueda abrir el archivo.",
      'No loader can open "file".',
    ],
    [
      new CadLoadError("parse-error", "-", {
        params: { fileName: "a.dwg", format: "dwg", reason: "bad object" },
      }),
      "No se ha podido leer «a.dwg» como dwg: bad object",
      'Could not read "a.dwg" as dwg: bad object',
    ],
    [
      new CadLoadError("fetch-failed", "-", { params: { url: "https://x/a.dxf", status: 404 } }),
      "No se ha podido descargar «https://x/a.dxf»: HTTP 404",
      'Failed to fetch "https://x/a.dxf": HTTP 404',
    ],
    [
      new CadLoadError("fetch-failed", "-", {
        params: { url: "https://x/a.dxf", reason: "Failed to fetch" },
      }),
      "No se ha podido descargar «https://x/a.dxf»: Failed to fetch",
      'Failed to fetch "https://x/a.dxf": Failed to fetch',
    ],
    [
      new CadLoadError("fetch-failed", "-", { params: { url: "https://x/a.dxf" } }),
      "No se ha podido descargar «https://x/a.dxf».",
      'Failed to fetch "https://x/a.dxf".',
    ],
    [new CadLoadError("aborted", "-"), "Se ha cancelado la carga.", "Loading was aborted."],
    [
      new CadViewerError("unknown-layer", "-", { params: { name: "Muros" } }),
      "La capa «Muros» no existe.",
      'Unknown layer "Muros".',
    ],
    [
      new CadViewerError("unknown-layout", "-", { params: { name: "Hoja 1" } }),
      "La presentación «Hoja 1» no existe.",
      'Unknown layout "Hoja 1".',
    ],
    [
      new CadViewerError("destroyed", "-"),
      "Este CadViewer ya se ha destruido.",
      "CadViewer has been destroyed.",
    ],
    [
      new CadViewerError("image-export-failed", "-"),
      "No se ha podido exportar la imagen.",
      "Image export failed.",
    ],
    [
      new CadViewerError("dxf-binary-unsupported", "-"),
      "Todavía no se admite el formato DXF binario.",
      "Binary DXF is not supported yet.",
    ],
    [
      new CadViewerError("dxf-invalid-group-code", "-", { params: { value: "abc", line: 3 } }),
      "Código de grupo «abc» no válido en la línea 3.",
      'Invalid group code "abc" at line 3.',
    ],
    [
      new CadViewerError("dxf-missing-value", "-", { params: { groupCode: 2, line: 3 } }),
      "Falta el valor del código de grupo 2 en la línea 3.",
      "Missing value for group code 2 at line 3.",
    ],
    [
      new CadViewerError("no-model-layout", "-"),
      "El documento no tiene espacio modelo.",
      "Document has no model layout.",
    ],
    [
      new CadViewerError("dwg-read-failed", "-"),
      "LibreDWG no ha podido leer el archivo.",
      "LibreDWG could not read the file.",
    ],
  ];

  it.each(cases)("formats %s in Spanish (Spain) and English", (error, spanish, english) => {
    expect(formatCadError(error, "es-ES")).toBe(spanish);
    expect(formatCadError(error, "en")).toBe(english);
  });

  it("uses Spanish (Spain) by default and English for unsupported locales", () => {
    const error = new CadLoadError("aborted", "-");
    expect(formatCadError(error)).toBe("Se ha cancelado la carga.");
    expect(formatCadError(error, "de")).toBe("Loading was aborted.");
  });

  it("translates the reason of a parse-error when its cause is a library error", async () => {
    const error = (await new FormatRegistry([dxfLoader])
      .load(new TextEncoder().encode("0\nSECTION\nabc\nX\n"), { fileName: "a.dxf" })
      .catch((e: unknown) => e)) as CadLoadError;
    expect(error.message).toBe(
      'Could not read "a.dxf" as dxf: Invalid group code "abc" at line 3.',
    );
    expect(formatCadError(error, "es-ES")).toBe(
      "No se ha podido leer «a.dxf» como dxf: Código de grupo «abc» no válido en la línea 3.",
    );
    expect(formatCadError(error, "en")).toBe(error.message);
  });

  it("falls back to the message when a code needs params that were not given", () => {
    const error = new CadLoadError("parse-error", "Custom loader failure.");
    expect(formatCadError(error, "es-ES")).toBe("Custom loader failure.");
  });

  it("returns the message of foreign errors and stringifies anything else", () => {
    expect(formatCadError(new TypeError("boom"), "es-ES")).toBe("boom");
    expect(formatCadError("plain", "es-ES")).toBe("plain");
  });
});

describe("locale and catalog invariants", () => {
  it("resolves a non-string tag to the default instead of throwing", () => {
    expect(resolveLocale(42 as unknown as string)).toBe("es-ES");
    expect(resolveLocale({} as unknown as string)).toBe("es-ES");
  });

  it("keeps every library error catalog-backed (no bare new Error in packages)", () => {
    const root = fileURLToPath(new URL("../../../packages/", import.meta.url));
    const sources = ["core", "dwg", "vue", "react"].map((pkg) => join(root, pkg, "src"));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (path.endsWith(".ts")) {
          readFileSync(path, "utf8")
            .split("\n")
            .forEach((line, index) => {
              // CadViewer normalizes whatever a caller or an event listener throws.
              if (/new Error\(/.test(line) && !line.includes("new Error(String(error))"))
                offenders.push(`${path.replace(root, "")}:${index + 1}`);
            });
        }
      }
    };
    for (const dir of sources) walk(dir);
    expect(offenders).toEqual([]);
  });
});
