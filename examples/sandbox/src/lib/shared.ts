import type { MeasureResult, PickResult } from "@jesusjbriceno/cad-viewer-core";
import { createDwgLoader } from "@jesusjbriceno/cad-viewer-dwg";

const base = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export interface Sample {
  label: string;
  url: string;
}

/** Sample drawings copied into public/samples by scripts/prepare-assets.mjs. */
export const SAMPLES: Sample[] = [
  {
    label: "DXF · hand-written R2000 sample (layers, block, layouts)",
    url: `${base}samples/sample-r2000.dxf`,
  },
  {
    // This test drawing contains a block inserted at scale ~3000: the regular content is the
    // small cluster at the center after "Fit" (zoom window into it).
    label: "DWG · LibreDWG example (AutoCAD 2013) — zoom into the center",
    url: `${base}samples/example_2013.dwg`,
  },
];

/** Shared loader list: DWG through LibreDWG, served from public/libredwg/. */
export const LOADERS = [createDwgLoader({ wasmUrl: `${base}libredwg/` })];

export function describePick(pick: PickResult | null): string {
  if (!pick) return "Nothing selected. Click an entity.";
  const lines = [`Type: ${pick.type}`, `Layer: ${pick.layer}`];
  if (pick.handle) lines.push(`Handle: ${pick.handle}`);
  if (pick.blockPath.length > 0) lines.push(`Block: ${pick.blockPath.join(" › ")}`);
  lines.push(`At: ${pick.world.x.toFixed(3)}, ${pick.world.y.toFixed(3)}`);
  return lines.join("\n");
}

export function describeMeasure(result: MeasureResult | null): string {
  if (!result) return "Measure tool: click two points.";
  const degrees = ((result.angle * 180) / Math.PI).toFixed(2);
  return `Distance: ${result.distance.toFixed(4)}\nΔx: ${result.dx.toFixed(4)}  Δy: ${result.dy.toFixed(4)}\nAngle: ${degrees}°`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
