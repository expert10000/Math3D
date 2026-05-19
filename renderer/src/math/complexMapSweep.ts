import { compileExpression } from "./expression";
import { C } from "./complex";
import { compileComplexExpression } from "./complexExpr";
import { evalRiemannSheet } from "./riemannSphere";
import type { PolylineSet } from "../scene/renderPrimitives";
import { mergeMeshData } from "../mesh/surfaceMesh";

export type ComplexMapSweepAxis = "u" | "v";

export type ComplexMapSweepOutput = "sweep" | "re" | "im" | "both";

export type ComplexMapMode = "standard" | "riemann";
export type ComplexMapSheetMode = "single" | "all";
export type ComplexMapInputMode = "reim" | "fz";

export type ComplexMapSweepSpec = {
  inputMode: ComplexMapInputMode;
  fExpr: string;
  reExpr: string;
  imExpr: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  nu: number;
  nv: number;
  sweepAxis: ComplexMapSweepAxis;
  outputMode: ComplexMapSweepOutput;
  wScale: number;
  clampAbs: number | null;
  showIsolines: boolean;
  isolinesCountU: number;
  isolinesCountV: number;
  mapMode: ComplexMapMode;
  sheetCount: number;
  sheetMode: ComplexMapSheetMode;
  sheetIndex: number;
  branchCutAngle: number;
};

type ComplexMapSweepBuild = {
  positions: Float32Array;
  indices: Uint32Array;
  polylines: PolylineSet | null;
  uvs: Float32Array;
};

