import type {
  CadEntity,
  HatchEntity,
  InsertEntity,
  MTextEntity,
  PolylineEntity,
  TextEntity,
  ViewportEntity,
} from "@cadscene/core";
import { describe, expect, it } from "vitest";
import { convertDwgDatabase } from "../src/convert";

type Loose = Record<string, unknown>;

const entity = (type: string, extra: Loose = {}): Loose => ({
  type,
  handle: "1",
  ownerBlockRecordSoftId: "1F",
  layer: "0",
  colorIndex: 256,
  lineType: "",
  lineweight: 29,
  lineTypeScale: 1,
  isVisible: true,
  transparencyType: 0,
  ...extra,
});

function database(entities: Loose[] = [], extra: Loose = {}): never {
  return {
    header: {
      INSUNITS: 4,
      EXTMIN: { x: 0, y: 0, z: 0 },
      EXTMAX: { x: 10, y: 5, z: 0 },
      LTSCALE: 2,
      PDMODE: 3,
      PDSIZE: 0.5,
    },
    tables: {
      LAYER: {
        entries: [
          {
            name: "0",
            handle: "10",
            colorIndex: 7,
            color: 0xffffff,
            lineType: "Continuous",
            frozen: false,
            off: false,
            locked: false,
            lineweight: 31,
          },
        ],
      },
      LTYPE: { entries: [] },
      STYLE: { entries: [] },
      BLOCK_RECORD: {
        entries: [
          { name: "*Model_Space", handle: "1F", basePoint: { x: 0, y: 0, z: 0 }, entities: [] },
        ],
      },
      APPID: { entries: [] },
      DIMSTYLE: { entries: [] },
      VPORT: { entries: [] },
    },
    objects: {
      LAYOUT: [],
      DICTIONARY: [],
      IMAGEDEF: [],
      LAYER_FILTER: [],
      LAYER_INDEX: [],
      MLEADERSTYLE: [],
      SPATIAL_FILTER: [],
      XRECORD: [],
    },
    entities,
    classes: [],
    ...extra,
  } as never;
}

const model = (entities: Loose[], extra?: Loose): CadEntity[] =>
  convertDwgDatabase(database(entities, extra)).layouts[0]?.entities ?? [];
const one = (e: Loose): CadEntity => {
  const [first] = model([e]);
  if (!first) throw new Error("no entity");
  return first;
};

