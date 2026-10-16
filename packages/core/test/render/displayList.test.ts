import { describe, expect, it } from "vitest";
import type { CadEntity, HatchEntity, InsertEntity } from "../../src/model/types";
import {
  buildDisplayList,
  type DisplayList,
  type FillPrimitive,
  FOREGROUND,
  type Primitive,
  type StrokePrimitive,
  type TextPrimitive,
} from "../../src/render/displayList";
import { aci, block, byBlock, byLayer, line, makeDocument } from "./helpers";

const build = (
  entities: CadEntity[],
  extra: Parameters<typeof makeDocument>[0] = {},
): DisplayList => {
  const document = makeDocument({ ...extra, entities });
  return buildDisplayList(document, document.layouts[0] as never);
};

const strokes = (list: DisplayList) =>
  list.primitives.filter((p): p is StrokePrimitive => p.kind === "stroke");
const coords = (primitive: StrokePrimitive) =>
  Array.from(primitive.points).map((n) => Math.round(n * 1e6) / 1e6);

const insert = (blockName: string, extra: Partial<InsertEntity> = {}): InsertEntity => ({
  type: "insert",
  layer: "0",
  color: byLayer,
  blockName,
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1, z: 1 },
  rotation: 0,
  columnCount: 1,
  rowCount: 1,
  columnSpacing: 0,
  rowSpacing: 0,
  attributes: [],
  ...extra,
});

