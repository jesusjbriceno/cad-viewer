// Generates the 3D sample models used by the end-to-end tests and the sandbox:
//   flange.stl — binary STL, a flanged hub (one solid)
//   house.obj  — OBJ with an object, three groups and three materials
// Run from the repository root: node packages/3d/test/fixtures/generate.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SEGMENTS = 96;

/** Triangles of a hollow cylinder between radii `inner` and `outer`, from z0 to z1. */
function ring(inner, outer, z0, z1) {
  const triangles = [];
  const point = (radius, angle, z) => [radius * Math.cos(angle), radius * Math.sin(angle), z];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (2 * Math.PI * i) / SEGMENTS;
    const b = (2 * Math.PI * (i + 1)) / SEGMENTS;
    const quad = (p, q, r, s) => triangles.push([p, q, r], [p, r, s]);
    quad(point(inner, a, z1), point(outer, a, z1), point(outer, b, z1), point(inner, b, z1)); // top
    quad(point(inner, b, z0), point(outer, b, z0), point(outer, a, z0), point(inner, a, z0)); // bottom
    quad(point(outer, a, z0), point(outer, b, z0), point(outer, b, z1), point(outer, a, z1)); // outside
    quad(point(inner, b, z0), point(inner, a, z0), point(inner, a, z1), point(inner, b, z1)); // bore
  }
  return triangles;
}

function normal([a, b, c]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1;
  return n.map((value) => value / length);
}

function binaryStl(header, triangles) {
  const buffer = Buffer.alloc(84 + 50 * triangles.length);
  buffer.write(header.padEnd(80, " ").slice(0, 80), 0, "ascii");
  buffer.writeUInt32LE(triangles.length, 80);
  triangles.forEach((triangle, index) => {
    let offset = 84 + 50 * index;
    for (const value of [...normal(triangle), ...triangle.flat()]) {
      buffer.writeFloatLE(value, offset);
      offset += 4;
    }
  });
  return buffer;
}

// Flange: a 100 mm plate (bore 30) with a 50 mm hub rising 30 mm above it.
const flange = [...ring(15, 50, 0, 10), ...ring(15, 25, 10, 40)];
writeFileSync(join(here, "flange.stl"), binaryStl("cad-viewer sample flange", flange));

// House: 8 x 6 walls 3 high, a gable roof and a door, Z-up, metres.
const house = `# cad-viewer sample house (Z-up, metres)
mtllib house.mtl
o House
g walls
usemtl plaster
v 0 0 0
v 8 0 0
v 8 6 0
v 0 6 0
v 0 0 3
v 8 0 3
v 8 6 3
v 0 6 3
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
f 1 4 3 2
g roof
usemtl tiles
v 0 3 5
v 8 3 5
f 5 6 10 9
f 7 8 9 10
f 5 9 8
f 6 7 10
g door
usemtl wood
v 3.5 -0.05 0
v 4.5 -0.05 0
v 4.5 -0.05 2.1
v 3.5 -0.05 2.1
f 11 12 13 14
`;
writeFileSync(join(here, "house.obj"), house);
console.log(`flange.stl: ${flange.length} triangles; house.obj written.`);
