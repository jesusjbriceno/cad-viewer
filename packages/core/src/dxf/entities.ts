import type {
  CadEntity,
  Color,
  HatchEdge,
  HatchEntity,
  HatchLoop,
  HatchPatternLine,
  InsertEntity,
  LineEntity,
  LineWeight,
  MTextAttachment,
  Point,
  PolylineEntity,
  PolylineVertex,
  TextEntity,
  TextHAlign,
  TextVAlign,
  Vec3,
} from "../model/types";
import { type DxfRecord, toNumber } from "./records";
import { decodeTextValue, decodeUnicodeEscapes } from "./text";
import type { DxfPair } from "./tokenizer";

const DEG = Math.PI / 180;
const H_ALIGN: TextHAlign[] = ["left", "center", "right", "aligned", "middle", "fit"];
const V_ALIGN: TextVAlign[] = ["baseline", "bottom", "middle", "top"];

/** Records that are consumed silently: they are never drawn on their own. */
const IGNORED = new Set(["ATTDEF", "SEQEND", "VERTEX", "ENDBLK"]);

/** Extra entity info that only matters while parsing (not part of the model). */
export interface ParsedEntity {
  entity: CadEntity;
  inPaperSpace: boolean;
}

export interface EntityContext {
  /** Source entity type → count of entities that could not be represented. */
  unsupported: Map<string, number>;
}

function color(record: DxfRecord): Color {
  const trueColor = record.num(420);
  if (trueColor !== undefined) return { kind: "rgb", value: trueColor & 0xffffff };
  const index = record.num(62);
  if (index === undefined || index === 256) return { kind: "byLayer" };
  if (index === 0) return { kind: "byBlock" };
  return { kind: "aci", index: Math.abs(index) };
}

export function lineWeight(value: number | undefined): LineWeight | undefined {
  if (value === undefined) return undefined;
  if (value === -1) return "byLayer";
  if (value === -2) return "byBlock";
  if (value === -3) return "default";
  return value;
}

function extrusion(record: DxfRecord): Vec3 | undefined {
  const normal = { x: record.num(210, 0), y: record.num(220, 0), z: record.num(230, 1) };
  return normal.x === 0 && normal.y === 0 && normal.z === 1 ? undefined : normal;
}

type EntityProps = Omit<LineEntity, "type" | "start" | "end">;

/** Properties shared by every entity: handle, layer, color, line type, weight, visibility, extrusion. */
function base(record: DxfRecord, ocs: boolean): EntityProps {
  const props: EntityProps = {
    layer: record.str(8)?.trim() || "0",
    color: color(record),
  };
  const handle = record.str(5);
  if (handle !== undefined) props.handle = handle.trim();
  const lineType = record.str(6);
  if (lineType !== undefined) props.lineType = lineType.trim();
  const lineTypeScale = record.num(48);
  if (lineTypeScale !== undefined) props.lineTypeScale = lineTypeScale;
  const weight = lineWeight(record.num(370));
  if (weight !== undefined) props.lineWeight = weight;
  if (record.num(60) === 1) props.visible = false;
  if (ocs) {
    const normal = extrusion(record);
    if (normal) props.extrusion = normal;
  }
  return props;
}

function text(record: DxfRecord, verticalCode: number): TextEntity {
  const entity: TextEntity = {
    type: "text",
    ...base(record, true),
    position: record.point(10),
    height: record.num(40, 1),
    rotation: record.num(50, 0) * DEG,
    value: decodeTextValue(record.str(1) ?? ""),
    hAlign: H_ALIGN[record.num(72, 0)] ?? "left",
    vAlign: V_ALIGN[record.num(verticalCode, 0)] ?? "baseline",
  };
  if (record.has(11)) entity.alignPoint = record.point(11);
  const widthFactor = record.num(41);
  if (widthFactor !== undefined) entity.widthFactor = widthFactor;
  const oblique = record.num(51);
  if (oblique !== undefined) entity.obliqueAngle = oblique * DEG;
  const style = record.str(7);
  if (style !== undefined) entity.style = style.trim();
  if (verticalCode === 74 && (record.num(70, 0) & 1) === 1) entity.visible = false;
  return entity;
}