describe("buildDisplayList: basics", () => {
  it("turns a line into a stroke with bounds and a pick target", () => {
    const entity = line(0, 0, 10, 5);
    const list = build([entity]);
    const [stroke] = strokes(list);
    expect(coords(stroke as StrokePrimitive)).toEqual([0, 0, 10, 5]);
    expect(stroke?.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
    expect(stroke?.target).toMatchObject({ entity, layer: "0", blockPath: [] });
    expect(list.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
  });

  it("returns null bounds for an empty layout", () => {
    expect(build([]).bounds).toBeNull();
  });

  it("skips invisible and unsupported entities", () => {
    const list = build([
      line(0, 0, 1, 1, { visible: false }),
      { type: "unsupported", layer: "0", color: byLayer, sourceType: "MESH" },
    ]);
    expect(list.primitives).toEqual([]);
  });

  it("counts entities per effective layer", () => {
    const list = build(
      [line(0, 0, 1, 1, { layer: "A" }), line(0, 0, 1, 1, { layer: "A" }), line(0, 0, 1, 1)],
      {
        layers: [{ name: "A" }],
      },
    );
    expect(Object.fromEntries(list.layerCounts)).toEqual({ A: 2, "0": 1 });
  });
});

describe("buildDisplayList: colors", () => {
  it("resolves BYLAYER through the layer table and maps ACI 7 to the foreground", () => {
    const list = build([line(0, 0, 1, 0, { layer: "Red" }), line(0, 0, 1, 0)], {
      layers: [{ name: "Red", color: aci(1) }],
    });
    expect(strokes(list).map((s) => s.color)).toEqual(["#ff0000", FOREGROUND]);
  });

  it("uses entity ACI and true colors", () => {
    const list = build([
      line(0, 0, 1, 0, { color: aci(3) }),
      line(0, 0, 1, 0, { color: { kind: "rgb", value: 0x123456 } }),
    ]);
    expect(strokes(list).map((s) => s.color)).toEqual(["#00ff00", "#123456"]);
  });

  it("BYBLOCK takes the insert color, nested through two levels", () => {
    const list = build([insert("OUTER", { color: aci(5) })], {
      blocks: [
        block("OUTER", [insert("INNER", { color: byBlock })]),
        block("INNER", [line(0, 0, 1, 0, { color: byBlock })]),
      ],
    });
    expect(strokes(list)[0]?.color).toBe("#0000ff");
  });

  it("BYBLOCK at top level falls back to the foreground", () => {
    expect(strokes(build([line(0, 0, 1, 0, { color: byBlock })]))[0]?.color).toBe(FOREGROUND);
  });
});

describe("buildDisplayList: blocks", () => {
  it("applies insert position, rotation, scale and base point", () => {
    const list = build(
      [
        insert("B", {
          position: { x: 10, y: 10 },
          rotation: Math.PI / 2,
          scale: { x: 2, y: 2, z: 1 },
        }),
      ],
      {
        blocks: [block("B", [line(1, 0, 2, 0)], { x: 1, y: 0 })],
      },
    );
    expect(coords(strokes(list)[0] as StrokePrimitive)).toEqual([10, 10, 10, 12]);
  });

  it("mirrors with a negative scale", () => {
    const list = build([insert("B", { scale: { x: -1, y: 1, z: 1 } })], {
      blocks: [block("B", [line(0, 0, 3, 1)])],
    });
    expect(coords(strokes(list)[0] as StrokePrimitive)).toEqual([0, 0, -3, 1]);
  });

  it("expands MINSERT grids", () => {
    const list = build(
      [insert("B", { columnCount: 2, rowCount: 2, columnSpacing: 10, rowSpacing: 5 })],
      {
        blocks: [block("B", [line(0, 0, 1, 0)])],
      },
    );
    expect(strokes(list).map((s) => [s.points[0], s.points[1]])).toEqual([
      [0, 0],
      [10, 0],
      [0, 5],
      [10, 5],
    ]);
  });

  it("layer 0 entities inside a block take the insert's layer; others keep theirs", () => {
    const list = build([insert("B", { layer: "Doors" })], {
      layers: [
        { name: "Doors", color: aci(2) },
        { name: "Glass", color: aci(4) },
      ],
      blocks: [block("B", [line(0, 0, 1, 0), line(0, 0, 1, 0, { layer: "Glass" })])],
    });
    const [onZero, onGlass] = strokes(list);
    expect(onZero?.target.layer).toBe("Doors");
    expect(onZero?.color).toBe("#ffff00");
    expect(onGlass?.target.layer).toBe("Glass");
    expect(onGlass?.target.blockPath).toEqual(["B"]);
    expect(list.chains[onGlass?.chain ?? -1]).toEqual(["Glass", "Doors"]);
  });

  it("guards against recursive and missing blocks", () => {
    const list = build([insert("A"), insert("MISSING")], {
      blocks: [block("A", [line(0, 0, 1, 0), insert("B")]), block("B", [insert("A")])],
    });
    // A → line, A → B → A is a cycle and is cut: only the first line is drawn.
    expect(strokes(list)).toHaveLength(1);
  });

  it("draws INSERT attributes with the parent transform", () => {
    const list = build(
      [
        insert("EMPTY", {
          attributes: [
            {
              type: "text",
              layer: "0",
              color: byLayer,
              position: { x: 3, y: 4 },
              height: 1,
              rotation: 0,
              value: "A-1",
              hAlign: "left",
              vAlign: "baseline",
            },
          ],
        }),
      ],
      { blocks: [block("EMPTY", [])] },
    );
    const text = list.primitives.find((p): p is TextPrimitive => p.kind === "text");
    expect(text).toMatchObject({ x: 3, y: 4, lines: ["A-1"] });
  });
});

describe("buildDisplayList: curves and OCS", () => {
  it("tessellates circles closed and keeps them on the circle", () => {
    const [circle] = strokes(
      build([{ type: "circle", layer: "0", color: byLayer, center: { x: 1, y: 1 }, radius: 2 }]),
    );
    expect(circle?.closed).toBe(true);
    for (let i = 0; i < (circle?.points.length ?? 0); i += 2) {
      expect(
        Math.hypot((circle?.points[i] ?? 0) - 1, (circle?.points[i + 1] ?? 0) - 1),
      ).toBeCloseTo(2, 9);
    }
    expect(circle?.bounds.minX).toBeCloseTo(-1, 6);
  });

  it("mirrors OCS arcs with extrusion (0, 0, -1)", () => {
    const [arc] = strokes(
      build([
        {
          type: "arc",
          layer: "0",
          color: byLayer,
          center: { x: 5, y: 0 },
          radius: 1,
          startAngle: 0,
          endAngle: Math.PI,
          extrusion: { x: 0, y: 0, z: -1 },
        },
      ]),
    );
    // OCS start point (6, 0) at angle 0 is mirrored to (-6, 0); the arc spans x = -6..-4.
    expect(arc?.points[0]).toBeCloseTo(-6, 9);
    expect(arc?.bounds.minX).toBeCloseTo(-6, 6);
    expect(arc?.bounds.maxX).toBeCloseTo(-4, 6);
  });

  it("draws bulged polylines through the arc", () => {
    const [polyline] = strokes(
      build([
        {
          type: "polyline",
          layer: "0",
          color: byLayer,
          closed: false,
          vertices: [
            { x: 0, y: 0, bulge: 1 },
            { x: 2, y: 0 },
          ],
        },
      ]),
    );
    expect(polyline?.bounds.minY).toBeCloseTo(-1, 2);
  });

  it("draws variable-width polylines as filled segments", () => {
    const list = build([
      {
        type: "polyline",
        layer: "0",
        color: byLayer,
        closed: false,
        vertices: [
          { x: 0, y: 0, startWidth: 0, endWidth: 2 },
          { x: 10, y: 0 },
        ],
      },
    ]);
    const fill = list.primitives.find((p): p is FillPrimitive => p.kind === "fill");
    expect(fill?.bounds).toEqual({ minX: 0, minY: -1, maxX: 10, maxY: 1 });
  });

  it("uses constant polyline width as a world-space stroke width", () => {
    const [polyline] = strokes(
      build([
        {
          type: "polyline",
          layer: "0",
          color: byLayer,
          closed: false,
          constantWidth: 0.5,
          vertices: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        },
      ]),
    );
    expect(polyline?.width).toBe(0.5);
  });

  it("excludes rays and xlines from the bounds", () => {
    const list = build([
      line(0, 0, 1, 1),
      {
        type: "xline",
        layer: "0",
        color: byLayer,
        basePoint: { x: 100, y: 100 },
        direction: { x: 1, y: 0 },
      },
    ]);
    expect(list.bounds).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(list.primitives.some((p: Primitive) => p.kind === "ray")).toBe(true);
  });
});

describe("buildDisplayList: line types and weights", () => {
  it("resolves dash patterns scaled by the entity and global line type scales", () => {
    const document = makeDocument({
      entities: [line(0, 0, 10, 0, { lineType: "DASHED", lineTypeScale: 2 })],
    });
    document.lineTypes.set("DASHED", { name: "DASHED", pattern: [0.5, -0.25] });
    document.header.lineTypeScale = 3;
    const [stroke] = strokes(buildDisplayList(document, document.layouts[0] as never));
    expect(stroke?.dash).toEqual([3, 1.5]);
  });

  it("CONTINUOUS and unknown line types are solid", () => {
    const [a, b] = strokes(
      build([line(0, 0, 1, 0, { lineType: "CONTINUOUS" }), line(0, 0, 1, 0, { lineType: "NOPE" })]),
    );
    expect(a?.dash).toBeUndefined();
    expect(b?.dash).toBeUndefined();
  });

  it("converts line weights to CSS pixels with a 1 px minimum", () => {
    const [thin, thick] = strokes(
      build([line(0, 0, 1, 0, { lineWeight: 13 }), line(0, 0, 1, 0, { lineWeight: 100 })]),
    );
    expect(thin?.weightPx).toBe(1);
    expect(thick?.weightPx).toBeCloseTo(3.78, 2);
  });
});

describe("buildDisplayList: texts", () => {
  const text = (extra: object) =>
    build([
      {
        type: "text",
        layer: "0",
        color: byLayer,
        position: { x: 0, y: 0 },
        height: 2,
        rotation: 0,
        value: "Hi",
        hAlign: "left",
        vAlign: "baseline",
        ...extra,
      } as CadEntity,
    ]).primitives[0] as TextPrimitive;

  it("left/baseline texts anchor at the insertion point", () => {
    expect(text({})).toMatchObject({
      x: 0,
      y: 0,
      align: "left",
      baseline: "alphabetic",
      height: 2,
      lines: ["Hi"],
    });
  });

  it("other alignments anchor at the second alignment point", () => {
    expect(text({ hAlign: "center", vAlign: "top", alignPoint: { x: 5, y: 6 } })).toMatchObject({
      x: 5,
      y: 6,
      align: "center",
      baseline: "top",
    });
    expect(text({ hAlign: "middle", alignPoint: { x: 1, y: 1 } })).toMatchObject({
      align: "center",
      baseline: "middle",
    });
  });

  it("aligned/fit texts span the two alignment points", () => {
    const fit = text({ hAlign: "fit", alignPoint: { x: 0, y: 10 } });
    expect(fit.fitWidth).toBeCloseTo(10);
    expect(fit.rotation).toBeCloseTo(Math.PI / 2);
  });

  it("MTEXT becomes plain lines with attachment and line spacing", () => {
    const mtext = build([
      {
        type: "mtext",
        layer: "0",
        color: byLayer,
        position: { x: 1, y: 2 },
        height: 3,
        width: 0,
        rotation: 0,
        attachment: 9,
        value: "a\\Pb",
        lineSpacingFactor: 2,
      },
    ]).primitives[0] as TextPrimitive;
    expect(mtext).toMatchObject({
      x: 1,
      y: 2,
      lines: ["a", "b"],
      align: "right",
      baseline: "bottom",
      lineHeight: 10,
    });
  });
});

describe("buildDisplayList: hatches", () => {
  const square = (size: number, offset = 0) => ({
    kind: "polyline" as const,
    closed: true,
    vertices: [
      { x: offset, y: offset },
      { x: offset + size, y: offset },
      { x: offset + size, y: offset + size },
      { x: offset, y: offset + size },
    ],
  });
  const hatch = (extra: Partial<HatchEntity>): HatchEntity => ({
    type: "hatch",
    layer: "0",
    color: byLayer,
    patternName: "SOLID",
    solid: true,
    loops: [square(10), square(4, 3)],
    patternLines: [],
    ...extra,
  });

  it("solid hatches become one even-odd fill with a ring per loop", () => {
    const fill = build([hatch({})]).primitives[0] as FillPrimitive;
    expect(fill.kind).toBe("fill");
    expect(fill.rings).toHaveLength(2);
    expect(fill.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it("pattern hatches clip pattern lines to the loops, skipping holes", () => {
    const list = build([
      hatch({
        solid: false,
        patternName: "LINES",
        patternLines: [{ angle: 0, origin: { x: 0, y: 0.5 }, offset: { x: 0, y: 1 }, dashes: [] }],
      }),
    ]);
    const [pattern] = strokes(list);
    expect(pattern?.segments).toBe(true);
    const segments: number[][] = [];
    for (let i = 0; i < (pattern?.points.length ?? 0); i += 4)
      segments.push(Array.from(pattern?.points.slice(i, i + 4) ?? []));
    // y = 5.5 crosses the hole (3..7) → two segments; y = 1.5 is a single full-width segment.
    expect(segments.filter((s) => s[1] === 5.5)).toEqual([
      [0, 5.5, 3, 5.5],
      [7, 5.5, 10, 5.5],
    ]);
    expect(segments.filter((s) => s[1] === 1.5)).toEqual([[0, 1.5, 10, 1.5]]);
    expect(segments).toHaveLength(14);
  });

  it("applies the pattern dash sequence along each line", () => {
    const list = build([
      hatch({
        solid: false,
        loops: [square(10)],
        patternLines: [
          { angle: 0, origin: { x: 0, y: 5 }, offset: { x: 0, y: 100 }, dashes: [2, -3] },
        ],
      }),
    ]);
    const [pattern] = strokes(list);
    expect(Array.from(pattern?.points ?? [])).toEqual([0, 5, 2, 5, 5, 5, 7, 5]);
  });

  it("falls back to the outline when a pattern is too dense", () => {
    const list = build([
      hatch({
        solid: false,
        loops: [square(10)],
        patternLines: [{ angle: 0, origin: { x: 0, y: 0 }, offset: { x: 0, y: 1e-6 }, dashes: [] }],
      }),
    ]);
    const [outline] = strokes(list);
    expect(outline?.segments).toBeUndefined();
    expect(outline?.closed).toBe(true);
  });
});

describe("buildDisplayList: paper layouts", () => {
  it("emits viewports except the overall viewport (id 1)", () => {
    const document = makeDocument({
      paper: [
        {
          type: "viewport",
          layer: "0",
          color: byLayer,
          id: 1,
          center: { x: 0, y: 0 },
          width: 1,
          height: 1,
          viewCenter: { x: 0, y: 0 },
          viewHeight: 1,
        },
        {
          type: "viewport",
          layer: "0",
          color: byLayer,
          id: 2,
          center: { x: 100, y: 50 },
          width: 200,
          height: 100,
          viewCenter: { x: 0, y: 0 },
          viewHeight: 10,
        },
      ],
    });
    const list = buildDisplayList(document, document.layouts[1] as never);
    expect(list.primitives.map((p) => p.kind)).toEqual(["viewport"]);
    expect(list.bounds).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 100 });
  });
});
