// src/math/colorMaps.ts
import * as THREE from "three";

export type ScaleMode = "auto" | "fixed";
export type PaletteId = "redYellow" | "blueWhiteRed" | "signed";

export type ValueRange = { min: number; max: number };

export function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function getAutoRange(values: ArrayLike<number>, signed = false): ValueRange {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn === mx) return { min: -1, max: 1 };

  if (signed) {
    const a = Math.max(Math.abs(mn), Math.abs(mx));
    return { min: -a, max: a };
  }
  return { min: mn, max: mx };
}

export function normalizeTo01(v: number, range: ValueRange) {
  const { min, max } = range;
  if (max === min) return 0.5;
  return clamp01((v - min) / (max - min));
}

// --- Palettes (all in linear RGB-ish lerps; good enough for visibility) ---
function c(r: number, g: number, b: number) {
  return new THREE.Color(r / 255, g / 255, b / 255);
}

const RED = c(220, 60, 40);
const YELLOW = c(255, 220, 60);
const BLUE = c(40, 90, 220);
const WHITE = c(245, 245, 245);

export function colorFromPalette(palette: PaletteId, v: number, range: ValueRange): THREE.Color {
  if (palette === "redYellow") {
    const t = normalizeTo01(v, range);
    return RED.clone().lerp(YELLOW, t);
  }

  // "blueWhiteRed" and "signed": same mapping idea, but "signed" expects symmetric range centered at 0
  // We map: t in [0..1] => blue -> white -> red with midpoint 0.5
  const t = normalizeTo01(v, range);
  if (t <= 0.5) {
    return BLUE.clone().lerp(WHITE, t / 0.5);
  }
  return WHITE.clone().lerp(RED, (t - 0.5) / 0.5);
}
