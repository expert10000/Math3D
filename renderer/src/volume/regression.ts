import type { VolumeGrid } from "../scene/datasets";

export type VolumeRegressionCategory = "analytic" | "sdf" | "voxel" | "labels" | "pathological" | "stress";
export type VolumeRegressionFixtureId =
  | "sphere" | "ellipsoid" | "torus" | "gyroid" | "metaballs" | "gaussian" | "ramp" | "constant"
  | "sdf-sphere" | "sdf-box" | "sdf-union" | "sdf-intersection" | "sdf-subtraction" | "sdf-offset" | "sdf-open-mesh-warning"
  | "checker" | "impulse" | "two-components" | "anisotropic" | "non-zero-origin" | "rotated-direction"
  | "two-labels" | "touching-labels" | "disconnected-labels" | "sparse-label-ids"
  | "nan-inf" | "empty" | "one-by-n-by-n" | "zero-range" | "invalid-spacing" | "truncated-import"
  | "stress-128" | "stress-256" | "stress-bricked";

export type VolumeRegressionFixture = {
  id: VolumeRegressionFixtureId;
  category: VolumeRegressionCategory;
  grid: VolumeGrid | null;
  labels?: Uint32Array;
  expectedFailure?: string;
  expected: { finiteCount?: number; minimum?: number; maximum?: number; uniqueLabels?: number[] };
};

const categories: Record<VolumeRegressionCategory, readonly VolumeRegressionFixtureId[]> = {
  analytic: ["sphere", "ellipsoid", "torus", "gyroid", "metaballs", "gaussian", "ramp", "constant"],
  sdf: ["sdf-sphere", "sdf-box", "sdf-union", "sdf-intersection", "sdf-subtraction", "sdf-offset", "sdf-open-mesh-warning"],
  voxel: ["checker", "impulse", "two-components", "anisotropic", "non-zero-origin", "rotated-direction"],
  labels: ["two-labels", "touching-labels", "disconnected-labels", "sparse-label-ids"],
  pathological: ["nan-inf", "empty", "one-by-n-by-n", "zero-range", "invalid-spacing", "truncated-import"],
  stress: ["stress-128", "stress-256", "stress-bricked"],
};

export const VOLUME_REGRESSION_MATRIX = Object.entries(categories).flatMap(([category, ids]) => ids.map((id) => ({ id, category: category as VolumeRegressionCategory })));

const categoryOf = (id: VolumeRegressionFixtureId): VolumeRegressionCategory => {
  for (const [category, ids] of Object.entries(categories)) if (ids.includes(id)) return category as VolumeRegressionCategory;
  throw new Error(`Unknown Volume regression fixture ${id}.`);
};

const makeGrid = (
  dims: [number, number, number],
  sample: (x: number, y: number, z: number, i: number) => number,
  metadata: Partial<Omit<VolumeGrid, "dims" | "scalars">> = {},
): VolumeGrid => {
  const scalars = new Float32Array(dims[0] * dims[1] * dims[2]);
  const spacing = metadata.spacing ?? [2 / Math.max(1, dims[0] - 1), 2 / Math.max(1, dims[1] - 1), 2 / Math.max(1, dims[2] - 1)];
  const origin = metadata.origin ?? [-1, -1, -1];
  for (let z = 0; z < dims[2]; z += 1) for (let y = 0; y < dims[1]; y += 1) for (let x = 0; x < dims[0]; x += 1) {
    const i = x + dims[0] * (y + dims[1] * z);
    scalars[i] = sample(origin[0] + x * spacing[0], origin[1] + y * spacing[1], origin[2] + z * spacing[2], i);
  }
  return { dims, scalars, spacing: [...spacing], origin: [...origin], centering: "point", ...metadata };
};

const finiteRange = (grid: VolumeGrid | null) => {
  if (!grid) return {};
  const values = [...grid.scalars].filter(Number.isFinite);
  return { finiteCount: values.length, minimum: values.length ? Math.min(...values) : undefined, maximum: values.length ? Math.max(...values) : undefined };
};

