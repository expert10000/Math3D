import type { ParamSurfaceId } from "@math3d/core";

export type RotationalProfileMode = "formula" | "points" | "spline";

export type RotationalProfilePoint = {
  v: number;
  r: number;
  z: number;
};

type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type RotationalProfileSettings = {
  mode?: RotationalProfileMode;
  rExpr?: string;
  zExpr?: string;
  pointsText?: string;
  points?: RotationalProfilePoint[];
  axisOrigin?: Vec3;
  axisDirection?: Vec3;
};

type ProfileSample = {
  r: number;
  z: number;
};

type ProfileDefault = {
  rExpr: string;
  zExpr: string;
  sample: (v: number) => ProfileSample;
};

const GENERAL_ROTATIONAL_SURFACE_IDS = new Set<ParamSurfaceId>([
  "rotationalDevelopable",
  "rotationalGraph",
  "rotationalBell",
  "rotationalSpheroid",
  "rotationalHyperboloid",
  "rotationalFreeProfile",
  "cylinder",
  "cone",
  "sphere",
  "torus",
  "pseudosphere",
  "catenoid",
  "paraboloid",
  "expCone",
]);

const DEFAULT_AXIS_ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };
const DEFAULT_AXIS_DIRECTION: Vec3 = { x: 0, y: 0, z: 1 };

const PROFILE_DEFAULTS: Partial<Record<ParamSurfaceId, ProfileDefault>> = {
  rotationalDevelopable: {
    rExpr: "max(0.1, 1 + 0.35*v)",
    zExpr: "v",
    sample: (v) => ({ r: Math.max(0.1, 1 + 0.35 * v), z: v }),
  },
  rotationalGraph: {
    rExpr: "0.55 + 0.35*v*v",
    zExpr: "v",
    sample: (v) => ({ r: 0.55 + 0.35 * v * v, z: v }),
  },
  rotationalBell: {
    rExpr: "max(0.1, 1 + 0.2*sin(3*v))",
    zExpr: "v",
    sample: (v) => ({ r: Math.max(0.1, 1 + 0.2 * Math.sin(3 * v)), z: v }),
  },
  rotationalSpheroid: {
    rExpr: "1.15*sin(v)",
    zExpr: "0.75*cos(v)",
    sample: (v) => ({ r: 1.15 * Math.sin(v), z: 0.75 * Math.cos(v) }),
  },
  rotationalHyperboloid: {
    rExpr: "0.8*cosh(v)",
    zExpr: "0.9*sinh(v)",
    sample: (v) => ({ r: 0.8 * Math.cosh(v), z: 0.9 * Math.sinh(v) }),
  },
  rotationalFreeProfile: {
    rExpr: "max(0.15, 0.55 + 0.12*v + 0.08*v*v - 0.015*v*v*v)",
    zExpr: "v + 0.15*sin(1.7*v)",
    sample: (v) => ({
      r: Math.max(0.15, 0.55 + 0.12 * v + 0.08 * v * v - 0.015 * v * v * v),
      z: v + 0.15 * Math.sin(1.7 * v),
    }),
  },
  cylinder: {
    rExpr: "1",
    zExpr: "v",
    sample: (v) => ({ r: 1, z: v }),
  },
  cone: {
    rExpr: "v",
    zExpr: "v",
    sample: (v) => ({ r: v, z: v }),
  },
  sphere: {
    rExpr: "sin(v)",
    zExpr: "cos(v)",
    sample: (v) => ({ r: Math.sin(v), z: Math.cos(v) }),
  },
  torus: {
    rExpr: "1.4 + 0.5*cos(v)",
    zExpr: "0.5*sin(v)",
    sample: (v) => ({ r: 1.4 + 0.5 * Math.cos(v), z: 0.5 * Math.sin(v) }),
  },
  pseudosphere: {
    rExpr: "1/cosh(v)",
    zExpr: "v - tanh(v)",
    sample: (v) => ({ r: 1 / Math.cosh(v), z: v - Math.tanh(v) }),
  },
  catenoid: {
    rExpr: "cosh(v)",
    zExpr: "v",
    sample: (v) => ({ r: Math.cosh(v), z: v }),
  },
  paraboloid: {
    rExpr: "v",
    zExpr: "0.6*v*v",
    sample: (v) => ({ r: v, z: 0.6 * v * v }),
  },
  expCone: {
    rExpr: "v",
    zExpr: "log(max(v, 1e-9))",
    sample: (v) => ({ r: v, z: Math.log(Math.max(v, 1e-9)) }),
  },
};

