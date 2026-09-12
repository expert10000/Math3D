import type { AnyCurve } from "../model";
import { curveDomainSpan } from "../model";
import { distancePoint, finitePoint } from "./vector";

export const clampToDomain = (curve: AnyCurve, t: number): number => {
  if (t <= curve.domain.tMin) return curve.domain.tMin;
  if (t >= curve.domain.tMax) return curve.domain.tMax;
  return t;
};

export const normalizeCurveParameter = (curve: AnyCurve, t: number): number => {
  const span = curveDomainSpan(curve.domain);
  if (span <= 1e-12) return 0;
  return (clampToDomain(curve, t) - curve.domain.tMin) / span;
};

export const denormalizeCurveParameter = (curve: AnyCurve, u: number): number => {
  const uc = Math.min(1, Math.max(0, u));
  return curve.domain.tMin + uc * curveDomainSpan(curve.domain);
};

export type ArcLengthTable = {
  ts: number[];
  lengths: number[];
  totalLength: number;
  segmentLengths?: number[];
  normalizedLengths?: number[];
  validMask?: number[];
};

export type ArcLengthSample = { t: number; point: import("../model").CurvePoint; valid?: boolean };

export const buildArcLengthTableFromSamples = (samples: readonly ArcLengthSample[]): ArcLengthTable => {
  if (!samples.length) return { ts: [], lengths: [], totalLength: 0, segmentLengths: [], normalizedLengths: [], validMask: [] };
  const sorted = [...samples].sort((left, right) => left.t - right.t);
  const ts = sorted.map((sample) => sample.t);
  const lengths = new Array<number>(sorted.length).fill(0);
  const segmentLengths = new Array<number>(sorted.length).fill(0);
  const validMask = sorted.map((sample) => sample.valid === false || !finitePoint(sample.point) ? 0 : 1);
  let totalLength = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const segmentLength = validMask[index - 1] && validMask[index]
      ? distancePoint(sorted[index - 1].point, sorted[index].point)
      : 0;
    const finiteLength = Number.isFinite(segmentLength) ? Math.max(0, segmentLength) : 0;
    segmentLengths[index] = finiteLength;
    totalLength += finiteLength;
    lengths[index] = totalLength;
  }
  const normalizedLengths = lengths.map((length) => totalLength > 1e-12 ? length / totalLength : 0);
  return { ts, lengths, totalLength, segmentLengths, normalizedLengths, validMask };
};

export const buildArcLengthTable = (curve: AnyCurve, segments = 256): ArcLengthTable => {
  const count = Math.max(2, Math.floor(segments));
  const ts: number[] = new Array(count + 1);
  const lengths: number[] = new Array(count + 1);
  const tMin = curve.domain.tMin;
  const tMax = curve.domain.tMax;
  const dt = (tMax - tMin) / count;

  let total = 0;
  ts[0] = tMin;
  lengths[0] = 0;
  let prev = curve.eval(tMin);

  for (let i = 1; i <= count; i += 1) {
    const t = i === count ? tMax : tMin + i * dt;
    ts[i] = t;
    const next = curve.eval(t);
    total += distancePoint(prev, next);
    lengths[i] = total;
    prev = next;
  }

  const segmentLengths = lengths.map((length, index) => index ? Math.max(0, length - lengths[index - 1]) : 0);
  const normalizedLengths = lengths.map((length) => total > 1e-12 ? length / total : 0);
  return { ts, lengths, totalLength: total, segmentLengths, normalizedLengths, validMask: ts.map(() => 1) };
};

export const invertArcLengthTable = (table: ArcLengthTable, s: number): number => {
  if (table.totalLength <= 1e-12) return table.ts[0] ?? 0;
  const target = Math.min(table.totalLength, Math.max(0, s));
  const lengths = table.lengths;
  const ts = table.ts;

  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= target) lo = mid;
    else hi = mid;
  }

  const aLen = lengths[lo];
  const bLen = lengths[lo + 1];
  const aT = ts[lo];
  const bT = ts[lo + 1];
  const span = bLen - aLen;
  if (span <= 1e-12) return target >= table.totalLength ? bT : aT;
  const alpha = (target - aLen) / span;
  return aT + (bT - aT) * alpha;
};

export const parameterToArcLength = (table: ArcLengthTable, t: number): number => {
  if (!table.ts.length) return 0;
  if (t <= table.ts[0]) return 0;
  const last = table.ts.length - 1;
  if (t >= table.ts[last]) return table.totalLength;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table.ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  const parameterSpan = table.ts[hi] - table.ts[lo];
  if (parameterSpan <= 1e-12) return table.lengths[lo];
  const alpha = (t - table.ts[lo]) / parameterSpan;
  return table.lengths[lo] + alpha * (table.lengths[hi] - table.lengths[lo]);
};

export const reparameterizeByArcLength = (curve: AnyCurve, segments = 256) => {
  const table = buildArcLengthTable(curve, segments);
  return {
    table,
    tToS: (t: number): number => parameterToArcLength(table, clampToDomain(curve, t)),
    sToT: (s: number): number => invertArcLengthTable(table, s),
    uToT: (u: number): number => invertArcLengthTable(table, Math.max(0, Math.min(1, u)) * table.totalLength),
  };
};
