import { colorToCss } from "../model/colors";
import type {
  Bounds,
  CadBlock,
  CadDocument,
  CadEntity,
  CadLayout,
  Color,
  InsertEntity,
  LineWeight,
  MTextEntity,
  Point,
  PolylineEntity,
  TextEntity,
} from "../model/types";
import {
  apply,
  arcPoints,
  bulgePoints,
  ellipsePoints,
  emptyBounds,
  extendBounds,
  IDENTITY,
  isEmptyBounds,
  type Matrix,
  matrixScale,
  multiply,
  ocsMatrix,
  rotation,
  scaling,
  splinePoints,
  translation,
  unionBounds,
  type XY,
} from "./geometry";
import { clipPattern, loopToRing } from "./hatch";
import { mtextToLines, wrapLines } from "./mtext";

/** Color token resolved at draw time to the theme foreground (ACI 7, top-level BYBLOCK). */
export const FOREGROUND = "foreground";

const MAX_INSERT_DEPTH = 16;
const MAX_PATTERN_SEGMENTS = 20_000;
/** CSS pixels per hundredth of a millimetre (96 dpi). */
const PX_PER_LINEWEIGHT = 96 / 25.4 / 100;
const DEFAULT_LINEWEIGHT = 25;
const MAX_WEIGHT_PX = 8;
/** Estimated glyph advance as a fraction of the text height, used before measuring. */
export const CHAR_WIDTH_RATIO = 0.6;
/** AutoCAD's default MTEXT line pitch is 5/3 of the text height. */
const MTEXT_LINE_PITCH = 5 / 3;

/** What a primitive belongs to: the source entity and where it was reached from. */
export interface PickTarget {
  entity: CadEntity;
  /** Effective layer (layer "0" inside a block resolves to the insert's layer). */
  layer: string;
  /** Block names from the outermost insert down to the entity's block. */
  blockPath: string[];
}

interface PrimitiveBase {
  /** CSS color or `FOREGROUND`. */
  color: string;
  bounds: Bounds;
  /** Shared by every primitive of one entity instance (used for highlighting). */
  target: PickTarget;
  /** Index into `DisplayList.chains`: all layers that must be visible for this primitive. */
  chain: number;
}

export interface StrokePrimitive extends PrimitiveBase {
  kind: "stroke";
  /** Flat world coordinates [x0, y0, x1, y1, ...]. */
  points: Float64Array;
  closed: boolean;
  /** When true, `points` holds independent segments [x1, y1, x2, y2, ...]. */
  segments?: boolean;
  /** Width in world units (polyline width); 0 = use `weightPx`. */
  width: number;
  /** Line weight in CSS pixels, at least 1. */
  weightPx: number;
  /** Dash pattern in world units (dash, gap, ...; 0 = dot). */
  dash?: number[];
}

export interface FillPrimitive extends PrimitiveBase {
  kind: "fill";
  /** Closed rings, filled with the even-odd rule. */
  rings: Float64Array[];
}

export interface TextPrimitive extends PrimitiveBase {
  kind: "text";
  x: number;
  y: number;
  /** World rotation, radians. */
  rotation: number;
  /** Cap height in world units. */
  height: number;
  lines: string[];
  align: "left" | "center" | "right";
  baseline: "alphabetic" | "bottom" | "middle" | "top";
  widthFactor: number;
  obliqueAngle: number;
  /** Distance between baselines in world units. */
  lineHeight: number;
  /** World width that aligned/fit texts must span. */
  fitWidth?: number;
}

export interface PointPrimitive extends PrimitiveBase {
  kind: "point";
  x: number;
  y: number;
}

export interface RayPrimitive extends PrimitiveBase {
  kind: "ray";
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** XLINE extends in both directions, RAY only forward. */
  bothWays: boolean;
}

export interface ViewportPrimitive extends PrimitiveBase {
  kind: "viewport";
  center: XY;
  width: number;
  height: number;
  viewCenter: XY;
  viewHeight: number;
  twist: number;
}

export type Primitive =
  | StrokePrimitive
  | FillPrimitive
  | TextPrimitive
  | PointPrimitive
  | RayPrimitive
  | ViewportPrimitive;

export interface DisplayList {
  layout: string;
  isModel: boolean;
  /** Primitives in drawing order. */
  primitives: Primitive[];
  /** Layer chains referenced by primitives; a primitive is visible when every layer in its chain is. */
  chains: string[][];
  /** Entities per effective layer, block contents included. */
  layerCounts: Map<string, number>;
  /** World bounds of everything except rays/xlines, or null when empty. */
  bounds: Bounds | null;
}

