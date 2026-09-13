import type {
  AnalysisIdentity,
  AnalysisResult,
  AnalysisResultStore,
} from "../analysis/contracts";
import {
  createAnalysisResultStore,
  getAnalysisResult,
  upsertAnalysisResult,
} from "../analysis/resultStore";
import type { VolumeGrid } from "../scene/datasets";
import type { VolumeObject, VolumeStorageRef } from "./contracts";
import { volumeGridIndexToWorld } from "./spatial";
import type { ManagedVolumeArray } from "./typedArrayStore";
import { VolumeTypedArrayStore } from "./typedArrayStore";

export type VolumeAnalysisResultKind =
  | "volume-statistics"
  | "derivative-fields"
  | "threshold-region"
  | "critical-points"
  | "iso-statistics";

export type VolumeAnalysisIdentity = AnalysisIdentity & {
  volumeId: string;
  volumeRevision: number;
  sampledGridRevision: number;
};

export type VolumeHistogramBin = { min: number; max: number; count: number };
export type VolumeStatistics = {
  sampleCount: number;
  finiteCount: number;
  missingCount: number;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  standardDeviation: number | null;
  percentiles: Readonly<Record<"p01" | "p05" | "p25" | "p50" | "p75" | "p95" | "p99", number | null>>;
  histogram: VolumeHistogramBin[];
  componentCorrelations: number[][];
  valueUnits: string;
};

export type VolumeDerivativeMethod = {
  source: "analytic" | "sampled-finite-difference";
  stencilOrder: 2;
  boundaryStencil: "second-order-one-sided";
  positionUnits: string;
  valueUnits: string;
};

export type VolumeDerivativeFields = {
  gradient: Float32Array;
  gradientMagnitude: Float32Array;
  hessian: Float32Array;
  laplacian: Float32Array;
  validMask: Uint8Array;
  boundaryMask: Uint8Array;
  method: VolumeDerivativeMethod;
};

export type VolumeDerivativeFieldRefs = {
  gradient: VolumeStorageRef;
  gradientMagnitude: VolumeStorageRef;
  hessian: VolumeStorageRef;
  laplacian: VolumeStorageRef;
  validMask: VolumeStorageRef;
  boundaryMask: VolumeStorageRef;
  method: VolumeDerivativeMethod;
};

export type VolumeConnectedRegion = {
  label: number;
  voxelCount: number;
  physicalVolume: number;
  centroid: [number, number, number];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  surfaceContactArea: number;
  touchesDomainBoundary: boolean;
};

export type VolumeRegionMeasurements = {
  threshold: { low: number; high: number };
  neighborhood: 6 | 18 | 26;
  voxelCount: number;
  physicalVolume: number;
  centroid: [number, number, number] | null;
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
  surfaceContactArea: number;
  components: VolumeConnectedRegion[];
  mask: Uint8Array;
  labels: Uint32Array;
};

export type VolumeCriticalPoint = {
  voxel: [number, number, number];
  world: [number, number, number];
  value: number;
  gradientMagnitude: number;
  classification: "minimum-candidate" | "maximum-candidate" | "saddle-candidate" | "degenerate";
};

export type VolumeIsoStatistics = {
  isoValue: number;
  belowCount: number;
  equalCount: number;
  aboveCount: number;
  crossingEdgeCount: number;
  finiteCount: number;
};

export type VolumeAnalysisSummary = {
  statistics: VolumeStatistics;
  derivatives: VolumeDerivativeFieldRefs;
  region: Omit<VolumeRegionMeasurements, "mask" | "labels"> & { mask: VolumeStorageRef; labels: VolumeStorageRef };
  criticalPoints: VolumeCriticalPoint[];
  iso: VolumeIsoStatistics;
};

export type VolumeAnalysisResultStore = AnalysisResultStore<VolumeAnalysisResultKind, VolumeAnalysisIdentity>;
export type VolumeAnalysisResult<T = VolumeAnalysisSummary> = AnalysisResult<T, VolumeAnalysisResultKind, VolumeAnalysisIdentity>;

const indexOf = (dims: readonly [number, number, number], x: number, y: number, z: number): number => x + dims[0] * (y + dims[1] * z);
const percentile = (sorted: readonly number[], q: number): number | null => {
  if (!sorted.length) return null;
  const position = Math.max(0, Math.min(sorted.length - 1, q * (sorted.length - 1)));
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const t = position - low;
  return (sorted[low] ?? 0) * (1 - t) + (sorted[high] ?? 0) * t;
};

