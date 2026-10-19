import { type CadMesh, type CadScene, createEmptyScene } from "@cadscene/core";
import {
  type BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshLambertMaterial,
} from "three";
import { describe, expect, it } from "vitest";
import { type BuiltScene, buildThreeScene } from "../src/render/buildScene";
import { fitDistance, orbitFromPosition, orbitPosition } from "../src/render/camera";

type XYZ = [number, number, number];

/** One closed unit cube as a triangle soup (12 triangles, 36 vertices), no normals. */
function cube(name: string, layer: string, material = "default", offset = 0): CadMesh {
  const v = (x: number, y: number, z: number): XYZ => [x + offset, y, z];
  const quads: [XYZ, XYZ, XYZ, XYZ][] = [
    [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0)],
    [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)],
    [v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(0, 1, 0), v(0, 1, 1), v(0, 0, 1)],
    [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)],
  ];
  const positions = quads.flatMap(([a, b, c, d]) => [...a, ...b, ...c, ...a, ...c, ...d]);
  return { name, layer, material, positions: new Float32Array(positions) };
}

function sceneWith(meshes: CadMesh[], configure?: (scene: CadScene) => void): CadScene {
  const scene = createEmptyScene("test");
  scene.meshes = meshes;
  for (const mesh of meshes) scene.layers.set(mesh.layer, { name: mesh.layer, visible: true });
  configure?.(scene);
  return scene;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`missing item ${index}`);
  return item;
}

const meshesOf = (built: BuiltScene): Mesh[] =>
  built.root.children.filter((child): child is Mesh => child instanceof Mesh);
const edgesOf = (built: BuiltScene): LineSegments[] =>
  meshesOf(built).flatMap((mesh) =>
    mesh.children.filter((child): child is LineSegments => child instanceof LineSegments),
  );
const lambert = (mesh: Mesh): MeshLambertMaterial => {
  if (!(mesh.material instanceof MeshLambertMaterial)) throw new Error("not a Lambert material");
  return mesh.material;
};
const lineMaterial = (edges: LineSegments): LineBasicMaterial => {
  if (!(edges.material instanceof LineBasicMaterial)) throw new Error("not a line material");
  return edges.material;
};

