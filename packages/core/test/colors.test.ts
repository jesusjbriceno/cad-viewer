import { describe, expect, it } from "vitest";
import { aciToRgb, colorToCss } from "../src/model/colors";

describe("aciToRgb", () => {
  it.each([
    [1, 0xff0000],
    [2, 0xffff00],
    [3, 0x00ff00],
    [4, 0x00ffff],
    [5, 0x0000ff],
    [6, 0xff00ff],
    [7, 0xffffff],
    [8, 0x808080],
    [9, 0xc0c0c0],
    [10, 0xff0000],
    [11, 0xff7f7f],
    [12, 0xcc0000],
    [13, 0xcc6666],
    [16, 0x7f0000],
    [19, 0x4c2626],
    [20, 0xff3f00],
    [21, 0xff9f7f],
    [50, 0xffff00],
    [130, 0x00ffff],
    [249, 0x4c262f],
    [250, 0x333333],
    [255, 0xffffff],
  ])("maps ACI %i to the AutoCAD palette", (index, rgb) => {
    expect(aciToRgb(index)).toBe(rgb);
  });

  it("rejects indices outside 1..255", () => {
    expect(aciToRgb(0)).toBeUndefined();
    expect(aciToRgb(256)).toBeUndefined();
    expect(aciToRgb(-3)).toBeUndefined();
  });
});

describe("colorToCss", () => {
  it("formats RGB colors as hex", () => {
    expect(colorToCss({ kind: "rgb", value: 0x0a0b0c })).toBe("#0a0b0c");
  });

  it("resolves ACI colors through the palette", () => {
    expect(colorToCss({ kind: "aci", index: 1 })).toBe("#ff0000");
  });

  it("returns undefined for colors that depend on context", () => {
    expect(colorToCss({ kind: "byLayer" })).toBeUndefined();
    expect(colorToCss({ kind: "byBlock" })).toBeUndefined();
  });
});
