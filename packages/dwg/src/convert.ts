import {
  type CadBlock,
  type CadDocument,
  type CadEntity,
  type CadLayer,
  type CadLayout,
  type Color,
  createDefaultLayer,
  createEmptyDocument,
  DEFAULT_LAYER,
  decodeTextValue,
  decodeUnicodeEscapes,
  type HatchEdge,
  type HatchLoop,
  type LineWeight,
  MODEL_LAYOUT,
  type MTextAttachment,
  type Point,
  type PolylineVertex,
  type TextEntity,
  type TextHAlign,
  type TextVAlign,
  type Vec3,
} from "@jesusjbriceno/cad-viewer-core";
import type { DwgDatabase } from "@mlightcad/libredwg-web";

/**
 * libredwg-web objects are read loosely: fields are optional in practice even
 * when typed as required, and a single malformed entity must not break the
 * whole drawing.
 */
type Raw = Record<string, unknown>;

const H_ALIGN: TextHAlign[] = ["left", "center", "right", "aligned", "middle", "fit"];
const V_ALIGN: TextVAlign[] = ["baseline", "bottom", "middle", "top"];
/** DWG line weight enum (index) → hundredths of a millimetre. */
const LINEWEIGHTS = [
  0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200,
  211,
];
/** Records that only exist as parts of another entity. */
const SKIPPED = new Set([
  "ATTRIB",
  "ATTDEF",
  "SEQEND",
  "VERTEX",
  "VERTEX_2D",
  "VERTEX_3D",
  "BLOCK",
  "ENDBLK",
]);
const MODEL_BLOCK = "*MODEL_SPACE";
const DWG_CLOSED = 0x200;

export interface ConvertOptions {
  /** Version string read from the file header (e.g. "AC1027"). */
  version?: string;
}

const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const str = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;
const raw = (value: unknown): Raw => (value && typeof value === "object" ? (value as Raw) : {});
const list = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);

function point(value: unknown, required = true): Point {
  if (required && (value === null || value === undefined)) throw new Error("Missing point.");
  const p = raw(value);
  const result: Point = { x: num(p.x), y: num(p.y) };
  if (typeof p.z === "number") result.z = p.z;
  return result;
}

function color(entity: Raw): Color {
  if (typeof entity.color === "number") return { kind: "rgb", value: entity.color & 0xffffff };
  const index = num(entity.colorIndex, 256);
  if (index === 0) return { kind: "byBlock" };
  if (index >= 1 && index <= 255) return { kind: "aci", index };
  return { kind: "byLayer" };
}

export function lineWeightOf(value: unknown): LineWeight | undefined {
  if (typeof value !== "number") return undefined;
  if (value === 29) return "byLayer";
  if (value === 30) return "byBlock";
  if (value === 31) return "default";
  return LINEWEIGHTS[value];
}

function extrusion(value: unknown): Vec3 | undefined {
  const v = raw(value);
  const normal = { x: num(v.x), y: num(v.y), z: num(v.z, 1) };
  const zero = normal.x === 0 && normal.y === 0 && normal.z === 0;
  const standard = normal.x === 0 && normal.y === 0 && normal.z > 0;
  return zero || standard ? undefined : normal;
}

type EntityProps = Pick<
  TextEntity,
  | "layer"
  | "color"
  | "handle"
  | "lineType"
  | "lineTypeScale"
  | "lineWeight"
  | "visible"
  | "extrusion"
>;

function base(entity: Raw, ocs: boolean): EntityProps {
  const props: EntityProps = { layer: str(entity.layer) ?? DEFAULT_LAYER, color: color(entity) };
  const handle = str(entity.handle);
  if (handle) props.handle = handle;
  const lineType = str(entity.lineType);
  if (lineType) props.lineType = lineType;
  if (typeof entity.lineTypeScale === "number" && entity.lineTypeScale !== 1)
    props.lineTypeScale = entity.lineTypeScale;
  const weight = lineWeightOf(entity.lineweight);
  if (weight !== undefined) props.lineWeight = weight;
  if (entity.isVisible === false) props.visible = false;
  if (ocs) {
    const normal = extrusion(entity.extrusionDirection);
    if (normal) props.extrusion = normal;
  }
  return props;
}

