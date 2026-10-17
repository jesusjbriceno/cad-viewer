import { createDefaultLayer, createEmptyDocument } from "../../src/model/document";
import type {
  CadBlock,
  CadDocument,
  CadEntity,
  CadLayer,
  Color,
  LineEntity,
} from "../../src/model/types";

export const byLayer: Color = { kind: "byLayer" };
export const byBlock: Color = { kind: "byBlock" };
export const aci = (index: number): Color => ({ kind: "aci", index });

export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra: Partial<LineEntity> = {},
): LineEntity {
  return {
    type: "line",
    layer: "0",
    color: byLayer,
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    ...extra,
  };
}

export interface DocumentSpec {
  entities?: CadEntity[];
  layers?: Partial<CadLayer>[];
  blocks?: CadBlock[];
  paper?: CadEntity[];
}

/** Builds a document programmatically: layers, blocks, model and an optional paper layout. */
export function makeDocument(spec: DocumentSpec = {}): CadDocument {
  const document = createEmptyDocument("test");
  for (const layer of spec.layers ?? []) {
    const name = layer.name ?? "L";
    document.layers.set(name, { ...createDefaultLayer(name), ...layer });
  }
  for (const block of spec.blocks ?? []) document.blocks.set(block.name, block);
  const model = document.layouts[0];
  if (model) model.entities = spec.entities ?? [];
  if (spec.paper)
    document.layouts.push({ name: "Sheet", isModel: false, tabOrder: 1, entities: spec.paper });
  return document;
}

export function block(name: string, entities: CadEntity[], basePoint = { x: 0, y: 0 }): CadBlock {
  return { name, basePoint, entities };
}
