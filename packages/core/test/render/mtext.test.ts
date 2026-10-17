import { describe, expect, it } from "vitest";
import { mtextToLines, wrapLines } from "../../src/render/mtext";

describe("mtextToLines", () => {
  it.each([
    ["plain", ["plain"]],
    ["one\\Ptwo", ["one", "two"]],
    ["a\\~b", ["a\u00a0b"]],
    ["{\\fArial|b1|i0;Bold} text", ["Bold text"]],
    ["\\H2.5x;Big\\C1;Red", ["BigRed"]],
    ["\\LUnder\\l \\OOver\\o \\KStrike\\k", ["Under Over Strike"]],
    ["\\S1^2; and \\S3/4; and \\S5#6;", ["1/2 and 3/4 and 5/6"]],
    ["\\\\ \\{ \\}", ["\\ { }"]],
    ["\\A1;aligned\\Q15;\\W0.8;\\T1.1;x", ["alignedx"]],
    ["\\pxqc;centered", ["centered"]],
    ["line\\nbreak", ["line", "break"]],
    ["", [""]],
  ])("%j → %j", (input, lines) => {
    expect(mtextToLines(input)).toEqual(lines);
  });
});

describe("wrapLines", () => {
  const measure = (text: string) => text.length;

  it("does not wrap when the width is 0", () => {
    expect(wrapLines(["a b c d"], 0, measure)).toEqual(["a b c d"]);
  });

  it("wraps on spaces at the reference width", () => {
    expect(wrapLines(["aaa bbb ccc"], 7, measure)).toEqual(["aaa bbb", "ccc"]);
  });

  it("keeps a single long word on its own line", () => {
    expect(wrapLines(["abcdefghij x"], 4, measure)).toEqual(["abcdefghij", "x"]);
  });

  it("preserves explicit paragraph lines", () => {
    expect(wrapLines(["a b", "c"], 10, measure)).toEqual(["a b", "c"]);
  });
});