function text(entity: Raw, textBase: Raw): TextEntity {
  const hAlign = H_ALIGN[num(textBase.halign)] ?? "left";
  const vAlign = V_ALIGN[num(textBase.valign)] ?? "baseline";
  const result: TextEntity = {
    type: "text",
    ...base(
      { ...entity, extrusionDirection: textBase.extrusionDirection ?? entity.extrusionDirection },
      true,
    ),
    position: point(textBase.startPoint),
    height: num(textBase.textHeight, 1),
    rotation: num(textBase.rotation),
    value: decodeTextValue(typeof textBase.text === "string" ? textBase.text : ""),
    hAlign,
    vAlign,
  };
  if (hAlign !== "left" || vAlign !== "baseline")
    result.alignPoint = point(textBase.endPoint, false);
  if (typeof textBase.xScale === "number" && textBase.xScale !== 1)
    result.widthFactor = textBase.xScale;
  if (typeof textBase.obliqueAngle === "number" && textBase.obliqueAngle !== 0)
    result.obliqueAngle = textBase.obliqueAngle;
  const style = str(textBase.styleName);
  if (style) result.style = style;
  return result;
}

function hatchLoop(path: Raw): HatchLoop {
  if ((num(path.boundaryPathTypeFlag) & 2) === 2) {
    const vertices = list(path.vertices).map((vertex): PolylineVertex => {
      const result: PolylineVertex = { x: num(vertex.x), y: num(vertex.y) };
      if (num(vertex.bulge) !== 0) result.bulge = num(vertex.bulge);
      return result;
    });
    return { kind: "polyline", vertices, closed: path.isClosed !== false };
  }
  const edges: HatchEdge[] = [];
  for (const edge of list(path.edges)) {
    const ccw = edge.isCCW !== false;
    switch (num(edge.type)) {
      case 1:
        edges.push({ kind: "line", start: point(edge.start), end: point(edge.end) });
        break;
      case 2:
        edges.push({
          kind: "arc",
          center: point(edge.center),
          radius: num(edge.radius),
          startAngle: num(edge.startAngle),
          endAngle: num(edge.endAngle),
          ccw,
        });
        break;
      case 3:
        edges.push({
          kind: "ellipse",
          center: point(edge.center),
          majorAxis: point(edge.end),
          ratio: num(edge.lengthOfMinorAxis, 1),
          startAngle: num(edge.startAngle),
          endAngle: num(edge.endAngle),
          ccw,
        });
        break;
      case 4: {
        const controls = list(edge.controlPoints);
        const weights = controls.map((control) => num(control.weight, 1));
        edges.push({
          kind: "spline",
          degree: num(edge.degree, 3),
          knots: (Array.isArray(edge.knots) ? edge.knots : []).map((knot) => num(knot)),
          controlPoints: controls.map((control) => ({ x: num(control.x), y: num(control.y) })),
          ...(controls.some((control) => typeof control.weight === "number") ? { weights } : {}),
        });
        break;
      }
    }
  }
  return { kind: "edges", edges };
}

