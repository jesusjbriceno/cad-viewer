import type { CadLocale, MeasureResult, PickResult } from "@jesusjbriceno/cad-viewer-core";
import { createDwgLoader } from "@jesusjbriceno/cad-viewer-dwg";
import { messages } from "./i18n";

const base = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export interface Sample {
  /** Key of the label in the sandbox catalog (`samples.<key>`). */
  key: "dxf" | "dwg";
  url: string;
}

/** Sample drawings copied into public/samples by scripts/prepare-assets.mjs. */
export const SAMPLES: Sample[] = [
  { key: "dxf", url: `${base}samples/sample-r2000.dxf` },
  // This test drawing contains a block inserted at scale ~3000: the regular content is the
  // small cluster at the center after "Fit" (zoom window into it).
  { key: "dwg", url: `${base}samples/example_2013.dwg` },
];

export interface SampleModel {
  /** Key of the label in the sandbox catalog (`model3d.samples.<key>`). */
  key: "flange" | "house";
  url: string;
  fileName: string;
}

/** Sample 3D models copied into public/samples by scripts/prepare-assets.mjs. */
export const MODELS: SampleModel[] = [
  { key: "flange", url: `${base}samples/flange.stl`, fileName: "flange.stl" },
  { key: "house", url: `${base}samples/house.obj`, fileName: "house.obj" },
];

/** Shared loader list: DWG through LibreDWG, served from public/libredwg/. */
export const LOADERS = [createDwgLoader({ wasmUrl: `${base}libredwg/` })];

function fixed(value: number, digits: number, locale: CadLocale): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

export function describePick(pick: PickResult | null, locale: CadLocale): string {
  const t = messages(locale);
  if (!pick) return t.noSelection;
  const lines = [`${t.pick.type}: ${pick.type}`, `${t.pick.layer}: ${pick.layer}`];
  if (pick.handle) lines.push(`${t.pick.handle}: ${pick.handle}`);
  if (pick.blockPath.length > 0) lines.push(`${t.pick.block}: ${pick.blockPath.join(" › ")}`);
  lines.push(`${t.pick.at}: ${fixed(pick.world.x, 3, locale)}; ${fixed(pick.world.y, 3, locale)}`);
  return lines.join("\n");
}

export function describeMeasure(result: MeasureResult | null, locale: CadLocale): string {
  const t = messages(locale);
  if (!result) return t.measureHint;
  const degrees = fixed((result.angle * 180) / Math.PI, 2, locale);
  return `${t.measureResult.distance}: ${fixed(result.distance, 4, locale)}\nΔx: ${fixed(result.dx, 4, locale)}  Δy: ${fixed(result.dy, 4, locale)}\n${t.measureResult.angle}: ${degrees}°`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