describe("convertDwgDatabase: document", () => {
  it("maps the header and the version", () => {
    const document = convertDwgDatabase(database(), { version: "AC1027" });
    expect(document.format).toBe("dwg");
    expect(document.header).toEqual({
      version: "AC1027",
      insUnits: 4,
      extents: { minX: 0, minY: 0, maxX: 10, maxY: 5 },
      lineTypeScale: 2,
      pointDisplayMode: 3,
      pointDisplaySize: 0.5,
    });
  });

  it("maps layers: ACI color, off, frozen, locked, line type and weight enum", () => {
    const db = database();
    (db as Loose & { tables: { LAYER: { entries: Loose[] } } }).tables.LAYER.entries.push(
      {
        name: "Walls",
        colorIndex: 1,
        color: 0xffffff,
        lineType: "DASHED",
        off: true,
        frozen: true,
        locked: true,
        lineweight: 9,
      },
      {
        name: "True",
        colorIndex: 256,
        color: 0x00ff80,
        lineType: "",
        off: false,
        frozen: false,
        locked: false,
        lineweight: 31,
      },
    );
    const layers = convertDwgDatabase(db).layers;
    expect(layers.get("Walls")).toEqual({
      name: "Walls",
      color: { kind: "aci", index: 1 },
      visible: false,
      frozen: true,
      locked: true,
      lineType: "DASHED",
      lineWeight: 35,
    });
    expect(layers.get("True")?.color).toEqual({ kind: "rgb", value: 0x00ff80 });
    expect(layers.get("True")?.lineWeight).toBe("default");
  });

  it("maps line types and text styles", () => {
    const db = database() as Loose & { tables: Record<string, { entries: Loose[] }> };
    db.tables.LTYPE?.entries.push({
      name: "DASHED",
      description: "__ __",
      pattern: [{ elementLength: 0.5 }, { elementLength: -0.25 }],
    });
    db.tables.STYLE?.entries.push({
      name: "Notes",
      font: "arial.ttf",
      fixedTextHeight: 0,
      widthFactor: 0.9,
      obliqueAngle: 0.1,
    });
    const document = convertDwgDatabase(db as never);
    expect(document.lineTypes.get("DASHED")).toEqual({
      name: "DASHED",
      description: "__ __",
      pattern: [0.5, -0.25],
    });
    expect(document.textStyles.get("Notes")).toEqual({
      name: "Notes",
      font: "arial.ttf",
      fixedHeight: 0,
      widthFactor: 0.9,
      obliqueAngle: 0.1,
    });
  });

  it("maps block records to blocks, skipping model space and nested attribute definitions", () => {
    const db = database() as Loose & { tables: { BLOCK_RECORD: { entries: Loose[] } } };
    db.tables.BLOCK_RECORD.entries.push({
      name: "DOOR",
      handle: "30",
      basePoint: { x: 1, y: 2, z: 0 },
      entities: [
        entity("LINE", { startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 } }),
        entity("ATTDEF"),
      ],
    });
    const document = convertDwgDatabase(db as never);
    expect([...document.blocks.keys()]).toEqual(["DOOR"]);
    expect(document.blocks.get("DOOR")?.basePoint).toEqual({ x: 1, y: 2, z: 0 });
    expect(document.blocks.get("DOOR")?.entities.map((e) => e.type)).toEqual(["line"]);
  });

  it("routes entities to layouts by owner block record and orders layouts by tab", () => {
    const db = database(
      [
        entity("LINE", { handle: "A", startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }),
        entity("VIEWPORT", {
          handle: "B",
          ownerBlockRecordSoftId: "55",
          viewportCenter: { x: 1, y: 1 },
          width: 2,
          height: 1,
          viewportId: 2,
          displayCenter: { x: 0, y: 0 },
          viewHeight: 4,
          viewTwistAngle: 0,
        }),
        entity("ATTRIB", { handle: "C" }),
      ],
      {
        objects: {
          LAYOUT: [
            {
              layoutName: "Second",
              tabOrder: 2,
              paperSpaceTableId: "50",
              minLimit: { x: 0, y: 0 },
              maxLimit: { x: 297, y: 210 },
            },
            {
              layoutName: "Model",
              tabOrder: 0,
              paperSpaceTableId: "1F",
              minLimit: { x: 0, y: 0 },
              maxLimit: { x: 0, y: 0 },
            },
            {
              layoutName: "First",
              tabOrder: 1,
              paperSpaceTableId: "55",
              minLimit: { x: 0, y: 0 },
              maxLimit: { x: 420, y: 297 },
            },
          ],
        },
      },
    ) as Loose & { tables: { BLOCK_RECORD: { entries: Loose[] } } };
    db.tables.BLOCK_RECORD.entries.push(
      { name: "*Paper_Space", handle: "55", basePoint: { x: 0, y: 0, z: 0 }, entities: [] },
      {
        name: "*Paper_Space0",
        handle: "50",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          entity("CIRCLE", {
            handle: "D",
            ownerBlockRecordSoftId: "50",
            center: { x: 0, y: 0 },
            radius: 1,
          }),
        ],
      },
    );
    const document = convertDwgDatabase(db as never);
    expect(
      document.layouts.map((layout) => [layout.name, layout.isModel, layout.tabOrder]),
    ).toEqual([
      ["Model", true, 0],
      ["First", false, 1],
      ["Second", false, 2],
    ]);
    expect(document.layouts[0]?.entities.map((e) => e.handle)).toEqual(["A"]);
    expect(document.layouts[1]?.entities.map((e) => e.type)).toEqual(["viewport"]);
    expect(document.layouts[2]?.entities.map((e) => e.handle)).toEqual(["D"]);
    expect(document.layouts[2]?.limits).toEqual({ minX: 0, minY: 0, maxX: 297, maxY: 210 });
  });

  it("creates layers referenced by entities and counts unsupported types", () => {
    const document = convertDwgDatabase(
      database([entity("MESH", { layer: "Ghost" }), entity("MESH"), entity("WIPEOUT")]),
    );
    expect(document.layers.has("Ghost")).toBe(true);
    expect(Object.fromEntries(document.unsupported)).toEqual({ MESH: 2, WIPEOUT: 1 });
  });

  it("turns an entity that fails to convert into an unsupported one instead of throwing", () => {
    const [bad] = model([entity("LINE", { startPoint: null })]);
    expect(bad).toMatchObject({ type: "unsupported", sourceType: "LINE" });
  });
});