interface Context {
  matrix: Matrix;
  /** Effective layer of the enclosing insert, for layer "0" entities. */
  insertLayer?: string;
  /** Resolved color of the enclosing insert, for BYBLOCK. */
  blockColor: string;
  blockLineType?: string;
  blockLineWeight?: number;
  /** Layers of the enclosing inserts, innermost first. */
  ancestors: string[];
  blockPath: string[];
  stack: Set<string>;
  /** World units per local unit, used to scale dash patterns. */
  scale: number;
}

class Builder {
  readonly primitives: Primitive[] = [];
  readonly chains: string[][] = [];
  readonly layerCounts = new Map<string, number>();
  private readonly chainIndex = new Map<string, number>();
  private readonly blocks = new Map<string, CadBlock>();
  private readonly lineTypes = new Map<string, number[]>();

  constructor(private readonly document: CadDocument) {
    for (const [name, block] of document.blocks) this.blocks.set(name.toUpperCase(), block);
    for (const [name, lineType] of document.lineTypes)
      this.lineTypes.set(name.toUpperCase(), lineType.pattern);
  }

  entities(entities: readonly CadEntity[], context: Context): void {
    for (const entity of entities) this.entity(entity, context);
  }

  private layerOf(entity: CadEntity, context: Context): string {
    return entity.layer === "0" && context.insertLayer !== undefined
      ? context.insertLayer
      : entity.layer;
  }

  private chainOf(layer: string, context: Context): number {
    const chain = [layer, ...context.ancestors.filter((name) => name !== layer)].filter(
      (name, index, all) => all.indexOf(name) === index,
    );
    const key = chain.join("\u0000");
    let index = this.chainIndex.get(key);
    if (index === undefined) {
      index = this.chains.length;
      this.chains.push(chain);
      this.chainIndex.set(key, index);
    }
    return index;
  }

  private layerColor(layer: string): string {
    const color = this.document.layers.get(layer)?.color;
    return color ? concreteColor(color) : FOREGROUND;
  }

  private colorOf(color: Color, layer: string, context: Context): string {
    if (color.kind === "byLayer") return this.layerColor(layer);
    if (color.kind === "byBlock") return context.blockColor;
    return concreteColor(color);
  }

  private dashOf(entity: CadEntity, layer: string, context: Context): number[] | undefined {
    let name = entity.lineType;
    if (name === undefined || name.toUpperCase() === "BYLAYER")
      name = this.document.layers.get(layer)?.lineType;
    else if (name.toUpperCase() === "BYBLOCK") name = context.blockLineType;
    const pattern = name ? this.lineTypes.get(name.toUpperCase()) : undefined;
    if (!pattern || pattern.length === 0) return undefined;
    const factor =
      (entity.lineTypeScale ?? 1) * (this.document.header.lineTypeScale ?? 1) * context.scale;
    const dash = pattern.map((value) => Math.abs(value) * factor);
    return dash.some((value) => value > 0) ? dash : undefined;
  }

  private weightOf(weight: LineWeight | undefined, layer: string, context: Context): number {
    let value: LineWeight | undefined = weight;
    if (value === undefined || value === "byLayer")
      value = this.document.layers.get(layer)?.lineWeight;
    else if (value === "byBlock") value = context.blockLineWeight;
    return typeof value === "number" && value >= 0 ? value : DEFAULT_LINEWEIGHT;
  }

