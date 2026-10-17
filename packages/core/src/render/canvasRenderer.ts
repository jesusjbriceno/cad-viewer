import type { Bounds } from "../model/types";
import {
  type DisplayList,
  type FillPrimitive,
  FOREGROUND,
  type PickTarget,
  type Primitive,
  type StrokePrimitive,
  type TextPrimitive,
  type ViewportPrimitive,
} from "./displayList";
import {
  apply,
  intersects,
  type Matrix,
  multiply,
  rotation,
  scaling,
  translation,
  type XY,
} from "./geometry";

/** CAD text height is the cap height; a typical sans-serif cap height is ~0.7 em. */
const CAP_HEIGHT_RATIO = 0.7;
/** Texts whose cap height is smaller than this many CSS pixels are not drawn. */
const MIN_TEXT_PX = 1.5;
const POINT_SIZE_PX = 3;

export interface ViewTransform {
  center: XY;
  /** CSS pixels per world unit. */
  scale: number;
  width: number;
  height: number;
}

export interface Overlay {
  /** Measurement: first point, and the second (or the cursor while measuring). */
  measure?: { from: XY; to?: XY; label?: string };
  /** Zoom-window rubber band in CSS pixels. */
  rectangle?: { x: number; y: number; width: number; height: number };
}

export interface Frame {
  list: DisplayList | null;
  /** Model list, drawn inside paper-space viewports. */
  modelList: DisplayList | null;
  view: ViewTransform;
  pixelRatio: number;
  background: string;
  foreground: string;
  highlight: string;
  fontFamily: string;
  /** Whether a primitive's layer chain (an index into `list.chains`) is visible. */
  isVisible: (list: DisplayList, chain: number) => boolean;
  hovered?: PickTarget | null;
  selected?: PickTarget | null;
  overlay?: Overlay;
}

/** World → CSS pixel matrix for a view (world +Y up, screen +Y down). */
export function viewMatrix(view: ViewTransform): Matrix {
  const { scale, center, width, height } = view;
  return [scale, 0, 0, -scale, width / 2 - center.x * scale, height / 2 + center.y * scale];
}

function visibleWorld(view: ViewTransform): Bounds {
  const halfWidth = view.width / 2 / view.scale;
  const halfHeight = view.height / 2 / view.scale;
  return {
    minX: view.center.x - halfWidth,
    minY: view.center.y - halfHeight,
    maxX: view.center.x + halfWidth,
    maxY: view.center.y + halfHeight,
  };
}

interface Pass {
  ctx: CanvasRenderingContext2D;
  matrix: Matrix;
  /** CSS pixels per world unit for this pass (viewports have their own). */
  scale: number;
  world: Bounds;
  frame: Frame;
  /** Forces every primitive to this color (highlight pass). */
  color?: string;
  extraWidth: number;
}

function cssColor(color: string, pass: Pass): string {
  if (pass.color) return pass.color;
  return color === FOREGROUND ? pass.frame.foreground : color;
}

