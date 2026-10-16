import { describe, expect, it } from "vitest";
import type {
  ArcEntity,
  CircleEntity,
  DimensionEntity,
  EllipseEntity,
  HatchEntity,
  InsertEntity,
  LeaderEntity,
  LineEntity,
  MTextEntity,
  PointEntity,
  PolylineEntity,
  RayEntity,
  SolidEntity,
  SplineEntity,
  TextEntity,
  UnsupportedEntity,
  ViewportEntity,
} from "../../src/model/types";
import { modelEntities, type Pair, parseEntities, parseOne } from "./helpers";

const DEG = Math.PI / 180;

describe("common entity properties", () => {
  it("reads handle, layer, line type, scale, weight and visibility", () => {
    const line = parseOne([
      [0, "LINE"],
      [5, "1A"],
      [8, "Walls"],
      [6, "DASHED"],
      [48, 2.5],
      [370, 35],
      [60, 1],
      [10, 0],
      [20, 0],
      [11, 1],
      [21, 1],
    ]);
    expect(line).toMatchObject({
      handle: "1A",
      layer: "Walls",
      lineType: "DASHED",
      lineTypeScale: 2.5,
      lineWeight: 35,
      visible: false,
    });
  });

  it.each<[Pair[], unknown]>([
    [[], { kind: "byLayer" }],
    [[[62, 256]], { kind: "byLayer" }],
    [[[62, 0]], { kind: "byBlock" }],
    [[[62, 3]], { kind: "aci", index: 3 }],
    [
      [
        [62, 3],
        [420, 0x123456],
      ],
      { kind: "rgb", value: 0x123456 },
    ],
  ])("maps color codes %j", (codes, color) => {
    const line = parseOne([[0, "LINE"], ...codes, [10, 0], [20, 0], [11, 1], [21, 0]]);
    expect(line.color).toEqual(color);
  });

  it.each<[number, unknown]>([
    [-1, "byLayer"],
    [-2, "byBlock"],
    [-3, "default"],
  ])("maps lineweight %i to %s", (code, weight) => {
    const line = parseOne([
      [0, "LINE"],
      [370, code],
      [10, 0],
      [20, 0],
      [11, 1],
      [21, 0],
    ]);
    expect(line.lineWeight).toBe(weight);
  });

  it("defaults to layer 0 and visible", () => {
    const line = parseOne([
      [0, "LINE"],
      [10, 0],
      [20, 0],
      [11, 1],
      [21, 0],
    ]);
    expect(line.layer).toBe("0");
    expect(line.visible).toBeUndefined();
  });

  it("keeps OCS coordinates and the extrusion of planar entities", () => {
    const circle = parseOne([
      [0, "CIRCLE"],
      [10, 5],
      [20, 6],
      [30, 0],
      [40, 2],
      [210, 0],
      [220, 0],
      [230, -1],
    ]) as CircleEntity;
    expect(circle.center).toEqual({ x: 5, y: 6, z: 0 });
    expect(circle.extrusion).toEqual({ x: 0, y: 0, z: -1 });
  });

  it("omits the default extrusion", () => {
    const circle = parseOne([
      [0, "CIRCLE"],
      [10, 0],
      [20, 0],
      [40, 1],
      [210, 0],
      [220, 0],
      [230, 1],
    ]);
    expect(circle.extrusion).toBeUndefined();
  });
});

