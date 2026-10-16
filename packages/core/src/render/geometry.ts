import type { Bounds, Point, Vec3 } from "../model/types";

/**
 * 2D affine matrix in canvas order: x' = a·x + c·y + e, y' = b·x + d·y + f.
 */
export type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export interface XY {
  x: number;
  y: number;
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const TWO_PI = Math.PI * 2;
/** Segments used for a full circle; arcs use a proportional share. */
const SEGMENTS_PER_TURN = 64;

/** `multiply(m, n)` applies `n` first, then `m`. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function translation(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

export function scaling(x: number, y: number): Matrix {
  return [x, 0, 0, y, 0, 0];
}

export function rotation(angle: number): Matrix {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cos, sin, -sin, cos, 0, 0];
}

export function apply(m: Matrix, x: number, y: number): XY {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  if (det === 0) return IDENTITY;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/** Largest linear scale factor of a matrix (used to size tolerances and line widths). */
export function matrixScale(m: Matrix): number {
  return Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * OCS → WCS projected on the XY plane, using the AutoCAD arbitrary axis
 * algorithm. `elevation` is the OCS z of the entity's points.
 */
export function ocsMatrix(normal: Vec3 | undefined, elevation = 0): Matrix {
  if (!normal || (normal.x === 0 && normal.y === 0 && normal.z > 0)) return IDENTITY;
  const n = normalize(normal);
  const limit = 1 / 64;
  const ax = normalize(
    Math.abs(n.x) < limit && Math.abs(n.y) < limit
      ? cross({ x: 0, y: 1, z: 0 }, n)
      : cross({ x: 0, y: 0, z: 1 }, n),
  );
  const ay = normalize(cross(n, ax));
  return [ax.x, ax.y, ay.x, ay.y, n.x * elevation, n.y * elevation];
}

function sweepOf(start: number, end: number): number {
  let sweep = (end - start) % TWO_PI;
  if (sweep <= 1e-12) sweep += TWO_PI;
  return sweep;
}

function segmentsFor(sweep: number, minimum: number): number {
  return Math.max(minimum, Math.ceil((Math.abs(sweep) / TWO_PI) * SEGMENTS_PER_TURN));
}

/** Counter-clockwise arc from `start` to `end` (radians); equal angles mean a full circle. */
export function arcPoints(center: XY, radius: number, start: number, end: number): XY[] {
  const sweep = sweepOf(start, end);
  const count = segmentsFor(sweep, 4);
  const points: XY[] = [];
  for (let index = 0; index <= count; index++) {
    const angle = start + (sweep * index) / count;
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  return points;
}

/** Arc segment between two polyline vertices; bulge = tan(θ/4), positive = counter-clockwise. */
export function bulgePoints(from: XY, to: XY, bulge: number): XY[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const chord = Math.hypot(dx, dy);
  if (bulge === 0 || chord === 0) return [from, to];
  const theta = 4 * Math.atan(bulge);
  const offset = (chord * (1 - bulge * bulge)) / (4 * bulge);
  const center = {
    x: (from.x + to.x) / 2 - (dy / chord) * offset,
    y: (from.y + to.y) / 2 + (dx / chord) * offset,
  };
  const radius = Math.hypot(from.x - center.x, from.y - center.y);
  const start = Math.atan2(from.y - center.y, from.x - center.x);
  const count = segmentsFor(theta, 2);
  const points: XY[] = [from];
  for (let index = 1; index < count; index++) {
    const angle = start + (theta * index) / count;
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  points.push(to);
  return points;
}

/** Elliptical arc by parameter, counter-clockwise from `startParam` to `endParam`. */
export function ellipsePoints(
  center: XY,
  majorAxis: XY,
  ratio: number,
  startParam: number,
  endParam: number,
): XY[] {
  const minor = { x: -majorAxis.y * ratio, y: majorAxis.x * ratio };
  const sweep = sweepOf(startParam, endParam);
  const count = segmentsFor(sweep, 4);
  const points: XY[] = [];
  for (let index = 0; index <= count; index++) {
    const t = startParam + (sweep * index) / count;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    points.push({
      x: center.x + majorAxis.x * cos + minor.x * sin,
      y: center.y + majorAxis.y * cos + minor.y * sin,
    });
  }
  return points;
}

/**
 * Samples a (rational) B-spline with De Boor's algorithm. Invalid knot vectors
 * fall back to the control polygon so a bad entity still shows something.
 */
export function splinePoints(
  degree: number,
  control: readonly XY[],
  knots: readonly number[],
  weights?: readonly number[],
): XY[] {
  const n = control.length;
  if (degree < 1 || n <= degree || knots.length !== n + degree + 1)
    return control.map((p) => ({ x: p.x, y: p.y }));
  const start = knots[degree] as number;
  const end = knots[n] as number;
  if (!(end > start)) return control.map((p) => ({ x: p.x, y: p.y }));
  const w = weights && weights.length === n ? weights : undefined;
  const samples = Math.min(512, Math.max(32, n * 8));
  const points: XY[] = [];
  for (let index = 0; index <= samples; index++) {
    points.push(deBoor(degree, control, knots, w, start + ((end - start) * index) / samples, n));
  }
  return points;
}

function deBoor(
  p: number,
  control: readonly XY[],
  knots: readonly number[],
  weights: readonly number[] | undefined,
  u: number,
  n: number,
): XY {
  let k = p;
  while (k < n - 1 && u >= (knots[k + 1] as number)) k++;
  const d: { x: number; y: number; w: number }[] = [];
  for (let j = 0; j <= p; j++) {
    const point = control[j + k - p] as XY;
    const weight = weights ? (weights[j + k - p] as number) : 1;
    d.push({ x: point.x * weight, y: point.y * weight, w: weight });
  }
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const left = knots[j + k - p] as number;
      const right = knots[j + 1 + k - r] as number;
      const alpha = right === left ? 0 : (u - left) / (right - left);
      const a = d[j - 1] as { x: number; y: number; w: number };
      const b = d[j] as { x: number; y: number; w: number };
      d[j] = {
        x: (1 - alpha) * a.x + alpha * b.x,
        y: (1 - alpha) * a.y + alpha * b.y,
        w: (1 - alpha) * a.w + alpha * b.w,
      };
    }
  }
  const result = d[p] as { x: number; y: number; w: number };
  return { x: result.x / result.w, y: result.y / result.w };
}

export function emptyBounds(): Bounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

export function isEmptyBounds(bounds: Bounds): boolean {
  return !(bounds.minX <= bounds.maxX && bounds.minY <= bounds.maxY);
}

export function extendBounds(bounds: Bounds, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (x < bounds.minX) bounds.minX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y > bounds.maxY) bounds.maxY = y;
}

export function unionBounds(target: Bounds, other: Bounds): void {
  if (isEmptyBounds(other)) return;
  extendBounds(target, other.minX, other.minY);
  extendBounds(target, other.maxX, other.maxY);
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function toXY(point: Point): XY {
  return { x: point.x, y: point.y };
}