function lwpolyline(record: DxfRecord): PolylineEntity {
  const vertices: PolylineVertex[] = [];
  let current: PolylineVertex | undefined;
  for (const { code, value } of record.pairs) {
    if (code === 10) {
      current = { x: toNumber(value), y: 0 };
      vertices.push(current);
    } else if (!current) {
    } else if (code === 20) current.y = toNumber(value);
    else if (code === 42 && toNumber(value) !== 0) current.bulge = toNumber(value);
    else if (code === 40) current.startWidth = toNumber(value);
    else if (code === 41) current.endWidth = toNumber(value);
  }
  const entity: PolylineEntity = {
    type: "polyline",
    ...base(record, true),
    vertices,
    closed: (record.num(70, 0) & 1) === 1,
  };
  const width = record.num(43, 0);
  if (width > 0) entity.constantWidth = width;
  return entity;
}

function spline(record: DxfRecord): CadEntity {
  const controlPoints: Point[] = [];
  const fitPoints: Point[] = [];
  let target: Point[] | undefined;
  let current: Point | undefined;
  for (const { code, value } of record.pairs) {
    if (code === 10 || code === 11) {
      target = code === 10 ? controlPoints : fitPoints;
      current = { x: toNumber(value), y: 0 };
      target.push(current);
    } else if (current && (code === 20 || code === 21)) current.y = toNumber(value);
    else if (current && (code === 30 || code === 31) && toNumber(value) !== 0)
      current.z = toNumber(value);
  }
  const weights = record.nums(41);
  return {
    type: "spline",
    ...base(record, false),
    degree: record.num(71, 3),
    knots: record.nums(40),
    controlPoints,
    ...(weights.length === controlPoints.length && weights.length > 0 ? { weights } : {}),
    ...(fitPoints.length > 0 ? { fitPoints } : {}),
    closed: (record.num(70, 0) & 1) === 1,
  };
}

/** Sequential reader over a record's pairs, for the nested HATCH structure. */
class PairCursor {
  private index = 0;
  constructor(private readonly pairs: readonly DxfPair[]) {}

  peek(offset = 0): DxfPair | undefined {
    return this.pairs[this.index + offset];
  }

  /** Moves past the next pair with `code` and returns its numeric value. */
  take(code: number, fallback = 0): number {
    while (this.index < this.pairs.length) {
      const pair = this.pairs[this.index++];
      if (pair?.code === code) return toNumber(pair.value, fallback);
    }
    return fallback;
  }

  takePoint(code: number): Point {
    return { x: this.take(code), y: this.take(code + 10) };
  }

  seek(code: number): boolean {
    const found = this.pairs.findIndex((pair, index) => index >= this.index && pair.code === code);
    if (found < 0) return false;
    this.index = found;
    return true;
  }
}

