import { colorToCss } from "../model/colors";
import type { Bounds, CadDocument, CadEntity, CadEntityType } from "../model/types";

/** A property value shown in an inspector: primitives only, so it stays JSON-serializable. */
export type PropertyValue = string | number | boolean | null;

/** One entity as listed by `collectEntities`: plain data, never the entity itself. */
export interface EntityInfo {
  type: CadEntityType;
  layer: string;
  handle?: string;
  /** Resolved CSS colour; undefined when it depends on the theme (BYLAYER with no concrete layer colour). */
  color?: string;
  visible: boolean;
}

/** One entity with its readable properties, including exact derived measurements. */
export interface EntityDetails extends EntityInfo {
  properties: Record<string, PropertyValue>;
}

export interface EntityFilter {
  /** Layout name; defaults to the model layout. */
  layout?: string;
  layer?: string;
  type?: CadEntityType;
}

/** What a drawing contains, without exposing the document itself. */
export interface DocumentSummary {
  format: string;
  version?: string;
  /** Unit symbol derived from `$INSUNITS` (`mm`, `cm`, `m`, `in`, `ft`, `yd`); absent when unitless or unknown. */
  units?: string;
  /** Top-level entities of every layout; block contents are counted per block, not here. */
  entityCount: number;
  countsByType: Partial<Record<CadEntityType, number>>;
  layerCount: number;
  blockCount: number;
  layoutCount: number;
  /** Extents saved in the header (`$EXTMIN`/`$EXTMAX`); null when missing. Use `viewer.getExtents()` for the rendered extents. */
  bounds: Bounds | null;
}

/** `$INSUNITS` → symbol; undefined for unitless (0) and for codes we do not map. */
const UNITS: Record<number, string> = {
  1: "in",
  2: "ft",
  4: "mm",
  5: "cm",
  6: "m",
  7: "km",
  10: "yd",
};

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function text(value: number): string {
  return String(round(value));
}

function point(p: { x: number; y: number }): string {
  return `${text(p.x)}, ${text(p.y)}`;
}