describe("buildThreeScene", () => {
  it("creates one three.js mesh per CadMesh, named after the part", () => {
    const built = buildThreeScene(sceneWith([cube("base", "A"), cube("lid", "B", "default", 2)]));
    expect(meshesOf(built).map((mesh) => mesh.name)).toEqual(["base", "lid"]);
    expect(at(meshesOf(built), 0).geometry.getAttribute("position").count).toBe(36);
  });

  it("computes normals when the source has none and keeps them when it has", () => {
    const withNormals = cube("given", "0");
    const normals = new Float32Array(withNormals.positions.length);
    for (let index = 2; index < normals.length; index += 3) normals[index] = 1;
    withNormals.normals = normals;
    const [auto, given] = meshesOf(buildThreeScene(sceneWith([cube("auto", "0"), withNormals])));
    expect(auto?.geometry.getAttribute("normal").count).toBe(36);
    expect(given?.geometry.getAttribute("normal").getZ(0)).toBe(1);
    expect(given?.geometry.getAttribute("normal").getX(4)).toBe(0);
  });

  it("uses the index buffer when the mesh is indexed", () => {
    const quad: CadMesh = {
      name: "quad",
      layer: "0",
      material: "default",
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    const mesh = at(meshesOf(buildThreeScene(sceneWith([quad]))), 0);
    expect(mesh.geometry.getIndex()?.count).toBe(6);
  });

  it("shares one material per CadMaterial and applies its color and opacity", () => {
    const scene = sceneWith(
      [cube("a", "0", "red"), cube("b", "0", "red", 2), cube("c", "0", "glass", 4)],
      (s) => {
        s.materials.set("red", { name: "red", color: 0xff0000 });
        s.materials.set("glass", { name: "glass", color: 0x88ccff, opacity: 0.4 });
      },
    );
    const meshes = meshesOf(buildThreeScene(scene));
    const red = lambert(at(meshes, 0));
    const glass = lambert(at(meshes, 2));
    expect(lambert(at(meshes, 1))).toBe(red);
    expect(red.color.getHex()).toBe(0xff0000);
    expect(red.transparent).toBe(false);
    expect(glass.color.getHex()).toBe(0x88ccff);
    expect(glass.opacity).toBeCloseTo(0.4);
    expect(glass.transparent).toBe(true);
  });

  it("falls back to the default material for an unknown material name", () => {
    const mesh = at(meshesOf(buildThreeScene(sceneWith([cube("a", "0", "missing")]))), 0);
    expect(lambert(mesh).color.getHex()).toBe(0xb4bcc4);
  });

  it("adds a feature-edge overlay to every mesh: the 12 edges of a cube", () => {
    const edges = edgesOf(buildThreeScene(sceneWith([cube("a", "0")])));
    expect(edges).toHaveLength(1);
    expect(at(edges, 0).geometry.getAttribute("position").count).toBe(24);
  });

  it("hides and shows the parts of a layer and honors the initial layer visibility", () => {
    const built = buildThreeScene(
      sceneWith([cube("a", "A"), cube("b", "B", "default", 2)], (s) => {
        s.layers.set("B", { name: "B", visible: false });
      }),
    );
    const [a, b] = meshesOf(built);
    expect([a?.visible, b?.visible]).toEqual([true, false]);
    built.setLayerVisible("A", false);
    built.setLayerVisible("B", true);
    expect([a?.visible, b?.visible]).toEqual([false, true]);
    built.setLayerVisible("Missing", false);
    expect([a?.visible, b?.visible]).toEqual([false, true]);
  });

  it("switches between shaded and wireframe, hiding edges in wireframe", () => {
    const built = buildThreeScene(sceneWith([cube("a", "0")]));
    const mesh = at(meshesOf(built), 0);
    const edges = at(edgesOf(built), 0);
    expect(built.shading).toBe("shaded");
    built.setShading("wireframe");
    expect(built.shading).toBe("wireframe");
    expect(lambert(mesh).wireframe).toBe(true);
    expect(edges.visible).toBe(false);
    built.setShading("shaded");
    expect(lambert(mesh).wireframe).toBe(false);
    expect(edges.visible).toBe(true);
  });

  it("turns edges off and on, keeps them off in wireframe, and recolors them", () => {
    const built = buildThreeScene(sceneWith([cube("a", "0")]));
    const edges = at(edgesOf(built), 0);
    built.setEdges(false);
    expect(edges.visible).toBe(false);
    built.setEdges(true);
    expect(edges.visible).toBe(true);
    built.setShading("wireframe");
    built.setEdges(true);
    expect(edges.visible).toBe(false);
    built.setEdgeColor(0x123456);
    expect(lineMaterial(edges).color.getHex()).toBe(0x123456);
  });

  it("dispose() releases every geometry and material once and empties the root", () => {
    const built = buildThreeScene(
      sceneWith([cube("a", "0"), cube("b", "0", "default", 2)], (s) => {
        s.materials.set("red", { name: "red", color: 0xff0000 });
      }),
    );
    const resources = new Set<BufferGeometry | Material>();
    for (const mesh of meshesOf(built)) {
      resources.add(mesh.geometry);
      resources.add(lambert(mesh));
    }
    for (const edges of edgesOf(built)) {
      resources.add(edges.geometry);
      resources.add(lineMaterial(edges));
    }
    const disposed = new Map<BufferGeometry | Material, number>();
    for (const resource of resources)
      resource.addEventListener("dispose", () =>
        disposed.set(resource, (disposed.get(resource) ?? 0) + 1),
      );
    built.dispose();
    // 2 mesh geometries + 2 edge geometries + 1 shared mesh material + 1 shared edge material.
    expect(resources.size).toBe(6);
    expect([...resources].map((resource) => disposed.get(resource))).toEqual([1, 1, 1, 1, 1, 1]);
    expect(built.root.children).toHaveLength(0);
  });
});

describe("orbit camera math", () => {
  const target = { x: 1, y: 2, z: 3 };

  it("places the camera on a Z-up sphere around the target", () => {
    const front = orbitPosition({ target, azimuth: 0, elevation: 0, distance: 10 }, "z");
    expect([front.x, front.y, front.z].map((n) => Number(n.toFixed(6)))).toEqual([11, 2, 3]);
    const top = orbitPosition({ target, azimuth: 0, elevation: Math.PI / 2, distance: 5 }, "z");
    expect(top.z).toBeCloseTo(8);
    const side = orbitPosition({ target, azimuth: Math.PI / 2, elevation: 0, distance: 5 }, "z");
    expect(side.y).toBeCloseTo(7);
  });

  it("maps the same orbit to a Y-up world (Z-up y becomes -z)", () => {
    const top = orbitPosition({ target, azimuth: 0, elevation: Math.PI / 2, distance: 5 }, "y");
    expect(top.y).toBeCloseTo(7);
    const side = orbitPosition({ target, azimuth: Math.PI / 2, elevation: 0, distance: 5 }, "y");
    expect(side.z).toBeCloseTo(-2);
  });

  it.each(["z", "y"] as const)("orbitFromPosition inverts orbitPosition (%s-up)", (up) => {
    const state = { target, azimuth: -0.7, elevation: 0.4, distance: 12 };
    const back = orbitFromPosition(orbitPosition(state, up), target, up);
    expect(back.azimuth).toBeCloseTo(state.azimuth);
    expect(back.elevation).toBeCloseTo(state.elevation);
    expect(back.distance).toBeCloseTo(state.distance);
    expect(back.target).toEqual(target);
  });

  it("fitDistance frames a sphere on the tighter field of view, plus padding", () => {
    const fov = Math.PI / 4;
    const wide = fitDistance(10, fov, 2, 0);
    expect(wide).toBeCloseTo(10 / Math.sin(fov / 2));
    const horizontal = 2 * Math.atan(Math.tan(fov / 2) * 0.5);
    expect(fitDistance(10, fov, 0.5, 0)).toBeCloseTo(10 / Math.sin(horizontal / 2));
    expect(fitDistance(10, fov, 2, 0.1)).toBeCloseTo(wide * 1.1);
  });

  it("fitDistance stays positive for a point-sized model", () => {
    expect(fitDistance(0, Math.PI / 4, 1, 0.05)).toBeGreaterThan(0);
  });
});
