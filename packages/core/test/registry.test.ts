import { describe, expect, it } from "vitest";
import { CadLoadError } from "../src/loaders/errors";
import { FormatRegistry } from "../src/loaders/registry";
import type { FormatLoader } from "../src/loaders/types";
import { createEmptyDocument } from "../src/model/document";

function fakeLoader(id: string, extensions: string[], sniff = false): FormatLoader {
  return {
    id,
    extensions,
    canLoad: () => sniff,
    load: async () => createEmptyDocument(id),
  };
}

const bytes = new Uint8Array([1, 2, 3]);

describe("FormatRegistry", () => {
  it("resolves a loader by file extension, case-insensitively", () => {
    const registry = new FormatRegistry([fakeLoader("dxf", [".dxf"])]);
    expect(registry.resolve({ fileName: "Plan.DXF", bytes })?.id).toBe("dxf");
  });

  it("falls back to content sniffing when the extension is unknown", () => {
    const registry = new FormatRegistry([
      fakeLoader("dxf", [".dxf"]),
      fakeLoader("dwg", [".dwg"], true),
    ]);
    expect(registry.resolve({ fileName: "drawing.bin", bytes })?.id).toBe("dwg");
    expect(registry.resolve({ bytes })?.id).toBe("dwg");
  });

  it("returns undefined when no loader matches", () => {
    const registry = new FormatRegistry([fakeLoader("dxf", [".dxf"])]);
    expect(registry.resolve({ fileName: "model.step", bytes })).toBeUndefined();
  });

  it("lets a later registration replace a loader with the same id", () => {
    const registry = new FormatRegistry([fakeLoader("dxf", [".dxf"])]);
    registry.register(fakeLoader("dxf", [".dxf", ".dxx"]));
    expect(registry.list().map((l) => l.id)).toEqual(["dxf"]);
    expect(registry.resolve({ fileName: "a.dxx", bytes })?.id).toBe("dxf");
  });

  it("unregisters loaders by id", () => {
    const registry = new FormatRegistry([fakeLoader("dxf", [".dxf"])]);
    registry.unregister("dxf");
    expect(registry.list()).toEqual([]);
  });

  it("load() throws an unsupported-format CadLoadError naming the file", async () => {
    const registry = new FormatRegistry([]);
    const error = await registry.load(bytes, { fileName: "x.step" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CadLoadError);
    expect((error as CadLoadError).code).toBe("unsupported-format");
    expect((error as CadLoadError).message).toBe('No loader can open "x.step".');
  });

  it("load() wraps loader failures as parse-error and keeps the cause", async () => {
    const boom = new Error("bad group code");
    const registry = new FormatRegistry([
      { ...fakeLoader("dxf", [".dxf"]), load: async () => Promise.reject(boom) },
    ]);
    const error = (await registry
      .load(bytes, { fileName: "a.dxf" })
      .catch((e: unknown) => e)) as CadLoadError;
    expect(error.code).toBe("parse-error");
    expect(error.cause).toBe(boom);
    expect(error.message).toBe('Could not read "a.dxf" as dxf: bad group code');
  });

  it("load() rejects with aborted when the signal is already aborted", async () => {
    const registry = new FormatRegistry([fakeLoader("dxf", [".dxf"])]);
    const controller = new AbortController();
    controller.abort();
    const error = (await registry
      .load(bytes, { fileName: "a.dxf", signal: controller.signal })
      .catch((e: unknown) => e)) as CadLoadError;
    expect(error.code).toBe("aborted");
  });
});