  private entity(entity: CadEntity, context: Context): void {
    if (entity.visible === false || entity.type === "unsupported") return;
    const layer = this.layerOf(entity, context);
    this.layerCounts.set(layer, (this.layerCounts.get(layer) ?? 0) + 1);
    const base = {
      color: this.colorOf(entity.color, layer, context),
      target: { entity, layer, blockPath: context.blockPath },
      chain: this.chainOf(layer, context),
    };
    const weightPx = Math.min(
      MAX_WEIGHT_PX,
      Math.max(1, this.weightOf(entity.lineWeight, layer, context) * PX_PER_LINEWEIGHT),
    );
    const stroke = (local: XY[], matrix: Matrix, closed: boolean, width = 0) => {
      if (local.length < 2) return;
      const dash = this.dashOf(entity, layer, context);
      this.primitives.push({
        kind: "stroke",
        ...base,
        bounds: emptyBounds(),
        points: transform(local, matrix),
        closed,
        width: width * matrixScale(matrix),
        weightPx,
        ...(dash ? { dash } : {}),
      } as StrokePrimitive);
      finishBounds(this.primitives.at(-1) as StrokePrimitive);
    };
    const ocs = (elevation = 0) => multiply(context.matrix, ocsMatrix(entity.extrusion, elevation));

    switch (entity.type) {
      case "line":
        stroke([entity.start, entity.end], context.matrix, false);
        return;
      case "circle":
        stroke(
          arcPoints(entity.center, entity.radius, 0, Math.PI * 2).slice(0, -1),
          ocs(entity.center.z),
          true,
        );
        return;
      case "arc":
        stroke(
          arcPoints(entity.center, entity.radius, entity.startAngle, entity.endAngle),
          ocs(entity.center.z),
          false,
        );
        return;
      case "ellipse": {
        const full = Math.abs(entity.endParam - entity.startParam - Math.PI * 2) < 1e-9;
        const points = ellipsePoints(
          entity.center,
          entity.majorAxis,
          entity.ratio,
          entity.startParam,
          entity.endParam,
        );
        stroke(full ? points.slice(0, -1) : points, context.matrix, full);
        return;
      }
      case "polyline":
        this.polyline(
          entity,
          base,
          entity.extrusion ? ocs(entity.vertices[0]?.z) : context.matrix,
          stroke,
        );
        return;
      case "spline": {
        const points =
          entity.controlPoints.length > entity.degree
            ? splinePoints(entity.degree, entity.controlPoints, entity.knots, entity.weights)
            : (entity.fitPoints ?? entity.controlPoints);
        stroke(points, context.matrix, false);
        return;
      }
      case "point": {
        const p = apply(context.matrix, entity.position.x, entity.position.y);
        this.primitives.push({
          kind: "point",
          ...base,
          x: p.x,
          y: p.y,
          bounds: { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y },
        });
        return;
      }
      case "text":
        this.text(entity, base, ocs(entity.position.z));
        return;
      case "mtext":
        this.mtext(entity, base, context.matrix);
        return;
      case "insert":
        this.insert(entity, layer, base.color, context);
        return;
      case "solid": {
        const [a, b, c, d] = entity.points;
        if (!a || !b || !c) return;
        const ring = d && (d.x !== c.x || d.y !== c.y) ? [a, b, d, c] : [a, b, c];
        const matrix = entity.outlineOnly ? context.matrix : ocs(a.z);
        if (entity.outlineOnly) stroke(entity.points, matrix, true);
        else this.fill([ring], base, matrix);
        return;
      }
      case "hatch": {
        const matrix = ocs();
        const rings = entity.loops.map(loopToRing).filter((ring) => ring.length >= 3);
        if (rings.length === 0) return;
        if (entity.solid) {
          this.fill(rings, base, matrix);
          return;
        }
        const segments = clipPattern(rings, entity.patternLines, MAX_PATTERN_SEGMENTS);
        if (segments === null || entity.patternLines.length === 0) {
          for (const ring of rings) stroke(ring, matrix, true);
          return;
        }
        if (segments.length === 0) return;
        const points = new Float64Array(segments.length);
        for (let i = 0; i < segments.length; i += 2) {
          const p = apply(matrix, segments[i] as number, segments[i + 1] as number);
          points[i] = p.x;
          points[i + 1] = p.y;
        }
        const primitive: StrokePrimitive = {
          kind: "stroke",
          ...base,
          bounds: emptyBounds(),
          points,
          closed: false,
          segments: true,
          width: 0,
          weightPx,
        };
        finishBounds(primitive);
        this.primitives.push(primitive);
        return;
      }
      case "dimension": {
        const block = entity.blockName
          ? this.blocks.get(entity.blockName.toUpperCase())
          : undefined;
        if (block) this.blockContent(block, ocs(), layer, base.color, entity, context);
        return;
      }
      case "leader": {
        stroke(entity.vertices, context.matrix, false);
        const [tip, next] = entity.vertices;
        if (entity.hasArrowhead && tip && next) {
          const length = Math.hypot(next.x - tip.x, next.y - tip.y);
          if (length > 0) {
            const size = Math.min(length * 0.3, length);
            const ux = (next.x - tip.x) / length;
            const uy = (next.y - tip.y) / length;
            const back = { x: tip.x + ux * size, y: tip.y + uy * size };
            const half = size / 6;
            this.fill(
              [
                [
                  tip,
                  { x: back.x - uy * half, y: back.y + ux * half },
                  { x: back.x + uy * half, y: back.y - ux * half },
                ],
              ],
              base,
              context.matrix,
            );
          }
        }
        return;
      }
      case "viewport": {
        if (entity.id === 1 || entity.width <= 0 || entity.height <= 0) return;
        const center = apply(context.matrix, entity.center.x, entity.center.y);
        const scale = matrixScale(context.matrix);
        const width = entity.width * scale;
        const height = entity.height * scale;
        this.primitives.push({
          kind: "viewport",
          ...base,
          center,
          width,
          height,
          viewCenter: { x: entity.viewCenter.x, y: entity.viewCenter.y },
          viewHeight: entity.viewHeight,
          twist: entity.twist ?? 0,
          bounds: {
            minX: center.x - width / 2,
            minY: center.y - height / 2,
            maxX: center.x + width / 2,
            maxY: center.y + height / 2,
          },
        });
        return;
      }
      case "ray":
      case "xline": {
        const p = apply(context.matrix, entity.basePoint.x, entity.basePoint.y);
        const q = apply(
          context.matrix,
          entity.basePoint.x + entity.direction.x,
          entity.basePoint.y + entity.direction.y,
        );
        const length = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        this.primitives.push({
          kind: "ray",
          ...base,
          x: p.x,
          y: p.y,
          dx: (q.x - p.x) / length,
          dy: (q.y - p.y) / length,
          bothWays: entity.type === "xline",
          bounds: emptyBounds(),
        });
        return;
      }
    }
  }