export const createCanonicalVolumeFixture = (id: VolumeRegressionFixtureId, dimensionOverride?: number): VolumeRegressionFixture => {
  const category = categoryOf(id);
  if (id === "empty") return { id, category, grid: null, expectedFailure: "empty Volume", expected: {} };
  if (id === "truncated-import") return { id, category, grid: null, expectedFailure: "truncated scientific payload", expected: {} };
  const stressDimension = dimensionOverride ?? (id === "stress-256" ? 256 : 128);
  const dims: [number, number, number] = id.startsWith("stress-") ? [stressDimension, stressDimension, stressDimension] : id === "one-by-n-by-n" ? [1, 9, 9] : [9, 9, 9];
  let labels: Uint32Array | undefined;
  let expectedFailure: string | undefined;
  let grid: VolumeGrid;
  switch (id) {
    case "sphere": case "sdf-sphere": grid = makeGrid(dims, (x, y, z) => Math.hypot(x, y, z) - 0.7); break;
    case "ellipsoid": grid = makeGrid(dims, (x, y, z) => x * x / 0.64 + y * y + z * z / 0.36 - 1); break;
    case "torus": grid = makeGrid(dims, (x, y, z) => Math.hypot(Math.hypot(x, y) - 0.62, z) - 0.22); break;
    case "gyroid": grid = makeGrid(dims, (x, y, z) => Math.sin(3*x)*Math.cos(3*y)+Math.sin(3*y)*Math.cos(3*z)+Math.sin(3*z)*Math.cos(3*x)); break;
    case "metaballs": grid = makeGrid(dims, (x, y, z) => 0.22/((x-.35)**2+y*y+z*z+.03)+0.22/((x+.35)**2+y*y+z*z+.03)-1); break;
    case "gaussian": grid = makeGrid(dims, (x, y, z) => Math.exp(-(x*x+y*y+z*z)*4)); break;
    case "ramp": grid = makeGrid(dims, (x, y, z) => x + 2*y + 3*z); break;
    case "constant": case "zero-range": grid = makeGrid(dims, () => 4.25); break;
    case "sdf-box": grid = makeGrid(dims, (x,y,z) => Math.max(Math.abs(x)-.55, Math.abs(y)-.45, Math.abs(z)-.35)); break;
    case "sdf-union": grid = makeGrid(dims, (x,y,z) => Math.min(Math.hypot(x-.3,y,z)-.5, Math.hypot(x+.3,y,z)-.5)); break;
    case "sdf-intersection": grid = makeGrid(dims, (x,y,z) => Math.max(Math.hypot(x-.3,y,z)-.5, Math.hypot(x+.3,y,z)-.5)); break;
    case "sdf-subtraction": grid = makeGrid(dims, (x,y,z) => Math.max(Math.hypot(x,y,z)-.75, -(Math.hypot(x-.3,y,z)-.35))); break;
    case "sdf-offset": grid = makeGrid(dims, (x,y,z) => Math.hypot(x,y,z)-.8); break;
    case "sdf-open-mesh-warning": grid = makeGrid(dims, (x,y,z) => Math.abs(z)-.05); expectedFailure = "signed distance unreliable for open mesh"; break;
    case "checker": grid = makeGrid(dims, (_x,_y,_z,i) => ((i + Math.floor(i/dims[0]) + Math.floor(i/(dims[0]*dims[1]))) & 1)); break;
    case "impulse": grid = makeGrid(dims, (_x,_y,_z,i) => i === Math.floor(dims[0]*dims[1]*dims[2]/2) ? 1 : 0); break;
    case "two-components": grid = makeGrid(dims, (x,y,z) => Math.min(Math.hypot(x-.55,y,z),Math.hypot(x+.55,y,z)) < .28 ? 1 : 0); break;
    case "anisotropic": grid = makeGrid(dims, (x,y,z) => x+y+z, { spacing: [.25,.5,1] }); break;
    case "non-zero-origin": grid = makeGrid(dims, (x,y,z) => x+y+z, { origin: [10,-4,2] }); break;
    case "rotated-direction": grid = makeGrid(dims, (x,y,z) => x+y+z, { direction: [0,-1,0,1,0,0,0,0,1] }); break;
    case "nan-inf": grid = makeGrid(dims, (_x,_y,_z,i) => i === 0 ? Number.NaN : i === 1 ? Number.POSITIVE_INFINITY : i); break;
    case "invalid-spacing": grid = makeGrid(dims, (x,y,z) => x+y+z, { spacing: [1,0,1] }); expectedFailure = "spacing must be non-zero"; break;
    case "one-by-n-by-n": grid = makeGrid(dims, (x,y,z) => x+y+z); break;
    case "two-labels": case "touching-labels": case "disconnected-labels": case "sparse-label-ids": {
      grid = makeGrid(dims, () => 0);
      labels = new Uint32Array(grid.scalars.length);
      for (let z=0;z<dims[2];z++) for(let y=0;y<dims[1];y++) for(let x=0;x<dims[0];x++) {
        const i=x+dims[0]*(y+dims[1]*z);
        if (id === "sparse-label-ids") labels[i] = x < 3 ? 2 : x > 5 ? 1000 : 0;
        else if (id === "disconnected-labels") labels[i] = (x < 2 || x > 6) && y > 2 && y < 6 ? 1 : 0;
        else labels[i] = x < 4 ? 1 : x > (id === "touching-labels" ? 3 : 4) ? 2 : 0;
      }
      grid.scalars.set(labels);
      break;
    }
    default: grid = makeGrid(dims, (x,y,z) => Math.sin(x*3)+Math.cos(y*2)+z);
  }
  return { id, category, grid, labels, expectedFailure, expected: { ...finiteRange(grid), ...(labels ? { uniqueLabels: [...new Set(labels)].sort((a,b)=>a-b) } : {}) } };
};

export const hashVolumeValues = (values: ArrayLike<number>): string => {
  let hash = 2166136261;
  const float = new Float32Array(1); const bytes = new Uint8Array(float.buffer);
  for (let i=0;i<values.length;i+=1) { float[0] = values[i]; for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619); } }
  return `fnv1a32:${(hash>>>0).toString(16).padStart(8,"0")}`;
};

export type VolumePerformanceBudget = { fixture: string; hardwareClass: string; backend: string; cache: "cold" | "warm"; medianMs: number; p95Ms: number; peakWorkingSetBytes: number; budgetMs: number; passed: boolean };
export const profileVolumeOperation = (fixture: string, backend: string, samples: readonly number[], peakWorkingSetBytes: number, budgetMs: number, cache: "cold" | "warm" = "warm"): VolumePerformanceBudget => {
  if (!samples.length || samples.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Performance profile requires finite non-negative samples.");
  const sorted = [...samples].sort((a,b)=>a-b);
  const percentile = (p:number) => sorted[Math.min(sorted.length-1, Math.max(0, Math.ceil(p*sorted.length)-1))];
  const middle = Math.floor(sorted.length/2);
  const medianMs = sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
  const p95Ms = percentile(.95);
  return { fixture, hardwareClass: "reviewed-desktop", backend, cache, medianMs, p95Ms, peakWorkingSetBytes, budgetMs, passed: p95Ms <= budgetMs };
};
