import { describe, expect, it } from "vitest";
import {
  type CadDocument,
  type CadEntity,
  collectEntities,
  createEmptyDocument,
  createModelLayout,
  describeEntity,
  summarizeDocument,
} from "../src/index";

const base = { layer: "0", color: { kind: "byLayer" } } as const;

const line = (): CadEntity => ({
  ...base,
  type: "line",
  start: { x: 0, y: 0 },
  end: { x: 3, y: 4 },
});

const documentWith = (...entities: CadEntity[]): CadDocument => {
  const document = createEmptyDocument("dxf");
  document.layouts[0]?.entities.push(...entities);
  return document;
};

describe("summarizeDocument", () => {
  it("counts entities, types, layers, blocks and layouts", () => {
    const document = documentWith(
      line(),
      { ...base, type: "circle", center: { x: 0, y: 0 }, radius: 2 },
      line(),
    );
    document.blocks.set("BLOCK", { name: "BLOCK", basePoint: { x: 0, y: 0 }, entities: [line()] });
    document.layouts.push({ ...createModelLayout(), name: "Layout1", isModel: false, tabOrder: 1 });
    document.header.version = "AC1032";
    document.header.insUnits = 4;

    expect(summarizeDocument(document)).toEqual({
      format: "dxf",
      version: "AC1032",
      units: "mm",
      entityCount: 3,
      countsByType: { line: 2, circle: 1 },
      layerCount: 1,
      blockCount: 1,
      layouts: [
        { name: "Model", isModel: true, entityCount: 3 },
        { name: "Layout1", isModel: false, entityCount: 0 },
      ],
      bounds: null,
    });
  });

  it("reports saved header extents as bounds and tolerates an unknown unit code", () => {
    const document = documentWith(line());
    document.header.insUnits = 99;
    document.header.extents = { minX: 0, minY: 0, maxX: 3, maxY: 4 };
    const summary = summarizeDocument(document);
    expect(summary.bounds).toEqual({ minX: 0, minY: 0, maxX: 3, maxY: 4 });
    expect(summary.units).toBeUndefined();
    expect(summary.version).toBeUndefined();
  });
});

describe("collectEntities", () => {
  it("lists the model-space entities as plain data with the resolved colour", () => {
    const document = documentWith(line());
    const layer = document.layers.get("0");
    if (layer) layer.color = { kind: "rgb", value: 0xff0000 };
    const [info] = collectEntities(document);
    expect(info).toEqual({
      type: "line",
      layer: "0",
      color: "#ff0000",
      visible: true,
    });
    // The entity itself is not leaked: only the inspection fields travel.
    expect(info && "start" in info).toBe(false);
  });

  it("filters by layer and type, and keeps the handle", () => {
    const document = documentWith(line(), {
      ...base,
      type: "circle",
      center: { x: 0, y: 0 },
      radius: 1,
    });
    document.layouts[0]?.entities.push({ ...line(), layer: "OTHER", handle: "2F" });
    expect(collectEntities(document, { type: "circle" }).map((info) => info.type)).toEqual([
      "circle",
    ]);
    expect(collectEntities(document, { layer: "OTHER" }).map((info) => info.handle)).toEqual([
      "2F",
    ]);
    // A layer missing from the table cannot resolve a BYLAYER colour: unknown, not invented.
    expect(collectEntities(document, { layer: "OTHER" })[0]?.color).toBeUndefined();
    document.layers.set("OTHER", {
      name: "OTHER",
      color: { kind: "aci", index: 1 },
      visible: true,
      frozen: false,
      locked: false,
    });
    expect(collectEntities(document, { layer: "OTHER" })[0]?.color).toBe("#ff0000");
  });

  it("can select a layout and returns nothing for an unknown one", () => {
    const document = documentWith(line());
    document.layouts.push({ ...createModelLayout(), name: "Layout1", isModel: false, tabOrder: 1 });
    expect(collectEntities(document, { layout: "Model" })).toHaveLength(1);
    expect(collectEntities(document, { layout: "Layout1" })).toHaveLength(0);
    expect(collectEntities(document, { layout: "Nope" })).toHaveLength(0);
  });
});

describe("describeEntity", () => {
  it("describes a line with its length and endpoints", () => {
    expect(describeEntity(line()).properties).toMatchObject({
      start: "0, 0",
      end: "3, 4",
      length: 5,
    });
  });

  it("describes a circle with radius, diameter and area", () => {
    const details = describeEntity({
      ...base,
      type: "circle",
      center: { x: 1, y: 2 },
      radius: 2,
    });
    expect(details.type).toBe("circle");
    expect(details.properties).toMatchObject({ center: "1, 2", radius: 2, diameter: 4 });
    expect(Number(details.properties.area)).toBeCloseTo(Math.PI * 4, 6);
  });

  it("describes an arc with degrees and arc length", () => {
    const details = describeEntity({
      ...base,
      type: "arc",
      center: { x: 0, y: 0 },
      radius: 2,
      startAngle: 0,
      endAngle: Math.PI / 2,
    });
    expect(details.properties).toMatchObject({ radius: 2, startAngle: 0, endAngle: 90 });
    expect(Number(details.properties.length)).toBeCloseTo(Math.PI, 6);
  });

  it("measures a polyline through straight segments and bulge arcs", () => {
    const straight = describeEntity({
      ...base,
      type: "polyline",
      closed: false,
      vertices: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 },
      ],
    });
    expect(straight.properties).toMatchObject({ vertices: 3, closed: false, length: 7 });

    const bulged = describeEntity({
      ...base,
      type: "polyline",
      closed: false,
      vertices: [
        { x: 0, y: 0, bulge: 1 },
        { x: 2, y: 0 },
      ],
    });
    expect(Number(bulged.properties.length)).toBeCloseTo(Math.PI, 6);
  });

  it("describes text, inserts, hatches and dimensions", () => {
    expect(
      describeEntity({
        ...base,
        type: "text",
        position: { x: 0, y: 0 },
        height: 2.5,
        rotation: 0,
        value: "HOLA",
        hAlign: "left",
        vAlign: "baseline",
      }).properties,
    ).toMatchObject({ value: "HOLA", height: 2.5 });

    expect(
      describeEntity({
        ...base,
        type: "insert",
        blockName: "PUERTA",
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        columnCount: 2,
        rowCount: 3,
        columnSpacing: 1,
        rowSpacing: 1,
        attributes: [],
      }).properties,
    ).toMatchObject({ blockName: "PUERTA", columns: 2, rows: 3, attributes: 0 });

    expect(
      describeEntity({
        ...base,
        type: "hatch",
        patternName: "ANSI31",
        solid: false,
        loops: [],
        patternLines: [],
      }).properties,
    ).toMatchObject({ patternName: "ANSI31", solid: false, loops: 0 });

    expect(
      describeEntity({ ...base, type: "dimension", measurement: 12.5, text: "<> mm" }).properties,
    ).toMatchObject({ measurement: 12.5, text: "<> mm" });
  });

  it("describes rays, unsupported entities and keeps the handle and colour", () => {
    expect(
      describeEntity({
        ...base,
        type: "ray",
        basePoint: { x: 1, y: 2 },
        direction: { x: 1, y: 0 },
        handle: "A1",
      }),
    ).toMatchObject({ handle: "A1", properties: { basePoint: "1, 2", direction: "1, 0" } });
    expect(
      describeEntity({ ...base, type: "unsupported", sourceType: "ACAD_TABLE" }).properties,
    ).toMatchObject({ sourceType: "ACAD_TABLE" });
  });
});