function entityOf(entity: Raw): CadEntity | undefined {
  switch (entity.type) {
    case "LINE":
      return {
        type: "line",
        ...base(entity, false),
        start: point(entity.startPoint),
        end: point(entity.endPoint),
      };
    case "CIRCLE":
      return {
        type: "circle",
        ...base(entity, true),
        center: point(entity.center),
        radius: num(entity.radius),
      };
    case "ARC":
      return {
        type: "arc",
        ...base(entity, true),
        center: point(entity.center),
        radius: num(entity.radius),
        startAngle: num(entity.startAngle),
        endAngle: num(entity.endAngle, Math.PI * 2),
      };
    case "ELLIPSE":
      return {
        type: "ellipse",
        ...base(entity, false),
        center: point(entity.center),
        majorAxis: point(entity.majorAxisEndPoint),
        ratio: num(entity.axisRatio, 1),
        startParam: num(entity.startAngle),
        endParam: num(entity.endAngle, Math.PI * 2),
      };
    case "POINT":
      return { type: "point", ...base(entity, false), position: point(entity.position) };
    case "LWPOLYLINE": {
      const vertices = list(entity.vertices).map((vertex): PolylineVertex => {
        const result: PolylineVertex = { x: num(vertex.x), y: num(vertex.y) };
        if (num(vertex.bulge) !== 0) result.bulge = num(vertex.bulge);
        if (typeof vertex.startWidth === "number") result.startWidth = vertex.startWidth;
        if (typeof vertex.endWidth === "number") result.endWidth = vertex.endWidth;
        return result;
      });
      const polyline: CadEntity = {
        type: "polyline",
        ...base(entity, true),
        vertices,
        closed: (num(entity.flag) & DWG_CLOSED) === DWG_CLOSED,
      };
      if (num(entity.constantWidth) > 0) polyline.constantWidth = num(entity.constantWidth);
      return polyline;
    }
    case "POLYLINE2D":
    case "POLYLINE3D": {
      const is3d = entity.type === "POLYLINE3D";
      const vertices = list(entity.vertices)
        .filter((vertex) => (num(vertex.flag) & 16) === 0)
        .map((vertex): PolylineVertex => {
          const result: PolylineVertex = { x: num(vertex.x), y: num(vertex.y) };
          if (is3d) result.z = num(vertex.z);
          if (!is3d && num(vertex.bulge) !== 0) result.bulge = num(vertex.bulge);
          if (!is3d && num(vertex.startWidth) !== 0) result.startWidth = num(vertex.startWidth);
          if (!is3d && num(vertex.endWidth) !== 0) result.endWidth = num(vertex.endWidth);
          return result;
        });
      const polyline: CadEntity = {
        type: "polyline",
        ...base(entity, !is3d),
        vertices,
        closed: (num(entity.flag) & 1) === 1,
      };
      const width = num(entity.startWidth);
      if (!is3d && width > 0 && width === num(entity.endWidth)) polyline.constantWidth = width;
      return polyline;
    }
    case "SPLINE": {
      const controlPoints = list(entity.controlPoints).map((p) => point(p));
      const weights = (Array.isArray(entity.weights) ? entity.weights : []).map((w) => num(w, 1));
      const fitPoints = list(entity.fitPoints).map((p) => point(p));
      return {
        type: "spline",
        ...base(entity, false),
        degree: num(entity.degree, 3),
        knots: (Array.isArray(entity.knots) ? entity.knots : []).map((k) => num(k)),
        controlPoints,
        ...(weights.length === controlPoints.length && weights.length > 0 ? { weights } : {}),
        ...(fitPoints.length > 0 ? { fitPoints } : {}),
        closed: (num(entity.flag) & 1) === 1,
      };
    }
    case "TEXT":
      return text(entity, entity);
    case "MTEXT": {
      const direction = raw(entity.direction);
      const hasDirection = num(direction.x) !== 0 || num(direction.y) !== 0;
      const attachment = num(entity.attachmentPoint, 1);
      const style = str(entity.styleName);
      return {
        type: "mtext",
        ...base(entity, false),
        position: point(entity.insertionPoint),
        height: num(entity.textHeight, 1),
        width: num(entity.rectWidth),
        rotation: hasDirection
          ? Math.atan2(num(direction.y), num(direction.x))
          : num(entity.rotation),
        attachment: (attachment >= 1 && attachment <= 9 ? attachment : 1) as MTextAttachment,
        value: decodeUnicodeEscapes(typeof entity.text === "string" ? entity.text : ""),
        ...(typeof entity.lineSpacing === "number" && entity.lineSpacing !== 1
          ? { lineSpacingFactor: entity.lineSpacing }
          : {}),
        ...(style ? { style } : {}),
      };
    }
    case "INSERT":
      return {
        type: "insert",
        ...base(entity, true),
        blockName: str(entity.name) ?? "",
        position: point(entity.insertionPoint),
        scale: { x: num(entity.xScale, 1), y: num(entity.yScale, 1), z: num(entity.zScale, 1) },
        rotation: num(entity.rotation),
        columnCount: Math.max(1, num(entity.columnCount, 1)),
        rowCount: Math.max(1, num(entity.rowCount, 1)),
        columnSpacing: num(entity.columnSpacing),
        rowSpacing: num(entity.rowSpacing),
        attributes: list(entity.attribs).map((attribute) => {
          const result = text(attribute, raw(attribute.text));
          if ((num(attribute.flags) & 1) === 1) result.visible = false;
          return result;
        }),
      };
    case "ACAD_TABLE": {
      const direction = raw(entity.directionVector);
      return {
        type: "insert",
        ...base(entity, true),
        blockName: str(entity.name) ?? "",
        position: point(entity.startPoint),
        scale: { x: 1, y: 1, z: 1 },
        rotation:
          num(direction.x) !== 0 || num(direction.y) !== 0
            ? Math.atan2(num(direction.y), num(direction.x))
            : 0,
        columnCount: 1,
        rowCount: 1,
        columnSpacing: 0,
        rowSpacing: 0,
        attributes: [],
      };
    }
    case "SOLID":
    case "TRACE":
    case "3DFACE": {
      const corners = [entity.corner1, entity.corner2, entity.corner3, entity.corner4].filter(
        (corner) => corner !== undefined && corner !== null,
      );
      const face = entity.type === "3DFACE";
      return {
        type: "solid",
        ...base(entity, !face),
        points: corners.map((corner) => point(corner)),
        ...(face ? { outlineOnly: true } : {}),
      };
    }
    case "HATCH":
      return {
        type: "hatch",
        ...base(entity, true),
        patternName: str(entity.patternName) ?? "",
        solid: num(entity.solidFill) === 1,
        loops: list(entity.boundaryPaths).map(hatchLoop),
        patternLines: list(entity.definitionLines).map((line) => ({
          angle: num(line.angle),
          origin: point(line.base, false),
          offset: point(line.offset, false),
          dashes: (Array.isArray(line.dashLengths) ? line.dashLengths : []).map((dash) =>
            num(dash),
          ),
        })),
      };
    case "DIMENSION":
      return {
        type: "dimension",
        ...base(entity, true),
        ...(str(entity.name) ? { blockName: str(entity.name) } : {}),
        ...(typeof entity.measurement === "number" ? { measurement: entity.measurement } : {}),
        ...(typeof entity.text === "string" ? { text: entity.text } : {}),
      };
    case "LEADER":
      return {
        type: "leader",
        ...base(entity, false),
        vertices: list(entity.vertices).map((p) => point(p)),
        hasArrowhead: entity.isArrowheadEnabled !== false,
      };
    case "VIEWPORT":
      return {
        type: "viewport",
        ...base(entity, false),
        center: point(entity.viewportCenter),
        width: num(entity.width),
        height: num(entity.height),
        viewCenter: point(entity.displayCenter, false),
        viewHeight: num(entity.viewHeight, 1),
        twist: num(entity.viewTwistAngle),
        ...(typeof entity.viewportId === "number" ? { id: entity.viewportId } : {}),
      };
    case "RAY":
    case "XLINE":
      return {
        type: entity.type === "RAY" ? "ray" : "xline",
        ...base(entity, false),
        basePoint: point(entity.firstPoint),
        direction: point(entity.unitDirection),
      };
    default:
      return undefined;
  }
}

