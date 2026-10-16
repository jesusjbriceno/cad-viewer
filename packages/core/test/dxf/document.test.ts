import { describe, expect, it } from "vitest";
import { parseDxf } from "../../src/dxf";
import type { InsertEntity, LineEntity } from "../../src/model/types";
import { dxf, modelEntities, type Pair, section } from "./helpers";

const line = (layer: string, extra: Pair[] = []): Pair[] => [
  [0, "LINE"],
  [8, layer],
  ...extra,
  [10, 0],
  [20, 0],
  [11, 1],
  [21, 1],
];

const table = (name: string, ...entries: Pair[][]): Pair[] => [
  [0, "TABLE"],
  [2, name],
  [70, entries.length],
  ...entries.flat(),
  [0, "ENDTAB"],
];

describe("parseDxf HEADER", () => {
  it("reads version, units, extents, point display and line type scale", () => {
    const document = parseDxf(
      dxf(
        section("HEADER", [
          [9, "$ACADVER"],
          [1, "AC1015"],
          [9, "$INSUNITS"],
          [70, 4],
          [9, "$EXTMIN"],
          [10, -1],
          [20, -2],
          [30, 0],
          [9, "$EXTMAX"],
          [10, 10],
          [20, 20],
          [30, 0],
          [9, "$PDMODE"],
          [70, 3],
          [9, "$PDSIZE"],
          [40, 0.5],
          [9, "$LTSCALE"],
          [40, 2],
        ]),
      ),
    );
    expect(document.format).toBe("dxf");
    expect(document.header).toEqual({
      version: "AC1015",
      insUnits: 4,
      extents: { minX: -1, minY: -2, maxX: 10, maxY: 20 },
      pointDisplayMode: 3,
      pointDisplaySize: 0.5,
      lineTypeScale: 2,
    });
  });

  it("ignores empty-drawing extents sentinels", () => {
    const document = parseDxf(
      dxf(
        section("HEADER", [
          [9, "$EXTMIN"],
          [10, 1e20],
          [20, 1e20],
          [9, "$EXTMAX"],
          [10, -1e20],
          [20, -1e20],
        ]),
      ),
    );
    expect(document.header.extents).toBeUndefined();
  });
});

describe("parseDxf TABLES", () => {
  it("reads layers with color, off, frozen, locked, line type and weight", () => {
    const document = parseDxf(
      dxf(
        section("TABLES", [
          ...table(
            "LAYER",
            [
              [0, "LAYER"],
              [2, "Walls"],
              [70, 0],
              [62, 1],
              [6, "CONTINUOUS"],
              [370, 50],
            ],
            [
              [0, "LAYER"],
              [2, "Hidden"],
              [70, 5],
              [62, -3],
            ],
            [
              [0, "LAYER"],
              [2, "True"],
              [70, 0],
              [62, 2],
              [420, 0x00ff80],
            ],
          ),
        ]),
      ),
    );
    expect(document.layers.get("Walls")).toEqual({
      name: "Walls",
      color: { kind: "aci", index: 1 },
      visible: true,
      frozen: false,
      locked: false,
      lineType: "CONTINUOUS",
      lineWeight: 50,
    });
    expect(document.layers.get("Hidden")).toMatchObject({
      color: { kind: "aci", index: 3 },
      visible: false,
      frozen: true,
      locked: true,
    });
    expect(document.layers.get("True")?.color).toEqual({ kind: "rgb", value: 0x00ff80 });
  });

  it("always has layer 0 and creates layers that entities reference", () => {
    const document = parseDxf(dxf(section("ENTITIES", line("Ghost"))));
    expect([...document.layers.keys()].sort()).toEqual(["0", "Ghost"]);
    expect(document.layers.get("Ghost")?.color).toEqual({ kind: "aci", index: 7 });
  });

  it("reads line type patterns and text styles", () => {
    const document = parseDxf(
      dxf(
        section("TABLES", [
          ...table("LTYPE", [
            [0, "LTYPE"],
            [2, "DASHDOT"],
            [3, "Dash dot __ . __"],
            [72, 65],
            [73, 4],
            [40, 1.4],
            [49, 0.5],
            [49, -0.25],
            [49, 0],
            [49, -0.25],
          ]),
          ...table("STYLE", [
            [0, "STYLE"],
            [2, "Notes"],
            [70, 0],
            [40, 0],
            [41, 0.9],
            [50, 10],
            [3, "arial.ttf"],
          ]),
        ]),
      ),
    );
    expect(document.lineTypes.get("DASHDOT")).toEqual({
      name: "DASHDOT",
      description: "Dash dot __ . __",
      pattern: [0.5, -0.25, 0, -0.25],
    });
    const style = document.textStyles.get("Notes");
    expect(style).toMatchObject({
      name: "Notes",
      font: "arial.ttf",
      fixedHeight: 0,
      widthFactor: 0.9,
    });
    expect(style?.obliqueAngle).toBeCloseTo((10 * Math.PI) / 180);
  });
});