function degrees(radians: number): number {
  return round((radians * 180) / Math.PI);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Exact length of one polyline segment, following its bulge when present. */
function segmentLength(
  a: { x: number; y: number; bulge?: number },
  b: { x: number; y: number },
): number {
  const chord = distance(a, b);
  const bulge = a.bulge ?? 0;
  if (bulge === 0) return chord;
  const theta = 4 * Math.atan(bulge);
  const radius = chord / (2 * Math.sin(theta / 2));
  return Math.abs(radius * theta);
}

/** CSS colour of an entity, resolving BYLAYER/BYBLOCK against its layer. */
function entityColor(entity: CadEntity, document?: CadDocument): string | undefined {
  const direct = colorToCss(entity.color);
  if (direct) return direct;
  const layer = document?.layers.get(entity.layer);
  return layer ? colorToCss(layer.color) : undefined;
}

function info(entity: CadEntity, document?: CadDocument): EntityInfo {
  return {
    type: entity.type,
    layer: entity.layer,
    ...(entity.handle ? { handle: entity.handle } : {}),
    ...(entityColor(entity, document) ? { color: entityColor(entity, document) } : {}),
    visible: entity.visible !== false,
  };
}

/** Summarizes a drawing: counts, layers, blocks, layouts and the saved extents. */
export function summarizeDocument(document: CadDocument): DocumentSummary {
  const countsByType: Partial<Record<CadEntityType, number>> = {};
  let entityCount = 0;
  for (const layout of document.layouts) {
    for (const entity of layout.entities) {
      entityCount += 1;
      countsByType[entity.type] = (countsByType[entity.type] ?? 0) + 1;
    }
  }
  const units =
    document.header.insUnits === undefined ? undefined : UNITS[document.header.insUnits];
  return {
    format: document.format,
    ...(document.header.version ? { version: document.header.version } : {}),
    ...(units ? { units } : {}),
    entityCount,
    countsByType,
    layerCount: document.layers.size,
    blockCount: document.blocks.size,
    layoutCount: document.layouts.length,
    bounds: document.header.extents ?? null,
  };
}

/** Lists top-level entities of one layout (model space by default) as plain data. */
export function collectEntities(document: CadDocument, filter: EntityFilter = {}): EntityInfo[] {
  const layout = filter.layout
    ? document.layouts.find((candidate) => candidate.name === filter.layout)
    : document.layouts.find((candidate) => candidate.isModel);
  if (!layout) return [];
  const matches = (entity: CadEntity) =>
    (filter.layer === undefined || entity.layer === filter.layer) &&
    (filter.type === undefined || entity.type === filter.type);
  return layout.entities.filter(matches).map((entity) => info(entity, document));
}

/** Reads one entity into plain properties, with exact measurements where they exist. */
export function describeEntity(entity: CadEntity, document?: CadDocument): EntityDetails {
  const properties: Record<string, PropertyValue> = {};
  const add = (values: Record<string, PropertyValue | undefined>) => {
    for (const [key, value] of Object.entries(values))
      if (value !== undefined) properties[key] = value;
  };

  switch (entity.type) {
    case "line":
      add({
        start: point(entity.start),
        end: point(entity.end),
        length: round(distance(entity.start, entity.end)),
      });
      break;
    case "circle":
      add({
        center: point(entity.center),
        radius: entity.radius,
        diameter: round(entity.radius * 2),
        area: round(Math.PI * entity.radius ** 2),
      });
      break;
    case "arc": {
      const span = (entity.endAngle - entity.startAngle + 2 * Math.PI) % (2 * Math.PI);
      add({
        center: point(entity.center),
        radius: entity.radius,
        startAngle: degrees(entity.startAngle),
        endAngle: degrees(entity.endAngle),
        length: round(entity.radius * span),
      });
      break;
    }
    case "ellipse":
      add({
        center: point(entity.center),
        majorAxis: point(entity.majorAxis),
        ratio: entity.ratio,
        startParam: entity.startParam,
        endParam: entity.endParam,
      });
      break;
    case "polyline": {
      const vertices = entity.vertices;
      let length = 0;
      for (let index = 0; index < vertices.length - 1; index += 1) {
        const current = vertices[index];
        const next = vertices[index + 1];
        if (current && next) length += segmentLength(current, next);
      }
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (entity.closed && first && last && vertices.length > 2)
        length += segmentLength(last, first);
      add({
        vertices: vertices.length,
        closed: entity.closed,
        length: round(length),
        ...(entity.constantWidth !== undefined ? { constantWidth: entity.constantWidth } : {}),
      });
      break;
    }
    case "spline":
      add({
        degree: entity.degree,
        controlPoints: entity.controlPoints.length,
        closed: entity.closed,
      });
      break;
    case "point":
      add({ position: point(entity.position) });
      break;
    case "text":
      add({ value: entity.value, height: entity.height, rotation: degrees(entity.rotation) });
      break;
    case "mtext":
      add({ value: entity.value, height: entity.height, width: entity.width });
      break;
    case "insert":
      add({
        blockName: entity.blockName,
        position: point(entity.position),
        rotation: degrees(entity.rotation),
        columns: entity.columnCount,
        rows: entity.rowCount,
        attributes: entity.attributes.length,
      });
      break;
    case "solid":
      add({ points: entity.points.length });
      break;
    case "hatch":
      add({
        patternName: entity.patternName,
        solid: entity.solid,
        loops: entity.loops.length,
      });
      break;
    case "dimension":
      add({
        ...(entity.measurement !== undefined ? { measurement: round(entity.measurement) } : {}),
        ...(entity.text !== undefined ? { text: entity.text } : {}),
        ...(entity.blockName ? { blockName: entity.blockName } : {}),
      });
      break;
    case "leader":
      add({ vertices: entity.vertices.length, arrowhead: entity.hasArrowhead });
      break;
    case "viewport":
      add({ center: point(entity.center), width: entity.width, height: entity.height });
      break;
    case "ray":
    case "xline":
      add({ basePoint: point(entity.basePoint), direction: point(entity.direction) });
      break;
    case "unsupported":
      add({ sourceType: entity.sourceType });
      break;
  }

  return { ...info(entity, document), properties };
}
