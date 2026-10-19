import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { objLoader, stlLoader } from "@jesusjbriceno/cad-viewer-3d";
import { dxfLoader } from "@jesusjbriceno/cad-viewer-core";
import { describe, expect, it } from "vitest";

const dir = new URL("../samples/", import.meta.url);
const read = (name: string) => new Uint8Array(readFileSync(new URL(name, dir)));
const text = (name: string) => readFileSync(new URL(name, dir), "utf8");
const manifest = JSON.parse(text("samples.json")) as {
  files: {
    file: string;
    format: "dxf" | "stl" | "obj";
    title: string;
    author: string;
    license: string;
    sourceUrl: string;
    sourcePage: string;
    sha256: string;
    bytes: number;
  }[];
};
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// Real third-party assets: the manifest, the attribution file and the files themselves must
// agree, and every file must still parse. See samples/SOURCES.md for the licensing policy.
describe("bundled sample assets", () => {
  const listed = new Set(manifest.files.map((entry) => entry.file));

  it("lists every asset file in the manifest and nothing stale", () => {
    const onDisk = readdirSync(dir).filter(
      (name) => name !== "samples.json" && name !== "SOURCES.md",
    );
    expect(onDisk.sort()).toEqual([...listed].sort());
  });

  it("records a matching size and SHA-256 for every file", () => {
    for (const entry of manifest.files) {
      const bytes = read(entry.file);
      expect(bytes.byteLength, entry.file).toBe(entry.bytes);
      expect(sha256(bytes), entry.file).toBe(entry.sha256);
    }
  });

  it("distributes only CC0 or CC BY files with a source", () => {
    for (const entry of manifest.files) {
      expect(["CC0-1.0", "CC-BY-4.0"], entry.file).toContain(entry.license);
      expect(entry.author, entry.file).not.toBe("");
      expect(entry.sourceUrl, entry.file).toMatch(/^https:\/\//);
      expect(entry.title, entry.file).not.toBe("");
    }
  });

  it("mentions every file, author and license in SOURCES.md", () => {
    const sources = text("SOURCES.md");
    for (const entry of manifest.files) {
      expect(sources, entry.file).toContain(entry.file);
      expect(sources, entry.author).toContain(entry.author);
      expect(sources, entry.license).toContain(entry.license);
    }
  });

  it("parses every 2D sample into a document with layers and entities", async () => {
    const drawings = manifest.files.filter((entry) => entry.format === "dxf");
    expect(drawings.length).toBeGreaterThan(0);
    for (const entry of drawings) {
      const document = await dxfLoader.load(read(entry.file), { fileName: entry.file });
      // A minimal DXF may have no BLOCKS section at all: its entities live in the layouts.
      const entities = document.layouts.reduce(
        (total, layout) => total + layout.entities.length,
        0,
      );
      expect(document.layers.size, entry.file).toBeGreaterThan(0);
      expect(entities, entry.file).toBeGreaterThan(0);
    }
  });

  it("parses every 3D sample into a scene with triangles and bounds", async () => {
    const models = manifest.files.filter((entry) => entry.format !== "dxf");
    expect(models.length).toBeGreaterThan(0);
    for (const entry of models) {
      const loader = entry.format === "stl" ? stlLoader : objLoader;
      const scene = await loader.load(read(entry.file), { fileName: entry.file });
      const triangles = scene.meshes.reduce(
        (total, mesh) =>
          total + (mesh.indices ? mesh.indices.length : mesh.positions.length / 3) / 3,
        0,
      );
      expect(scene.meshes.length, entry.file).toBeGreaterThan(0);
      expect(triangles, entry.file).toBeGreaterThan(0);
      expect(scene.bounds, entry.file).not.toBeNull();
    }
  });
});
