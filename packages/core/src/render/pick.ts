import type { DisplayList, Primitive } from "./displayList";

function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function polylineDistance(
  points: Float64Array,
  closed: boolean,
  segments: boolean,
  x: number,
  y: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  const step = segments ? 4 : 2;
  const last = segments ? points.length - 3 : points.length - 2;
  for (let i = 0; i < last; i += step) {
    best = Math.min(
      best,
      segmentDistance(
        x,
        y,
        points[i] as number,
        points[i + 1] as number,
        points[i + 2] as number,
        points[i + 3] as number,
      ),
    );
  }
  if (closed && !segments && points.length >= 4) {
    const n = points.length;
    best = Math.min(
      best,
      segmentDistance(
        x,
        y,
        points[n - 2] as number,
        points[n - 1] as number,
        points[0] as number,
        points[1] as number,
      ),
    );
  }
  if (points.length === 2) best = Math.hypot(x - (points[0] as number), y - (points[1] as number));
  return best;
}

/** Even-odd point-in-polygon over several rings. */
function insideRings(rings: readonly Float64Array[], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i] as number;
      const yi = ring[i + 1] as number;
      const xj = ring[j] as number;
      const yj = ring[j + 1] as number;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function distanceTo(primitive: Primitive, x: number, y: number): number {
  switch (primitive.kind) {
    case "stroke":
      return Math.max(
        0,
        polylineDistance(primitive.points, primitive.closed, primitive.segments === true, x, y) -
          primitive.width / 2,
      );
    case "fill":
      if (insideRings(primitive.rings, x, y)) return 0;
      return Math.min(...primitive.rings.map((ring) => polylineDistance(ring, true, false, x, y)));
    case "text":
    case "viewport": {
      const { minX, minY, maxX, maxY } = primitive.bounds;
      const dx = Math.max(minX - x, 0, x - maxX);
      const dy = Math.max(minY - y, 0, y - maxY);
      return Math.hypot(dx, dy);
    }
    case "point":
      return Math.hypot(x - primitive.x, y - primitive.y);
    case "ray": {
      const t = (x - primitive.x) * primitive.dx + (y - primitive.y) * primitive.dy;
      const along = primitive.bothWays ? t : Math.max(0, t);
      return Math.hypot(
        x - (primitive.x + along * primitive.dx),
        y - (primitive.y + along * primitive.dy),
      );
    }
  }
}

/**
 * Nearest visible primitive within `tolerance` world units of (x, y). Ties go
 * to the primitive drawn last (on top).
 */
export function pickPrimitive(
  list: DisplayList,
  x: number,
  y: number,
  tolerance: number,
  isVisible: (chain: number) => boolean,
): Primitive | null {
  let best: Primitive | null = null;
  let bestDistance = tolerance;
  for (let i = list.primitives.length - 1; i >= 0; i--) {
    const primitive = list.primitives[i] as Primitive;
    if (!isVisible(primitive.chain)) continue;
    if (primitive.kind !== "ray") {
      const b = primitive.bounds;
      if (
        x < b.minX - tolerance ||
        x > b.maxX + tolerance ||
        y < b.minY - tolerance ||
        y > b.maxY + tolerance
      )
        continue;
    }
    const distance = distanceTo(primitive, x, y);
    if (distance < bestDistance || (best === null && distance <= tolerance)) {
      best = primitive;
      bestDistance = distance;
    }
  }
  return best;
}
