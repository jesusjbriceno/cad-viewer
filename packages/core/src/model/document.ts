import type { CadDocument, CadLayer, CadLayout } from "./types";

export const MODEL_LAYOUT = "Model";
export const DEFAULT_LAYER = "0";

export function createDefaultLayer(name = DEFAULT_LAYER): CadLayer {
  return { name, color: { kind: "aci", index: 7 }, visible: true, frozen: false, locked: false };
}

export function createModelLayout(): CadLayout {
  return { name: MODEL_LAYOUT, isModel: true, tabOrder: 0, entities: [] };
}

/** A valid, empty document: layer "0" and an empty model layout. */
export function createEmptyDocument(format: string): CadDocument {
  return {
    format,
    header: {},
    layers: new Map([[DEFAULT_LAYER, createDefaultLayer()]]),
    lineTypes: new Map(),
    textStyles: new Map(),
    blocks: new Map(),
    layouts: [createModelLayout()],
    unsupported: new Map(),
  };
}

export function getModelLayout(document: CadDocument): CadLayout {
  const model = document.layouts.find((layout) => layout.isModel);
  if (!model) throw new Error("Document has no model layout.");
  return model;
}