export const computeVolumeStatistics = (
  values: ArrayLike<number>,
  options: { components?: number; histogramBins?: number; valueUnits?: string } = {},
): VolumeStatistics => {
  const components = Math.max(1, Math.floor(options.components ?? 1));
  const tuples = Math.floor(values.length / components);
  const perComponent: number[][] = Array.from({ length: components }, () => []);
  for (let tuple = 0; tuple < tuples; tuple += 1) {
    for (let component = 0; component < components; component += 1) {
      const value = values[tuple * components + component];
      if (Number.isFinite(value)) perComponent[component].push(value);
    }
  }
  const finite = perComponent[0].slice().sort((a, b) => a - b);
  let mean: number | null = null;
  let standardDeviation: number | null = null;
  if (finite.length) {
    mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
    standardDeviation = Math.sqrt(finite.reduce((sum, value) => sum + (value - mean!) ** 2, 0) / finite.length);
  }
  const binCount = Math.max(1, Math.min(4096, Math.round(options.histogramBins ?? 64)));
  const minimum = finite[0] ?? null;
  const maximum = finite[finite.length - 1] ?? null;
  const histogram: VolumeHistogramBin[] = [];
  if (minimum != null && maximum != null) {
    const width = maximum > minimum ? (maximum - minimum) / binCount : 1;
    const counts = new Uint32Array(binCount);
    for (const value of finite) counts[Math.min(binCount - 1, Math.max(0, Math.floor((value - minimum) / width)))] += 1;
    for (let bin = 0; bin < binCount; bin += 1) histogram.push({
      min: minimum + bin * width,
      max: maximum > minimum ? minimum + (bin + 1) * width : maximum,
      count: counts[bin],
    });
  }
  const correlations = Array.from({ length: components }, () => Array<number>(components).fill(Number.NaN));
  for (let a = 0; a < components; a += 1) for (let b = a; b < components; b += 1) {
    const pairs: [number, number][] = [];
    for (let tuple = 0; tuple < tuples; tuple += 1) {
      const x = values[tuple * components + a]; const y = values[tuple * components + b];
      if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
    }
    if (!pairs.length) continue;
    const mx = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
    const my = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
    let numerator = 0; let xx = 0; let yy = 0;
    for (const [x, y] of pairs) { numerator += (x - mx) * (y - my); xx += (x - mx) ** 2; yy += (y - my) ** 2; }
    const correlation = xx === 0 || yy === 0 ? (a === b ? 1 : Number.NaN) : numerator / Math.sqrt(xx * yy);
    correlations[a][b] = correlation; correlations[b][a] = correlation;
  }
  return {
    sampleCount: tuples,
    finiteCount: finite.length,
    missingCount: tuples - finite.length,
    minimum,
    maximum,
    mean,
    standardDeviation,
    percentiles: { p01: percentile(finite, 0.01), p05: percentile(finite, 0.05), p25: percentile(finite, 0.25), p50: percentile(finite, 0.5), p75: percentile(finite, 0.75), p95: percentile(finite, 0.95), p99: percentile(finite, 0.99) },
    histogram,
    componentCorrelations: correlations,
    valueUnits: options.valueUnits ?? "unitless",
  };
};

type AnalyticDerivatives = (world: [number, number, number]) => {
  gradient: readonly [number, number, number];
  hessian: readonly [number, number, number, number, number, number];
};