class Converter {
  readonly unsupported = new Map<string, number>();

  entities(entities: readonly Raw[]): CadEntity[] {
    const result: CadEntity[] = [];
    for (const entity of entities) {
      const type = typeof entity.type === "string" ? entity.type : "UNKNOWN";
      if (SKIPPED.has(type)) continue;
      let converted: CadEntity | undefined;
      try {
        converted = entityOf(entity);
      } catch {
        converted = undefined;
      }
      if (!converted) {
        this.unsupported.set(type, (this.unsupported.get(type) ?? 0) + 1);
        converted = {
          type: "unsupported",
          layer: str(entity.layer) ?? DEFAULT_LAYER,
          color: { kind: "byLayer" },
          sourceType: type,
        };
      }
      result.push(converted);
    }
    return result;
  }
}

function layerOf(entry: Raw): CadLayer {
  const index = num(entry.colorIndex, 7);
  const layerColor: Color =
    index >= 1 && index <= 255
      ? { kind: "aci", index }
      : typeof entry.color === "number"
        ? { kind: "rgb", value: entry.color & 0xffffff }
        : { kind: "aci", index: 7 };
  const layer: CadLayer = {
    name: str(entry.name) ?? DEFAULT_LAYER,
    color: layerColor,
    visible: entry.off !== true,
    frozen: entry.frozen === true,
    locked: entry.locked === true,
  };
  const lineType = str(entry.lineType);
  if (lineType) layer.lineType = lineType;
  const weight = lineWeightOf(entry.lineweight);
  if (weight !== undefined) layer.lineWeight = weight;
  return layer;
}

