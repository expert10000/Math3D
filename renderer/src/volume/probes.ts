import type { VolumeDataset } from "../scene/datasets";
import { gradientVectorAt, sampleGridTrilinear } from "../scene/volume/sliceVolume";
import type { VolumeObject } from "./contracts";
import {
  clampVolumeIndex,
  nearestVolumeVoxel,
  volumeGridIndexToWorld,
  volumeIndexInside,
  volumeWorldToGridIndex,
  type VolumePoint3,
} from "./spatial";

export type VolumeOrientationConvention = "scientific" | "radiological";
export type VolumeProbeGradientMethod = "analytic" | "central-difference";

export type VolumeProbeReading = {
  continuousIndex: VolumePoint3;
  voxelIndex: VolumePoint3;
  world: VolumePoint3;
  components: number[];
  gradient: VolumePoint3;
  gradientMagnitude: number;
  gradientMethod: VolumeProbeGradientMethod;
  insideDomain: boolean;
};

export type PinnedVolumeProbe = VolumeProbeReading & {
  id: string;
  name: string;
  volumeId: string;
  volumeRevision: number;
  sampledGridRevision: number;
  pinnedAt: number;
};

export type VolumeProbeComparison = {
  first: PinnedVolumeProbe;
  second: PinnedVolumeProbe;
  worldDistance: number;
  valueDelta: number;
  gradientMagnitudeDelta: number;
};

const signPowDerivative = (value: number, power: number): number => {
  if (value === 0) return 0;
  return power * Math.sign(value) * Math.pow(Math.abs(value), power - 1);
};

export const analyticVolumeGradientAt = (volume: VolumeObject, world: VolumePoint3): VolumePoint3 | null => {
  if (volume.source.kind !== "analytic-preset") return null;
  const [x, y, z] = world;
  const p = volume.source.parameters;
  switch (volume.source.presetId) {
    case "sphere":
      return [2 * x, 2 * y, 2 * z];
    case "ellipsoid": {
      const a = p.a ?? 1.3;
      const b = p.b ?? 1;
      const c = p.c ?? 0.75;
      return [2 * x / (a * a), 2 * y / (b * b), 2 * z / (c * c)];
    }
    case "torus": {
      const q = x * x + y * y - (p.R ?? 1);
      return [4 * x * q, 4 * y * q, 2 * z];
    }
    case "cylinder": {
      const radiusBranch = x * x + y * y - Math.pow(p.R ?? 0.9, 2);
      const capBranch = Math.abs(z) - (p.h ?? 1.1);
      return radiusBranch >= capBranch ? [2 * x, 2 * y, 0] : [0, 0, Math.sign(z)];
    }
    case "superquadric": {
      const power = p.p ?? 3.2;
      return [signPowDerivative(x, power), signPowDerivative(y, power), signPowDerivative(z, power)];
    }
    case "gyroid": {
      const k = p.k ?? 1;
      return [
        k * Math.cos(k * x) * Math.cos(k * y) - k * Math.sin(k * z) * Math.sin(k * x),
        -k * Math.sin(k * x) * Math.sin(k * y) + k * Math.cos(k * y) * Math.cos(k * z),
        -k * Math.sin(k * y) * Math.sin(k * z) + k * Math.cos(k * z) * Math.cos(k * x),
      ];
    }
    case "metaballs": {
      const falloff = p.k ?? 4.2;
      const balls = [
        { x: -0.6, y: 0, z: 0, w: 1 },
        { x: 0.6, y: 0, z: 0, w: 1 },
        { x: 0, y: 0.7, z: 0.4, w: 0.85 },
      ];
      const gradient: VolumePoint3 = [0, 0, 0];
      for (const ball of balls) {
        const dx = x - ball.x;
        const dy = y - ball.y;
        const dz = z - ball.z;
        const factor = -2 * falloff * ball.w * Math.exp(-falloff * (dx * dx + dy * dy + dz * dz));
        gradient[0] += factor * dx;
        gradient[1] += factor * dy;
        gradient[2] += factor * dz;
      }
      return gradient;
    }
    default:
      return null;
  }
};

export const readVolumeProbe = (
  dataset: VolumeDataset,
  volume: VolumeObject,
  world: VolumePoint3,
  snapToVoxelCenter: boolean
): VolumeProbeReading => {
  const grid = dataset.grid;
  const rawIndex = volumeWorldToGridIndex(grid, world);
  const insideDomain = volumeIndexInside(grid.dims, rawIndex);
  const clamped = clampVolumeIndex(grid.dims, rawIndex);
  const sampleIndex = snapToVoxelCenter ? nearestVolumeVoxel(grid.dims, clamped) : clamped;
  const sampleWorld = volumeGridIndexToWorld(grid, sampleIndex);
  const exactGradient = analyticVolumeGradientAt(volume, sampleWorld);
  const gradient = exactGradient ?? gradientVectorAt(grid, sampleWorld);
  const gradientMagnitude = Math.hypot(gradient[0], gradient[1], gradient[2]);
  return {
    continuousIndex: sampleIndex,
    voxelIndex: nearestVolumeVoxel(grid.dims, sampleIndex),
    world: sampleWorld,
    components: [sampleGridTrilinear(grid, sampleWorld)],
    gradient,
    gradientMagnitude,
    gradientMethod: exactGradient ? "analytic" : "central-difference",
    insideDomain,
  };
};

