import type { CombinedRegionSummary, Graph2DFieldReference, Graph2DPointRow,
  Graph2DScientificVolume,
  VectorField3DAxis, VectorField3DDocument, VectorField3DOverlayRegion,
  VectorField3DSliceArtifact } from "@math3d/core";
import { linkedFieldPointStatus, sampleLinkedFieldVolume,
  type LinkedFieldPoint } from "./linkedFieldProbe";
import type { VectorSliceOverlayPlane } from "./scientificSliceOverlay";

export type FieldStatistics = Readonly<{
  count: number; gaps: number; mean: number | null; min: number | null; max: number | null }>;
export type FieldPointSample = Readonly<{
  status: "inside" | "outside" | "incompatible-units" | "invalid";
  value: number | null }>;
export type ComplexPointSample = Readonly<{
  status: FieldPointSample["status"]; real: number | null; imaginary: number | null;
  magnitude: number | null; phase: number | null }>;
export type ComplexRegionStatistics = Readonly<{
  magnitude: FieldStatistics; phase: FieldStatistics }>;

const regionSampleCount = 17 * 17;
const checkedAxes = (reference: Graph2DFieldReference, volume: Graph2DScientificVolume,
  vectorAxes: readonly VectorField3DAxis[]) => {
  if (reference.shape.length !== 3 || reference.axes.length !== 3 ||
      reference.axes.some((axis, index) => axis.name !== vectorAxes[index]?.label ||
        axis.unit !== vectorAxes[index]?.unit) ||
      volume.datasetId !== reference.datasetId ||
      volume.component !== reference.component ||
      volume.fingerprint !== reference.sceneFingerprint ||
      volume.resourceSha256 !== reference.resourceSha256 ||
      volume.sourceShape.some((count, index) => count !== reference.shape[index]))
    throw new TypeError("Field source, coordinate axes, units, or resource hash changed.");
  return reference.axes.map((axis, index) => ({ name: axis.name, unit: axis.unit,
    origin: axis.origin, spacing: axis.spacing, count: reference.shape[index]! }));
};
const checkedComplexAxes = (real: Graph2DFieldReference,
  imaginary: Graph2DFieldReference, volumes: readonly [Graph2DScientificVolume,
    Graph2DScientificVolume], vectorAxes: readonly VectorField3DAxis[]) => {
  const axes = checkedAxes(real, volumes[0], vectorAxes);
  checkedAxes(imaginary, volumes[1], vectorAxes);
  if (real.component !== "real" || imaginary.component !== "imaginary" ||
      real.datasetId !== imaginary.datasetId ||
      real.sceneFingerprint !== imaginary.sceneFingerprint ||
      real.axes.some((axis, index) => JSON.stringify(axis) !== JSON.stringify(imaginary.axes[index])) ||
      real.shape.some((count, index) => count !== imaginary.shape[index]))
    throw new TypeError("Complex components no longer form one aligned field.");
  return axes;
};
const statistics = (values: readonly number[]): FieldStatistics => ({
  count: values.length, gaps: regionSampleCount - values.length,
  mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
  min: values.length ? Math.min(...values) : null,
  max: values.length ? Math.max(...values) : null,
});
const phaseStatistics = (values: readonly number[]): FieldStatistics => {
  const base = statistics(values);
  if (!values.length) return base;
  const sine = values.reduce((sum, value) => sum + Math.sin(value), 0);
  const cosine = values.reduce((sum, value) => sum + Math.cos(value), 0);
  return { ...base, mean: Math.hypot(sine, cosine) / values.length < 1e-12 ? null :
    Math.atan2(sine, cosine) };
};
const regionPoints = (region: VectorField3DOverlayRegion): LinkedFieldPoint[] => {
  if (region.bounds.some(([low, high]) => !Number.isFinite(low) ||
      !Number.isFinite(high) || high <= low) || !Number.isFinite(region.fixedCoordinate))
    throw new RangeError("Region needs finite, ordered physical bounds.");
  const axes = ([0, 1, 2] as const).filter(axis => axis !== region.normalAxis);
  const points: LinkedFieldPoint[] = [];
  for (let i = 0; i < 17; i++) for (let j = 0; j < 17; j++) {
    const point = [0, 0, 0] as [number, number, number];
    point[region.normalAxis] = region.fixedCoordinate;
    point[axes[0]!] = region.bounds[0][0] +
      (region.bounds[0][1] - region.bounds[0][0]) * i / 16;
    point[axes[1]!] = region.bounds[1][0] +
      (region.bounds[1][1] - region.bounds[1][0]) * j / 16;
    points.push(point);
  }
  return points;
};