/** Converts a libredwg-web `DwgDatabase` into the neutral `CadDocument` model. */
export function convertDwgDatabase(
  database: DwgDatabase,
  options: ConvertOptions = {},
): CadDocument {
  // SAFETY: DwgDatabase is a plain JSON-like object; every field is read through
  // the defensive helpers above, so treating it as a loose record is sound.
  const db = database as unknown as Raw;
  const document = createEmptyDocument("dwg");
  const converter = new Converter();
  const header = raw(db.header);
  const tables = raw(db.tables);

  if (options.version) document.header.version = options.version;
  else if (str(header.ACADVER)) document.header.version = str(header.ACADVER);
  if (typeof header.INSUNITS === "number") document.header.insUnits = header.INSUNITS;
  if (header.EXTMIN && header.EXTMAX) {
    const min = raw(header.EXTMIN);
    const max = raw(header.EXTMAX);
    const extents = { minX: num(min.x), minY: num(min.y), maxX: num(max.x), maxY: num(max.y) };
    const sane = Object.values(extents).every((value) => Math.abs(value) < 1e19);
    if (sane && extents.minX <= extents.maxX && extents.minY <= extents.maxY)
      document.header.extents = extents;
  }
  if (typeof header.LTSCALE === "number") document.header.lineTypeScale = header.LTSCALE;
  if (typeof header.PDMODE === "number") document.header.pointDisplayMode = header.PDMODE;
  if (typeof header.PDSIZE === "number") document.header.pointDisplaySize = header.PDSIZE;

  for (const entry of list(raw(tables.LAYER).entries)) {
    const layer = layerOf(entry);
    document.layers.set(layer.name, layer);
  }
  for (const entry of list(raw(tables.LTYPE).entries)) {
    const name = str(entry.name);
    if (!name) continue;
    const description = str(entry.description);
    document.lineTypes.set(name, {
      name,
      ...(description ? { description } : {}),
      pattern: list(entry.pattern).map((element) => num(element.elementLength)),
    });
  }
  for (const entry of list(raw(tables.STYLE).entries)) {
    const name = str(entry.name);
    if (!name) continue;
    const font = str(entry.font);
    document.textStyles.set(name, {
      name,
      ...(font ? { font } : {}),
      fixedHeight: num(entry.fixedTextHeight),
      widthFactor: num(entry.widthFactor, 1),
      obliqueAngle: num(entry.obliqueAngle),
    });
  }

  const blockRecords = list(raw(tables.BLOCK_RECORD).entries);
  const recordByHandle = new Map(blockRecords.map((record) => [String(record.handle), record]));
  const modelRecord = blockRecords.find(
    (record) => String(record.name).toUpperCase() === MODEL_BLOCK,
  );
  for (const record of blockRecords) {
    const name = str(record.name);
    if (!name || name.toUpperCase() === MODEL_BLOCK) continue;
    const block: CadBlock = {
      name,
      basePoint: point(record.basePoint, false),
      entities: converter.entities(list(record.entities)),
    };
    document.blocks.set(name, block);
  }

  // Route top-level entities by owner block record: model space, or a paper layout.
  const owned = new Map<string, Raw[]>();
  for (const entity of list(db.entities)) {
    const owner = String(entity.ownerBlockRecordSoftId ?? modelRecord?.handle ?? "");
    const bucket = owned.get(owner) ?? [];
    bucket.push(entity);
    owned.set(owner, bucket);
  }
  const modelHandle = String(modelRecord?.handle ?? "");
  const modelEntities = [
    ...(owned.get(modelHandle) ?? []),
    ...(modelHandle === "" ? (owned.get("") ?? []) : []),
  ];
  const model: CadLayout = {
    name: MODEL_LAYOUT,
    isModel: true,
    tabOrder: 0,
    entities: converter.entities(modelEntities),
  };

  const papers: CadLayout[] = list(raw(db.objects).LAYOUT)
    .filter(
      (layout) =>
        String(layout.paperSpaceTableId) !== modelHandle &&
        str(layout.layoutName)?.toUpperCase() !== "MODEL",
    )
    .sort((a, b) => num(a.tabOrder) - num(b.tabOrder))
    .map((layout) => {
      const handle = String(layout.paperSpaceTableId);
      const record = recordByHandle.get(handle);
      const fromRecord = list(record?.entities);
      const seen = new Set(fromRecord.map((entity) => entity.handle));
      const extra = (owned.get(handle) ?? []).filter((entity) => !seen.has(entity.handle));
      const min = raw(layout.minLimit);
      const max = raw(layout.maxLimit);
      const paper: CadLayout = {
        name: str(layout.layoutName) ?? `Layout${num(layout.tabOrder)}`,
        isModel: false,
        tabOrder: num(layout.tabOrder),
        entities: converter.entities([...fromRecord, ...extra]),
      };
      if (num(max.x) > num(min.x) && num(max.y) > num(min.y))
        paper.limits = { minX: num(min.x), minY: num(min.y), maxX: num(max.x), maxY: num(max.y) };
      return paper;
    });
  document.layouts = [model, ...papers];

  for (const [type, count] of converter.unsupported) document.unsupported.set(type, count);
  const ensure = (entity: CadEntity) => {
    if (!document.layers.has(entity.layer))
      document.layers.set(entity.layer, createDefaultLayer(entity.layer));
    if (entity.type === "insert") entity.attributes.forEach(ensure);
  };
  if (!document.layers.has(DEFAULT_LAYER)) document.layers.set(DEFAULT_LAYER, createDefaultLayer());
  for (const layout of document.layouts) layout.entities.forEach(ensure);
  for (const block of document.blocks.values()) block.entities.forEach(ensure);
  return document;
}