export const computeVolumeDerivativeFields = (
  grid: VolumeGrid,
  options: { analytic?: AnalyticDerivatives; positionUnits?: string; valueUnits?: string } = {},
): VolumeDerivativeFields => {
  const [nx, ny, nz] = grid.dims;
  const count = nx * ny * nz;
  const spacing = grid.spacing ?? [1, 1, 1];
  const direction = grid.direction ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const gradient = new Float32Array(count * 3);
  const magnitude = new Float32Array(count);
  const hessian = new Float32Array(count * 6);
  const laplacian = new Float32Array(count);
  const validMask = new Uint8Array(count);
  const boundaryMask = new Uint8Array(count);
  gradient.fill(Number.NaN); magnitude.fill(Number.NaN); hessian.fill(Number.NaN); laplacian.fill(Number.NaN);

  const sample = (x: number, y: number, z: number): number => grid.scalars[indexOf(grid.dims, x, y, z)];
  const first = (x: number, y: number, z: number, axis: 0 | 1 | 2): number => {
    const n = grid.dims[axis]; const p = [x, y, z]; const h = Math.abs(spacing[axis]);
    if (n < 3 || h === 0) return Number.NaN;
    if (p[axis] === 0) { const p1 = [...p]; const p2 = [...p]; p1[axis] = 1; p2[axis] = 2; return (-3 * sample(x, y, z) + 4 * sample(p1[0], p1[1], p1[2]) - sample(p2[0], p2[1], p2[2])) / (2 * h); }
    if (p[axis] === n - 1) { const p1 = [...p]; const p2 = [...p]; p1[axis] = n - 2; p2[axis] = n - 3; return (3 * sample(x, y, z) - 4 * sample(p1[0], p1[1], p1[2]) + sample(p2[0], p2[1], p2[2])) / (2 * h); }
    const lo = [...p]; const hi = [...p]; lo[axis] -= 1; hi[axis] += 1;
    return (sample(hi[0], hi[1], hi[2]) - sample(lo[0], lo[1], lo[2])) / (2 * h);
  };
  const second = (x: number, y: number, z: number, axis: 0 | 1 | 2): number => {
    const n = grid.dims[axis]; const p = [x, y, z]; const h2 = Math.abs(spacing[axis]) ** 2;
    if (n < 4 || h2 === 0) return Number.NaN;
    if (p[axis] === 0 || p[axis] === n - 1) {
      const sign = p[axis] === 0 ? 1 : -1; const q1 = [...p]; const q2 = [...p]; const q3 = [...p];
      q1[axis] += sign; q2[axis] += 2 * sign; q3[axis] += 3 * sign;
      return (2 * sample(x, y, z) - 5 * sample(q1[0], q1[1], q1[2]) + 4 * sample(q2[0], q2[1], q2[2]) - sample(q3[0], q3[1], q3[2])) / h2;
    }
    const lo = [...p]; const hi = [...p]; lo[axis] -= 1; hi[axis] += 1;
    return (sample(hi[0], hi[1], hi[2]) - 2 * sample(x, y, z) + sample(lo[0], lo[1], lo[2])) / h2;
  };
  const mixed = (x: number, y: number, z: number, a: 0 | 1 | 2, b: 0 | 1 | 2): number => {
    const p = [x, y, z];
    if (p[a] === 0 || p[a] === grid.dims[a] - 1 || p[b] === 0 || p[b] === grid.dims[b] - 1) return 0;
    const pp = [...p]; const pm = [...p]; const mp = [...p]; const mm = [...p];
    pp[a] += 1; pp[b] += 1; pm[a] += 1; pm[b] -= 1; mp[a] -= 1; mp[b] += 1; mm[a] -= 1; mm[b] -= 1;
    return (sample(pp[0], pp[1], pp[2]) - sample(pm[0], pm[1], pm[2]) - sample(mp[0], mp[1], mp[2]) + sample(mm[0], mm[1], mm[2])) / (4 * Math.abs(spacing[a] * spacing[b]));
  };

  for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
    const index = indexOf(grid.dims, x, y, z);
    boundaryMask[index] = x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1 ? 1 : 0;
    const analytic = options.analytic?.(volumeGridIndexToWorld(grid, [x, y, z]));
    const localGradient = analytic ? [...analytic.gradient] : [first(x, y, z, 0), first(x, y, z, 1), first(x, y, z, 2)];
    const localHessian = analytic ? [...analytic.hessian] : [second(x, y, z, 0), second(x, y, z, 1), second(x, y, z, 2), mixed(x, y, z, 0, 1), mixed(x, y, z, 0, 2), mixed(x, y, z, 1, 2)];
    const finite = Number.isFinite(sample(x, y, z)) && localGradient.every(Number.isFinite) && localHessian.every(Number.isFinite);
    if (!finite) continue;
    const gx = direction[0] * localGradient[0] + direction[1] * localGradient[1] + direction[2] * localGradient[2];
    const gy = direction[3] * localGradient[0] + direction[4] * localGradient[1] + direction[5] * localGradient[2];
    const gz = direction[6] * localGradient[0] + direction[7] * localGradient[1] + direction[8] * localGradient[2];
    gradient.set([gx, gy, gz], index * 3);
    magnitude[index] = Math.hypot(gx, gy, gz);
    hessian.set(localHessian, index * 6);
    laplacian[index] = localHessian[0] + localHessian[1] + localHessian[2];
    validMask[index] = 1;
  }
  return {
    gradient,
    gradientMagnitude: magnitude,
    hessian,
    laplacian,
    validMask,
    boundaryMask,
    method: { source: options.analytic ? "analytic" : "sampled-finite-difference", stencilOrder: 2, boundaryStencil: "second-order-one-sided", positionUnits: options.positionUnits ?? "unit", valueUnits: options.valueUnits ?? "unitless" },
  };
};