  private fill(rings: XY[][], base: Omit<PrimitiveBase, "bounds">, matrix: Matrix): void {
    const primitive: FillPrimitive = {
      kind: "fill",
      ...base,
      bounds: emptyBounds(),
      rings: rings.map((ring) => transform(ring, matrix)),
    };
    for (const ring of primitive.rings) {
      for (let i = 0; i < ring.length; i += 2)
        extendBounds(primitive.bounds, ring[i] as number, ring[i + 1] as number);
    }
    this.primitives.push(primitive);
  }

  private polyline(
    entity: PolylineEntity,
    base: Omit<PrimitiveBase, "bounds">,
    matrix: Matrix,
    stroke: (local: XY[], matrix: Matrix, closed: boolean, width?: number) => void,
  ): void {
    const { vertices } = entity;
    if (vertices.length === 0) return;
    const segmentCount = entity.closed ? vertices.length : vertices.length - 1;
    const widthOf = (vertex: { startWidth?: number; endWidth?: number }) => [
      vertex.startWidth ?? entity.constantWidth ?? 0,
      vertex.endWidth ?? entity.constantWidth ?? 0,
    ];
    const widths = vertices.slice(0, segmentCount).map(widthOf);
    const uniform = widths.every(([start, end]) => start === end && start === widths[0]?.[0]);
    const points: XY[] = [vertices[0] as XY];
    for (let index = 0; index < segmentCount; index++) {
      const from = vertices[index] as XY & { bulge?: number };
      const to = vertices[(index + 1) % vertices.length] as XY;
      points.push(...bulgePoints(from, to, from.bulge ?? 0).slice(1));
    }
    if (entity.closed) points.pop();
    if (uniform) {
      stroke(
        points.length === 1 ? [points[0] as XY, points[0] as XY] : points,
        matrix,
        entity.closed,
        widths[0]?.[0] ?? 0,
      );
      return;
    }
    // Variable widths: one filled quad per tessellated sub-segment, widths interpolated.
    for (let index = 0; index < segmentCount; index++) {
      const from = vertices[index] as XY & { bulge?: number };
      const to = vertices[(index + 1) % vertices.length] as XY;
      const [startWidth = 0, endWidth = 0] = widths[index] ?? [];
      const arc = bulgePoints(from, to, from.bulge ?? 0);
      const quads: XY[][] = [];
      for (let i = 0; i + 1 < arc.length; i++) {
        const a = arc[i] as XY;
        const b = arc[i + 1] as XY;
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / length;
        const ny = (b.x - a.x) / length;
        const wa = (startWidth + ((endWidth - startWidth) * i) / (arc.length - 1)) / 2;
        const wb = (startWidth + ((endWidth - startWidth) * (i + 1)) / (arc.length - 1)) / 2;
        quads.push([
          { x: a.x + nx * wa, y: a.y + ny * wa },
          { x: b.x + nx * wb, y: b.y + ny * wb },
          { x: b.x - nx * wb, y: b.y - ny * wb },
          { x: a.x - nx * wa, y: a.y - ny * wa },
        ]);
      }
      for (const quad of quads) this.fill([quad], base, matrix);
    }
  }

