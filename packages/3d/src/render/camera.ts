/** Which world axis points up: CAD models are usually Z-up, many mesh exports Y-up. */
export type UpAxis = "z" | "y";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Camera on a sphere around `target`. Angles are radians in a Z-up frame:
 * `azimuth` counter-clockwise from +X in the ground plane, `elevation` from the
 * ground plane towards up. A Y-up world uses the same angles (Z-up y maps to -z).
 */
export interface OrbitState {
  target: Vec3Like;
  azimuth: number;
  elevation: number;
  distance: number;
}

/** South-east isometric view, the usual CAD default. */
export const ISOMETRIC = { azimuth: -Math.PI / 4, elevation: Math.asin(1 / Math.sqrt(3)) };

/** Camera position for an orbit. */
export function orbitPosition(state: OrbitState, up: UpAxis): Vec3Like {
  const ground = Math.cos(state.elevation);
  const dx = ground * Math.cos(state.azimuth);
  const dy = ground * Math.sin(state.azimuth);
  const dz = Math.sin(state.elevation);
  const [x, y, z] = up === "z" ? [dx, dy, dz] : [dx, dz, -dy];
  const { target, distance } = state;
  return { x: target.x + x * distance, y: target.y + y * distance, z: target.z + z * distance };
}

/** Orbit that puts the camera at `position` looking at `target`. */
export function orbitFromPosition(position: Vec3Like, target: Vec3Like, up: UpAxis): OrbitState {
  const ex = position.x - target.x;
  const ey = position.y - target.y;
  const ez = position.z - target.z;
  const [x, y, z] = up === "z" ? [ex, ey, ez] : [ex, -ez, ey];
  const distance = Math.hypot(x, y, z);
  const elevation = distance > 0 ? Math.asin(Math.max(-1, Math.min(1, z / distance))) : 0;
  return { target: { ...target }, azimuth: Math.atan2(y, x), elevation, distance };
}

/**
 * Distance at which a sphere of `radius` fits the narrower of the vertical
 * field of view `fovY` (radians) and the horizontal one implied by `aspect`,
 * enlarged by `padding` (0.05 = 5 %). A point-sized model is framed as radius 1.
 */
export function fitDistance(radius: number, fovY: number, aspect: number, padding: number): number {
  const fitted = radius > 0 ? radius : 1;
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);
  const fov = Math.min(fovY, fovX);
  return (fitted / Math.sin(fov / 2)) * (1 + padding);
}