const neighborOffsets = (neighborhood: 6 | 18 | 26): [number, number, number][] => {
  const result: [number, number, number][] = [];
  for (let z = -1; z <= 1; z += 1) for (let y = -1; y <= 1; y += 1) for (let x = -1; x <= 1; x += 1) {
    if (x === 0 && y === 0 && z === 0) continue;
    const manhattan = Math.abs(x) + Math.abs(y) + Math.abs(z);
    if (neighborhood === 6 ? manhattan === 1 : neighborhood === 18 ? manhattan <= 2 : true) result.push([x, y, z]);
  }
  return result;
};

export const measureThresholdRegion = (
  grid: VolumeGrid,
  low: number,
  high = Number.POSITIVE_INFINITY,
  neighborhood: 6 | 18 | 26 = 6,
): VolumeRegionMeasurements => {
  const [nx, ny, nz] = grid.dims; const count = nx * ny * nz;
  const mask = new Uint8Array(count); const labels = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) mask[i] = Number.isFinite(grid.scalars[i]) && grid.scalars[i] >= low && grid.scalars[i] <= high ? 1 : 0;
  const offsets = neighborOffsets(neighborhood); const queue = new Uint32Array(count); const spacing = grid.spacing ?? [1, 1, 1];
  const voxelVolume = Math.abs(spacing[0] * spacing[1] * spacing[2]); const faceAreas = [Math.abs(spacing[1] * spacing[2]), Math.abs(spacing[0] * spacing[2]), Math.abs(spacing[0] * spacing[1])];
  const components: VolumeConnectedRegion[] = []; let label = 0;
  for (let seed = 0; seed < count; seed += 1) {
    if (!mask[seed] || labels[seed]) continue;
    label += 1; let head = 0; let tail = 0; queue[tail++] = seed; labels[seed] = label;
    let voxels = 0; let sumX = 0; let sumY = 0; let sumZ = 0; let contact = 0; let touches = false;
    const min: [number, number, number] = [Infinity, Infinity, Infinity]; const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    while (head < tail) {
      const current = queue[head++]; const z = Math.floor(current / (nx * ny)); const rest = current - z * nx * ny; const y = Math.floor(rest / nx); const x = rest - y * nx;
      const world = volumeGridIndexToWorld(grid, [x, y, z]); voxels += 1; sumX += world[0]; sumY += world[1]; sumZ += world[2];
      for (let axis = 0; axis < 3; axis += 1) { min[axis] = Math.min(min[axis], world[axis]); max[axis] = Math.max(max[axis], world[axis]); }
      touches ||= x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1;
      for (const [dx, dy, dz] of [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]] as const) {
        const xx=x+dx, yy=y+dy, zz=z+dz; const axis = dx ? 0 : dy ? 1 : 2;
        if (xx<0||yy<0||zz<0||xx>=nx||yy>=ny||zz>=nz || !mask[indexOf(grid.dims,xx,yy,zz)]) contact += faceAreas[axis];
      }
      for (const [dx, dy, dz] of offsets) { const xx=x+dx, yy=y+dy, zz=z+dz; if(xx<0||yy<0||zz<0||xx>=nx||yy>=ny||zz>=nz) continue; const next=indexOf(grid.dims,xx,yy,zz); if(mask[next]&&!labels[next]){labels[next]=label;queue[tail++]=next;} }
    }
    components.push({ label, voxelCount: voxels, physicalVolume: voxels * voxelVolume, centroid: [sumX/voxels,sumY/voxels,sumZ/voxels], bounds: { min, max }, surfaceContactArea: contact, touchesDomainBoundary: touches });
  }
  const voxelCount = components.reduce((sum, component) => sum + component.voxelCount, 0);
  const centroid = voxelCount ? components.reduce<[number,number,number]>((sum,c)=>[sum[0]+c.centroid[0]*c.voxelCount,sum[1]+c.centroid[1]*c.voxelCount,sum[2]+c.centroid[2]*c.voxelCount],[0,0,0]).map(v=>v/voxelCount) as [number,number,number] : null;
  const bounds = components.length ? { min: [0,1,2].map(axis=>Math.min(...components.map(c=>c.bounds.min[axis]))) as [number,number,number], max: [0,1,2].map(axis=>Math.max(...components.map(c=>c.bounds.max[axis]))) as [number,number,number] } : null;
  return { threshold: { low, high }, neighborhood, voxelCount, physicalVolume: voxelCount*voxelVolume, centroid, bounds, surfaceContactArea: components.reduce((sum,c)=>sum+c.surfaceContactArea,0), components, mask, labels };
};