  private text(entity: TextEntity, base: Omit<PrimitiveBase, "bounds">, matrix: Matrix): void {
    const simple = entity.hAlign === "left" && entity.vAlign === "baseline";
    const spans = entity.hAlign === "aligned" || entity.hAlign === "fit";
    const anchor = simple || spans || !entity.alignPoint ? entity.position : entity.alignPoint;
    let localRotation = entity.rotation;
    let fitWidth: number | undefined;
    if (spans && entity.alignPoint) {
      const dx = entity.alignPoint.x - entity.position.x;
      const dy = entity.alignPoint.y - entity.position.y;
      localRotation = Math.atan2(dy, dx);
      fitWidth = Math.hypot(dx, dy) * matrixScale(matrix);
    }
    const align =
      spans || simple
        ? "left"
        : entity.hAlign === "right"
          ? "right"
          : entity.hAlign === "left"
            ? "left"
            : "center";
    const baseline = entity.hAlign === "middle" ? "middle" : BASELINES[entity.vAlign];
    this.pushText(
      base,
      matrix,
      anchor,
      localRotation,
      entity.height,
      [entity.value],
      align,
      baseline,
      {
        widthFactor: entity.widthFactor ?? 1,
        obliqueAngle: entity.obliqueAngle ?? 0,
        lineHeight: entity.height * MTEXT_LINE_PITCH,
        ...(fitWidth !== undefined ? { fitWidth } : {}),
      },
    );
  }

  private mtext(entity: MTextEntity, base: Omit<PrimitiveBase, "bounds">, matrix: Matrix): void {
    const column = (entity.attachment - 1) % 3;
    const row = Math.floor((entity.attachment - 1) / 3);
    const estimate = (text: string) => text.length * entity.height * CHAR_WIDTH_RATIO;
    const lines = wrapLines(mtextToLines(entity.value), entity.width, estimate);
    this.pushText(
      base,
      matrix,
      entity.position,
      entity.rotation,
      entity.height,
      lines,
      (["left", "center", "right"] as const)[column] ?? "left",
      (["top", "middle", "bottom"] as const)[row] ?? "top",
      {
        widthFactor: 1,
        obliqueAngle: 0,
        lineHeight: entity.height * MTEXT_LINE_PITCH * (entity.lineSpacingFactor ?? 1),
      },
    );
  }

  private pushText(
    base: Omit<PrimitiveBase, "bounds">,
    matrix: Matrix,
    anchor: Point,
    localRotation: number,
    height: number,
    lines: string[],
    align: TextPrimitive["align"],
    baseline: TextPrimitive["baseline"],
    extra: Pick<TextPrimitive, "widthFactor" | "obliqueAngle" | "lineHeight" | "fitWidth">,
  ): void {
    const scale = matrixScale(matrix);
    const p = apply(matrix, anchor.x, anchor.y);
    const direction = apply(
      matrix,
      anchor.x + Math.cos(localRotation),
      anchor.y + Math.sin(localRotation),
    );
    const rotationAngle = Math.atan2(direction.y - p.y, direction.x - p.x);
    const primitive: TextPrimitive = {
      kind: "text",
      ...base,
      x: p.x,
      y: p.y,
      rotation: rotationAngle,
      height: height * scale,
      lines,
      align,
      baseline,
      ...extra,
      lineHeight: extra.lineHeight * scale,
      bounds: emptyBounds(),
    };
    primitive.bounds = textBounds(primitive);
    this.primitives.push(primitive);
  }

  private insert(entity: InsertEntity, layer: string, color: string, context: Context): void {
    const block = this.blocks.get(entity.blockName.toUpperCase());
    if (block && !block.xrefPath) {
      const ocs = multiply(context.matrix, ocsMatrix(entity.extrusion, entity.position.z));
      for (let row = 0; row < entity.rowCount; row++) {
        for (let column = 0; column < entity.columnCount; column++) {
          const matrix = [
            translation(entity.position.x, entity.position.y),
            rotation(entity.rotation),
            translation(column * entity.columnSpacing, row * entity.rowSpacing),
            scaling(entity.scale.x, entity.scale.y),
            translation(-block.basePoint.x, -block.basePoint.y),
          ].reduce(multiply, ocs);
          this.blockContent(block, matrix, layer, color, entity, context);
        }
      }
    }
    for (const attribute of entity.attributes) this.entity(attribute, context);
  }