describe("geometric entities", () => {
  it("LINE", () => {
    const line = parseOne([
      [0, "LINE"],
      [10, 1],
      [20, 2],
      [30, 3],
      [11, 4],
      [21, 5],
      [31, 6],
    ]) as LineEntity;
    expect(line).toMatchObject({
      type: "line",
      start: { x: 1, y: 2, z: 3 },
      end: { x: 4, y: 5, z: 6 },
    });
  });

  it("CIRCLE", () => {
    const circle = parseOne([
      [0, "CIRCLE"],
      [10, 1],
      [20, 2],
      [40, 3],
    ]) as CircleEntity;
    expect(circle).toMatchObject({ type: "circle", center: { x: 1, y: 2 }, radius: 3 });
  });

  it("ARC converts degrees to radians", () => {
    const arc = parseOne([
      [0, "ARC"],
      [10, 0],
      [20, 0],
      [40, 2],
      [50, 90],
      [51, 180],
    ]) as ArcEntity;
    expect(arc.type).toBe("arc");
    expect(arc.startAngle).toBeCloseTo(90 * DEG);
    expect(arc.endAngle).toBeCloseTo(180 * DEG);
  });

  it("ELLIPSE keeps parameters in radians", () => {
    const ellipse = parseOne([
      [0, "ELLIPSE"],
      [10, 0],
      [20, 0],
      [11, 4],
      [21, 0],
      [40, 0.5],
      [41, 0],
      [42, Math.PI],
    ]) as EllipseEntity;
    expect(ellipse).toMatchObject({
      type: "ellipse",
      majorAxis: { x: 4, y: 0 },
      ratio: 0.5,
      startParam: 0,
      endParam: Math.PI,
    });
  });

  it("POINT", () => {
    const point = parseOne([
      [0, "POINT"],
      [10, 7],
      [20, 8],
    ]) as PointEntity;
    expect(point).toMatchObject({ type: "point", position: { x: 7, y: 8 } });
  });

  it("LWPOLYLINE with bulges, widths and closed flag", () => {
    const polyline = parseOne([
      [0, "LWPOLYLINE"],
      [90, 3],
      [70, 1],
      [43, 0.5],
      [10, 0],
      [20, 0],
      [42, 1],
      [10, 10],
      [20, 0],
      [40, 1],
      [41, 2],
      [10, 10],
      [20, 10],
    ]) as PolylineEntity;
    expect(polyline.type).toBe("polyline");
    expect(polyline.closed).toBe(true);
    expect(polyline.constantWidth).toBe(0.5);
    expect(polyline.vertices).toEqual([
      { x: 0, y: 0, bulge: 1 },
      { x: 10, y: 0, startWidth: 1, endWidth: 2 },
      { x: 10, y: 10 },
    ]);
  });

  it("POLYLINE with VERTEX records and SEQEND", () => {
    const document = parseEntities(
      [
        [0, "POLYLINE"],
        [8, "P"],
        [66, 1],
        [70, 1],
        [10, 0],
        [20, 0],
      ],
      [
        [0, "VERTEX"],
        [8, "P"],
        [10, 1],
        [20, 2],
        [42, 0.5],
      ],
      [
        [0, "VERTEX"],
        [8, "P"],
        [10, 3],
        [20, 4],
      ],
      [[0, "SEQEND"]],
      [
        [0, "POINT"],
        [10, 9],
        [20, 9],
      ],
    );
    const [polyline, point] = modelEntities(document) as [PolylineEntity, PointEntity];
    expect(polyline).toMatchObject({ type: "polyline", layer: "P", closed: true });
    expect(polyline.vertices).toEqual([
      { x: 1, y: 2, bulge: 0.5 },
      { x: 3, y: 4 },
    ]);
    expect(point.type).toBe("point");
  });

  it("3D POLYLINE keeps z and has no extrusion", () => {
    const document = parseEntities(
      [
        [0, "POLYLINE"],
        [66, 1],
        [70, 8],
        [210, 0],
        [220, 0],
        [230, -1],
      ],
      [
        [0, "VERTEX"],
        [70, 32],
        [10, 1],
        [20, 2],
        [30, 3],
      ],
      [[0, "SEQEND"]],
    );
    const polyline = modelEntities(document)[0] as PolylineEntity;
    expect(polyline.vertices[0]).toEqual({ x: 1, y: 2, z: 3 });
    expect(polyline.extrusion).toBeUndefined();
  });

  it("polyface meshes become unsupported", () => {
    const document = parseEntities(
      [
        [0, "POLYLINE"],
        [66, 1],
        [70, 64],
      ],
      [
        [0, "VERTEX"],
        [10, 1],
        [20, 2],
      ],
      [[0, "SEQEND"]],
    );
    expect((modelEntities(document)[0] as UnsupportedEntity).sourceType).toBe("POLYLINE");
    expect(document.unsupported.get("POLYLINE")).toBe(1);
  });

  it("SPLINE with knots, weights, control and fit points", () => {
    const spline = parseOne([
      [0, "SPLINE"],
      [70, 1],
      [71, 2],
      [40, 0],
      [40, 0],
      [40, 1],
      [40, 1],
      [10, 0],
      [20, 0],
      [41, 1],
      [10, 1],
      [20, 1],
      [41, 0.5],
      [11, 5],
      [21, 5],
    ]) as SplineEntity;
    expect(spline).toMatchObject({ type: "spline", degree: 2, closed: true, knots: [0, 0, 1, 1] });
    expect(spline.controlPoints).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(spline.weights).toEqual([1, 0.5]);
    expect(spline.fitPoints).toEqual([{ x: 5, y: 5 }]);
  });

  it("SOLID, TRACE and 3DFACE", () => {
    const corners: Pair[] = [
      [10, 0],
      [20, 0],
      [11, 1],
      [21, 0],
      [12, 0],
      [22, 1],
      [13, 1],
      [23, 1],
    ];
    const [solid, trace, face] = modelEntities(
      parseEntities(
        [[0, "SOLID"], ...corners],
        [[0, "TRACE"], ...corners],
        [[0, "3DFACE"], ...corners],
      ),
    ) as SolidEntity[];
    expect(solid?.points).toHaveLength(4);
    expect(solid?.outlineOnly).toBeUndefined();
    expect(trace?.type).toBe("solid");
    expect(face?.outlineOnly).toBe(true);
  });

  it("LEADER", () => {
    const leader = parseOne([
      [0, "LEADER"],
      [71, 1],
      [76, 2],
      [10, 0],
      [20, 0],
      [10, 5],
      [20, 5],
    ]) as LeaderEntity;
    expect(leader).toMatchObject({ type: "leader", hasArrowhead: true });
    expect(leader.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
  });

  it("RAY and XLINE", () => {
    const [ray, xline] = modelEntities(
      parseEntities(
        [
          [0, "RAY"],
          [10, 1],
          [20, 1],
          [11, 1],
          [21, 0],
        ],
        [
          [0, "XLINE"],
          [10, 0],
          [20, 0],
          [11, 0],
          [21, 1],
        ],
      ),
    ) as RayEntity[];
    expect(ray).toMatchObject({
      type: "ray",
      basePoint: { x: 1, y: 1 },
      direction: { x: 1, y: 0 },
    });
    expect(xline?.type).toBe("xline");
  });

  it("VIEWPORT goes to paper space with its view parameters", () => {
    const document = parseEntities([
      [0, "VIEWPORT"],
      [67, 1],
      [10, 100],
      [20, 50],
      [40, 200],
      [41, 100],
      [69, 2],
      [12, 10],
      [22, 20],
      [45, 40],
      [51, 30],
    ]);
    expect(modelEntities(document)).toEqual([]);
    const viewport = document.layouts[1]?.entities[0] as ViewportEntity;
    expect(viewport).toMatchObject({
      type: "viewport",
      center: { x: 100, y: 50 },
      width: 200,
      height: 100,
      id: 2,
      viewCenter: { x: 10, y: 20 },
      viewHeight: 40,
    });
    expect(viewport.twist).toBeCloseTo(30 * DEG);
  });
});

describe("annotation entities", () => {
  it("TEXT with alignment, rotation and decoded control codes", () => {
    const text = parseOne([
      [0, "TEXT"],
      [10, 1],
      [20, 2],
      [11, 3],
      [21, 4],
      [40, 2.5],
      [50, 90],
      [41, 0.8],
      [51, 15],
      [7, "Standard"],
      [72, 1],
      [73, 2],
      [1, "45%%d %%c10 %%p0.1 %%uA%%u %%%"],
    ]) as TextEntity;
    expect(text).toMatchObject({
      type: "text",
      position: { x: 1, y: 2 },
      alignPoint: { x: 3, y: 4 },
      height: 2.5,
      widthFactor: 0.8,
      style: "Standard",
      hAlign: "center",
      vAlign: "middle",
      value: "45° ⌀10 ±0.1 A %",
    });
    expect(text.rotation).toBeCloseTo(90 * DEG);
    expect(text.obliqueAngle).toBeCloseTo(15 * DEG);
  });

  it.each<[number, number, string, string]>([
    [0, 0, "left", "baseline"],
    [2, 0, "right", "baseline"],
    [3, 0, "aligned", "baseline"],
    [4, 0, "middle", "baseline"],
    [5, 0, "fit", "baseline"],
    [0, 1, "left", "bottom"],
    [0, 3, "left", "top"],
  ])("TEXT alignment 72=%i 73=%i → %s/%s", (h, v, hAlign, vAlign) => {
    const text = parseOne([
      [0, "TEXT"],
      [10, 0],
      [20, 0],
      [40, 1],
      [72, h],
      [73, v],
      [1, "x"],
    ]) as TextEntity;
    expect([text.hAlign, text.vAlign]).toEqual([hAlign, vAlign]);
  });

  it("MTEXT concatenates chunks, keeps format codes and decodes \\U+ escapes", () => {
    const mtext = parseOne([
      [0, "MTEXT"],
      [10, 1],
      [20, 2],
      [40, 3],
      [41, 50],
      [71, 5],
      [44, 1.5],
      [3, "{\\fArial|b1;Bold} and "],
      [1, "\\U+00E9t\\U+00E9\\Pnext"],
    ]) as MTextEntity;
    expect(mtext).toMatchObject({
      type: "mtext",
      position: { x: 1, y: 2 },
      height: 3,
      width: 50,
      attachment: 5,
      lineSpacingFactor: 1.5,
      value: "{\\fArial|b1;Bold} and été\\Pnext",
    });
  });

  it("MTEXT rotation comes from the x-axis direction when present", () => {
    const mtext = parseOne([
      [0, "MTEXT"],
      [10, 0],
      [20, 0],
      [40, 1],
      [11, 0],
      [21, 1],
      [1, "x"],
    ]) as MTextEntity;
    expect(mtext.rotation).toBeCloseTo(Math.PI / 2);
    expect(mtext.attachment).toBe(1);
  });

  it("INSERT with defaults", () => {
    const insert = parseOne([
      [0, "INSERT"],
      [2, "DOOR"],
      [10, 5],
      [20, 6],
    ]) as InsertEntity;
    expect(insert).toMatchObject({
      type: "insert",
      blockName: "DOOR",
      position: { x: 5, y: 6 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      columnCount: 1,
      rowCount: 1,
      columnSpacing: 0,
      rowSpacing: 0,
      attributes: [],
    });
  });

  it("INSERT with scale, rotation, MINSERT grid and attributes", () => {
    const document = parseEntities(
      [
        [0, "INSERT"],
        [66, 1],
        [2, "TAG"],
        [10, 0],
        [20, 0],
        [41, 2],
        [42, -1],
        [50, 45],
        [70, 3],
        [71, 2],
        [44, 10],
        [45, 20],
      ],
      [
        [0, "ATTRIB"],
        [8, "A"],
        [10, 1],
        [20, 1],
        [40, 0.5],
        [1, "R-101"],
        [2, "ROOM"],
      ],
      [[0, "SEQEND"]],
    );
    const insert = modelEntities(document)[0] as InsertEntity;
    expect(insert.scale).toEqual({ x: 2, y: -1, z: 1 });
    expect(insert.rotation).toBeCloseTo(45 * DEG);
    expect([insert.columnCount, insert.rowCount, insert.columnSpacing, insert.rowSpacing]).toEqual([
      3, 2, 10, 20,
    ]);
    expect(insert.attributes).toHaveLength(1);
    expect(insert.attributes[0]).toMatchObject({
      type: "text",
      layer: "A",
      value: "R-101",
      height: 0.5,
    });
    expect(modelEntities(document)).toHaveLength(1);
  });

  it("DIMENSION keeps block, measurement and text", () => {
    const dimension = parseOne([
      [0, "DIMENSION"],
      [2, "*D1"],
      [42, 12.5],
      [1, "<> mm"],
    ]) as DimensionEntity;
    expect(dimension).toMatchObject({
      type: "dimension",
      blockName: "*D1",
      measurement: 12.5,
      text: "<> mm",
    });
  });
});

describe("HATCH", () => {
  it("solid hatch with a polyline loop", () => {
    const hatch = parseOne([
      [0, "HATCH"],
      [2, "SOLID"],
      [70, 1],
      [91, 1],
      [92, 2],
      [72, 1],
      [73, 1],
      [93, 3],
      [10, 0],
      [20, 0],
      [10, 4],
      [20, 0],
      [42, 1],
      [10, 4],
      [20, 4],
      [97, 0],
      [75, 0],
      [98, 0],
    ]) as HatchEntity;
    expect(hatch).toMatchObject({
      type: "hatch",
      patternName: "SOLID",
      solid: true,
      patternLines: [],
    });
    expect(hatch.loops).toEqual([
      {
        kind: "polyline",
        closed: true,
        vertices: [
          { x: 0, y: 0 },
          { x: 4, y: 0, bulge: 1 },
          { x: 4, y: 4 },
        ],
      },
    ]);
  });

  it("pattern hatch with edge loops and pattern lines", () => {
    const hatch = parseOne([
      [0, "HATCH"],
      [2, "ANSI31"],
      [70, 0],
      [91, 1],
      [92, 1],
      [93, 3],
      [72, 1],
      [10, 0],
      [20, 0],
      [11, 10],
      [21, 0],
      [72, 2],
      [10, 5],
      [20, 0],
      [40, 5],
      [50, 0],
      [51, 180],
      [73, 1],
      [72, 3],
      [10, 0],
      [20, 0],
      [11, 2],
      [21, 0],
      [40, 0.5],
      [50, 0],
      [51, 90],
      [73, 0],
      [97, 0],
      [75, 0],
      [76, 1],
      [52, 0],
      [41, 1],
      [77, 0],
      [78, 1],
      [53, 45],
      [43, 0],
      [44, 0],
      [45, -0.1],
      [46, 0.1],
      [79, 2],
      [49, 0.5],
      [49, -0.25],
      [98, 0],
    ]) as HatchEntity;
    expect(hatch.solid).toBe(false);
    const loop = hatch.loops[0];
    expect(loop?.kind).toBe("edges");
    if (loop?.kind !== "edges") throw new Error("expected edges");
    expect(loop.edges.map((edge) => edge.kind)).toEqual(["line", "arc", "ellipse"]);
    expect(loop.edges[1]).toMatchObject({ kind: "arc", radius: 5, startAngle: 0, ccw: true });
    expect((loop.edges[1] as { endAngle: number }).endAngle).toBeCloseTo(Math.PI);
    expect(loop.edges[2]).toMatchObject({ kind: "ellipse", ratio: 0.5, ccw: false });
    expect(hatch.patternLines).toHaveLength(1);
    expect(hatch.patternLines[0]?.angle).toBeCloseTo(45 * DEG);
    expect(hatch.patternLines[0]).toMatchObject({
      offset: { x: -0.1, y: 0.1 },
      dashes: [0.5, -0.25],
    });
  });

  it("spline edges", () => {
    const hatch = parseOne([
      [0, "HATCH"],
      [2, "SOLID"],
      [70, 1],
      [91, 1],
      [92, 1],
      [93, 1],
      [72, 4],
      [94, 2],
      [73, 0],
      [74, 0],
      [95, 4],
      [96, 2],
      [40, 0],
      [40, 0],
      [40, 1],
      [40, 1],
      [10, 0],
      [20, 0],
      [10, 1],
      [20, 1],
      [97, 0],
      [75, 0],
      [98, 0],
    ]) as HatchEntity;
    const loop = hatch.loops[0];
    if (loop?.kind !== "edges") throw new Error("expected edges");
    expect(loop.edges[0]).toEqual({
      kind: "spline",
      degree: 2,
      knots: [0, 0, 1, 1],
      controlPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
  });
});

describe("block-backed entities", () => {
  it("ARC_DIMENSION is drawn through its block like DIMENSION", () => {
    const dimension = parseOne([
      [0, "ARC_DIMENSION"],
      [2, "*D3"],
      [42, 3.5],
    ]) as DimensionEntity;
    expect(dimension).toMatchObject({ type: "dimension", blockName: "*D3", measurement: 3.5 });
  });

  it("ACAD_TABLE is drawn as an insert of its table block", () => {
    const table = parseOne([
      [0, "ACAD_TABLE"],
      [8, "Tables"],
      [2, "*T1"],
      [10, 5],
      [20, 6],
    ]) as InsertEntity;
    expect(table).toMatchObject({
      type: "insert",
      layer: "Tables",
      blockName: "*T1",
      position: { x: 5, y: 6 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      attributes: [],
    });
  });
});

describe("unsupported entities", () => {
  it("are kept with their source type and counted", () => {
    const document = parseEntities(
      [
        [0, "MESH"],
        [8, "M"],
      ],
      [[0, "MESH"]],
      [[0, "IMAGE"]],
    );
    const entities = modelEntities(document) as UnsupportedEntity[];
    expect(entities.map((entity) => [entity.type, entity.sourceType])).toEqual([
      ["unsupported", "MESH"],
      ["unsupported", "MESH"],
      ["unsupported", "IMAGE"],
    ]);
    expect(Object.fromEntries(document.unsupported)).toEqual({ MESH: 2, IMAGE: 1 });
  });
});
