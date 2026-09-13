import type { AnalysisIdentity, AnalysisResult, AnalysisResultStore } from "../analysis/contracts";
import { createAnalysisResultStore, getAnalysisResult, upsertAnalysisResult } from "../analysis/resultStore";
import type { VolumeGrid } from "../scene/datasets";
import { sampleGridTrilinear } from "../scene/volume/sliceVolume";
import type { VolumeObject, VolumeStorageRef } from "./contracts";
import type { IntegerVolumeLabelMap } from "./segmentation";
import { volumeGridIndexToWorld, volumeIndexInside, volumeWorldToGridIndex } from "./spatial";
import { VolumeTypedArrayStore } from "./typedArrayStore";

export type VolumeAlignmentPolicy = "exact-grid" | "resample-b-to-a" | "common-target-grid" | "reject-incompatible";
export type VolumeComparisonView = "a-b" | "a-difference" | "overlay" | "checkerboard" | "synchronized-probe";
export type VolumeComparisonInput = { volume: VolumeObject; grid: VolumeGrid };
export type VolumeComparisonNorms = { l1: number; l2: number; linfinity: number; rmse: number };
export type VolumeComparisonMetrics = {
  finitePairCount: number;
  missingPairCount: number;
  signedMeanDifference: number | null;
  absoluteMeanDifference: number | null;
  relativeMeanDifference: number | null;
  norms: VolumeComparisonNorms;
  correlation: number | null;
  changedVoxelCount: number;
  changedFraction: number;
};
export type VolumeComparisonProvenance = {
  volumeA: { id: string; volumeRevision: number; sampledGridRevision: number };
  volumeB: { id: string; volumeRevision: number; sampledGridRevision: number };
  alignmentPolicy: VolumeAlignmentPolicy;
  interpolation: "none" | "trilinear";
  target: { dimensions: [number, number, number]; origin: [number, number, number]; spacing: [number, number, number]; direction: number[] };
  createdAt: number;
};
export type VolumeComparisonFieldRefs = {
  alignedB: VolumeStorageRef;
  signedDifference: VolumeStorageRef;
  absoluteDifference: VolumeStorageRef;
  relativeDifference: VolumeStorageRef;
  changeMask: VolumeStorageRef;
};
export type VolumeComparisonSummary = {
  metrics: VolumeComparisonMetrics;
  fields: VolumeComparisonFieldRefs;
  provenance: VolumeComparisonProvenance;
  changeThreshold: number;
};
export type VolumeLabelOverlap = { label: number; aCount: number; bCount: number; intersection: number; union: number; dice: number; jaccard: number; changedVoxelCount: number };
export type VolumeLabelComparison = {
  totalVoxels: number;
  unchangedVoxels: number;
  changedVoxels: number;
  confusion: Array<{ labelA: number; labelB: number; count: number }>;
  labels: VolumeLabelOverlap[];
  alignmentPolicy: "exact-grid";
};
export type VolumeComparisonIdentity = AnalysisIdentity & {
  volumeAId: string;
  volumeARevision: number;
  volumeBId: string;
  volumeBRevision: number;
};
export type VolumeComparisonResultStore = AnalysisResultStore<"volume-comparison", VolumeComparisonIdentity>;
export type VolumeComparisonResult = AnalysisResult<VolumeComparisonSummary, "volume-comparison", VolumeComparisonIdentity>;

const sameNumbers = (a: readonly number[] | undefined, b: readonly number[] | undefined, fallback: readonly number[]) => {
  const left = a ?? fallback;
  const right = b ?? fallback;
  return left.length === right.length && left.every((value, index) => Math.abs(value - right[index]) <= 1e-12);
};
export const volumeGridsExactlyAligned = (a: VolumeGrid, b: VolumeGrid): boolean =>
  a.dims.every((value, index) => value === b.dims[index]) &&
  sameNumbers(a.origin, b.origin, [0, 0, 0]) &&
  sameNumbers(a.spacing, b.spacing, [1, 1, 1]) &&
  sameNumbers(a.direction, b.direction, [1, 0, 0, 0, 1, 0, 0, 0, 1]) &&
  (a.centering ?? "point") === (b.centering ?? "point");

