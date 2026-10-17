import { describe, expect, it } from "vitest";
import { tokenize } from "../../src/dxf/tokenizer";

describe("tokenize", () => {
  it("reads code/value pairs with LF, CRLF, padding and a BOM", () => {
    const pairs = tokenize("\uFEFF  0\r\nSECTION\r\n  2\nHEADER  \n");
    expect(pairs).toEqual([
      { code: 0, value: "SECTION", line: 1 },
      { code: 2, value: "HEADER  ", line: 3 },
    ]);
  });

  it("keeps values verbatim, including leading and trailing spaces", () => {
    expect(tokenize("1\n  hello  \n")[0]?.value).toBe("  hello  ");
  });

  it("rejects a non-numeric group code with its line number", () => {
    expect(() => tokenize("0\nSECTION\nabc\nX\n")).toThrow('Invalid group code "abc" at line 3.');
  });

  it("rejects a group code without a value", () => {
    expect(() => tokenize("0\nSECTION\n2\n")).toThrow("Missing value for group code 2 at line 3.");
  });

  it("ignores trailing empty lines", () => {
    expect(tokenize("0\nEOF\n\n\n")).toHaveLength(1);
  });
});