const vectorLength = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

const normalizeVec = (v: Vec3): Vec3 => {
  const len = vectorLength(v);
  if (len <= 1e-12) return { ...DEFAULT_AXIS_DIRECTION };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const crossVec = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const sanitizeVec = (value: Vec3 | undefined, fallback: Vec3): Vec3 => ({
  x: Number.isFinite(value?.x) ? value!.x : fallback.x,
  y: Number.isFinite(value?.y) ? value!.y : fallback.y,
  z: Number.isFinite(value?.z) ? value!.z : fallback.z,
});

const makeSafeProfileExpr = (
  expr: string | undefined,
  fallback: (v: number) => number
): ((v: number) => number) => {
  const trimmed = (expr ?? "").trim();
  if (!trimmed) return fallback;
  let compiled: (v: number, pi: number, e: number, PI: number, E: number) => number;
  try {
    compiled = new Function(
      "v",
      "pi",
      "e",
      "PI",
      "E",
      `
      const {
        sin, cos, tan, asin, acos, atan,
        sinh, cosh, tanh,
        exp, log, sqrt, abs, pow, min, max, floor, ceil, round
      } = Math;
      return (${trimmed});
    `
    ) as (v: number, pi: number, e: number, PI: number, E: number) => number;
  } catch {
    return fallback;
  }

  return (v: number) => {
    try {
      const next = compiled(v, Math.PI, Math.E, Math.PI, Math.E);
      return Number.isFinite(next) ? next : fallback(v);
    } catch {
      return fallback(v);
    }
  };
};

const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
};

const buildLinearPointSampler = (points: RotationalProfilePoint[]): ((v: number) => ProfileSample) => {
  return (v: number) => {
    const first = points[0];
    const last = points[points.length - 1];
    if (v <= first.v) return { r: first.r, z: first.z };
    if (v >= last.v) return { r: last.r, z: last.z };

    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid].v <= v) lo = mid;
      else hi = mid;
    }
    const a = points[lo];
    const b = points[lo + 1];
    const span = Math.max(1e-9, b.v - a.v);
    const t = (v - a.v) / span;
    return {
      r: a.r + (b.r - a.r) * t,
      z: a.z + (b.z - a.z) * t,
    };
  };
};

const buildSplinePointSampler = (points: RotationalProfilePoint[]): ((v: number) => ProfileSample) => {
  return (v: number) => {
    const first = points[0];
    const last = points[points.length - 1];
    if (v <= first.v) return { r: first.r, z: first.z };
    if (v >= last.v) return { r: last.r, z: last.z };

    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid].v <= v) lo = mid;
      else hi = mid;
    }

    const i1 = Math.max(0, lo);
    const i2 = Math.min(points.length - 1, lo + 1);
    const i0 = Math.max(0, i1 - 1);
    const i3 = Math.min(points.length - 1, i2 + 1);
    const p0 = points[i0];
    const p1 = points[i1];
    const p2 = points[i2];
    const p3 = points[i3];
    const span = Math.max(1e-9, p2.v - p1.v);
    const t = (v - p1.v) / span;
    return {
      r: catmullRom(p0.r, p1.r, p2.r, p3.r, t),
      z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
    };
  };
};

const normalizePoints = (points: RotationalProfilePoint[]): RotationalProfilePoint[] => {
  const sorted = points
    .filter((p) => Number.isFinite(p.v) && Number.isFinite(p.r) && Number.isFinite(p.z))
    .sort((a, b) => a.v - b.v);
  if (!sorted.length) return [];
  const out: RotationalProfilePoint[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = out[out.length - 1];
    if (Math.abs(current.v - prev.v) < 1e-9) {
      out[out.length - 1] = current;
    } else {
      out.push(current);
    }
  }
  return out;
};

