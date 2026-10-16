import type { HatchEdge, HatchLoop, HatchPatternLine } from "../model/types";
import { arcPoints, bulgePoints, ellipsePoints, splinePoints, type XY } from "./geometry";

function edgePoints(edge: HatchEdge): XY[] {
  switch (edge.kind) {
    case "line":
      return [edge.start, edge.end];
    case "arc":
      // Clockwise edges store mirrored angles: traverse -start → -end clockwise.
      return edge.ccw
        ? arcPoints(edge.center, edge.radius, edge.startAngle, edge.endAngle)
        : arcPoints(edge.center, edge.radius, -edge.endAngle, -edge.startAngle).reverse();
    case "ellipse":
      return edge.ccw
        ? ellipsePoints(edge.center, edge.majorAxis, edge.ratio, edge.startAngle, edge.endAngle)
        : ellipsePoints(
            edge.center,
            edge.majorAxis,
            edge.ratio,
            -edge.endAngle,
            -edge.startAngle,
          ).reverse();
    case "spline":
      return splinePoints(edge.degree, edge.controlPoints, edge.knots, edge.weights);
  }
}

/** Boundary loop → closed ring of points (local hatch coordinates). */
export function loopToRing(loop: HatchLoop): XY[] {
  const ring: XY[] = [];
  const push = (points: XY[]) => {
    for (const point of points) {
      const last = ring.at(-1);
      if (!last || Math.abs(last.x - point.x) > 1e-12 || Math.abs(last.y - point.y) > 1e-12)
        ring.push(point);
    }
  };
  if (loop.kind === "polyline") {
    const { vertices } = loop;
    vertices.forEach((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length];
      const isLast = index === vertices.length - 1;
      if (!next || (isLast && !loop.closed && vertices.length > 2)) {
        push([vertex]);
      } else {
        push(bulgePoints(vertex, next, vertex.bulge ?? 0));
      }
    });
  } else {
    for (const edge of loop.edges) push(edgePoints(edge));
  }
  const first = ring[0];
  const last = ring.at(-1);
  if (
    first &&
    last &&
    ring.length > 1 &&
    Math.abs(first.x - last.x) < 1e-12 &&
    Math.abs(first.y - last.y) < 1e-12
  )
    ring.pop();
  return ring;
}

/**
 * Clips hatch pattern line families to boundary rings (even-odd rule) and
 * applies their dash sequences. Returns flat segment coordinates
 * [x1, y1, x2, y2, ...], or null when the pattern would exceed
 * `maxSegments` (the caller then draws the outline instead).
 */
export function clipPattern(
  rings: readonly XY[][],
  lines: readonly HatchPatternLine[],
  maxSegments: number,
): number[] | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    for (const p of ring) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!(minX <= maxX)) return [];
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  const out: number[] = [];
  for (const family of lines) {
    const d = { x: Math.cos(family.angle), y: Math.sin(family.angle) };
    const n = { x: -d.y, y: d.x };
    const spacing = family.offset.x * n.x + family.offset.y * n.y;
    if (Math.abs(spacing) < 1e-12) continue;
    const projections = corners.map(
      (c) => ((c.x - family.origin.x) * n.x + (c.y - family.origin.y) * n.y) / spacing,
    );
    const kMin = Math.ceil(Math.min(...projections));
    const kMax = Math.floor(Math.max(...projections));
    if (kMax - kMin + 1 > maxSegments) return null;

    const period = family.dashes.reduce((sum, dash) => sum + Math.abs(dash), 0);
    for (let k = kMin; k <= kMax; k++) {
      const px = family.origin.x + k * family.offset.x;
      const py = family.origin.y + k * family.offset.y;
      const hits: number[] = [];
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i] as XY;
          const b = ring[(i + 1) % ring.length] as XY;
          const sa = (a.x - px) * n.x + (a.y - py) * n.y;
          const sb = (b.x - px) * n.x + (b.y - py) * n.y;
          if (sa > 0 === sb > 0) continue;
          const t = sa / (sa - sb);
          hits.push(
            (a.x - px) * d.x + (a.y - py) * d.y + t * ((b.x - a.x) * d.x + (b.y - a.y) * d.y),
          );
        }
      }
      hits.sort((x, y) => x - y);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const s0 = hits[i] as number;
        const s1 = hits[i + 1] as number;
        if (period <= 0) {
          out.push(px + d.x * s0, py + d.y * s0, px + d.x * s1, py + d.y * s1);
        } else {
          let position = Math.floor(s0 / period) * period;
          while (position < s1) {
            for (const dash of family.dashes) {
              const end = position + Math.abs(dash);
              if (dash > 0) {
                const from = Math.max(position, s0);
                const to = Math.min(end, s1);
                if (to > from)
                  out.push(px + d.x * from, py + d.y * from, px + d.x * to, py + d.y * to);
              }
              position = end;
              if (position >= s1) break;
            }
          }
        }
        if (out.length / 4 > maxSegments) return null;
      }
    }
  }
  return out;
}