export function sampleVerifiedScalarPoint(reference: Graph2DFieldReference,
  volume: Graph2DScientificVolume, vectorAxes: readonly VectorField3DAxis[],
  point: LinkedFieldPoint, units: readonly string[]): FieldPointSample {
  const axes = checkedAxes(reference, volume, vectorAxes);
  const status = linkedFieldPointStatus(point, axes, units);
  if (status !== "inside") return { status, value: null };
  const value = sampleLinkedFieldVolume(volume, axes, point);
  return Number.isFinite(value) ? { status, value } : { status: "invalid", value: null };
}

export function sampleVerifiedComplexPoint(real: Graph2DFieldReference,
  imaginary: Graph2DFieldReference,
  volumes: readonly [Graph2DScientificVolume, Graph2DScientificVolume],
  vectorAxes: readonly VectorField3DAxis[], point: LinkedFieldPoint,
  units: readonly string[]): ComplexPointSample {
  const axes = checkedComplexAxes(real, imaginary, volumes, vectorAxes);
  const status = linkedFieldPointStatus(point, axes, units);
  if (status !== "inside") return { status, real: null, imaginary: null,
    magnitude: null, phase: null };
  const a = sampleLinkedFieldVolume(volumes[0], axes, point);
  const b = sampleLinkedFieldVolume(volumes[1], axes, point);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { status: "invalid",
    real: null, imaginary: null, magnitude: null, phase: null };
  const magnitude = Math.hypot(a, b);
  return { status, real: a, imaginary: b, magnitude,
    phase: magnitude > 1e-12 ? Math.atan2(b, a) : null };
}

export function sampleVerifiedScalarRegion(region: VectorField3DOverlayRegion,
  reference: Graph2DFieldReference, volume: Graph2DScientificVolume,
  vectorAxes: readonly VectorField3DAxis[]): FieldStatistics {
  const axes = checkedAxes(reference, volume, vectorAxes);
  const units = vectorAxes.map(axis => axis.unit);
  const values: number[] = [];
  for (const point of regionPoints(region)) {
    if (linkedFieldPointStatus(point, axes, units) !== "inside") continue;
    const value = sampleLinkedFieldVolume(volume, axes, point);
    if (Number.isFinite(value)) values.push(value);
  }
  return statistics(values);
}

export function sampleVerifiedComplexRegion(region: VectorField3DOverlayRegion,
  real: Graph2DFieldReference, imaginary: Graph2DFieldReference,
  volumes: readonly [Graph2DScientificVolume, Graph2DScientificVolume],
  vectorAxes: readonly VectorField3DAxis[]): ComplexRegionStatistics {
  const axes = checkedComplexAxes(real, imaginary, volumes, vectorAxes);
  const units = vectorAxes.map(axis => axis.unit);
  const magnitudes: number[] = [], phases: number[] = [];
  for (const point of regionPoints(region)) {
    if (linkedFieldPointStatus(point, axes, units) !== "inside") continue;
    const a = sampleLinkedFieldVolume(volumes[0], axes, point);
    const b = sampleLinkedFieldVolume(volumes[1], axes, point);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const magnitude = Math.hypot(a, b);
    magnitudes.push(magnitude);
    if (magnitude > 1e-12) phases.push(Math.atan2(b, a));
  }
  return { magnitude: statistics(magnitudes), phase: phaseStatistics(phases) };
}

