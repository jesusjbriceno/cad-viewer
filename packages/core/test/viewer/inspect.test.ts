// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { line } from "../render/helpers";
import { documentWith, setup } from "./setup";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("CadViewer model information", () => {
  it("summarizes the loaded document", () => {
    const { viewer } = setup();
    const document = documentWith([line(0, 0, 3, 4)]);
    document.format = "dxf";
    viewer.loadDocument(document);
    expect(viewer.getSummary()).toMatchObject({
      format: "dxf",
      entityCount: 1,
      countsByType: { line: 1 },
      layerCount: 1,
      layoutCount: 1,
    });
  });

  it("lists entities and filters them", () => {
    const { viewer } = setup();
    viewer.loadDocument(documentWith([line(0, 0, 3, 4)]));
    expect(viewer.getEntities()).toHaveLength(1);
    expect(viewer.getEntities({ type: "line" })).toHaveLength(1);
    expect(viewer.getEntities({ type: "circle" })).toHaveLength(0);
    expect(viewer.getEntities({ layout: "Nope" })).toHaveLength(0);
  });

  it("returns nothing before a drawing is loaded", () => {
    const { viewer } = setup();
    expect(viewer.getSummary()).toBeNull();
    expect(viewer.getEntities()).toEqual([]);
  });
});