export const createPinnedVolumeProbe = (args: {
  id: string;
  name: string;
  reading: VolumeProbeReading;
  volume: VolumeObject;
  now?: number;
}): PinnedVolumeProbe => {
  const reading = args.reading;
  return {
    continuousIndex: [...reading.continuousIndex] as VolumePoint3,
    voxelIndex: [...reading.voxelIndex] as VolumePoint3,
    world: [...reading.world] as VolumePoint3,
    components: [...reading.components],
    gradient: [...reading.gradient] as VolumePoint3,
    gradientMagnitude: reading.gradientMagnitude,
    gradientMethod: reading.gradientMethod,
    insideDomain: reading.insideDomain,
    id: args.id,
    name: args.name.trim() || "Probe",
    volumeId: args.volume.identity.volumeId,
    volumeRevision: args.volume.identity.volumeRevision,
    sampledGridRevision: args.volume.identity.sampledGridRevision,
    pinnedAt: args.now ?? Date.now(),
  };
};

export const isPinnedVolumeProbeStale = (probe: PinnedVolumeProbe, volume: VolumeObject): boolean =>
  probe.volumeId !== volume.identity.volumeId || probe.volumeRevision !== volume.identity.volumeRevision;

export const comparePinnedVolumeProbes = (
  first: PinnedVolumeProbe,
  second: PinnedVolumeProbe
): VolumeProbeComparison => ({
  first,
  second,
  worldDistance: Math.hypot(
    second.world[0] - first.world[0],
    second.world[1] - first.world[1],
    second.world[2] - first.world[2]
  ),
  valueDelta: (second.components[0] ?? Number.NaN) - (first.components[0] ?? Number.NaN),
  gradientMagnitudeDelta: second.gradientMagnitude - first.gradientMagnitude,
});

export const formatVolumeProbeText = (probe: VolumeProbeReading | PinnedVolumeProbe): string =>
  [
    "name" in probe ? probe.name : "Current Volume probe",
    `index=(${probe.continuousIndex.map((value) => Number(value.toFixed(4))).join(", ")})`,
    `voxel=(${probe.voxelIndex.join(", ")})`,
    `world=(${probe.world.map((value) => Number(value.toFixed(6))).join(", ")})`,
    `components=(${probe.components.map((value) => Number(value.toFixed(6))).join(", ")})`,
    `gradient=(${probe.gradient.map((value) => Number(value.toFixed(6))).join(", ")})`,
    `gradientMagnitude=${Number(probe.gradientMagnitude.toFixed(6))}`,
    `gradientMethod=${probe.gradientMethod}`,
    `insideDomain=${probe.insideDomain}`,
  ].join("\n");

const csvCell = (value: unknown): string => `"${String(value).replaceAll('"', '""')}"`;

export const volumeProbesToCsv = (probes: readonly PinnedVolumeProbe[]): string => {
  const header = [
    "id", "name", "volumeId", "volumeRevision", "gridRevision", "i", "j", "k", "x", "y", "z",
    "value", "gradientX", "gradientY", "gradientZ", "gradientMagnitude", "gradientMethod", "insideDomain", "pinnedAt",
  ];
  const rows = probes.map((probe) => [
    probe.id, probe.name, probe.volumeId, probe.volumeRevision, probe.sampledGridRevision,
    ...probe.continuousIndex, ...probe.world, probe.components[0] ?? "", ...probe.gradient,
    probe.gradientMagnitude, probe.gradientMethod, probe.insideDomain, new Date(probe.pinnedAt).toISOString(),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
};

export const restorePinnedVolumeProbes = (value: unknown): PinnedVolumeProbe[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PinnedVolumeProbe => {
    if (!entry || typeof entry !== "object") return false;
    const probe = entry as Partial<PinnedVolumeProbe>;
    return typeof probe.id === "string" && typeof probe.name === "string" && typeof probe.volumeId === "string" &&
      Number.isFinite(probe.volumeRevision) && Number.isFinite(probe.sampledGridRevision) && Number.isFinite(probe.pinnedAt) &&
      Array.isArray(probe.continuousIndex) && probe.continuousIndex.length === 3 && probe.continuousIndex.every(Number.isFinite) &&
      Array.isArray(probe.voxelIndex) && probe.voxelIndex.length === 3 && probe.voxelIndex.every(Number.isFinite) &&
      Array.isArray(probe.world) && probe.world.length === 3 && probe.world.every(Number.isFinite) &&
      Array.isArray(probe.components) && probe.components.every(Number.isFinite) &&
      Array.isArray(probe.gradient) && probe.gradient.length === 3 && probe.gradient.every(Number.isFinite) &&
      Number.isFinite(probe.gradientMagnitude) &&
      (probe.gradientMethod === "analytic" || probe.gradientMethod === "central-difference") &&
      typeof probe.insideDomain === "boolean";
  }).map((probe) => ({
    ...probe,
    continuousIndex: [...probe.continuousIndex] as VolumePoint3,
    voxelIndex: [...probe.voxelIndex] as VolumePoint3,
    world: [...probe.world] as VolumePoint3,
    components: [...probe.components],
    gradient: [...probe.gradient] as VolumePoint3,
  }));
};
