import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { dxfLoader } from "../../src/dxf";
import { decodeDxfBytes, decodeTextValue } from "../../src/dxf/text";
import { CadLoadError } from "../../src/loaders/errors";
import type { InsertEntity, TextEntity } from "../../src/model/types";
import { dxf, section } from "./helpers";

const encoder = new TextEncoder();
const minimal = dxf(
  section("ENTITIES", [
    [0, "POINT"],
    [10, 1],
    [20, 2],
  ]),
);

describe("decodeTextValue", () => {
  it.each([
    ["%%d", "°"],
    ["%%D", "°"],
    ["%%c", "⌀"],
    ["%%p", "±"],
    ["%%%", "%"],
    ["%%u%%o", ""],
    ["%%065", "A"],
    ["\\U+00F1", "ñ"],
    ["50%", "50%"],
  ])("decodes %s", (input, output) => {
    expect(decodeTextValue(input)).toBe(output);
  });
});

describe("decodeDxfBytes", () => {
  it("decodes UTF-8", () => {
    expect(decodeDxfBytes(encoder.encode("1\nñandú\n"))).toBe("1\nñandú\n");
  });

  it("falls back to the drawing code page when the bytes are not UTF-8", () => {
    const header = "0\nSECTION\n2\nHEADER\n9\n$DWGCODEPAGE\n3\nANSI_1252\n0\nENDSEC\n1\n";
    const bytes = new Uint8Array([...encoder.encode(header), 0xf1, 0x0a]);
    expect(decodeDxfBytes(bytes).endsWith("ñ\n")).toBe(true);
  });

  it("uses Windows-1252 when the code page is missing", () => {
    expect(decodeDxfBytes(new Uint8Array([0x31, 0x0a, 0xe9, 0x0a]))).toBe("1\né\n");
  });

  it("supports other ANSI code pages", () => {
    const header = "9\n$DWGCODEPAGE\n3\nANSI_1251\n1\n";
    const bytes = new Uint8Array([...encoder.encode(header), 0xc4, 0x0a]);
    expect(decodeDxfBytes(bytes).endsWith("Д\n")).toBe(true);
  });
});

describe("dxfLoader", () => {
  it("declares its id and extension", () => {
    expect(dxfLoader.id).toBe("dxf");
    expect(dxfLoader.extensions).toEqual([".dxf"]);
  });

  it.each([
    ["ASCII DXF", minimal, true],
    ["ASCII DXF with BOM and padding", `\uFEFF  0\r\nSECTION\r\n`, true],
    ["ASCII DXF with a 999 comment", `999\nmade by hand\n${minimal}`, true],
    ["binary DXF", "AutoCAD Binary DXF\r\n\u001a\u0000", true],
    ["random text", "hello world", false],
    ["DWG magic", "AC1032\u0000\u0000", false],
  ])("canLoad sniffs %s", (_label, text, expected) => {
    expect(dxfLoader.canLoad({ bytes: encoder.encode(text) })).toBe(expected);
  });

  it("loads a document and reports the parse phase", async () => {
    const onProgress = vi.fn();
    const document = await dxfLoader.load(encoder.encode(minimal), { onProgress });
    expect(document.format).toBe("dxf");
    expect(document.layouts[0]?.entities[0]?.type).toBe("point");
    expect(onProgress).toHaveBeenCalledWith({ phase: "parse" });
  });

  it("rejects binary DXF", async () => {
    await expect(
      dxfLoader.load(encoder.encode("AutoCAD Binary DXF\r\n\u001a\u0000"), {}),
    ).rejects.toThrow("Binary DXF is not supported yet.");
  });

  it("rejects with an aborted CadLoadError when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await dxfLoader
      .load(encoder.encode(minimal), { signal: controller.signal })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CadLoadError);
    expect((error as CadLoadError).code).toBe("aborted");
  });
});

describe("fixture: sample-r2000.dxf", () => {
  it("parses a realistic drawing end to end", async () => {
    const bytes = readFileSync(new URL("../fixtures/dxf/sample-r2000.dxf", import.meta.url));
    const document = await dxfLoader.load(new Uint8Array(bytes), { fileName: "sample-r2000.dxf" });

    expect(document.header.version).toBe("AC1015");
    expect(document.header.insUnits).toBe(4);
    expect([...document.layers.keys()].sort()).toEqual(["0", "Annotations", "Doors", "Walls"]);
    expect(document.layers.get("Walls")?.color).toEqual({ kind: "aci", index: 1 });
    expect(document.blocks.get("DOOR")?.entities.map((entity) => entity.type)).toEqual([
      "line",
      "arc",
    ]);
    expect(document.layouts.map((layout) => layout.name)).toEqual(["Model", "A3 Sheet", "Details"]);

    const model = document.layouts[0]?.entities ?? [];
    expect(model.map((entity) => entity.type)).toEqual([
      "polyline",
      "insert",
      "text",
      "mtext",
      "circle",
      "hatch",
    ]);
    const door = model[1] as InsertEntity;
    expect(door.attributes.map((attribute) => attribute.value)).toEqual(["D-01"]);
    expect((model[2] as TextEntity).value).toBe("Plan 1:50 — ⌀ 120");

    expect(document.layouts[1]?.entities.map((entity) => entity.type)).toEqual([
      "viewport",
      "text",
    ]);
    expect(document.layouts[2]?.entities).toEqual([]);
    expect(document.unsupported.size).toBe(0);
  });
});