  private blockContent(
    block: CadBlock,
    matrix: Matrix,
    layer: string,
    color: string,
    owner: CadEntity,
    context: Context,
  ): void {
    const key = block.name.toUpperCase();
    if (context.stack.has(key) || context.stack.size >= MAX_INSERT_DEPTH) return;
    const stack = new Set(context.stack).add(key);
    const blockLineType =
      owner.lineType && owner.lineType.toUpperCase() !== "BYLAYER"
        ? owner.lineType.toUpperCase() === "BYBLOCK"
          ? context.blockLineType
          : owner.lineType
        : this.document.layers.get(layer)?.lineType;
    const blockLineWeight = this.weightOf(owner.lineWeight, layer, context);
    this.entities(block.entities, {
      matrix,
      insertLayer: layer,
      blockColor: color,
      ...(blockLineType !== undefined ? { blockLineType } : {}),
      blockLineWeight,
      ancestors: [layer, ...context.ancestors],
      blockPath: [...context.blockPath, block.name],
      stack,
      scale: matrixScale(matrix),
    });
  }
}

const BASELINES: Record<TextEntity["vAlign"], TextPrimitive["baseline"]> = {
  baseline: "alphabetic",
  bottom: "bottom",
  middle: "middle",
  top: "top",
};

function concreteColor(color: Color): string {
  if (color.kind === "aci" && color.index === 7) return FOREGROUND;
  return colorToCss(color) ?? FOREGROUND;
}

function transform(points: readonly XY[], matrix: Matrix): Float64Array {
  const out = new Float64Array(points.length * 2);
  points.forEach((point, index) => {
    const p = apply(matrix, point.x, point.y);
    out[index * 2] = p.x;
    out[index * 2 + 1] = p.y;
  });
  return out;
}

function finishBounds(primitive: StrokePrimitive): void {
  const { points } = primitive;
  for (let i = 0; i < points.length; i += 2)
    extendBounds(primitive.bounds, points[i] as number, points[i + 1] as number);
  if (primitive.width > 0) {
    const half = primitive.width / 2;
    primitive.bounds.minX -= half;
    primitive.bounds.minY -= half;
    primitive.bounds.maxX += half;
    primitive.bounds.maxY += half;
  }
}

/** Estimated world box of a text (glyph widths are estimated, not measured). */
export function textBounds(text: TextPrimitive): Bounds {
  const longest = Math.max(1, ...text.lines.map((line) => line.length));
  const width = text.fitWidth ?? longest * text.height * CHAR_WIDTH_RATIO * text.widthFactor;
  const blockHeight = text.height + (text.lines.length - 1) * text.lineHeight;
  const left = text.align === "left" ? 0 : text.align === "center" ? -width / 2 : -width;
  const top =
    text.baseline === "top"
      ? 0
      : text.baseline === "middle"
        ? blockHeight / 2
        : text.baseline === "bottom"
          ? blockHeight
          : text.height;
  const corners: XY[] = [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top - blockHeight },
    { x: left, y: top - blockHeight },
  ];
  const cos = Math.cos(text.rotation);
  const sin = Math.sin(text.rotation);
  const bounds = emptyBounds();
  for (const c of corners)
    extendBounds(bounds, text.x + c.x * cos - c.y * sin, text.y + c.x * sin + c.y * cos);
  return bounds;
}

/** Flattens one layout of a document into world-space primitives. */
export function buildDisplayList(document: CadDocument, layout: CadLayout): DisplayList {
  const builder = new Builder(document);
  builder.entities(layout.entities, {
    matrix: IDENTITY,
    blockColor: FOREGROUND,
    ancestors: [],
    blockPath: [],
    stack: new Set(),
    scale: 1,
  });
  const bounds = emptyBounds();
  for (const primitive of builder.primitives) {
    if (primitive.kind !== "ray") unionBounds(bounds, primitive.bounds);
  }
  return {
    layout: layout.name,
    isModel: layout.isModel,
    primitives: builder.primitives,
    chains: builder.chains,
    layerCounts: builder.layerCounts,
    bounds: isEmptyBounds(bounds) ? null : bounds,
  };
}
