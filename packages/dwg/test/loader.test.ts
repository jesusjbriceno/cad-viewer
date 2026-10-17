import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CadLoadError, CadViewerError, formatCadError } from "@jesusjbriceno/cad-viewer-core";
import { describe, expect, it, vi } from "vitest";
import { createDwgLoader, type LibreDwgLike } from "../src/loader";

const fixture = new Uint8Array(
  readFileSync(new URL("./fixtures/example_2013.dwg", import.meta.url)),
);
const wasmUrl = fileURLToPath(
  new URL("../node_modules/@mlightcad/libredwg-web/wasm/", import.meta.url),
);
const emptyDatabase = {
  header: {},
  tables: {
    LAYER: { entries: [] },
    LTYPE: { entries: [] },
    STYLE: { entries: [] },
    BLOCK_RECORD: { entries: [] },
  },
  objects: { LAYOUT: [] },
  entities: [],
};

function fakeLibreDwg(
  overrides: Partial<LibreDwgLike> = {},
): LibreDwgLike & { dwg_free: ReturnType<typeof vi.fn> } {
  return {
    dwg_read_data: vi.fn(() => 42),
    convert: vi.fn(() => emptyDatabase as never),
    dwg_free: vi.fn(),
    ...overrides,
  } as LibreDwgLike & { dwg_free: ReturnType<typeof vi.fn> };
}

const encoder = new TextEncoder();

describe("createDwgLoader", () => {
  it("declares its id and extension", () => {
    const loader = createDwgLoader();
    expect(loader.id).toBe("dwg");
    expect(loader.extensions).toEqual([".dwg"]);
  });

  it.each([
    ["the real fixture", fixture, true],
    ["an R2018 header", encoder.encode("AC1032\u0000\u0000\u0000"), true],
    ["DXF text", encoder.encode("0\nSECTION\n"), false],
    ["a short buffer", encoder.encode("AC1"), false],
    ["a non-numeric version", encoder.encode("AC10XY"), false],
  ])("canLoad sniffs %s", (_label, bytes, expected) => {
    expect(createDwgLoader().canLoad({ bytes })).toBe(expected);
  });

  it("reads a real DWG file end to end", async () => {
    const onProgress = vi.fn();
    const document = await createDwgLoader({ wasmUrl }).load(fixture, { onProgress });
    expect(document.format).toBe("dwg");
    expect(document.header.version).toBe("AC1027");
    expect(document.layers.size).toBeGreaterThan(1);
    expect(document.layouts.map((layout) => layout.name)).toEqual(["Model", "Layout1", "Layout2"]);
    const model = document.layouts[0]?.entities ?? [];
    expect(model.length).toBeGreaterThan(40);
    expect(model.filter((entity) => entity.type === "viewport")).toEqual([]);
    expect(document.blocks.has("bloko")).toBe(true);
    expect(Number.isFinite(document.header.extents?.minX)).toBe(true);
    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "init",
      "parse",
      "convert",
    ]);
  }, 30_000);

  it("frees native memory after a successful conversion", async () => {
    const libredwg = fakeLibreDwg();
    await createDwgLoader({ libredwg }).load(fixture, {});
    expect(libredwg.dwg_free).toHaveBeenCalledWith(42);
  });

  it("frees native memory when the conversion throws", async () => {
    const libredwg = fakeLibreDwg({
      convert: vi.fn(() => {
        throw new Error("bad object");
      }),
    });
    await expect(createDwgLoader({ libredwg }).load(fixture, {})).rejects.toThrow("bad object");
    expect(libredwg.dwg_free).toHaveBeenCalledWith(42);
  });

  it("rejects when LibreDWG cannot read the file", async () => {
    const libredwg = fakeLibreDwg({ dwg_read_data: vi.fn(() => undefined) });
    await expect(createDwgLoader({ libredwg }).load(fixture, {})).rejects.toThrow(
      "LibreDWG could not read the file.",
    );
    expect(libredwg.dwg_free).not.toHaveBeenCalled();
  });

  it("reports an unreadable file with a stable, translatable code", async () => {
    const libredwg = fakeLibreDwg({ dwg_read_data: vi.fn(() => 0) });
    const error = (await createDwgLoader({ libredwg })
      .load(fixture, {})
      .catch((e: unknown) => e)) as CadViewerError;
    expect(error).toBeInstanceOf(CadViewerError);
    expect(error.code).toBe("dwg-read-failed");
    expect(formatCadError(error, "es-ES")).toBe("LibreDWG no ha podido leer el archivo.");
  });

  it("creates LibreDWG once and retries after a failed initialization", async () => {
    const instance = fakeLibreDwg();
    const factory = vi
      .fn<() => Promise<LibreDwgLike>>()
      .mockRejectedValueOnce(new Error("wasm 404"))
      .mockResolvedValue(instance);
    const loader = createDwgLoader({ libredwg: factory });
    await expect(loader.load(fixture, {})).rejects.toThrow("wasm 404");
    await loader.load(fixture, {});
    await loader.load(fixture, {});
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("stops between phases when aborted", async () => {
    const controller = new AbortController();
    const libredwg = fakeLibreDwg({
      dwg_read_data: vi.fn(() => {
        controller.abort();
        return 7;
      }),
    });
    const error = (await createDwgLoader({ libredwg })
      .load(fixture, { signal: controller.signal })
      .catch((reason: unknown) => reason)) as CadLoadError;
    expect(error).toBeInstanceOf(CadLoadError);
    expect(error.code).toBe("aborted");
    expect(libredwg.convert).not.toHaveBeenCalled();
    expect(libredwg.dwg_free).toHaveBeenCalledWith(7);
  });
});
