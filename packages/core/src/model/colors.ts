import type { Color } from "./types";

const FIXED: Record<number, number> = {
  1: 0xff0000,
  2: 0xffff00,
  3: 0x00ff00,
  4: 0x00ffff,
  5: 0x0000ff,
  6: 0xff00ff,
  7: 0xffffff,
  8: 0x808080,
  9: 0xc0c0c0,
  250: 0x333333,
  251: 0x505050,
  252: 0x696969,
  253: 0x828282,
  254: 0xbebebe,
  255: 0xffffff,
};

const VALUES = [1, 0.8, 0.6, 0.5, 0.3];

/**
 * AutoCAD Color Index → 0xRRGGBB. Indices 10..249 follow the standard palette:
 * 24 hues in 15° steps, each with 5 brightness levels in a saturated and a
 * pastel (50 % saturation) variant.
 */
export function aciToRgb(index: number): number | undefined {
  if (!Number.isInteger(index) || index < 1 || index > 255) return undefined;
  const fixed = FIXED[index];
  if (fixed !== undefined) return fixed;
  const offset = index - 10;
  const hue = Math.floor(offset / 10) * 15;
  const sub = offset % 10;
  const saturation = sub % 2 === 0 ? 1 : 0.5;
  const value = VALUES[sub >> 1] ?? 1;
  return hsvToRgb(hue, saturation, value);
}

function hsvToRgb(hue: number, saturation: number, value: number): number {
  const max = value * 255;
  const min = max * (1 - saturation);
  const sector = Math.floor(hue / 60) % 6;
  const fraction = hue / 60 - Math.floor(hue / 60);
  const rising = min + (max - min) * fraction;
  const falling = max - (max - min) * fraction;
  const channels: [number, number, number][] = [
    [max, rising, min],
    [falling, max, min],
    [min, max, rising],
    [min, falling, max],
    [rising, min, max],
    [max, min, falling],
  ];
  const [r, g, b] = channels[sector] ?? [max, max, max];
  return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
}

export function rgbToCss(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** CSS color for a concrete color; undefined for BYLAYER/BYBLOCK or invalid ACI. */
export function colorToCss(color: Color): string | undefined {
  if (color.kind === "rgb") return rgbToCss(color.value);
  if (color.kind === "aci") {
    const rgb = aciToRgb(color.index);
    return rgb === undefined ? undefined : rgbToCss(rgb);
  }
  return undefined;
}