function hatchEdge(cursor: PairCursor): HatchEdge | undefined {
  const kind = cursor.take(72);
  if (kind === 1) return { kind: "line", start: cursor.takePoint(10), end: cursor.takePoint(11) };
  if (kind === 2) {
    return {
      kind: "arc",
      center: cursor.takePoint(10),
      radius: cursor.take(40),
      startAngle: cursor.take(50) * DEG,
      endAngle: cursor.take(51) * DEG,
      ccw: cursor.take(73, 1) === 1,
    };
  }
  if (kind === 3) {
    return {
      kind: "ellipse",
      center: cursor.takePoint(10),
      majorAxis: cursor.takePoint(11),
      ratio: cursor.take(40),
      startAngle: cursor.take(50) * DEG,
      endAngle: cursor.take(51) * DEG,
      ccw: cursor.take(73, 1) === 1,
    };
  }
  if (kind === 4) {
    const degree = cursor.take(94);
    const rational = cursor.take(73) === 1;
    cursor.take(74);
    const knotCount = cursor.take(95);
    const controlCount = cursor.take(96);
    const knots = Array.from({ length: knotCount }, () => cursor.take(40));
    const controlPoints: Point[] = [];
    const weights: number[] = [];
    for (let index = 0; index < controlCount; index++) {
      controlPoints.push(cursor.takePoint(10));
      if (rational) weights.push(cursor.take(42, 1));
    }
    // R2010+ adds fit data (97 + 11/21 points + 12/13 tangents); a 97 that is not
    // followed by fit data belongs to the loop (source boundary count).
    const next = cursor.peek(1)?.code;
    if (cursor.peek()?.code === 97 && (next === 11 || next === 12)) {
      const fitCount = cursor.take(97);
      for (let index = 0; index < fitCount; index++) cursor.takePoint(11);
      if (cursor.peek()?.code === 12) cursor.takePoint(12);
      if (cursor.peek()?.code === 13) cursor.takePoint(13);
    }
    return { kind: "spline", degree, controlPoints, knots, ...(rational ? { weights } : {}) };
  }
  return undefined;
}

function hatchLoop(cursor: PairCursor): HatchLoop {
  const flags = cursor.take(92);
  if ((flags & 2) === 2) {
    const hasBulge = cursor.take(72) === 1;
    const closed = cursor.take(73, 1) === 1;
    const count = cursor.take(93);
    const vertices: PolylineVertex[] = [];
    for (let index = 0; index < count; index++) {
      const vertex: PolylineVertex = cursor.takePoint(10);
      if (hasBulge && cursor.peek()?.code === 42) {
        const bulge = cursor.take(42);
        if (bulge !== 0) vertex.bulge = bulge;
      }
      vertices.push(vertex);
    }
    return { kind: "polyline", vertices, closed };
  }
  const count = cursor.take(93);
  const edges: HatchEdge[] = [];
  for (let index = 0; index < count; index++) {
    const edge = hatchEdge(cursor);
    if (edge) edges.push(edge);
  }
  return { kind: "edges", edges };
}

function hatch(record: DxfRecord): HatchEntity {
  const cursor = new PairCursor(record.pairs);
  const loops: HatchLoop[] = [];
  if (cursor.seek(91)) {
    const loopCount = cursor.take(91);
    for (let index = 0; index < loopCount; index++) {
      loops.push(hatchLoop(cursor));
      if (cursor.peek()?.code === 97) {
        const sources = cursor.take(97);
        for (let source = 0; source < sources; source++) cursor.take(330);
      }
    }
  }
  const patternLines: HatchPatternLine[] = [];
  const solid = record.num(70, 0) === 1;
  if (!solid && cursor.seek(78)) {
    const lineCount = cursor.take(78);
    for (let index = 0; index < lineCount; index++) {
      const angle = cursor.take(53) * DEG;
      const origin = { x: cursor.take(43), y: cursor.take(44) };
      const offset = { x: cursor.take(45), y: cursor.take(46) };
      const dashCount = cursor.take(79);
      const dashes = Array.from({ length: dashCount }, () => cursor.take(49));
      patternLines.push({ angle, origin, offset, dashes });
    }
  }
  return {
    type: "hatch",
    ...base(record, true),
    patternName: record.str(2)?.trim() ?? "",
    solid,
    loops,
    patternLines,
  };
}