describe("convertDwgDatabase: common properties", () => {
  const line = (extra: Loose) =>
    one(
      entity("LINE", {
        startPoint: { x: 0, y: 0, z: 0 },
        endPoint: { x: 1, y: 1, z: 0 },
        ...extra,
      }),
    );

  it.each<[Loose, unknown]>([
    [{ colorIndex: 256 }, { kind: "byLayer" }],
    [{ colorIndex: 0 }, { kind: "byBlock" }],
    [{ colorIndex: 3 }, { kind: "aci", index: 3 }],
    [
      { colorIndex: 3, color: 0x123456 },
      { kind: "rgb", value: 0x123456 },
    ],
  ])("colors %j", (extra, color) => {
    expect(line(extra).color).toEqual(color);
  });

  it.each<[number, unknown]>([
    [29, "byLayer"],
    [30, "byBlock"],
    [31, "default"],
    [0, 0],
    [9, 35],
    [23, 211],
  ])("lineweight enum %i → %j", (lineweight, weight) => {
    expect(line({ lineweight }).lineWeight).toEqual(weight);
  });

  it("maps handle, layer, line type, scale and visibility", () => {
    expect(
      line({
        handle: "2A",
        layer: "Walls",
        lineType: "DASHED",
        lineTypeScale: 3,
        isVisible: false,
      }),
    ).toMatchObject({
      handle: "2A",
      layer: "Walls",
      lineType: "DASHED",
      lineTypeScale: 3,
      visible: false,
    });
  });

  it("omits empty line types and default or zero extrusions", () => {
    const circle = one(
      entity("CIRCLE", {
        center: { x: 0, y: 0, z: 0 },
        radius: 1,
        extrusionDirection: { x: 0, y: 0, z: 0 },
      }),
    );
    expect(circle.lineType).toBeUndefined();
    expect(circle.extrusion).toBeUndefined();
    const mirrored = one(
      entity("CIRCLE", {
        center: { x: 0, y: 0, z: 0 },
        radius: 1,
        extrusionDirection: { x: 0, y: 0, z: -1 },
      }),
    );
    expect(mirrored.extrusion).toEqual({ x: 0, y: 0, z: -1 });
  });
});

