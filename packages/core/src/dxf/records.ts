import type { Point } from "../model/types";
import type { DxfPair } from "./tokenizer";

/**
 * A DXF record: the pairs from one group code 0 up to (excluding) the next.
 * Accessors read the first occurrence of a code, which is what every
 * non-repeating property needs.
 */
export class DxfRecord {
  constructor(
    readonly type: string,
    readonly pairs: readonly DxfPair[],
  ) {}

  has(code: number): boolean {
    return this.pairs.some((pair) => pair.code === code);
  }

  str(code: number): string | undefined {
    return this.pairs.find((pair) => pair.code === code)?.value;
  }

  num(code: number): number | undefined;
  num(code: number, fallback: number): number;
  num(code: number, fallback?: number): number | undefined {
    const value = this.str(code);
    if (value === undefined) return fallback;
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  all(code: number): string[] {
    return this.pairs.filter((pair) => pair.code === code).map((pair) => pair.value);
  }

  nums(code: number): number[] {
    return this.all(code).map((value) => Number(value.trim()));
  }

  /** Point from `code` (x), `code + 10` (y) and optional `code + 20` (z). */
  point(code: number): Point {
    const z = this.num(code + 20);
    const point: Point = { x: this.num(code, 0), y: this.num(code + 10, 0) };
    if (z !== undefined) point.z = z;
    return point;
  }

  /** The record restricted to the pairs after a subclass marker (code 100), if present. */
  subclass(marker: string): DxfRecord {
    const index = this.pairs.findIndex((pair) => pair.code === 100 && pair.value.trim() === marker);
    return index < 0 ? this : new DxfRecord(this.type, this.pairs.slice(index + 1));
  }
}

export function toNumber(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Splits a section body into records, one per group code 0. */
export function splitRecords(pairs: readonly DxfPair[]): DxfRecord[] {
  const records: DxfRecord[] = [];
  let start = -1;
  for (let index = 0; index < pairs.length; index++) {
    if (pairs[index]?.code !== 0) continue;
    if (start >= 0) records.push(recordOf(pairs, start, index));
    start = index;
  }
  if (start >= 0) records.push(recordOf(pairs, start, pairs.length));
  return records;
}

function recordOf(pairs: readonly DxfPair[], start: number, end: number): DxfRecord {
  return new DxfRecord(
    (pairs[start]?.value ?? "").trim().toUpperCase(),
    pairs.slice(start + 1, end),
  );
}

/** Maps section names (HEADER, TABLES, ...) to their body pairs. Tolerates a missing EOF/ENDSEC. */
export function splitSections(pairs: readonly DxfPair[]): Map<string, DxfPair[]> {
  const sections = new Map<string, DxfPair[]>();
  let index = 0;
  while (index < pairs.length) {
    const pair = pairs[index];
    if (pair?.code === 0 && pair.value.trim() === "SECTION") {
      const name =
        pairs[index + 1]?.code === 2 ? (pairs[index + 1]?.value.trim().toUpperCase() ?? "") : "";
      let end = index + 2;
      while (end < pairs.length) {
        const current = pairs[end];
        if (current?.code === 0 && ["ENDSEC", "EOF"].includes(current.value.trim())) break;
        end++;
      }
      sections.set(name, pairs.slice(index + 2, end));
      index = end + 1;
    } else {
      index++;
    }
  }
  return sections;
}
