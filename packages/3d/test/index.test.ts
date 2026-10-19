import { describe, expect, it } from "vitest";
import * as api from "../src/index";

describe("@jesusjbriceno/cad-viewer-3d public API", () => {
  it("exports the viewer, the built-in loaders and the camera helpers", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        "BUILT_IN_3D_LOADERS",
        "Cad3DViewer",
        "ISOMETRIC",
        "OBJ_MATERIAL_PALETTE",
        "describePart",
        "has3dFaces",
        "objLoader",
        "parseObj",
        "parseStl",
        "partsOf",
        "sceneFromDocument",
        "stlLoader",
        "summarizeScene",
      ].sort(),
    );
    expect(api.BUILT_IN_3D_LOADERS.map((loader) => loader.id)).toEqual(["stl", "obj"]);
  });
});