export const findVolumeCriticalPoints = (grid: VolumeGrid, derivatives: VolumeDerivativeFields, tolerance: number): VolumeCriticalPoint[] => {
  const result: VolumeCriticalPoint[] = []; const [nx,ny,nz]=grid.dims;
  for(let z=1;z<nz-1;z+=1) for(let y=1;y<ny-1;y+=1) for(let x=1;x<nx-1;x+=1){const i=indexOf(grid.dims,x,y,z);if(!derivatives.validMask[i]||derivatives.gradientMagnitude[i]>tolerance)continue;const h=derivatives.hessian.subarray(i*6,i*6+6);const diagonal=[h[0],h[1],h[2]];const classification=diagonal.every(v=>v>0)?"minimum-candidate":diagonal.every(v=>v<0)?"maximum-candidate":diagonal.some(v=>v>0)&&diagonal.some(v=>v<0)?"saddle-candidate":"degenerate";result.push({voxel:[x,y,z],world:volumeGridIndexToWorld(grid,[x,y,z]),value:grid.scalars[i],gradientMagnitude:derivatives.gradientMagnitude[i],classification});}
  return result;
};

export const computeVolumeIsoStatistics = (grid: VolumeGrid, isoValue: number): VolumeIsoStatistics => {
  let belowCount=0,equalCount=0,aboveCount=0,crossingEdgeCount=0,finiteCount=0; const [nx,ny,nz]=grid.dims;
  for(let z=0;z<nz;z+=1) for(let y=0;y<ny;y+=1) for(let x=0;x<nx;x+=1){const value=grid.scalars[indexOf(grid.dims,x,y,z)];if(!Number.isFinite(value))continue;finiteCount+=1;if(value<isoValue)belowCount+=1;else if(value>isoValue)aboveCount+=1;else equalCount+=1;for(const [dx,dy,dz] of [[1,0,0],[0,1,0],[0,0,1]] as const){if(x+dx>=nx||y+dy>=ny||z+dz>=nz)continue;const next=grid.scalars[indexOf(grid.dims,x+dx,y+dy,z+dz)];if(Number.isFinite(next)&&(value-isoValue)*(next-isoValue)<0)crossingEdgeCount+=1;}}
  return {isoValue,belowCount,equalCount,aboveCount,crossingEdgeCount,finiteCount};
};

const storageRef = (handle: string, data: ManagedVolumeArray, components: number): VolumeStorageRef => ({ handle, byteLength: data.byteLength, elementCount: data.length, scalarType: data instanceof Uint32Array ? "uint32" : data instanceof Uint8Array ? "uint8" : "float32", components, ownership: "managed-memory" });
export const createVolumeAnalysisIdentity = (volume: VolumeObject): VolumeAnalysisIdentity => ({ key: `volume-analysis:${volume.identity.volumeId}@${volume.identity.volumeRevision}:${volume.identity.sampledGridRevision}`, revision: `${volume.identity.volumeRevision}:${volume.identity.sampledGridRevision}`, label: volume.identity.label, sourceLabel: volume.identity.volumeId, volumeId: volume.identity.volumeId, volumeRevision: volume.identity.volumeRevision, sampledGridRevision: volume.identity.sampledGridRevision });
export const createVolumeAnalysisResultStore = (): VolumeAnalysisResultStore => createAnalysisResultStore<VolumeAnalysisResultKind, VolumeAnalysisIdentity>();
export const getVolumeAnalysisResult = <T=VolumeAnalysisSummary>(store: VolumeAnalysisResultStore, identity: VolumeAnalysisIdentity, kind: VolumeAnalysisResultKind, variant="default"): VolumeAnalysisResult<T>|null => getAnalysisResult<T,VolumeAnalysisResultKind,VolumeAnalysisIdentity>(store,identity,kind,variant);