function mtext(record: DxfRecord): CadEntity {
  const value = record.pairs
    .filter((pair) => pair.code === 3 || pair.code === 1)
    .map((pair) => pair.value)
    .join("");
  const attachment = record.num(71, 1);
  const rotation = record.has(11)
    ? Math.atan2(record.num(21, 0), record.num(11, 1))
    : record.num(50, 0) * DEG;
  return {
    type: "mtext",
    ...base(record, false),
    position: record.point(10),
    height: record.num(40, 1),
    width: record.num(41, 0),
    rotation,
    attachment: (attachment >= 1 && attachment <= 9 ? attachment : 1) as MTextAttachment,
    value: decodeUnicodeEscapes(value),
    ...(record.has(44) ? { lineSpacingFactor: record.num(44, 1) } : {}),
    ...(record.has(7) ? { style: record.str(7)?.trim() } : {}),
  };
}

function insert(record: DxfRecord, attributes: TextEntity[]): InsertEntity {
  return {
    type: "insert",
    ...base(record, true),
    blockName: record.str(2)?.trim() ?? "",
    position: record.point(10),
    scale: { x: record.num(41, 1), y: record.num(42, 1), z: record.num(43, 1) },
    rotation: record.num(50, 0) * DEG,
    columnCount: Math.max(1, record.num(70, 1)),
    rowCount: Math.max(1, record.num(71, 1)),
    columnSpacing: record.num(44, 0),
    rowSpacing: record.num(45, 0),
    attributes,
  };
}

function points(record: DxfRecord, codes: number[]): Point[] {
  return codes.filter((code) => record.has(code)).map((code) => record.point(code));
}

/** Maps one self-contained entity record (not POLYLINE/INSERT sequences). */
function simpleEntity(record: DxfRecord): CadEntity | undefined {
  switch (record.type) {
    case "LINE":
      return {
        type: "line",
        ...base(record, false),
        start: record.point(10),
        end: record.point(11),
      };
    case "CIRCLE":
      return {
        type: "circle",
        ...base(record, true),
        center: record.point(10),
        radius: record.num(40, 0),
      };
    case "ARC":
      return {
        type: "arc",
        ...base(record, true),
        center: record.point(10),
        radius: record.num(40, 0),
        startAngle: record.num(50, 0) * DEG,
        endAngle: record.num(51, 360) * DEG,
      };
    case "ELLIPSE":
      return {
        type: "ellipse",
        ...base(record, false),
        center: record.point(10),
        majorAxis: record.point(11),
        ratio: record.num(40, 1),
        startParam: record.num(41, 0),
        endParam: record.num(42, Math.PI * 2),
      };
    case "POINT":
      return { type: "point", ...base(record, false), position: record.point(10) };
    case "LWPOLYLINE":
      return lwpolyline(record);
    case "SPLINE":
      return spline(record);
    case "TEXT":
      return text(record, 73);
    case "MTEXT":
      return mtext(record);
    case "SOLID":
    case "TRACE":
      return { type: "solid", ...base(record, true), points: points(record, [10, 11, 12, 13]) };
    case "3DFACE":
      return {
        type: "solid",
        ...base(record, false),
        points: points(record, [10, 11, 12, 13]),
        outlineOnly: true,
      };
    case "HATCH":
      return hatch(record);
    case "DIMENSION":
    case "ARC_DIMENSION":
      return {
        type: "dimension",
        ...base(record, true),
        ...(record.has(2) ? { blockName: record.str(2)?.trim() } : {}),
        ...(record.has(42) ? { measurement: record.num(42, 0) } : {}),
        ...(record.has(1) ? { text: record.str(1) } : {}),
      };
    case "LEADER": {
      const vertices: Point[] = [];
      record.pairs.forEach((pair, index) => {
        if (pair.code !== 10) return;
        const next = record.pairs[index + 1];
        vertices.push({ x: toNumber(pair.value), y: next?.code === 20 ? toNumber(next.value) : 0 });
      });
      return {
        type: "leader",
        ...base(record, false),
        vertices,
        hasArrowhead: record.num(71, 1) === 1,
      };
    }
    case "VIEWPORT":
      return {
        type: "viewport",
        ...base(record, false),
        center: record.point(10),
        width: record.num(40, 0),
        height: record.num(41, 0),
        viewCenter: record.point(12),
        viewHeight: record.num(45, 1),
        twist: record.num(51, 0) * DEG,
        ...(record.has(69) ? { id: record.num(69, 0) } : {}),
      };
    case "ACAD_TABLE":
      // A table is a block reference to its anonymous "*T" block (scale 1).
      return {
        type: "insert",
        ...base(record, true),
        blockName: record.str(2)?.trim() ?? "",
        position: record.point(10),
        scale: { x: 1, y: 1, z: 1 },
        rotation: record.has(11) ? Math.atan2(record.num(21, 0), record.num(11, 1)) : 0,
        columnCount: 1,
        rowCount: 1,
        columnSpacing: 0,
        rowSpacing: 0,
        attributes: [],
      };
    case "RAY":
    case "XLINE":
      return {
        type: record.type === "RAY" ? "ray" : "xline",
        ...base(record, false),
        basePoint: record.point(10),
        direction: record.point(11),
      };
    default:
      return undefined;
  }
}

