import type { PlanePlotHandle } from "../components/PlanePlot";

type Cpx = { re: number; im: number };
type Segment = Cpx[];

export type MapId =
  | "upperHalfToDisk"
  | "diskAutomorphism"
  | "stripToHalfPlane"
  | "stripToDisk"
  | "exponential"
  | "logarithm"
  | "joukowski"
  | "powerN"
  | "inverse"
  | "square"
  | "cayley";

const C = (re: number, im: number): Cpx => ({ re, im });
const cAdd = (a: Cpx, b: Cpx): Cpx => C(a.re + b.re, a.im + b.im);
const cSub = (a: Cpx, b: Cpx): Cpx => C(a.re - b.re, a.im - b.im);
const cMul = (a: Cpx, b: Cpx): Cpx => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cAbs2 = (z: Cpx): number => z.re * z.re + z.im * z.im;
const cConj = (z: Cpx): Cpx => C(z.re, -z.im);
const cDiv = (a: Cpx, b: Cpx): Cpx | null => {
  const d = cAbs2(b);
  if (!Number.isFinite(d) || d < 1e-12) return null;
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cExp = (z: Cpx): Cpx => {
  const e = Math.exp(z.re);
  return C(e * Math.cos(z.im), e * Math.sin(z.im));
};
const cLogPrincipal = (z: Cpx): Cpx | null => {
  const r = Math.hypot(z.re, z.im);
  if (!Number.isFinite(r) || r < 1e-12) return null;
  return C(Math.log(r), Math.atan2(z.im, z.re));
};
const cPowN = (z: Cpx, n: number): Cpx => {
  if (n === 0) return C(1, 0);
  let out = C(z.re, z.im);
  for (let k = 1; k < Math.max(1, n); k++) out = cMul(out, z);
  return out;
};
const finiteC = (z: Cpx | null): z is Cpx => !!z && Number.isFinite(z.re) && Number.isFinite(z.im);

const CLIP = 3.25;
const JUMP = 2.6;

const mapForId = (id: MapId): ((z: Cpx) => Cpx | null) => {
  const normalized: Exclude<MapId, "square" | "cayley"> =
    id === "square" ? "powerN" : id === "cayley" ? "upperHalfToDisk" : id;
  switch (normalized) {
    case "upperHalfToDisk":
      return (z) => cDiv(cSub(z, C(0, 1)), cAdd(z, C(0, 1)));
    case "diskAutomorphism":
      return (z) => {
        const a = C(0.45, 0.2);
        const theta = 0.55;
        const numerator = cSub(z, a);
        const denominator = cSub(C(1, 0), cMul(cConj(a), z));
        const quotient = cDiv(numerator, denominator);
        if (!quotient) return null;
        return cMul(C(Math.cos(theta), Math.sin(theta)), quotient);
      };
    case "stripToHalfPlane":
      return (z) => cExp(C(Math.PI * z.re, Math.PI * z.im));
    case "stripToDisk":
      return (z) => {
        const h = cExp(C(Math.PI * z.re, Math.PI * z.im));
        return cDiv(cSub(h, C(0, 1)), cAdd(h, C(0, 1)));
      };
    case "exponential":
      return (z) => cExp(z);
    case "logarithm":
      return (z) => cLogPrincipal(z);
    case "joukowski":
      return (z) => {
        const inv = cDiv(C(1, 0), z);
        if (!inv) return null;
        return cAdd(z, inv);
      };
    case "powerN":
      return (z) => cPowN(z, 3);
    case "inverse":
      return (z) => cDiv(C(1, 0), z);
    default:
      return (z) => cDiv(cSub(z, C(0, 1)), cAdd(z, C(0, 1)));
  }
};

const sampleLine = (from: Cpx, to: Cpx, count: number): Cpx[] => {
  const pts: Cpx[] = [];
  const n = Math.max(2, Math.round(count));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(C(from.re + (to.re - from.re) * t, from.im + (to.im - from.im) * t));
  }
  return pts;
};

const splitMappedSegments = (zLine: Cpx[], mapFn: (z: Cpx) => Cpx | null): { z: Segment[]; w: Segment[] } => {
  const zOut: Segment[] = [];
  const wOut: Segment[] = [];
  let currentZ: Segment = [];
  let currentW: Segment = [];
  let prevW: Cpx | null = null;
  for (const z of zLine) {
    const w = mapFn(z);
    const valid =
      finiteC(w) &&
      Math.abs(w.re) <= CLIP &&
      Math.abs(w.im) <= CLIP &&
      (!prevW || Math.hypot(w.re - prevW.re, w.im - prevW.im) <= JUMP);
    if (!valid) {
      if (currentZ.length >= 2 && currentW.length >= 2) {
        zOut.push(currentZ);
        wOut.push(currentW);
      }
      currentZ = [];
      currentW = [];
      prevW = null;
      continue;
    }
    currentZ.push(z);
    currentW.push(w);
    prevW = w;
  }
  if (currentZ.length >= 2 && currentW.length >= 2) {
    zOut.push(currentZ);
    wOut.push(currentW);
  }
  return { z: zOut, w: wOut };
};