const cloneGridGeometry = (grid: VolumeGrid): Omit<VolumeGrid, "scalars"> => ({
  dims: [...grid.dims],
  origin: [...(grid.origin ?? [0, 0, 0])],
  spacing: [...(grid.spacing ?? [1, 1, 1])],
  direction: [...(grid.direction ?? [1, 0, 0, 0, 1, 0, 0, 0, 1])],
  centering: grid.centering ?? "point",
});
const resampleTo = (source: VolumeGrid, target: Omit<VolumeGrid, "scalars">): Float32Array => {
  const values = new Float32Array(target.dims[0] * target.dims[1] * target.dims[2]);
  const targetGrid: VolumeGrid = { ...target, scalars: values };
  for (let z = 0; z < target.dims[2]; z += 1) {
    for (let y = 0; y < target.dims[1]; y += 1) {
      for (let x = 0; x < target.dims[0]; x += 1) {
        const index = x + target.dims[0] * (y + target.dims[1] * z);
        const world = volumeGridIndexToWorld(targetGrid, [x, y, z]);
        const sourceIndex = volumeWorldToGridIndex(source, world);
        values[index] = volumeIndexInside(source.dims, sourceIndex) ? sampleGridTrilinear(source, world) : Number.NaN;
      }
    }
  }
  return values;
};
export const alignVolumePair = (
  a: VolumeGrid,
  b: VolumeGrid,
  policy: VolumeAlignmentPolicy,
  commonTarget?: Omit<VolumeGrid, "scalars">,
): { target: Omit<VolumeGrid, "scalars">; a: Float32Array; b: Float32Array; interpolation: "none" | "trilinear" } => {
  const exact = volumeGridsExactlyAligned(a, b);
  if (policy === "exact-grid" || policy === "reject-incompatible") {
    if (!exact) throw new Error(`Volume grids are incompatible under ${policy}; choose an explicit resampling policy.`);
    return { target: cloneGridGeometry(a), a: new Float32Array(a.scalars), b: new Float32Array(b.scalars), interpolation: "none" };
  }
  if (policy === "resample-b-to-a") {
    return { target: cloneGridGeometry(a), a: new Float32Array(a.scalars), b: exact ? new Float32Array(b.scalars) : resampleTo(b, cloneGridGeometry(a)), interpolation: exact ? "none" : "trilinear" };
  }
  if (!commonTarget) throw new Error("Common-target comparison requires an explicit target grid.");
  const count = commonTarget.dims[0] * commonTarget.dims[1] * commonTarget.dims[2];
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("Common comparison target dimensions are invalid.");
  return { target: cloneGridGeometry({ ...commonTarget, scalars: new Float32Array(count) }), a: resampleTo(a, commonTarget), b: resampleTo(b, commonTarget), interpolation: "trilinear" };
};