export const runVolumeAnalysis = (args: { volume: VolumeObject; grid: VolumeGrid; store: VolumeTypedArrayStore; threshold?: number; thresholdHigh?: number; isoValue?: number; criticalTolerance?: number; now?: number }): VolumeAnalysisSummary => {
  const threshold=args.threshold??0; const iso=args.isoValue??threshold; const derivatives=computeVolumeDerivativeFields(args.grid,{positionUnits:args.volume.spatial.positionUnits,valueUnits:args.volume.spatial.valueUnits}); const region=measureThresholdRegion(args.grid,threshold,args.thresholdHigh??Number.POSITIVE_INFINITY,6); const prefix=`volume-analysis:${args.volume.identity.volumeId}@${args.volume.identity.volumeRevision}:${args.volume.identity.sampledGridRevision}:${args.now??Date.now()}`;
  const bind=(suffix:string,data:ManagedVolumeArray,components:number)=>{const ref=storageRef(`${prefix}:${suffix}`,data,components);args.store.bind(`${prefix}:${suffix}`,ref,data);return ref;};
  return { statistics: computeVolumeStatistics(args.grid.scalars,{valueUnits:args.volume.spatial.valueUnits}), derivatives:{gradient:bind("gradient",derivatives.gradient,3),gradientMagnitude:bind("gradient-magnitude",derivatives.gradientMagnitude,1),hessian:bind("hessian",derivatives.hessian,6),laplacian:bind("laplacian",derivatives.laplacian,1),validMask:bind("valid-mask",derivatives.validMask,1),boundaryMask:bind("boundary-mask",derivatives.boundaryMask,1),method:derivatives.method}, region:{...region,mask:bind("region-mask",region.mask,1),labels:bind("region-labels",region.labels,1)},criticalPoints:findVolumeCriticalPoints(args.grid,derivatives,args.criticalTolerance??Math.max(...(args.grid.spacing??[1,1,1]).map(Math.abs))*1e-3),iso:computeVolumeIsoStatistics(args.grid,iso)};
};

export const publishVolumeAnalysis = (store: VolumeAnalysisResultStore, volume: VolumeObject, summary: VolumeAnalysisSummary, now=Date.now()): VolumeAnalysisResultStore => {
  const identity=createVolumeAnalysisIdentity(volume); const common={identity,parameters:{threshold:summary.region.threshold.low,thresholdHigh:Number.isFinite(summary.region.threshold.high)?summary.region.threshold.high:"infinity",isoValue:summary.iso.isoValue},backend:"Math3D finite-difference analysis",now};
  let next=upsertAnalysisResult(store,{...common,kind:"volume-statistics",payload:summary.statistics},{lineageKey:id=>id.volumeId,maxResults:40,maxHistory:120});
  next=upsertAnalysisResult(next,{...common,kind:"derivative-fields",payload:summary.derivatives},{lineageKey:id=>id.volumeId,maxResults:40,maxHistory:120});
  next=upsertAnalysisResult(next,{...common,kind:"threshold-region",payload:summary.region},{lineageKey:id=>id.volumeId,maxResults:40,maxHistory:120});
  next=upsertAnalysisResult(next,{...common,kind:"critical-points",payload:{criticalPoints:summary.criticalPoints}},{lineageKey:id=>id.volumeId,maxResults:40,maxHistory:120});
  return upsertAnalysisResult(next,{...common,kind:"iso-statistics",payload:summary.iso},{lineageKey:id=>id.volumeId,maxResults:40,maxHistory:120});
};

export type VolumeAnalysisLayerState = { visible: Readonly<Record<"gradient"|"gradientMagnitude"|"laplacian"|"thresholdRegion"|"criticalPoints",boolean>>; activeScalar:"source"|"gradientMagnitude"|"laplacian" };
export const createVolumeAnalysisLayerState = (): VolumeAnalysisLayerState => ({visible:{gradient:false,gradientMagnitude:false,laplacian:false,thresholdRegion:false,criticalPoints:false},activeScalar:"source"});
export const setVolumeAnalysisLayerVisibility = (state:VolumeAnalysisLayerState,layer:keyof VolumeAnalysisLayerState["visible"],visible:boolean):VolumeAnalysisLayerState=>({...state,visible:{...state.visible,[layer]:visible}});