function tracePoints(
  ctx: CanvasRenderingContext2D,
  points: Float64Array,
  matrix: Matrix,
  closed: boolean,
  segments: boolean,
): void {
  if (segments) {
    for (let i = 0; i + 3 < points.length; i += 4) {
      const a = apply(matrix, points[i] as number, points[i + 1] as number);
      const b = apply(matrix, points[i + 2] as number, points[i + 3] as number);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    return;
  }
  for (let i = 0; i + 1 < points.length; i += 2) {
    const p = apply(matrix, points[i] as number, points[i + 1] as number);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  if (points.length === 2) {
    const p = apply(matrix, points[0] as number, points[1] as number);
    ctx.lineTo(p.x + 0.01, p.y);
  }
  if (closed) ctx.closePath();
}

/** Stroke batching: consecutive strokes with the same style share one path. */
class StrokeBatch {
  private key = "";
  private open = false;

  constructor(private readonly pass: Pass) {}

  add(primitive: StrokePrimitive): void {
    const { ctx, scale, extraWidth } = this.pass;
    const widthPx = Math.max(primitive.width * scale, primitive.weightPx) + extraWidth;
    const dash = primitive.dash ? dashPixels(primitive.dash, scale) : undefined;
    const color = cssColor(primitive.color, this.pass);
    const key = `${color}|${widthPx}|${dash?.join(",") ?? ""}`;
    if (key !== this.key) {
      this.flush();
      this.key = key;
      ctx.strokeStyle = color;
      ctx.lineWidth = widthPx;
      ctx.setLineDash(dash ?? []);
      ctx.lineCap = primitive.width > 0 ? "butt" : "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      this.open = true;
    }
    tracePoints(
      ctx,
      primitive.points,
      this.pass.matrix,
      primitive.closed,
      primitive.segments === true,
    );
  }

  flush(): void {
    if (this.open) this.pass.ctx.stroke();
    this.open = false;
    this.key = "";
  }
}

/** Dash lengths in pixels; patterns too dense to see are drawn solid. */
function dashPixels(dash: number[], scale: number): number[] | undefined {
  const pixels = dash.map((value) => (value === 0 ? 1 : value * scale));
  const period = pixels.reduce((sum, value) => sum + value, 0);
  return period < 4 ? undefined : pixels;
}

function drawFill(primitive: FillPrimitive, pass: Pass): void {
  const { ctx, matrix } = pass;
  ctx.fillStyle = cssColor(primitive.color, pass);
  ctx.beginPath();
  for (const ring of primitive.rings) tracePoints(ctx, ring, matrix, true, false);
  ctx.fill("evenodd");
}

function drawText(primitive: TextPrimitive, pass: Pass): void {
  const { ctx, matrix, scale, frame } = pass;
  const capPx = primitive.height * scale;
  if (capPx < MIN_TEXT_PX) return;
  const fontPx = capPx / CAP_HEIGHT_RATIO;
  const anchor = apply(matrix, primitive.x, primitive.y);
  const lineStep = primitive.lineHeight * scale;
  const count = primitive.lines.length;
  const firstOffset =
    primitive.baseline === "middle"
      ? (-(count - 1) * lineStep) / 2
      : primitive.baseline === "bottom" || primitive.baseline === "alphabetic"
        ? -(count - 1) * lineStep
        : 0;
  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.rotate(-primitive.rotation);
  if (primitive.obliqueAngle) ctx.transform(1, 0, -Math.tan(primitive.obliqueAngle), 1, 0, 0);
  ctx.scale(primitive.widthFactor || 1, 1);
  ctx.fillStyle = cssColor(primitive.color, pass);
  ctx.font = `${fontPx}px ${frame.fontFamily}`;
  ctx.textAlign = primitive.align;
  ctx.textBaseline = primitive.baseline;
  const maxWidth =
    primitive.fitWidth !== undefined
      ? (primitive.fitWidth * scale) / (primitive.widthFactor || 1)
      : undefined;
  primitive.lines.forEach((line, index) => {
    const y = firstOffset + index * lineStep;
    if (maxWidth !== undefined) ctx.fillText(line, 0, y, maxWidth);
    else ctx.fillText(line, 0, y);
  });
  ctx.restore();
}

function drawRay(primitive: Primitive & { kind: "ray" }, pass: Pass): void {
  const { world, ctx, matrix } = pass;
  const reach =
    Math.hypot(world.maxX - world.minX, world.maxY - world.minY) +
    Math.hypot(world.minX - primitive.x, world.minY - primitive.y);
  const start = primitive.bothWays ? -reach : 0;
  const a = apply(matrix, primitive.x + primitive.dx * start, primitive.y + primitive.dy * start);
  const b = apply(matrix, primitive.x + primitive.dx * reach, primitive.y + primitive.dy * reach);
  ctx.strokeStyle = cssColor(primitive.color, pass);
  ctx.lineWidth = 1 + pass.extraWidth;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawPoint(primitive: Primitive & { kind: "point" }, pass: Pass): void {
  const p = apply(pass.matrix, primitive.x, primitive.y);
  const size = POINT_SIZE_PX + pass.extraWidth;
  pass.ctx.fillStyle = cssColor(primitive.color, pass);
  pass.ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
}

function drawViewport(primitive: ViewportPrimitive, pass: Pass): void {
  const { ctx, matrix, frame } = pass;
  const corner = apply(
    matrix,
    primitive.center.x - primitive.width / 2,
    primitive.center.y + primitive.height / 2,
  );
  const widthPx = primitive.width * pass.scale;
  const heightPx = primitive.height * pass.scale;
  ctx.strokeStyle = cssColor(primitive.color, pass);
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(corner.x, corner.y, widthPx, heightPx);
  if (pass.color || !frame.modelList || primitive.viewHeight <= 0) return;
  // Model space shown through the viewport: paper = center + R(-twist)·k·(model - viewCenter).
  const k = primitive.height / primitive.viewHeight;
  const modelToPaper = [
    translation(primitive.center.x, primitive.center.y),
    rotation(-primitive.twist),
    scaling(k, k),
    translation(-primitive.viewCenter.x, -primitive.viewCenter.y),
  ].reduce(multiply);
  const halfWidth = primitive.width / 2 / k;
  const halfHeight = primitive.height / 2 / k;
  const reach = Math.hypot(halfWidth, halfHeight);
  ctx.save();
  ctx.beginPath();
  ctx.rect(corner.x, corner.y, widthPx, heightPx);
  ctx.clip();
  drawList(frame.modelList, {
    ...pass,
    matrix: multiply(matrix, modelToPaper),
    scale: pass.scale * k,
    world: {
      minX: primitive.viewCenter.x - reach,
      minY: primitive.viewCenter.y - reach,
      maxX: primitive.viewCenter.x + reach,
      maxY: primitive.viewCenter.y + reach,
    },
  });
  ctx.restore();
}

function drawList(list: DisplayList, pass: Pass, only?: PickTarget): void {
  const batch = new StrokeBatch(pass);
  for (const primitive of list.primitives) {
    if (only && primitive.target !== only) continue;
    if (!only && !pass.frame.isVisible(list, primitive.chain)) continue;
    if (primitive.kind !== "ray" && !intersects(primitive.bounds, pass.world)) continue;
    if (primitive.kind === "stroke") {
      batch.add(primitive);
      continue;
    }
    batch.flush();
    if (primitive.kind === "fill") drawFill(primitive, pass);
    else if (primitive.kind === "text") drawText(primitive, pass);
    else if (primitive.kind === "point") drawPoint(primitive, pass);
    else if (primitive.kind === "ray") drawRay(primitive, pass);
    else drawViewport(primitive, pass);
  }
  batch.flush();
}

function drawOverlay(ctx: CanvasRenderingContext2D, frame: Frame, matrix: Matrix): void {
  const { overlay } = frame;
  if (!overlay) return;
  ctx.setLineDash([]);
  if (overlay.measure) {
    const a = apply(matrix, overlay.measure.from.x, overlay.measure.from.y);
    ctx.fillStyle = frame.highlight;
    ctx.strokeStyle = frame.highlight;
    ctx.lineWidth = 1.5;
    ctx.fillRect(a.x - 3, a.y - 3, 6, 6);
    if (overlay.measure.to) {
      const b = apply(matrix, overlay.measure.to.x, overlay.measure.to.y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillRect(b.x - 3, b.y - 3, 6, 6);
      if (overlay.measure.label) {
        ctx.font = `12px ${frame.fontFamily}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(overlay.measure.label, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6);
      }
    }
  }
  if (overlay.rectangle) {
    const { x, y, width, height } = overlay.rectangle;
    ctx.strokeStyle = frame.highlight;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);
  }
}

/** Paints one frame: background, display list (culled), highlights and overlay. */
export function drawFrame(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const { view, pixelRatio } = frame;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.fillStyle = frame.background;
  ctx.fillRect(0, 0, view.width, view.height);
  const matrix = viewMatrix(view);
  if (frame.list) {
    const pass: Pass = {
      ctx,
      matrix,
      scale: view.scale,
      world: visibleWorld(view),
      frame,
      extraWidth: 0,
    };
    drawList(frame.list, pass);
    for (const [target, extraWidth] of [
      [frame.hovered, 1],
      [frame.selected, 2],
    ] as const) {
      if (target) drawList(frame.list, { ...pass, color: frame.highlight, extraWidth }, target);
    }
  }
  drawOverlay(ctx, frame, matrix);
}