const drawPolylineSet = (
  plot: PlanePlotHandle,
  lines: Segment[],
  color: string,
  opts?: { width?: number; opacity?: number; dash?: string; layer?: string }
) => {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 2) continue;
    plot.drawCurve(
      line.map((p) => [p.re, p.im] as [number, number]),
      color,
      { ...opts, layer: opts?.layer ? `${opts.layer}-${i}` : undefined }
    );
  }
};

const drawSpecialPoints = (zPlot: PlanePlotHandle, wPlot: PlanePlotHandle, mapFn: (z: Cpx) => Cpx | null, points: Cpx[]) => {
  const zPts: [number, number][] = [];
  const wPts: [number, number][] = [];
  for (const z of points) {
    zPts.push([z.re, z.im]);
    const w = mapFn(z);
    if (!finiteC(w) || Math.abs(w.re) > CLIP || Math.abs(w.im) > CLIP) continue;
    wPts.push([w.re, w.im]);
  }
  zPlot.drawPoints(zPts, { color: "#111827", shape: "diamond", size: 4.2, layer: "maps-special-z" });
  wPlot.drawPoints(wPts, { color: "#111827", shape: "diamond", size: 4.2, layer: "maps-special-w" });
};

export function renderStandardMap(
  zPlot: PlanePlotHandle,
  wPlot: PlanePlotHandle,
  id: MapId,
  samples = 260
) {
  zPlot.clear();
  wPlot.clear();
  zPlot.drawGrid(0.5);
  wPlot.drawGrid(0.5);
  zPlot.drawPoints([], { layer: "maps-special-z" });
  wPlot.drawPoints([], { layer: "maps-special-w" });

  const mapFn = mapForId(id);
  const curveSamples = Math.max(60, Math.round(samples));
  const familySamples = Math.max(50, Math.round(samples * 0.55));
  const normalized: Exclude<MapId, "square" | "cayley"> =
    id === "square" ? "powerN" : id === "cayley" ? "upperHalfToDisk" : id;

  const drawMapped = (
    zLine: Cpx[],
    opts?: { boundary?: boolean; family?: "u" | "v"; dash?: string; opacity?: number }
  ) => {
    const pair = splitMappedSegments(zLine, mapFn);
    const zColor = opts?.boundary ? "#111827" : opts?.family === "u" ? "#1d4ed8" : "#c2410c";
    const wColor = opts?.boundary ? "#0f172a" : opts?.family === "u" ? "#1d4ed8" : "#c2410c";
    const width = opts?.boundary ? 2.1 : 1.15;
    drawPolylineSet(zPlot, pair.z, zColor, { width, opacity: opts?.opacity ?? 0.9, dash: opts?.dash, layer: "maps-z" });
    drawPolylineSet(wPlot, pair.w, wColor, { width, opacity: opts?.opacity ?? 0.9, dash: opts?.dash, layer: "maps-w" });
  };

  if (normalized === "upperHalfToDisk") {
    const xMin = -2.8;
    const xMax = 2.8;
    const yMin = 0.06;
    const yMax = 2.8;
    drawMapped(sampleLine(C(xMin, 0), C(xMax, 0), curveSamples), { boundary: true, dash: "6 4" });
    for (let k = -3; k <= 3; k++) {
      const x = k * 0.7;
      drawMapped(sampleLine(C(x, yMin), C(x, yMax), familySamples), { family: "u", opacity: 0.8 });
    }
    for (let k = 1; k <= 5; k++) {
      const y = 0.25 + k * 0.45;
      drawMapped(sampleLine(C(xMin, y), C(xMax, y), familySamples), { family: "v", opacity: 0.8 });
    }
    drawSpecialPoints(zPlot, wPlot, mapFn, [C(-1, 0.5), C(0, 1), C(1, 0.5)]);
    return;
  }

  if (normalized === "diskAutomorphism") {
    const twoPi = Math.PI * 2;
    const circle: Cpx[] = [];
    for (let i = 0; i <= curveSamples; i++) {
      const t = (twoPi * i) / curveSamples;
      circle.push(C(Math.cos(t), Math.sin(t)));
    }
    drawMapped(circle, { boundary: true });
    for (let rStep = 1; rStep <= 4; rStep++) {
      const r = rStep * 0.2;
      const ring: Cpx[] = [];
      for (let i = 0; i <= familySamples; i++) {
        const t = (twoPi * i) / familySamples;
        ring.push(C(r * Math.cos(t), r * Math.sin(t)));
      }
      drawMapped(ring, { family: "u", opacity: 0.8 });
    }
    for (let aStep = 0; aStep < 12; aStep++) {
      const th = (twoPi * aStep) / 12;
      drawMapped(sampleLine(C(0, 0), C(0.98 * Math.cos(th), 0.98 * Math.sin(th)), familySamples), {
        family: "v",
        opacity: 0.8,
      });
    }
    drawSpecialPoints(zPlot, wPlot, mapFn, [C(0, 0), C(0.45, 0.2), C(-0.5, 0.35)]);
    return;
  }

  if (normalized === "stripToHalfPlane" || normalized === "stripToDisk") {
    const xMin = -2.8;
    const xMax = 2.8;
    const yLow = 0;
    const yHigh = 1;
    drawMapped(sampleLine(C(xMin, yLow), C(xMax, yLow), curveSamples), { boundary: true, dash: "7 4" });
    drawMapped(sampleLine(C(xMin, yHigh), C(xMax, yHigh), curveSamples), { boundary: true, dash: "7 4" });
    for (let k = -4; k <= 4; k++) {
      const x = k * 0.6;
      drawMapped(sampleLine(C(x, yLow + 0.03), C(x, yHigh - 0.03), familySamples), {
        family: "u",
        opacity: 0.82,
      });
    }
    for (let k = 1; k <= 4; k++) {
      const y = k / 5;
      drawMapped(sampleLine(C(xMin, y), C(xMax, y), familySamples), { family: "v", opacity: 0.82 });
    }
    drawSpecialPoints(zPlot, wPlot, mapFn, [C(0, 0.25), C(0, 0.5), C(0, 0.75)]);
    return;
  }

  if (normalized === "exponential") {
    const xMin = -1.4;
    const xMax = 1.4;
    const yMin = -2.8;
    const yMax = 2.8;
    drawMapped(sampleLine(C(xMin, yMin), C(xMax, yMin), curveSamples), { boundary: true, dash: "5 4" });
    drawMapped(sampleLine(C(xMax, yMin), C(xMax, yMax), curveSamples), { boundary: true, dash: "5 4" });
    drawMapped(sampleLine(C(xMax, yMax), C(xMin, yMax), curveSamples), { boundary: true, dash: "5 4" });
    drawMapped(sampleLine(C(xMin, yMax), C(xMin, yMin), curveSamples), { boundary: true, dash: "5 4" });
    for (let x = -1.2; x <= 1.2 + 1e-9; x += 0.4) {
      drawMapped(sampleLine(C(x, yMin), C(x, yMax), familySamples), { family: "u", opacity: 0.8 });
    }
    for (let y = -2.4; y <= 2.4 + 1e-9; y += 0.6) {
      drawMapped(sampleLine(C(xMin, y), C(xMax, y), familySamples), { family: "v", opacity: 0.8 });
    }
    drawSpecialPoints(zPlot, wPlot, mapFn, [C(0, 0), C(0, Math.PI / 2), C(Math.log(2), 0)]);
    return;
  }

  if (normalized === "logarithm") {
    const rIn = 0.35;
    const rOut = 2.8;
    const aMin = -Math.PI + 0.06;
    const aMax = Math.PI - 0.06;
    const ringIn: Cpx[] = [];
    const ringOut: Cpx[] = [];
    for (let i = 0; i <= curveSamples; i++) {
      const t = i / curveSamples;
      const a = aMin + (aMax - aMin) * t;
      ringIn.push(C(rIn * Math.cos(a), rIn * Math.sin(a)));
      ringOut.push(C(rOut * Math.cos(a), rOut * Math.sin(a)));
    }
    drawMapped(ringIn, { boundary: true, dash: "5 4" });
    drawMapped(ringOut, { boundary: true, dash: "5 4" });
    drawMapped(sampleLine(ringIn[0]!, ringOut[0]!, curveSamples), { boundary: true, dash: "3 4" });
    drawMapped(sampleLine(ringIn[ringIn.length - 1]!, ringOut[ringOut.length - 1]!, curveSamples), {
      boundary: true,
      dash: "3 4",
    });
    for (let r = 0.45; r <= 2.5 + 1e-9; r += 0.35) {
      const arc: Cpx[] = [];
      for (let i = 0; i <= familySamples; i++) {
        const t = i / familySamples;
        const a = aMin + (aMax - aMin) * t;
        arc.push(C(r * Math.cos(a), r * Math.sin(a)));
      }
      drawMapped(arc, { family: "u", opacity: 0.78 });
    }
    for (let a = -2.4; a <= 2.4 + 1e-9; a += 0.45) {
      drawMapped(sampleLine(C(rIn * Math.cos(a), rIn * Math.sin(a)), C(rOut * Math.cos(a), rOut * Math.sin(a)), familySamples), {
        family: "v",
        opacity: 0.78,
      });
    }
    drawSpecialPoints(zPlot, wPlot, mapFn, [C(1, 0), C(0, 1), C(2, 0)]);
    return;
  }

  if (normalized === "joukowski") {
    const twoPi = Math.PI * 2;
    const boundary: Cpx[] = [];
    const radius = 1.15;
    for (let i = 0; i <= curveSamples; i++) {
      const t = (twoPi * i) / curveSamples;
      boundary.push(C(radius * Math.cos(t), radius * Math.sin(t)));
    }
    drawMapped(boundary, { boundary: true });
    for (let r = 1.25; r <= 2.6 + 1e-9; r += 0.35) {
      const ring: Cpx[] = [];
      for (let i = 0; i <= familySamples; i++) {
        const t = (twoPi * i) / familySamples;
        ring.push(C(r * Math.cos(t), r * Math.sin(t)));
      }
      drawMapped(ring, { family: "u", opacity: 0.8 });
    }
    for (let a = 0; a < 12; a++) {
      const th = (twoPi * a) / 12;
      drawMapped(sampleLine(C(radius * Math.cos(th), radius * Math.sin(th)), C(2.8 * Math.cos(th), 2.8 * Math.sin(th)), familySamples), {
        family: "v",
        opacity: 0.78,
      });
    }
    drawSpecialPoints(zPlot, wPlot, mapFn, [C(1.15, 0), C(-1.15, 0), C(2, 0.5)]);
    return;
  }

  if (normalized === "powerN") {
    const twoPi = Math.PI * 2;
    const boundary: Cpx[] = [];
    for (let i = 0; i <= curveSamples; i++) {
      const t = (twoPi * i) / curveSamples;
      boundary.push(C(Math.cos(t), Math.sin(t)));
    }
    drawMapped(boundary, { boundary: true });
    for (let r = 0.2; r <= 1.0 + 1e-9; r += 0.2) {
      const ring: Cpx[] = [];
      for (let i = 0; i <= familySamples; i++) {
        const t = (twoPi * i) / familySamples;
        ring.push(C(r * Math.cos(t), r * Math.sin(t)));
      }
      drawMapped(ring, { family: "u", opacity: 0.8 });
    }
    for (let a = 0; a < 12; a++) {
      const th = (twoPi * a) / 12;
      drawMapped(sampleLine(C(0, 0), C(Math.cos(th), Math.sin(th)), familySamples), { family: "v", opacity: 0.8 });
    }
    drawSpecialPoints(zPlot, wPlot, mapFn, [C(1, 0), C(0, 1), C(-1, 0)]);
    return;
  }

  if (normalized === "inverse") {
    const twoPi = Math.PI * 2;
    const rIn = 0.45;
    const rOut = 2.8;
    const boundaryIn: Cpx[] = [];
    const boundaryOut: Cpx[] = [];
    for (let i = 0; i <= curveSamples; i++) {
      const t = (twoPi * i) / curveSamples;
      boundaryIn.push(C(rIn * Math.cos(t), rIn * Math.sin(t)));
      boundaryOut.push(C(rOut * Math.cos(t), rOut * Math.sin(t)));
    }
    drawMapped(boundaryIn, { boundary: true, dash: "4 3" });
    drawMapped(boundaryOut, { boundary: true, dash: "4 3" });
    for (let r = 0.6; r <= 2.4 + 1e-9; r += 0.3) {
      const ring: Cpx[] = [];
      for (let i = 0; i <= familySamples; i++) {
        const t = (twoPi * i) / familySamples;
        ring.push(C(r * Math.cos(t), r * Math.sin(t)));
      }
      drawMapped(ring, { family: "u", opacity: 0.78 });
    }
    for (let a = 0; a < 14; a++) {
      const th = (twoPi * a) / 14;
      drawMapped(sampleLine(C(rIn * Math.cos(th), rIn * Math.sin(th)), C(rOut * Math.cos(th), rOut * Math.sin(th)), familySamples), {
        family: "v",
        opacity: 0.78,
      });
    }
    drawSpecialPoints(zPlot, wPlot, mapFn, [C(1, 0), C(0, 1), C(2, 0)]);
  }
}