/** Vector-only summary, so changed scalar or complex sources cannot hide valid vector values. */
export function sampleVerifiedVectorRegion(document: VectorField3DDocument,
  slice: VectorField3DSliceArtifact, region: VectorField3DOverlayRegion,
  plane: VectorSliceOverlayPlane): Readonly<{ statistics: FieldStatistics; unit: string;
    rows: readonly Graph2DPointRow[] }> {
  if (region.normalAxis !== slice.normalAxis ||
      Math.abs(region.fixedCoordinate - slice.fixedCoordinate) > 1e-9 ||
      plane.sourceStructuralHash !== document.identity.structuralHash ||
      plane.shape[0] !== slice.shape[0] || plane.shape[1] !== slice.shape[1])
    throw new TypeError("Region is not on the current verified vector plane.");
  const component = { p: 0, q: 1, r: 2 } as const;
  const index = region.vectorChannel === "speed" ? null : component[region.vectorChannel];
  if (index === null && plane.units.some(unit => unit !== plane.units[0]))
    throw new TypeError("Vector component units differ; speed cannot be combined.");
  const values: number[] = [];
  const columns: number[][] = Array.from({ length: 17 }, () => []);
  const [nx, ny] = slice.shape;
  for (const [sampleIndex, point] of regionPoints(region).entries()) {
    const local = slice.planeAxes.map(axis => point[axis]);
    const positions = local.map((value, axis) => {
      const coordinates = slice.coordinates[axis]!;
      if (value < coordinates[0]! - 1e-9 || value > coordinates.at(-1)! + 1e-9)
        return null;
      let hi = coordinates.findIndex(coordinate => coordinate >= value - 1e-9);
      if (hi < 0) hi = coordinates.length - 1;
      const lo = Math.max(0, hi - 1);
      return { lo, hi, fraction: hi === lo ? 0 :
        Math.max(0, Math.min(1, (value - coordinates[lo]!) /
          (coordinates[hi]! - coordinates[lo]!))) };
    });
    if (positions.some(position => position === null)) continue;
    const [a, b] = positions as NonNullable<typeof positions[number]>[];
    const sampled = plane.components.map(values => {
      const at = (i: number, j: number) => values[i * ny + j];
      const corners = [at(a!.lo, b!.lo), at(a!.hi, b!.lo),
        at(a!.lo, b!.hi), at(a!.hi, b!.hi)];
      if (!corners.every(Number.isFinite)) return null;
      return (corners[0]! * (1 - a!.fraction) + corners[1]! * a!.fraction) * (1 - b!.fraction) +
        (corners[2]! * (1 - a!.fraction) + corners[3]! * a!.fraction) * b!.fraction;
    });
    const value = index === null ? sampled.every(item => item !== null) ?
      Math.hypot(...sampled as number[]) : null : sampled[index];
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      values.push(value);
      columns[Math.floor(sampleIndex / 17)]!.push(value);
    }
  }
  if (plane.components.some(values => values.length !== nx * ny))
    throw new TypeError("Verified vector plane has an unexpected sample count.");
  return { statistics: statistics(values), unit: plane.units[index ?? 0]!,
    rows: columns.map((column, i) => ({ id: `row_${i + 1}`,
      x: region.bounds[0][0] + (region.bounds[0][1] - region.bounds[0][0]) * i / 16,
      y: column.length ? column.reduce((sum, value) => sum + value, 0) /
        column.length : null })) };
}

export type CombinedRegionSeries = "vector" | "scalar" | "complex-magnitude" | "complex-phase";
export type CombinedRegionInspection = Readonly<{
  summary: CombinedRegionSummary;
  profiles: Readonly<Record<CombinedRegionSeries, readonly Graph2DPointRow[]>>;
  rowProfiles: Readonly<Record<CombinedRegionSeries, readonly Graph2DPointRow[]>>;
  /** Transient verified values, first physical axis outermost. Never saved in a Project. */
  cells: Readonly<Record<CombinedRegionSeries, readonly (number | null)[]>>;
}>;

