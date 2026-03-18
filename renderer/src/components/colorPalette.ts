import * as THREE from "three";
import type { ColorPalette } from "@math3d/core";
export type { ColorPalette } from "@math3d/core";

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export function scalarToColor01(
  t: number,
  palette: ColorPalette
): { r: number; g: number; b: number } {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;

  switch (palette) {
    case "grayscale": {
      const g = x;
      return { r: g, g, b: g };
    }

    case "redYellow": {
      return { r: 1, g: x, b: 0 };
    }

    case "rainbow": {
      const h = x * 5.0;
      const i = Math.floor(h);
      const f = h - i;
      const q = 1 - f;

      let r = 0, g = 0, b = 0;
      switch (i) {
        case 0:
          r = 1;
          g = f;
          b = 0;
          break;
        case 1:
          r = q;
          g = 1;
          b = 0;
          break;
        case 2:
          r = 0;
          g = 1;
          b = f;
          break;
        case 3:
          r = 0;
          g = q;
          b = 1;
          break;
        default:
          r = f;
          g = 0;
          b = 1;
          break;
      }
      return { r, g, b };
    }

    case "blueRed":
    default: {
      const four = 4 * x;
      const r = Math.min(Math.max(four - 1.5, 0), 1);
      const g = Math.min(Math.max(2 - Math.abs(four - 2), 0), 1);
      const b = Math.min(Math.max(1.5 - four, 0), 1);
      return { r, g, b };
    }
  }
}

export function colorFromPalette(t: number, palette: ColorPalette, out = new THREE.Color()) {
  const u = clamp01(t);

  if (palette === "grayscale") {
    return out.setRGB(u, u, u);
  }

  if (palette === "redYellow") {
    return out.setRGB(1, u, 0);
  }

  if (palette === "rainbow") {
    return out.setHSL((1 - u) * 0.7, 1.0, 0.5);
  }

  const r = u;
  const g = 0.15 + 0.2 * (1 - Math.abs(2 * u - 1));
  const b = 1 - u;
  return out.setRGB(r, g, b);
}

export function solidColorForPalette(palette: ColorPalette): number {
  if (palette === "redYellow") return 0xffcc00;
  if (palette === "grayscale") return 0x888888;
  if (palette === "blueRed") return 0x4f8cff;
  return 0x6a5cff;
}