const FUNC_NAMES = ["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "log", "exp", "min", "max"];

const normalizeExpr = (src: string) => {
  let out = src.trim();
  if (!out) return out;
  out = out.replace(/Math\./g, "");
  out = out.replace(/\bPI\b/g, "pi").replace(/\bE\b/g, "e");
  const funcRegex = new RegExp(`\\b(${FUNC_NAMES.join("|")})\\b`, "gi");
  out = out.replace(funcRegex, (m) => m.toLowerCase());
  const funcNoParen = new RegExp(
    `\\b(${FUNC_NAMES.join("|")})\\s+(-?\\s*[A-Za-z_][A-Za-z0-9_]*|-?\\s*\\d*\\.?\\d+)`,
    "g"
  );
  out = out.replace(funcNoParen, (_m, fn, arg) => `${fn}(${String(arg).replace(/\\s+/g, "")})`);
  return out;
};

const compileUv = (src: string, label: string) => {
  const trimmed = normalizeExpr(src);
  if (!trimmed) return { error: `${label} expression is empty.` as string };
  const res = compileExpression(trimmed, ["u", "v"]);
  if (res.error) return { error: `${label}: ${res.error.message} (col ${res.error.col})` as string };
  const fn = res.fn!;
  const vars = { u: 0, v: 0 };
  return {
    fn: (u: number, v: number) => {
      vars.u = u;
      vars.v = v;
      const val = fn(vars);
      return Number.isFinite(val) ? val : NaN;
    },
  };
};

const normalizeComplexFunctionExpr = (src: string) => {
  let out = src.trim();
  if (!out) return out;
  out = out.replace(/^f\s*\(\s*z\s*\)\s*=\s*/i, "");
  out = out.replace(/^w\s*=\s*/i, "");
  out = out.replace(/Math\./g, "");
  return out;
};

export const compileComplexMapExpressions = (
  reExpr: string,
  imExpr: string,
  options?: { inputMode?: ComplexMapInputMode; fExpr?: string }
) => {
  const inputMode: ComplexMapInputMode = options?.inputMode === "fz" ? "fz" : "reim";
  if (inputMode === "fz") {
    const fExpr = normalizeComplexFunctionExpr(options?.fExpr ?? "");
    if (!fExpr) return { error: "f(z) expression is empty." as string };
    const compiled = compileComplexExpression(fExpr, ["z", "u", "v"]);
    if (compiled.error || !compiled.fn) {
      const err = compiled.error;
      return {
        error: `f(z): ${err?.message ?? "Parse error"}${err ? ` (col ${err.col})` : ""}`,
      };
    }
    let hasCache = false;
    let cacheU = NaN;
    let cacheV = NaN;
    let cacheRe = NaN;
    let cacheIm = NaN;
    const evalF = (u: number, v: number) => {
      if (hasCache && u === cacheU && v === cacheV) return { re: cacheRe, im: cacheIm };
      const w = compiled.fn!({ z: C(u, v), u, v });
      cacheU = u;
      cacheV = v;
      cacheRe = Number.isFinite(w.re) ? w.re : NaN;
      cacheIm = Number.isFinite(w.im) ? w.im : NaN;
      hasCache = true;
      return { re: cacheRe, im: cacheIm };
    };
    return {
      reFn: (u: number, v: number) => evalF(u, v).re,
      imFn: (u: number, v: number) => evalF(u, v).im,
    };
  }
  const reRes = compileUv(reExpr, "Re(w)");
  if (reRes.error) return { error: reRes.error as string };
  const imRes = compileUv(imExpr, "Im(w)");
  if (imRes.error) return { error: imRes.error as string };
  return { reFn: reRes.fn!, imFn: imRes.fn! };
};

const clampMag = (re: number, im: number, limit: number) => {
  const mag = Math.hypot(re, im);
  if (!Number.isFinite(mag) || mag <= limit) return { re, im };
  const s = limit / mag;
  return { re: re * s, im: im * s };
};

export function buildComplexMapSweep(
  spec: ComplexMapSweepSpec
): { build?: ComplexMapSweepBuild; error?: string } {
  const outputMode: ComplexMapSweepOutput =
    spec.outputMode === "re" || spec.outputMode === "im" || spec.outputMode === "both" ? spec.outputMode : "sweep";
  const compiled = compileComplexMapExpressions(spec.reExpr, spec.imExpr, {
    inputMode: spec.inputMode,
    fExpr: spec.fExpr,
  });
  if (compiled.error) return { error: compiled.error };
  const { reFn, imFn } = compiled;

  const nu = Math.max(2, Math.round(spec.nu));
  const nv = Math.max(2, Math.round(spec.nv));
  if (!Number.isFinite(nu) || !Number.isFinite(nv)) {
    return { error: "Resolution must be finite." };
  }

  const uMin = Number.isFinite(spec.uMin) ? spec.uMin : -1;
  const uMax = Number.isFinite(spec.uMax) ? spec.uMax : 1;
  const vMin = Number.isFinite(spec.vMin) ? spec.vMin : -1;
  const vMax = Number.isFinite(spec.vMax) ? spec.vMax : 1;

  const wScale = Number.isFinite(spec.wScale) ? spec.wScale : 1;
  const clampAbs = spec.clampAbs != null && Number.isFinite(spec.clampAbs) && spec.clampAbs > 0 ? spec.clampAbs : null;
  const mapMode: ComplexMapMode = spec.mapMode === "riemann" ? "riemann" : "standard";
  const sheetCount = mapMode === "riemann" ? Math.max(2, Math.round(spec.sheetCount)) : 1;
  const sheetMode: ComplexMapSheetMode = spec.sheetMode === "all" ? "all" : "single";
  const sheetIndex = Math.min(Math.max(0, Math.round(spec.sheetIndex)), sheetCount - 1);
  const branchCutAngle = Number.isFinite(spec.branchCutAngle) ? spec.branchCutAngle : 0;
  const sheetIndices = sheetMode === "all" ? [...Array(sheetCount).keys()] : [sheetIndex];

  const uRange = uMax - uMin;
  const vRange = vMax - vMin;
  const uStep = nu > 1 ? uRange / (nu - 1) : 0;
  const vStep = nv > 1 ? vRange / (nv - 1) : 0;

  const total = nu * nv;
  const sheetTotal = total * sheetIndices.length;
  const needSweep = outputMode === "sweep";
  const needRe = outputMode === "re" || outputMode === "both";
  const needIm = outputMode === "im" || outputMode === "both";
  const positionsSweep = needSweep ? new Float32Array(sheetTotal * 3) : null;
  const positionsRe = needRe ? new Float32Array(sheetTotal * 3) : null;
  const positionsIm = needIm ? new Float32Array(sheetTotal * 3) : null;
  const uvsBase = new Float32Array(sheetTotal * 2);
  const valid = new Uint8Array(sheetTotal);

  for (let s = 0; s < sheetIndices.length; s++) {
    const sheet = sheetIndices[s];
    const sheetOffset = s * total;
    for (let j = 0; j < nv; j++) {
      const v = vMin + vStep * j;
      for (let i = 0; i < nu; i++) {
        const u = uMin + uStep * i;
        const idx = j * nu + i;
        const outIdx = sheetOffset + idx;
        let re = reFn(u, v);
        let im = imFn(u, v);
        if (!Number.isFinite(re) || !Number.isFinite(im)) {
          continue;
        }
        if (mapMode === "riemann") {
          const w = evalRiemannSheet(re, im, sheet, sheetCount, branchCutAngle);
          if (!w) continue;
          re = w.re;
          im = w.im;
        }
        re *= wScale;
        im *= wScale;
        if (clampAbs) {
          const clamped = clampMag(re, im, clampAbs);
          re = clamped.re;
          im = clamped.im;
        }
        const x = spec.sweepAxis === "v" ? v : u;
        const other = spec.sweepAxis === "v" ? u : v;
        if (positionsSweep) {
          positionsSweep[3 * outIdx] = x;
          positionsSweep[3 * outIdx + 1] = re;
          positionsSweep[3 * outIdx + 2] = im;
        }
        if (positionsRe) {
          positionsRe[3 * outIdx] = x;
          positionsRe[3 * outIdx + 1] = re;
          positionsRe[3 * outIdx + 2] = other;
        }
        if (positionsIm) {
          positionsIm[3 * outIdx] = x;
          positionsIm[3 * outIdx + 1] = im;
          positionsIm[3 * outIdx + 2] = other;
        }
        uvsBase[2 * outIdx] = u;
        uvsBase[2 * outIdx + 1] = v;
        valid[outIdx] = 1;
      }
    }
  }

  const indices: number[] = [];
  for (let s = 0; s < sheetIndices.length; s++) {
    const sheetOffset = s * total;
    for (let j = 0; j < nv - 1; j++) {
      for (let i = 0; i < nu - 1; i++) {
        const a = sheetOffset + j * nu + i;
        const b = a + 1;
        const c = a + nu;
        const d = c + 1;
        if (!valid[a] || !valid[b] || !valid[c] || !valid[d]) continue;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }
  }

  if (!indices.length) {
    return { error: "No valid triangles produced. Check expressions, domain, or clamps." };
  }

  let polylines: PolylineSet | null = null;
  if (outputMode === "sweep" && spec.showIsolines) {
    const countU = Math.max(0, Math.round(spec.isolinesCountU));
    const countV = Math.max(0, Math.round(spec.isolinesCountV));
    const makeFamily = (axis: "u" | "v", count: number) => {
      if (count <= 0) return [] as PolylineSet;
      const lineMin = axis === "u" ? uMin : vMin;
      const lineMax = axis === "u" ? uMax : vMax;
      const lineRange = lineMax - lineMin;
      const lineStep = count > 1 ? lineRange / (count - 1) : 0;
      const sampleCount = axis === "u" ? nv : nu;
      const sampleMin = axis === "u" ? vMin : uMin;
      const sampleStep = axis === "u" ? vStep : uStep;
      const lines: PolylineSet = [];

      for (let k = 0; k < count; k++) {
        const constVal = lineMin + lineStep * k;
        let currentLine: { x: number; y: number; z: number }[] = [];
        for (let s = 0; s < sampleCount; s++) {
          const t = sampleMin + sampleStep * s;
          const u = axis === "u" ? constVal : t;
          const v = axis === "u" ? t : constVal;
          let re = reFn(u, v);
          let im = imFn(u, v);
          if (!Number.isFinite(re) || !Number.isFinite(im)) {
            if (currentLine.length >= 2) lines.push(currentLine);
            currentLine = [];
            continue;
          }
          re *= wScale;
          im *= wScale;
          if (clampAbs) {
            const clamped = clampMag(re, im, clampAbs);
            re = clamped.re;
            im = clamped.im;
          }
          const x = spec.sweepAxis === "v" ? v : u;
          currentLine.push({ x, y: re, z: im });
        }
        if (currentLine.length >= 2) lines.push(currentLine);
      }
      return lines;
    };

    const linesU = makeFamily("u", countU);
    const linesV = makeFamily("v", countV);
    polylines = [...linesU, ...linesV];
    if (!polylines.length) polylines = null;
  }

  const indexArray = Uint32Array.from(indices);
  let positions: Float32Array;
  let indicesOut: Uint32Array;
  let uvs: Float32Array;

  if (outputMode === "both") {
    if (!positionsRe || !positionsIm) {
      return { error: "Failed to build Re/Im surfaces." };
    }
    const merged = mergeMeshData([
      { positions: positionsRe, indices: indexArray },
      { positions: positionsIm, indices: indexArray },
    ]);
    positions = merged.positions;
    indicesOut = merged.indices;
    uvs = new Float32Array(uvsBase.length * 2);
    uvs.set(uvsBase, 0);
    uvs.set(uvsBase, uvsBase.length);
  } else if (outputMode === "re") {
    if (!positionsRe) return { error: "Failed to build Re surface." };
    positions = positionsRe;
    indicesOut = indexArray;
    uvs = uvsBase;
  } else if (outputMode === "im") {
    if (!positionsIm) return { error: "Failed to build Im surface." };
    positions = positionsIm;
    indicesOut = indexArray;
    uvs = uvsBase;
  } else {
    if (!positionsSweep) return { error: "Failed to build sweep surface." };
    positions = positionsSweep;
    indicesOut = indexArray;
    uvs = uvsBase;
  }

  return {
    build: {
      positions,
      indices: indicesOut,
      polylines,
      uvs,
    },
  };
}
