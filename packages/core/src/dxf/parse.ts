import {
  createDefaultLayer,
  createEmptyDocument,
  DEFAULT_LAYER,
  MODEL_LAYOUT,
} from "../model/document";
import type {
  Bounds,
  CadDocument,
  CadEntity,
  CadHeader,
  CadLayer,
  CadLayout,
  Color,
} from "../model/types";
import { lineWeight, type ParsedEntity, parseEntityRecords } from "./entities";
import { type DxfRecord, splitRecords, splitSections, toNumber } from "./records";
import { type DxfPair, tokenize } from "./tokenizer";

const DEG = Math.PI / 180;
const MODEL_BLOCK = "*MODEL_SPACE";
const ACTIVE_PAPER_BLOCK = "*PAPER_SPACE";
const EXTENT_LIMIT = 1e19;

/** Header variables: `$NAME` → the pairs that follow it. */
function headerVariables(pairs: readonly DxfPair[]): Map<string, DxfPair[]> {
  const variables = new Map<string, DxfPair[]>();
  let current: DxfPair[] | undefined;
  for (const pair of pairs) {
    if (pair.code === 9) {
      current = [];
      variables.set(pair.value.trim().toUpperCase(), current);
    } else {
      current?.push(pair);
    }
  }
  return variables;
}

function parseHeader(pairs: readonly DxfPair[]): CadHeader {
  const variables = headerVariables(pairs);
  const value = (name: string, code?: number) => {
    const entry = variables.get(name);
    return (code === undefined ? entry?.[0] : entry?.find((pair) => pair.code === code))?.value;
  };
  const header: CadHeader = {};
  const version = value("$ACADVER");
  if (version !== undefined) header.version = version.trim();
  const numeric: [keyof CadHeader, string][] = [
    ["insUnits", "$INSUNITS"],
    ["pointDisplayMode", "$PDMODE"],
    ["pointDisplaySize", "$PDSIZE"],
    ["lineTypeScale", "$LTSCALE"],
  ];
  for (const [key, name] of numeric) {
    const raw = value(name);
    if (raw !== undefined) (header as Record<string, number>)[key] = toNumber(raw);
  }
  if (variables.has("$EXTMIN") && variables.has("$EXTMAX")) {
    const extents: Bounds = {
      minX: toNumber(value("$EXTMIN", 10)),
      minY: toNumber(value("$EXTMIN", 20)),
      maxX: toNumber(value("$EXTMAX", 10)),
      maxY: toNumber(value("$EXTMAX", 20)),
    };
    const sane = [extents.minX, extents.minY, extents.maxX, extents.maxY].every(
      (n) => Math.abs(n) < EXTENT_LIMIT,
    );
    if (sane && extents.minX <= extents.maxX && extents.minY <= extents.maxY)
      header.extents = extents;
  }
  return header;
}

function layerColor(record: DxfRecord): Color {
  const trueColor = record.num(420);
  if (trueColor !== undefined) return { kind: "rgb", value: trueColor & 0xffffff };
  return { kind: "aci", index: Math.abs(record.num(62, 7)) || 7 };
}

/** Reads LAYER, LTYPE, STYLE and BLOCK_RECORD tables; returns block record handle → name. */
function parseTables(records: readonly DxfRecord[], document: CadDocument): Map<string, string> {
  const blockRecords = new Map<string, string>();
  let table = "";
  for (const record of records) {
    if (record.type === "TABLE") {
      table = record.str(2)?.trim().toUpperCase() ?? "";
      continue;
    }
    if (record.type !== table) continue;
    const name = record.str(2)?.trim() ?? "";
    if (table === "LAYER" && name) {
      const flags = record.num(70, 0);
      const layer: CadLayer = {
        name,
        color: layerColor(record),
        visible: record.num(62, 7) >= 0,
        frozen: (flags & 1) === 1,
        locked: (flags & 4) === 4,
      };
      const lineType = record.str(6);
      if (lineType !== undefined) layer.lineType = lineType.trim();
      const weight = lineWeight(record.num(370));
      if (weight !== undefined) layer.lineWeight = weight;
      document.layers.set(name, layer);
    } else if (table === "LTYPE" && name) {
      const description = record.str(3);
      document.lineTypes.set(name, {
        name,
        ...(description ? { description } : {}),
        pattern: record.nums(49),
      });
    } else if (table === "STYLE" && name) {
      const font = record.str(3)?.trim();
      document.textStyles.set(name, {
        name,
        ...(font ? { font } : {}),
        fixedHeight: record.num(40, 0),
        widthFactor: record.num(41, 1),
        obliqueAngle: record.num(50, 0) * DEG,
      });
    } else if (table === "BLOCK_RECORD" && name) {
      const handle = record.str(5)?.trim();
      if (handle) blockRecords.set(handle.toUpperCase(), name);
    }
  }
  return blockRecords;
}

const entitiesOf = (parsed: ParsedEntity[]): CadEntity[] => parsed.map((item) => item.entity);

