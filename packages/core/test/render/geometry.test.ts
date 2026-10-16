import { describe, expect, it } from "vitest";
import {
  apply,
  arcPoints,
  bulgePoints,
  ellipsePoints,
  IDENTITY,
  invert,
  multiply,
  ocsMatrix,
  rotation,
  scaling,
  splinePoints,
  translation,
} from "../../src/render/geometry";

const close = (actual: { x: number; y: number }, x: number, y: number) => {
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
};

describe("matrices", () => {
  it("composes right-to-left: multiply(a, b) applies b first", () => {
    const m = multiply(translation(10, 0), scaling(2, 3));
    close(apply(m, 1, 1), 12, 3);
  });

  it("rotates counter-clockwise", () => {
    close(apply(rotation(Math.PI / 2), 1, 0), 0, 1);
  });

  it("inverts affine transforms", () => {
    const m = multiply(translation(5, -2), multiply(rotation(0.7), scaling(2, -1)));
    const p = apply(m, 3, 4);
    close(apply(invert(m), p.x, p.y), 3, 4);
  });

  it("identity leaves points unchanged", () => {
    close(apply(IDENTITY, 7, 8), 7, 8);
  });
});

describe("ocsMatrix (arbitrary axis algorithm)", () => {
  it("is the identity for the default normal", () => {
    expect(ocsMatrix(undefined)).toEqual(IDENTITY);
    expect(ocsMatrix({ x: 0, y: 0, z: 1 })).toEqual(IDENTITY);
  });

  it("mirrors X for the (0, 0, -1) normal", () => {
    close(apply(ocsMatrix({ x: 0, y: 0, z: -1 }), 2, 3), -2, 3);
  });

  it("projects an elevation along a tilted normal", () => {
    const m = ocsMatrix({ x: 1, y: 0, z: 0 }, 5);
    // N = +X: Ax = Wz × N = (0, 1, 0), Ay = N × Ax = (0, 0, 1); elevation moves along +X.
    close(apply(m, 0, 0), 5, 0);
    close(apply(m, 2, 0), 5, 2);
    close(apply(m, 0, 2), 5, 0);
  });
});

describe("tessellation", () => {
  it("arcPoints starts and ends on the arc and stays on the circle", () => {
    const points = arcPoints({ x: 1, y: 1 }, 2, 0, Math.PI / 2);
    close(points[0] as { x: number; y: number }, 3, 1);
    close(points.at(-1) as { x: number; y: number }, 1, 3);
    for (const p of points) expect(Math.hypot(p.x - 1, p.y - 1)).toBeCloseTo(2, 9);
    expect(points.length).toBeGreaterThanOrEqual(5);
  });

  it("arcPoints wraps when the end angle is smaller than the start angle", () => {
    const points = arcPoints({ x: 0, y: 0 }, 1, (3 * Math.PI) / 2, Math.PI / 2);
    close(points[0] as { x: number; y: number }, 0, -1);
    close(points.at(-1) as { x: number; y: number }, 0, 1);
    // passes through (1, 0), i.e. the short way counter-clockwise through 0 rad
    expect(points.some((p) => Math.abs(p.x - 1) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true);
  });

  it("a full circle has a bounded segment count", () => {
    const points = arcPoints({ x: 0, y: 0 }, 1e6, 0, Math.PI * 2);
    expect(points.length).toBeLessThanOrEqual(129);
    expect(points.length).toBeGreaterThanOrEqual(33);
  });

  it("bulgePoints: bulge 1 is a counter-clockwise half circle", () => {
    const points = bulgePoints({ x: 0, y: 0 }, { x: 2, y: 0 }, 1);
    close(points[0] as { x: number; y: number }, 0, 0);
    close(points.at(-1) as { x: number; y: number }, 2, 0);
    const lowest = Math.min(...points.map((p) => p.y));
    expect(lowest).toBeCloseTo(-1, 2);
  });

  it("bulgePoints: negative bulge goes clockwise", () => {
    const points = bulgePoints({ x: 0, y: 0 }, { x: 2, y: 0 }, -1);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(1, 2);
  });

  it("ellipsePoints follows the rotated major axis", () => {
    const points = ellipsePoints({ x: 0, y: 0 }, { x: 0, y: 2 }, 0.5, 0, Math.PI);
    close(points[0] as { x: number; y: number }, 0, 2);
    close(points.at(-1) as { x: number; y: number }, 0, -2);
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(-1, 2);
  });

  it("splinePoints of a clamped quadratic equals the Bézier curve", () => {
    const control = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 0 },
    ];
    const points = splinePoints(2, control, [0, 0, 0, 1, 1, 1]);
    close(points[0] as { x: number; y: number }, 0, 0);
    close(points.at(-1) as { x: number; y: number }, 2, 0);
    const middle = points.reduce((best, p) =>
      Math.abs(p.x - 1) < Math.abs(best.x - 1) ? p : best,
    );
    expect(middle.y).toBeCloseTo(1, 2);
  });

  it("splinePoints honours weights (rational splines)", () => {
    const control = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    // Quarter circle as a rational quadratic: weights 1, √2/2, 1.
    const points = splinePoints(2, control, [0, 0, 0, 1, 1, 1], [1, Math.SQRT1_2, 1]);
    for (const p of points) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 6);
  });

  it("splinePoints returns the control polygon when the knot vector is invalid", () => {
    const control = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(splinePoints(3, control, [0, 1])).toEqual(control);
  });
});
