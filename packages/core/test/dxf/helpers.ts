import { parseDxf } from "../../src/dxf";
import type { CadDocument, CadEntity } from "../../src/model/types";

export type Pair = readonly [code: number, value: string | number];

/** Serializes group code/value pairs to DXF text. */
export function toDxf(pairs: readonly Pair[]): string {
  return `${pairs.map(([code, value]) => `${code}\n${value}`).join("\n")}\n`;
}

export function section(name: string, ...records: readonly Pair[][]): Pair[] {
  return [[0, "SECTION"], [2, name], ...records.flat(), [0, "ENDSEC"]];
}

export function dxf(...sections: readonly Pair[][]): string {
  return toDxf([...sections.flat(), [0, "EOF"]]);
}

/** Parses a document whose ENTITIES section holds the given records. */
export function parseEntities(...records: readonly Pair[][]): CadDocument {
  return parseDxf(dxf(section("ENTITIES", ...records)));
}

export function modelEntities(document: CadDocument): CadEntity[] {
  return document.layouts[0]?.entities ?? [];
}

/** Parses a single entity record and returns the first model-space entity. */
export function parseOne(record: readonly Pair[]): CadEntity {
  const entity = modelEntities(parseEntities([...record]))[0];
  if (!entity) throw new Error("No entity parsed.");
  return entity;
}
