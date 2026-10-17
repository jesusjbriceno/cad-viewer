import { describe, expect, it } from "vitest";
import type { CadEntity } from "../../src/model/types";
import { buildDisplayList } from "../../src/render/displayList";
import { pickPrimitive } from "../../src/render/pick";
import { byLayer, line, makeDocument } from "./helpers";

const listOf = (entities: CadEntity[]) => {
  const document = makeDocument({ entities });
  return buildDisplayList(document, document.layouts[0] as never);
};
const always = () => true;

describe("pickPrimitive", () => {
  it("picks a line within the tolerance and ignores it beyond", () => {
    const entity = line(0, 0, 10, 0);
    const list = listOf([entity]);
    expect(pickPrimitive(list, 5, 0.4, 0.5, always)?.target.entity).toBe(entity);
    expect(pickPrimitive(list, 5, 0.6, 0.5, always)).toBeNull();
  });

  it("prefers the nearest primitive", () => {
    const near = line(0, 1, 10, 1);
    const far = line(0, 0, 10, 0);
    expect(pickPrimitive(listOf([near, far]), 5, 0.9, 1, always)?.target.entity).toBe(near);
  });

  it("picks inside filled areas", () => {
    const solid: CadEntity = {
      type: "solid",
      layer: "0",
      color: byLayer,
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
        { x: 4, y: 4 },
      ],
    };
    expect(pickPrimitive(listOf([solid]), 2, 2, 0.1, always)?.target.entity).toBe(solid);
  });

  it("picks texts inside their box", () => {
    const text: CadEntity = {
      type: "text",
      layer: "0",
      color: byLayer,
      position: { x: 0, y: 0 },
      height: 2,
      rotation: 0,
      value: "Hello",
      hAlign: "left",
      vAlign: "baseline",
    };
    expect(pickPrimitive(listOf([text]), 2, 1, 0.1, always)?.target.entity).toBe(text);
  });

  it("skips primitives on hidden layer chains", () => {
    const list = listOf([line(0, 0, 10, 0)]);
    expect(pickPrimitive(list, 5, 0, 1, () => false)).toBeNull();
  });
});