const storage = (handle: string, data: Float32Array | Uint8Array): VolumeStorageRef => ({
  handle,
  byteLength: data.byteLength,
  elementCount: data.length,
  scalarType: data instanceof Uint8Array ? "uint8" : "float32",
  components: 1,
  ownership: "managed-memory",
});
export const compareVolumes = (args: {
  a: VolumeComparisonInput;
  b: VolumeComparisonInput;
  alignment: VolumeAlignmentPolicy;
  store: VolumeTypedArrayStore;
  commonTarget?: Omit<VolumeGrid, "scalars">;
  changeThreshold?: number;
  relativeEpsilon?: number;
  now?: number;
}): VolumeComparisonSummary => {
  const aligned = alignVolumePair(args.a.grid, args.b.grid, args.alignment, args.commonTarget);
  const count = aligned.a.length;
  const signed = new Float32Array(count);
  const absolute = new Float32Array(count);
  const relative = new Float32Array(count);
  const changeMask = new Uint8Array(count);
  const threshold = Math.max(0, args.changeThreshold ?? 0);
  const epsilon = Math.max(Number.EPSILON, args.relativeEpsilon ?? 1e-12);
  signed.fill(Number.NaN); absolute.fill(Number.NaN); relative.fill(Number.NaN);
  let finitePairCount = 0; let missingPairCount = 0; let signedSum = 0; let absoluteSum = 0; let relativeSum = 0; let squares = 0; let linfinity = 0;
  let sumA = 0; let sumB = 0; let sumAA = 0; let sumBB = 0; let sumAB = 0; let changedVoxelCount = 0;
  for (let index = 0; index < count; index += 1) {
    const av = aligned.a[index]; const bv = aligned.b[index];
    if (!Number.isFinite(av) || !Number.isFinite(bv)) { missingPairCount += 1; continue; }
    const difference = bv - av; const magnitude = Math.abs(difference); const relativeValue = magnitude / Math.max(Math.abs(av), epsilon);
    signed[index] = difference; absolute[index] = magnitude; relative[index] = relativeValue;
    finitePairCount += 1; signedSum += difference; absoluteSum += magnitude; relativeSum += relativeValue; squares += difference * difference; linfinity = Math.max(linfinity, magnitude);
    sumA += av; sumB += bv; sumAA += av * av; sumBB += bv * bv; sumAB += av * bv;
    if (magnitude > threshold) { changeMask[index] = 1; changedVoxelCount += 1; }
  }
  const numerator = finitePairCount * sumAB - sumA * sumB;
  const denominator = Math.sqrt(Math.max(0, finitePairCount * sumAA - sumA * sumA) * Math.max(0, finitePairCount * sumBB - sumB * sumB));
  const correlation = finitePairCount && denominator > 0 ? numerator / denominator : finitePairCount && absoluteSum === 0 ? 1 : null;
  const stamp = args.now ?? Date.now();
  const prefix = `volume-compare:${args.a.volume.identity.volumeId}@${args.a.volume.identity.volumeRevision}:${args.b.volume.identity.volumeId}@${args.b.volume.identity.volumeRevision}:${stamp}`;
  const bind = (name: string, data: Float32Array | Uint8Array) => { const ref = storage(`${prefix}:${name}`, data); args.store.bind(`${prefix}:${name}`, ref, data); return ref; };
  const targetGrid: VolumeGrid = { ...aligned.target, scalars: aligned.a };
  return {
    metrics: {
      finitePairCount,
      missingPairCount,
      signedMeanDifference: finitePairCount ? signedSum / finitePairCount : null,
      absoluteMeanDifference: finitePairCount ? absoluteSum / finitePairCount : null,
      relativeMeanDifference: finitePairCount ? relativeSum / finitePairCount : null,
      norms: { l1: absoluteSum, l2: Math.sqrt(squares), linfinity, rmse: finitePairCount ? Math.sqrt(squares / finitePairCount) : Number.NaN },
      correlation,
      changedVoxelCount,
      changedFraction: finitePairCount ? changedVoxelCount / finitePairCount : 0,
    },
    fields: { alignedB: bind("aligned-b", aligned.b), signedDifference: bind("signed-difference", signed), absoluteDifference: bind("absolute-difference", absolute), relativeDifference: bind("relative-difference", relative), changeMask: bind("change-mask", changeMask) },
    provenance: {
      volumeA: { id: args.a.volume.identity.volumeId, volumeRevision: args.a.volume.identity.volumeRevision, sampledGridRevision: args.a.volume.identity.sampledGridRevision },
      volumeB: { id: args.b.volume.identity.volumeId, volumeRevision: args.b.volume.identity.volumeRevision, sampledGridRevision: args.b.volume.identity.sampledGridRevision },
      alignmentPolicy: args.alignment,
      interpolation: aligned.interpolation,
      target: { dimensions: [...aligned.target.dims], origin: [...(aligned.target.origin ?? [0,0,0])], spacing: [...(aligned.target.spacing ?? [1,1,1])], direction: [...(aligned.target.direction ?? [1,0,0,0,1,0,0,0,1])] },
      createdAt: stamp,
    },
    changeThreshold: threshold,
  };
};