export const parseRotationalProfilePoints = (text: string | undefined): RotationalProfilePoint[] => {
  if (!text) return [];
  const parsed: RotationalProfilePoint[] = [];
  const lines = text.split(/\r?\n/);
  let implicitV = 0;
  for (const rawLine of lines) {
    const body = rawLine.split("#")[0]?.trim() ?? "";
    if (!body) continue;
    const parts = body.split(/[\s,;]+/).filter(Boolean);
    if (parts.length >= 3) {
      const v = Number(parts[0]);
      const r = Number(parts[1]);
      const z = Number(parts[2]);
      if (Number.isFinite(v) && Number.isFinite(r) && Number.isFinite(z)) {
        parsed.push({ v, r, z });
      }
      continue;
    }
    if (parts.length === 2) {
      const r = Number(parts[0]);
      const z = Number(parts[1]);
      if (Number.isFinite(r) && Number.isFinite(z)) {
        parsed.push({ v: implicitV, r, z });
        implicitV += 1;
      }
    }
  }
  return normalizePoints(parsed);
};

export const supportsGeneralRotationalProfile = (surfaceId: ParamSurfaceId): boolean =>
  GENERAL_ROTATIONAL_SURFACE_IDS.has(surfaceId);

export const getDefaultRotationalProfileExpressions = (
  surfaceId: ParamSurfaceId
): { rExpr: string; zExpr: string } | null => {
  const profile = PROFILE_DEFAULTS[surfaceId];
  if (!profile) return null;
  return { rExpr: profile.rExpr, zExpr: profile.zExpr };
};

const buildProfileSampler = (
  surfaceId: ParamSurfaceId,
  settings?: RotationalProfileSettings
): ((v: number) => ProfileSample) | null => {
  const defaults = PROFILE_DEFAULTS[surfaceId];
  if (!defaults) return null;

  const defaultFn = defaults.sample;
  const mode = settings?.mode ?? "formula";

  if (mode === "points" || mode === "spline") {
    const textPoints = parseRotationalProfilePoints(settings?.pointsText);
    const merged = normalizePoints([...(settings?.points ?? []), ...textPoints]);
    if (merged.length >= 2) {
      return mode === "spline" ? buildSplinePointSampler(merged) : buildLinearPointSampler(merged);
    }
  }

  const rFn = makeSafeProfileExpr(settings?.rExpr, (v) => defaultFn(v).r);
  const zFn = makeSafeProfileExpr(settings?.zExpr, (v) => defaultFn(v).z);
  return (v: number) => ({ r: rFn(v), z: zFn(v) });
};

const buildAxisFrame = (direction: Vec3): { e1: Vec3; e2: Vec3; axis: Vec3 } => {
  const axis = normalizeVec(direction);
  const helper = Math.abs(axis.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  let e1 = crossVec(helper, axis);
  if (vectorLength(e1) <= 1e-9) {
    e1 = crossVec({ x: 1, y: 0, z: 0 }, axis);
  }
  e1 = normalizeVec(e1);
  const e2 = normalizeVec(crossVec(axis, e1));
  return { e1, e2, axis };
};

export const buildRotationalSurfaceEvaluator = (
  surfaceId: ParamSurfaceId,
  settings?: RotationalProfileSettings
): ((u: number, v: number) => { x: number; y: number; z: number }) | null => {
  if (!supportsGeneralRotationalProfile(surfaceId)) return null;

  const profileSampler = buildProfileSampler(surfaceId, settings);
  if (!profileSampler) return null;

  const origin = sanitizeVec(settings?.axisOrigin, DEFAULT_AXIS_ORIGIN);
  const axisDirection = sanitizeVec(settings?.axisDirection, DEFAULT_AXIS_DIRECTION);
  const { e1, e2, axis } = buildAxisFrame(axisDirection);

  return (u: number, v: number) => {
    // Rotational convention: u is the angle parameter, v is the profile parameter.
    const angle = u;
    const sample = profileSampler(v);
    const radius = Number.isFinite(sample.r) ? sample.r : 0;
    const height = Number.isFinite(sample.z) ? sample.z : 0;
    const cu = Math.cos(angle);
    const su = Math.sin(angle);
    return {
      x: origin.x + e1.x * radius * cu + e2.x * radius * su + axis.x * height,
      y: origin.y + e1.y * radius * cu + e2.y * radius * su + axis.y * height,
      z: origin.z + e1.z * radius * cu + e2.z * radius * su + axis.z * height,
    };
  };
};