function unsupported(record: DxfRecord, context: EntityContext): CadEntity {
  context.unsupported.set(record.type, (context.unsupported.get(record.type) ?? 0) + 1);
  return { type: "unsupported", ...base(record, false), sourceType: record.type };
}

/** POLYLINE + VERTEX* + SEQEND → polyline (2D/3D) or unsupported (meshes). */
function polyline(record: DxfRecord, vertices: DxfRecord[], context: EntityContext): CadEntity {
  const flags = record.num(70, 0);
  if ((flags & (16 | 64)) !== 0) return unsupported(record, context);
  const is3d = (flags & 8) === 8;
  const mapped: PolylineVertex[] = [];
  for (const vertex of vertices) {
    if ((vertex.num(70, 0) & 16) === 16) continue; // spline frame control point
    const point: PolylineVertex = { x: vertex.num(10, 0), y: vertex.num(20, 0) };
    if (is3d) point.z = vertex.num(30, 0);
    const bulge = vertex.num(42, 0);
    if (bulge !== 0 && !is3d) point.bulge = bulge;
    const startWidth = vertex.num(40);
    const endWidth = vertex.num(41);
    if (startWidth !== undefined) point.startWidth = startWidth;
    if (endWidth !== undefined) point.endWidth = endWidth;
    mapped.push(point);
  }
  const entity: PolylineEntity = {
    type: "polyline",
    ...base(record, !is3d),
    vertices: mapped,
    closed: (flags & 1) === 1,
  };
  const width = record.num(40, 0);
  if (width > 0 && width === record.num(41, 0)) entity.constantWidth = width;
  return entity;
}

/**
 * Converts a stream of entity records (an ENTITIES section or a block body)
 * into model entities, folding POLYLINE/VERTEX and INSERT/ATTRIB sequences.
 */
export function parseEntityRecords(
  records: readonly DxfRecord[],
  context: EntityContext,
): ParsedEntity[] {
  const result: ParsedEntity[] = [];
  let index = 0;
  const followers = (type: string): DxfRecord[] => {
    const items: DxfRecord[] = [];
    while (records[index]?.type === type) items.push(records[index++] as DxfRecord);
    if (records[index]?.type === "SEQEND") index++;
    return items;
  };

  while (index < records.length) {
    const record = records[index++] as DxfRecord;
    let entity: CadEntity | undefined;
    if (record.type === "POLYLINE") {
      entity = polyline(record, followers("VERTEX"), context);
    } else if (record.type === "INSERT") {
      const attributes =
        record.num(66, 0) === 1 ? followers("ATTRIB").map((item) => text(item, 74)) : [];
      entity = insert(record, attributes);
    } else if (IGNORED.has(record.type)) {
      continue;
    } else {
      entity = simpleEntity(record) ?? unsupported(record, context);
    }
    result.push({ entity, inPaperSpace: record.num(67, 0) === 1 });
  }
  return result;
}
