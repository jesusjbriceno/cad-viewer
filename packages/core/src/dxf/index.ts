import type { FormatLoader } from "../loaders/types";
import type { CadDocument } from "../model/types";

/** Parses an ASCII DXF string into a `CadDocument`. Implemented in T3. */
export function parseDxf(_text: string): CadDocument {
  throw new Error("parseDxf is not implemented yet.");
}

/** Built-in DXF format loader. Implemented in T3. */
export const dxfLoader: FormatLoader = {
  id: "dxf",
  extensions: [".dxf"],
  canLoad: () => false,
  load: async () => {
    throw new Error("dxfLoader is not implemented yet.");
  },
};