describe("parseDxf BLOCKS", () => {
  it("reads block definitions with base point, entities and xref path", () => {
    const document = parseDxf(
      dxf(
        section(
          "BLOCKS",
          [
            [0, "BLOCK"],
            [8, "0"],
            [2, "DOOR"],
            [70, 0],
            [10, 1],
            [20, 2],
            [30, 0],
          ],
          line("0"),
          [[0, "ENDBLK"]],
          [
            [0, "BLOCK"],
            [2, "XREF1"],
            [70, 4],
            [10, 0],
            [20, 0],
            [1, "C:\\plans\\site.dwg"],
          ],
          [[0, "ENDBLK"]],
        ),
      ),
    );
    const door = document.blocks.get("DOOR");
    expect(door?.basePoint).toEqual({ x: 1, y: 2, z: 0 });
    expect(door?.entities.map((entity) => entity.type)).toEqual(["line"]);
    expect(door?.xrefPath).toBeUndefined();
    expect(document.blocks.get("XREF1")?.xrefPath).toBe("C:\\plans\\site.dwg");
  });

  it("reads INSERT attributes inside blocks", () => {
    const document = parseDxf(
      dxf(
        section(
          "BLOCKS",
          [
            [0, "BLOCK"],
            [2, "OUTER"],
            [10, 0],
            [20, 0],
          ],
          [
            [0, "INSERT"],
            [66, 1],
            [2, "INNER"],
            [10, 0],
            [20, 0],
          ],
          [
            [0, "ATTRIB"],
            [10, 0],
            [20, 0],
            [40, 1],
            [1, "v"],
          ],
          [[0, "SEQEND"]],
          [[0, "ENDBLK"]],
        ),
      ),
    );
    const insert = document.blocks.get("OUTER")?.entities[0] as InsertEntity;
    expect(insert.attributes.map((attribute) => attribute.value)).toEqual(["v"]);
  });
});

describe("parseDxf layouts", () => {
  it("puts model-space entities in the Model layout and creates Layout1 for paper entities", () => {
    const document = parseDxf(dxf(section("ENTITIES", line("A"), line("B", [[67, 1]]))));
    expect(
      document.layouts.map((layout) => [layout.name, layout.isModel, layout.tabOrder]),
    ).toEqual([
      ["Model", true, 0],
      ["Layout1", false, 1],
    ]);
    expect(modelEntities(document).map((entity) => entity.layer)).toEqual(["A"]);
    expect(document.layouts[1]?.entities.map((entity) => entity.layer)).toEqual(["B"]);
  });

  it("only creates the model layout when there is no paper content", () => {
    expect(parseDxf(dxf(section("ENTITIES", line("A")))).layouts).toHaveLength(1);
  });

  it("maps LAYOUT objects to their block records, ordered by tab order", () => {
    const blockRecord = (handle: string, name: string): Pair[] => [
      [0, "BLOCK_RECORD"],
      [5, handle],
      [2, name],
    ];
    const layout = (name: string, tab: number, owner: string): Pair[] => [
      [0, "LAYOUT"],
      [5, `L${tab}`],
      [100, "AcDbPlotSettings"],
      [100, "AcDbLayout"],
      [1, name],
      [70, 1],
      [71, tab],
      [10, 0],
      [20, 0],
      [11, 420],
      [21, 297],
      [330, owner],
    ];
    const document = parseDxf(
      dxf(
        section(
          "TABLES",
          table(
            "BLOCK_RECORD",
            blockRecord("1F", "*Model_Space"),
            blockRecord("20", "*Paper_Space"),
            blockRecord("21", "*Paper_Space0"),
          ),
        ),
        section(
          "BLOCKS",
          [
            [0, "BLOCK"],
            [2, "*Paper_Space0"],
            [10, 0],
            [20, 0],
          ],
          line("Second"),
          [[0, "ENDBLK"]],
        ),
        section("ENTITIES", line("Model"), line("First", [[67, 1]])),
        section(
          "OBJECTS",
          layout("Model", 0, "1F"),
          layout("Sheet B", 2, "21"),
          layout("Sheet A", 1, "20"),
        ),
      ),
    );
    expect(document.layouts.map((entry) => entry.name)).toEqual(["Model", "Sheet A", "Sheet B"]);
    expect(document.layouts[1]?.entities.map((entity) => entity.layer)).toEqual(["First"]);
    expect(document.layouts[2]?.entities.map((entity) => entity.layer)).toEqual(["Second"]);
    expect(document.layouts[1]?.limits).toEqual({ minX: 0, minY: 0, maxX: 420, maxY: 297 });
    expect(modelEntities(document).map((entity) => entity.layer)).toEqual(["Model"]);
  });

  it("ignores unknown sections and tolerates a missing EOF", () => {
    const text =
      `${dxf(section("THUMBNAILIMAGE", [[90, 0]]), section("ENTITIES", line("A")))}`.replace(
        /0\nEOF\n$/,
        "",
      );
    const entity = modelEntities(parseDxf(text))[0] as LineEntity;
    expect(entity.layer).toBe("A");
  });
});