function parseBlocks(records: readonly DxfRecord[], document: CadDocument): void {
  let index = 0;
  while (index < records.length) {
    const record = records[index++] as DxfRecord;
    if (record.type !== "BLOCK") continue;
    const body: DxfRecord[] = [];
    while (index < records.length && records[index]?.type !== "ENDBLK")
      body.push(records[index++] as DxfRecord);
    index++;
    const name = record.str(2)?.trim() ?? "";
    if (!name) continue;
    const flags = record.num(70, 0);
    const xrefPath = record.str(1)?.trim();
    document.blocks.set(name, {
      name,
      basePoint: record.point(10),
      entities: entitiesOf(parseEntityRecords(body, document)),
      ...((flags & (4 | 8)) !== 0 && xrefPath ? { xrefPath } : {}),
    });
  }
}

function blockEntities(document: CadDocument, upperName: string): CadEntity[] {
  for (const [name, block] of document.blocks) {
    if (name.toUpperCase() === upperName) return block.entities;
  }
  return [];
}

interface LayoutObject {
  name: string;
  tabOrder: number;
  blockName?: string;
  limits?: Bounds;
}

function parseLayoutObjects(
  records: readonly DxfRecord[],
  blockRecords: Map<string, string>,
): LayoutObject[] {
  return records
    .filter((record) => record.type === "LAYOUT")
    .map((record) => {
      const layout = record.subclass("AcDbLayout");
      const owner = layout.all(330).at(-1)?.trim().toUpperCase();
      const result: LayoutObject = {
        name: layout.str(1)?.trim() ?? "",
        tabOrder: layout.num(71, 0),
      };
      const blockName = owner ? blockRecords.get(owner) : undefined;
      if (blockName) result.blockName = blockName;
      if (layout.has(10) && layout.has(11)) {
        result.limits = {
          minX: layout.num(10, 0),
          minY: layout.num(20, 0),
          maxX: layout.num(11, 0),
          maxY: layout.num(21, 0),
        };
      }
      return result;
    })
    .filter((layout) => layout.name !== "");
}

function buildLayouts(
  document: CadDocument,
  entities: ParsedEntity[],
  layoutObjects: LayoutObject[],
): CadLayout[] {
  const model: CadLayout = {
    name: MODEL_LAYOUT,
    isModel: true,
    tabOrder: 0,
    entities: [
      ...blockEntities(document, MODEL_BLOCK),
      ...entitiesOf(entities.filter((item) => !item.inPaperSpace)),
    ],
  };
  const activePaper = [
    ...blockEntities(document, ACTIVE_PAPER_BLOCK),
    ...entitiesOf(entities.filter((item) => item.inPaperSpace)),
  ];
  const paperObjects = layoutObjects.filter(
    (layout) =>
      layout.blockName?.toUpperCase() !== MODEL_BLOCK && layout.name.toUpperCase() !== "MODEL",
  );
  if (paperObjects.length === 0) {
    return activePaper.length > 0
      ? [model, { name: "Layout1", isModel: false, tabOrder: 1, entities: activePaper }]
      : [model];
  }
  const papers = paperObjects
    .sort((a, b) => a.tabOrder - b.tabOrder)
    .map((layout): CadLayout => {
      const upper = layout.blockName?.toUpperCase();
      const entitiesOfLayout =
        upper === ACTIVE_PAPER_BLOCK || upper === undefined
          ? activePaper
          : blockEntities(document, upper);
      return {
        name: layout.name,
        isModel: false,
        tabOrder: layout.tabOrder,
        entities: entitiesOfLayout,
        ...(layout.limits ? { limits: layout.limits } : {}),
      };
    });
  return [model, ...papers];
}

/** Adds a default layer for every layer name used by an entity but missing from the LAYER table. */
function ensureLayers(document: CadDocument): void {
  const visit = (entity: CadEntity) => {
    if (!document.layers.has(entity.layer))
      document.layers.set(entity.layer, createDefaultLayer(entity.layer));
    if (entity.type === "insert") entity.attributes.forEach(visit);
  };
  if (!document.layers.has(DEFAULT_LAYER)) document.layers.set(DEFAULT_LAYER, createDefaultLayer());
  for (const layout of document.layouts) layout.entities.forEach(visit);
  for (const block of document.blocks.values()) block.entities.forEach(visit);
}

/** Parses an ASCII DXF string into a `CadDocument`. */
export function parseDxf(text: string): CadDocument {
  const sections = splitSections(tokenize(text));
  const document = createEmptyDocument("dxf");
  document.header = parseHeader(sections.get("HEADER") ?? []);
  const blockRecords = parseTables(splitRecords(sections.get("TABLES") ?? []), document);
  parseBlocks(splitRecords(sections.get("BLOCKS") ?? []), document);
  const entities = parseEntityRecords(splitRecords(sections.get("ENTITIES") ?? []), document);
  const layoutObjects = parseLayoutObjects(
    splitRecords(sections.get("OBJECTS") ?? []),
    blockRecords,
  );
  document.layouts = buildLayouts(document, entities, layoutObjects);
  ensureLayers(document);
  return document;
}