/** Four independent means along both axes of one physical 17×17 lattice. */
export function sampleCombinedRegion(document: VectorField3DDocument,
  slice: VectorField3DSliceArtifact, region: VectorField3DOverlayRegion,
  plane: VectorSliceOverlayPlane, scalarReference: Graph2DFieldReference,
  scalarVolume: Graph2DScientificVolume, realReference: Graph2DFieldReference,
  imaginaryReference: Graph2DFieldReference,
  complexVolumes: readonly [Graph2DScientificVolume, Graph2DScientificVolume]):
  CombinedRegionInspection {
  const speedRegion = { ...region, vectorChannel: "speed" as const };
  const vector = sampleVerifiedVectorRegion(document, slice, speedRegion, plane);
  const scalar = sampleVerifiedScalarRegion(region, scalarReference, scalarVolume,
    document.source.axes);
  const complex = sampleVerifiedComplexRegion(region, realReference,
    imaginaryReference, complexVolumes, document.source.axes);
  const series: CombinedRegionSeries[] = ["vector", "scalar", "complex-magnitude",
    "complex-phase"];
  const emptyBins = () => Array.from({ length: 17 }, () =>
    ({ vector: [] as number[], scalar: [] as number[],
      "complex-magnitude": [] as number[], "complex-phase": [] as number[] }));
  const columns = emptyBins(), rows = emptyBins();
  const cells: Record<CombinedRegionSeries, (number | null)[]> = {
    vector: [], scalar: [], "complex-magnitude": [], "complex-phase": [] };
  const ny = slice.shape[1];
  const speedAt = (point: LinkedFieldPoint): number | null => {
    const local = slice.planeAxes.map(axis => point[axis]);
    if (local.some((value, axis) => value < slice.coordinates[axis]![0]! - 1e-9 ||
        value > slice.coordinates[axis]!.at(-1)! + 1e-9)) return null;
    const positions = local.map((value, axis) => {
      const coordinates = slice.coordinates[axis]!;
      let hi = coordinates.findIndex(coordinate => coordinate >= value - 1e-9);
      if (hi < 0) hi = coordinates.length - 1;
      const lo = Math.max(0, hi - 1);
      return { lo, hi, fraction: hi === lo ? 0 : Math.max(0, Math.min(1,
        (value - coordinates[lo]!) / (coordinates[hi]! - coordinates[lo]!))) };
    });
    const [a, b] = positions;
    const values = plane.components.map(component => {
      const at = (i: number, j: number) => component[i * ny + j];
      const corners = [at(a!.lo, b!.lo), at(a!.hi, b!.lo),
        at(a!.lo, b!.hi), at(a!.hi, b!.hi)];
      return corners.every(Number.isFinite) ?
        (corners[0]! * (1 - a!.fraction) + corners[1]! * a!.fraction) * (1 - b!.fraction) +
        (corners[2]! * (1 - a!.fraction) + corners[3]! * a!.fraction) * b!.fraction : null;
    });
    return values.every(value => value !== null) ? Math.hypot(...values as number[]) : null;
  };
  const units = document.source.axes.map(axis => axis.unit);
  for (let i = 0; i < 17; i++) for (let j = 0; j < 17; j++) {
    const point = [0, 0, 0] as [number, number, number];
    point[region.normalAxis] = region.fixedCoordinate;
    point[slice.planeAxes[0]!] = region.bounds[0][0] +
      (region.bounds[0][1] - region.bounds[0][0]) * i / 16;
    point[slice.planeAxes[1]!] = region.bounds[1][0] +
      (region.bounds[1][1] - region.bounds[1][0]) * j / 16;
    const speed = speedAt(point);
    cells.vector.push(speed !== null && Number.isFinite(speed) ? speed : null);
    if (speed !== null && Number.isFinite(speed)) {
      columns[i]!.vector.push(speed); rows[j]!.vector.push(speed);
    }
    const q = sampleVerifiedScalarPoint(scalarReference, scalarVolume,
      document.source.axes, point, units).value;
    cells.scalar.push(q);
    if (q !== null) { columns[i]!.scalar.push(q); rows[j]!.scalar.push(q); }
    const wave = sampleVerifiedComplexPoint(realReference, imaginaryReference,
      complexVolumes, document.source.axes, point, units);
    cells["complex-magnitude"].push(wave.magnitude);
    cells["complex-phase"].push(wave.phase);
    if (wave.magnitude !== null) {
      columns[i]!["complex-magnitude"].push(wave.magnitude);
      rows[j]!["complex-magnitude"].push(wave.magnitude);
    }
    if (wave.phase !== null) {
      columns[i]!["complex-phase"].push(wave.phase);
      rows[j]!["complex-phase"].push(wave.phase);
    }
  }
  const profile = (bins: ReturnType<typeof emptyBins>, axis: 0 | 1) => {
    const result = Object.fromEntries(series.map(key => [key,
      bins.map((bin, index) => ({ id: `row_${index + 1}`,
        x: region.bounds[axis][0] + (region.bounds[axis][1] - region.bounds[axis][0]) * index / 16,
        y: key === "complex-phase" ? phaseStatistics(bin[key]).mean :
          statistics(bin[key]).mean }))])) as Record<CombinedRegionSeries, Graph2DPointRow[]>;
    // A wrapped phase jump has no unambiguous line segment across the branch cut.
    for (let index = 1; index < 17; index++) {
      const previous = result["complex-phase"][index - 1]!.y;
      const current = result["complex-phase"][index]!.y;
      if (previous !== null && current !== null && Math.abs(current - previous) > Math.PI)
        result["complex-phase"][index] = { ...result["complex-phase"][index]!, y: null };
    }
    return result;
  };
  const profiles = profile(columns, 0), rowProfiles = profile(rows, 1);
  return { cells, summary: { sampleCount: 289, vector: vector.statistics,
    scalar, complexMagnitude: complex.magnitude, complexPhase: complex.phase,
    vectorUnit: vector.unit,
    scalarUnit: document.workspace!.scalarOverlay!.unit,
    complexUnit: document.workspace!.complexOverlay!.unit }, profiles, rowProfiles };
}
