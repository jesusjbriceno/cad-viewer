import { abortError } from "../loaders/errors";
import type { FormatLoader, LoaderProbe, LoadOptions } from "../loaders/types";
import type { CadDocument } from "../model/types";
import { parseDxf } from "./parse";
import { decodeDxfBytes } from "./text";

export { parseDxf } from "./parse";

const BINARY_SENTINEL = "AutoCAD Binary DXF";
const ASCII_START = /^\s*(?:999\s*\r?\n[^\r\n]*\r?\n\s*)*0\s*\r?\n\s*SECTION\b/;

function head(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes.subarray(0, 1024));
}

function isBinaryDxf(bytes: Uint8Array): boolean {
  return head(bytes).startsWith(BINARY_SENTINEL);
}

/** Built-in loader for ASCII DXF (all versions). Binary DXF is recognized and rejected. */
export const dxfLoader: FormatLoader = {
  id: "dxf",
  extensions: [".dxf"],

  canLoad({ bytes }: LoaderProbe): boolean {
    const text = head(bytes).replace(/^\uFEFF/, "");
    return text.startsWith(BINARY_SENTINEL) || ASCII_START.test(text);
  },

  async load(bytes: Uint8Array, options: LoadOptions): Promise<CadDocument> {
    if (options.signal?.aborted) throw abortError();
    if (isBinaryDxf(bytes)) throw new Error("Binary DXF is not supported yet.");
    options.onProgress?.({ phase: "parse" });
    const document = parseDxf(decodeDxfBytes(bytes));
    if (options.signal?.aborted) throw abortError();
    return document;
  },
};