export const compareVolumeLabels = (a: IntegerVolumeLabelMap, b: IntegerVolumeLabelMap, alignment: VolumeAlignmentPolicy = "exact-grid"): VolumeLabelComparison => {
  if (alignment !== "exact-grid") throw new Error("Categorical label comparisons require exact-grid alignment; interpolation is forbidden.");
  if (a.dimensions.some((value, index) => value !== b.dimensions[index])) throw new Error("Categorical label grids are incompatible.");
  const confusion = new Map<string, number>(); let unchangedVoxels = 0;
  const labels = new Set<number>();
  for (let index = 0; index < a.data.length; index += 1) {
    const av = a.data[index]; const bv = b.data[index]; labels.add(av); labels.add(bv); if (av === bv) unchangedVoxels += 1;
    const key = `${av}:${bv}`; confusion.set(key, (confusion.get(key) ?? 0) + 1);
  }
  const overlap = [...labels].filter(label => label !== 0).sort((left, right) => left - right).map(label => {
    let aCount = 0; let bCount = 0; let intersection = 0;
    for (let index = 0; index < a.data.length; index += 1) { const inA = a.data[index] === label; const inB = b.data[index] === label; if (inA) aCount += 1; if (inB) bCount += 1; if (inA && inB) intersection += 1; }
    const union = aCount + bCount - intersection;
    return { label, aCount, bCount, intersection, union, dice: aCount + bCount ? 2 * intersection / (aCount + bCount) : 1, jaccard: union ? intersection / union : 1, changedVoxelCount: aCount + bCount - 2 * intersection };
  });
  return { totalVoxels: a.data.length, unchangedVoxels, changedVoxels: a.data.length - unchangedVoxels, confusion: [...confusion].map(([key, count]) => { const [labelA, labelB] = key.split(":").map(Number); return { labelA, labelB, count }; }).sort((left, right) => left.labelA - right.labelA || left.labelB - right.labelB), labels: overlap, alignmentPolicy: "exact-grid" };
};

export const createVolumeComparisonIdentity = (a: VolumeObject, b: VolumeObject): VolumeComparisonIdentity => ({
  key: `volume-comparison:${a.identity.volumeId}@${a.identity.volumeRevision}:${b.identity.volumeId}@${b.identity.volumeRevision}`,
  revision: `${a.identity.volumeRevision}:${a.identity.sampledGridRevision}|${b.identity.volumeRevision}:${b.identity.sampledGridRevision}`,
  label: `${a.identity.label} ↔ ${b.identity.label}`,
  sourceLabel: `${a.identity.volumeId}|${b.identity.volumeId}`,
  volumeAId: a.identity.volumeId,
  volumeARevision: a.identity.volumeRevision,
  volumeBId: b.identity.volumeId,
  volumeBRevision: b.identity.volumeRevision,
});
export const createVolumeComparisonResultStore = (): VolumeComparisonResultStore => createAnalysisResultStore<"volume-comparison", VolumeComparisonIdentity>();
export const publishVolumeComparison = (store: VolumeComparisonResultStore, a: VolumeObject, b: VolumeObject, summary: VolumeComparisonSummary): VolumeComparisonResultStore => upsertAnalysisResult(store, { identity: createVolumeComparisonIdentity(a,b), kind: "volume-comparison", parameters: { alignment: summary.provenance.alignmentPolicy, changeThreshold: summary.changeThreshold, volumeARevision: a.identity.volumeRevision, volumeBRevision: b.identity.volumeRevision }, payload: summary, backend: "Math3D Volume Compare", now: summary.provenance.createdAt }, { lineageKey: identity => `${identity.volumeAId}|${identity.volumeBId}`, maxResults: 24, maxHistory: 96 });
export const getVolumeComparisonResult = (store: VolumeComparisonResultStore, a: VolumeObject, b: VolumeObject): VolumeComparisonResult | null => getAnalysisResult<VolumeComparisonSummary,"volume-comparison",VolumeComparisonIdentity>(store,createVolumeComparisonIdentity(a,b),"volume-comparison");