describe("convertDwgDatabase: entities", () => {
  it("LINE, CIRCLE, ARC (radians), ELLIPSE and POINT", () => {
    const entities = model([
      entity("LINE", { startPoint: { x: 1, y: 2, z: 0 }, endPoint: { x: 3, y: 4, z: 0 } }),
      entity("CIRCLE", { center: { x: 1, y: 1, z: 0 }, radius: 2 }),
      entity("ARC", { center: { x: 0, y: 0, z: 0 }, radius: 1, startAngle: 0.5, endAngle: 2 }),
      entity("ELLIPSE", {
        center: { x: 0, y: 0, z: 0 },
        majorAxisEndPoint: { x: 2, y: 0, z: 0 },
        axisRatio: 0.5,
        startAngle: 0,
        endAngle: Math.PI,
      }),
      entity("POINT", { position: { x: 7, y: 8, z: 0 } }),
    ]);
    expect(entities).toMatchObject([
      { type: "line", start: { x: 1, y: 2 }, end: { x: 3, y: 4 } },
      { type: "circle", center: { x: 1, y: 1 }, radius: 2 },
      { type: "arc", startAngle: 0.5, endAngle: 2 },
      { type: "ellipse", majorAxis: { x: 2, y: 0 }, ratio: 0.5, startParam: 0, endParam: Math.PI },
      { type: "point", position: { x: 7, y: 8 } },
    ]);
  });

  it("LWPOLYLINE uses the DWG closed flag (512), bulges and widths", () => {
    const polyline = one(
      entity("LWPOLYLINE", {
        flag: 512,
        constantWidth: 0.25,
        vertices: [
          { id: 0, x: 0, y: 0, bulge: 1 },
          { id: 1, x: 2, y: 0, bulge: 0, startWidth: 1, endWidth: 2 },
        ],
      }),
    ) as PolylineEntity;
    expect(polyline).toMatchObject({ type: "polyline", closed: true, constantWidth: 0.25 });
    expect(polyline.vertices).toEqual([
      { x: 0, y: 0, bulge: 1 },
      { x: 2, y: 0, startWidth: 1, endWidth: 2 },
    ]);
    expect((one(entity("LWPOLYLINE", { flag: 1, vertices: [] })) as PolylineEntity).closed).toBe(
      false,
    );
  });

  it("POLYLINE2D and POLYLINE3D", () => {
    const [flat, spatial] = model([
      entity("POLYLINE2D", {
        flag: 1,
        vertices: [
          { x: 0, y: 0, z: 0, bulge: 0.5, startWidth: 0, endWidth: 0, flag: 0 },
          { x: 9, y: 9, z: 0, bulge: 0, startWidth: 0, endWidth: 0, flag: 16 },
          { x: 1, y: 1, z: 0, bulge: 0, startWidth: 0, endWidth: 0, flag: 0 },
        ],
      }),
      entity("POLYLINE3D", { flag: 0, vertices: [{ x: 0, y: 0, z: 5, flag: 32 }] }),
    ]) as PolylineEntity[];
    expect(flat).toMatchObject({ type: "polyline", closed: true });
    expect(flat?.vertices).toEqual([
      { x: 0, y: 0, bulge: 0.5 },
      { x: 1, y: 1 },
    ]);
    expect(spatial?.vertices).toEqual([{ x: 0, y: 0, z: 5 }]);
  });

  it("SPLINE with weights and fit points", () => {
    const spline = one(
      entity("SPLINE", {
        flag: 1,
        degree: 2,
        knots: [0, 0, 0, 1, 1, 1],
        weights: [1, 0.5, 1],
        controlPoints: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
          { x: 2, y: 0, z: 0 },
        ],
        fitPoints: [],
      }),
    );
    expect(spline).toMatchObject({
      type: "spline",
      degree: 2,
      closed: true,
      weights: [1, 0.5, 1],
      knots: [0, 0, 0, 1, 1, 1],
    });
  });

  it("TEXT with alignment and decoded control codes", () => {
    const text = one(
      entity("TEXT", {
        text: "%%c50 %%d",
        startPoint: { x: 1, y: 2 },
        endPoint: { x: 5, y: 2 },
        textHeight: 2.5,
        rotation: 0.5,
        xScale: 0.8,
        obliqueAngle: 0.1,
        styleName: "Standard",
        halign: 1,
        valign: 2,
      }),
    ) as TextEntity;
    expect(text).toMatchObject({
      type: "text",
      value: "⌀50 °",
      position: { x: 1, y: 2 },
      alignPoint: { x: 5, y: 2 },
      height: 2.5,
      rotation: 0.5,
      widthFactor: 0.8,
      obliqueAngle: 0.1,
      style: "Standard",
      hAlign: "center",
      vAlign: "middle",
    });
    const plain = one(
      entity("TEXT", {
        text: "x",
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 0, y: 0 },
        textHeight: 1,
        rotation: 0,
        halign: 0,
        valign: 0,
      }),
    ) as TextEntity;
    expect(plain.alignPoint).toBeUndefined();
  });

  it("MTEXT with attachment, width, spacing and rotation from its direction", () => {
    const mtext = one(
      entity("MTEXT", {
        text: "a\\Pb",
        insertionPoint: { x: 1, y: 2, z: 0 },
        textHeight: 3,
        rectWidth: 40,
        attachmentPoint: 5,
        lineSpacing: 1.5,
        direction: { x: 0, y: 1, z: 0 },
        rotation: 0,
        styleName: "Standard",
      }),
    ) as MTextEntity;
    expect(mtext).toMatchObject({
      type: "mtext",
      value: "a\\Pb",
      height: 3,
      width: 40,
      attachment: 5,
      lineSpacingFactor: 1.5,
      style: "Standard",
    });
    expect(mtext.rotation).toBeCloseTo(Math.PI / 2);
  });

  it("INSERT with scale, grid defaults and attributes", () => {
    const insert = one(
      entity("INSERT", {
        name: "DOOR",
        layer: "Doors",
        insertionPoint: { x: 5, y: 6, z: 0 },
        xScale: 2,
        yScale: -1,
        zScale: 1,
        rotation: 0.25,
        columnCount: 0,
        rowCount: 0,
        columnSpacing: 0,
        rowSpacing: 0,
        attribs: [
          entity("ATTRIB", {
            layer: "Tags",
            tag: "NUM",
            flags: 0,
            text: {
              text: "D-01",
              startPoint: { x: 1, y: 1 },
              endPoint: { x: 0, y: 0 },
              textHeight: 0.5,
              rotation: 0,
              xScale: 1,
              obliqueAngle: 0,
              styleName: "Standard",
              halign: 0,
              valign: 0,
            },
          }),
          entity("ATTRIB", {
            flags: 1,
            text: {
              text: "hidden",
              startPoint: { x: 0, y: 0 },
              endPoint: { x: 0, y: 0 },
              textHeight: 1,
              rotation: 0,
              halign: 0,
              valign: 0,
            },
          }),
        ],
      }),
    ) as InsertEntity;
    expect(insert).toMatchObject({
      type: "insert",
      blockName: "DOOR",
      layer: "Doors",
      position: { x: 5, y: 6 },
      scale: { x: 2, y: -1, z: 1 },
      rotation: 0.25,
      columnCount: 1,
      rowCount: 1,
    });
    expect(
      insert.attributes.map((attribute) => [attribute.value, attribute.layer, attribute.visible]),
    ).toEqual([
      ["D-01", "Tags", undefined],
      ["hidden", "0", false],
    ]);
  });

  it("ACAD_TABLE becomes an insert of its block", () => {
    const table = one(
      entity("ACAD_TABLE", {
        name: "*T1",
        startPoint: { x: 1, y: 2, z: 0 },
        directionVector: { x: 0, y: 1, z: 0 },
      }),
    ) as InsertEntity;
    expect(table).toMatchObject({
      type: "insert",
      blockName: "*T1",
      position: { x: 1, y: 2 },
      scale: { x: 1, y: 1, z: 1 },
    });
    expect(table.rotation).toBeCloseTo(Math.PI / 2);
  });

  it("ACAD_TABLE without a block (not decoded by LibreDWG for R2010+) is counted as unsupported", () => {
    const document = convertDwgDatabase(
      database([
        entity("ACAD_TABLE", { name: "", startPoint: { x: 0, y: 0, z: 0 }, blockRecordHandle: "" }),
      ]),
    );
    expect(document.layouts[0]?.entities[0]).toMatchObject({
      type: "unsupported",
      sourceType: "ACAD_TABLE",
    });
    expect(document.unsupported.get("ACAD_TABLE")).toBe(1);
  });

  it("SOLID, TRACE and 3DFACE", () => {
    const corners = {
      corner1: { x: 0, y: 0 },
      corner2: { x: 1, y: 0 },
      corner3: { x: 0, y: 1 },
      corner4: { x: 1, y: 1 },
    };
    const [solid, trace, face] = model([
      entity("SOLID", corners),
      entity("TRACE", corners),
      entity("3DFACE", corners),
    ]);
    expect(solid).toMatchObject({
      type: "solid",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
    });
    expect(trace?.type).toBe("solid");
    expect(face).toMatchObject({ type: "solid", outlineOnly: true });
  });

  it("HATCH with polyline and edge paths and pattern lines", () => {
    const hatch = one(
      entity("HATCH", {
        patternName: "ANSI31",
        solidFill: 0,
        boundaryPaths: [
          {
            boundaryPathTypeFlag: 2,
            hasBulge: true,
            isClosed: true,
            vertices: [
              { x: 0, y: 0, bulge: 0 },
              { x: 4, y: 0, bulge: 1 },
              { x: 4, y: 4, bulge: 0 },
            ],
          },
          {
            boundaryPathTypeFlag: 1,
            edges: [
              { type: 1, start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
              {
                type: 2,
                center: { x: 0, y: 0 },
                radius: 1,
                startAngle: 0,
                endAngle: Math.PI,
                isCCW: false,
              },
              {
                type: 3,
                center: { x: 0, y: 0 },
                end: { x: 2, y: 0 },
                lengthOfMinorAxis: 0.5,
                startAngle: 0,
                endAngle: 1,
              },
              {
                type: 4,
                degree: 2,
                knots: [0, 0, 0, 1, 1, 1],
                controlPoints: [
                  { x: 0, y: 0, weight: 1 },
                  { x: 1, y: 1, weight: 0.5 },
                  { x: 2, y: 0, weight: 1 },
                ],
              },
            ],
          },
        ],
        definitionLines: [
          {
            angle: Math.PI / 4,
            base: { x: 0, y: 0 },
            offset: { x: -0.1, y: 0.1 },
            dashLengths: [0.5, -0.25],
          },
        ],
      }),
    ) as HatchEntity;
    expect(hatch).toMatchObject({ type: "hatch", patternName: "ANSI31", solid: false });
    expect(hatch.loops[0]).toEqual({
      kind: "polyline",
      closed: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 4, y: 0, bulge: 1 },
        { x: 4, y: 4 },
      ],
    });
    const edges = hatch.loops[1];
    if (edges?.kind !== "edges") throw new Error("expected edges");
    expect(edges.edges).toEqual([
      { kind: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      {
        kind: "arc",
        center: { x: 0, y: 0 },
        radius: 1,
        startAngle: 0,
        endAngle: Math.PI,
        ccw: false,
      },
      {
        kind: "ellipse",
        center: { x: 0, y: 0 },
        majorAxis: { x: 2, y: 0 },
        ratio: 0.5,
        startAngle: 0,
        endAngle: 1,
        ccw: true,
      },
      {
        kind: "spline",
        degree: 2,
        knots: [0, 0, 0, 1, 1, 1],
        controlPoints: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 0 },
        ],
        weights: [1, 0.5, 1],
      },
    ]);
    expect(hatch.patternLines).toEqual([
      {
        angle: Math.PI / 4,
        origin: { x: 0, y: 0 },
        offset: { x: -0.1, y: 0.1 },
        dashes: [0.5, -0.25],
      },
    ]);
    expect(
      (
        one(
          entity("HATCH", {
            patternName: "SOLID",
            solidFill: 1,
            boundaryPaths: [],
            definitionLines: [],
          }),
        ) as HatchEntity
      ).solid,
    ).toBe(true);
  });

  it("DIMENSION, LEADER, VIEWPORT, RAY and XLINE", () => {
    const [dimension, leader, viewport, ray, xline] = model([
      entity("DIMENSION", { name: "*D4", measurement: 12.5, text: "" }),
      entity("LEADER", {
        isArrowheadEnabled: true,
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
      }),
      entity("VIEWPORT", {
        viewportCenter: { x: 5, y: 5, z: 0 },
        width: 10,
        height: 8,
        viewportId: 3,
        displayCenter: { x: 1, y: 2 },
        viewHeight: 40,
        viewTwistAngle: 0.2,
      }),
      entity("RAY", { firstPoint: { x: 0, y: 0, z: 0 }, unitDirection: { x: 1, y: 0, z: 0 } }),
      entity("XLINE", { firstPoint: { x: 0, y: 0, z: 0 }, unitDirection: { x: 0, y: 1, z: 0 } }),
    ]);
    expect(dimension).toMatchObject({ type: "dimension", blockName: "*D4", measurement: 12.5 });
    expect(leader).toMatchObject({
      type: "leader",
      hasArrowhead: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    expect(viewport as ViewportEntity).toMatchObject({
      type: "viewport",
      center: { x: 5, y: 5 },
      width: 10,
      height: 8,
      id: 3,
      viewCenter: { x: 1, y: 2 },
      viewHeight: 40,
      twist: 0.2,
    });
    expect(ray).toMatchObject({
      type: "ray",
      basePoint: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
    });
    expect(xline?.type).toBe("xline");
  });
});
