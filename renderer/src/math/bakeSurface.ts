import type { SurfaceId } from "../components/SurfaceViewer";
import type { ParamSurfaceId } from "../components/ParamSurfaceViewer";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { compileExpression } from "./expression";
import { buildWeierstrassSurface } from "./weierstrass";

type GraphDomain = { xSpan: number; ySpan: number };
type ParamDomain = { uMin: number; uMax: number; vMin: number; vMax: number };

type BakeResult = { mesh: SurfaceMeshData } | { error: string };

type GridBuild = {
  positions: Float32Array;
  uvs: Float32Array;
  valid: Uint8Array;
  nx: number;
  ny: number;
};

const clampSpan = (value: number, fallback: number, min = 1e-4) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, value);
};

const clampDomain = (domain: ParamDomain, fallback: ParamDomain): ParamDomain => {
  let uMin = Number.isFinite(domain.uMin) ? domain.uMin : fallback.uMin;
  let uMax = Number.isFinite(domain.uMax) ? domain.uMax : fallback.uMax;
  let vMin = Number.isFinite(domain.vMin) ? domain.vMin : fallback.vMin;
  let vMax = Number.isFinite(domain.vMax) ? domain.vMax : fallback.vMax;
  if (uMin === uMax) uMax = uMin + 0.1;
  if (vMin === vMax) vMax = vMin + 0.1;
  if (uMin > uMax) [uMin, uMax] = [uMax, uMin];
  if (vMin > vMax) [vMin, vMax] = [vMax, vMin];
  return { uMin, uMax, vMin, vMax };
};

const clampResolution = (value: number, fallback: number, min: number) => {
  const rounded = Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, rounded);
};

const triangulateGrid = (nx: number, ny: number, valid: Uint8Array) => {
  const indices: number[] = [];
  if (nx < 2 || ny < 2) return indices;
  for (let j = 0; j < ny - 1; j++) {
    const row = j * nx;
    const rowNext = (j + 1) * nx;
    for (let i = 0; i < nx - 1; i++) {
      const a = row + i;
      const b = a + 1;
      const c = rowNext + i;
      const d = c + 1;
      if (valid[a] && valid[b] && valid[c]) {
        indices.push(a, c, b);
      }
      if (valid[b] && valid[c] && valid[d]) {
        indices.push(b, c, d);
      }
    }
  }
  return indices;
};

const buildGraphFn = (surfaceId: SurfaceId, graphExpr: string) => {
  if (surfaceId === "graph_saddle") return { fn: (x: number, y: number) => 0.4 * (x * x - y * y) };
  if (surfaceId === "graph_rotatedSaddle") return { fn: (x: number, y: number) => 0.8 * x * y };
  if (surfaceId === "graph_monkey") {
    return { fn: (x: number, y: number) => 0.2 * (x * x * x - 3 * x * y * y) };
  }
  if (surfaceId === "graph_wave") {
    return { fn: (x: number, y: number) => 0.6 * Math.sin(x * 1.3) * Math.cos(y * 1.3) };
  }
  if (surfaceId === "graph_paraboloid") return { fn: (x: number, y: number) => 0.3 * (x * x + y * y) };
  if (surfaceId === "graph_gaussian") return { fn: (x: number, y: number) => Math.exp(-0.7 * (x * x + y * y)) };
  if (surfaceId === "graph_ripple") {
    return {
      fn: (x: number, y: number) => {
        const r = Math.sqrt(x * x + y * y);
        return r < 1e-4 ? 1 : Math.sin(3 * r) / (3 * r);
      },
    };
  }
  if (surfaceId === "graph_mexican") {
    return {
      fn: (x: number, y: number) => {
        const r2 = x * x + y * y;
        return (1 - r2) * Math.exp(-0.5 * r2);
      },
    };
  }
  if (surfaceId === "graph_sinSum") return { fn: (x: number, y: number) => 0.45 * (Math.sin(x) + Math.cos(y)) };
  if (surfaceId === "graph_sinc") {
    return {
      fn: (x: number, y: number) => {
        const r = Math.sqrt(x * x + y * y);
        return r < 1e-4 ? 1 : Math.sin(r) / r;
      },
    };
  }
  if (surfaceId === "graph_sinc2") {
    return {
      fn: (x: number, y: number) => {
        const r = Math.sqrt(x * x + y * y);
        return Math.sin(2 * r) / (1 + r * r);
      },
    };
  }
  if (surfaceId !== "graph_custom") {
    return { error: "Graph baker only supports explicit graph surfaces." };
  }

  const trimmed = graphExpr.trim();
  if (!trimmed) return { error: "Graph expression is empty." };
  const compiled = compileExpression(trimmed, ["x", "y"]);
  if (compiled.error) {
    return { error: `${compiled.error.message} (col ${compiled.error.col})` };
  }
  const fn = compiled.fn!;
  const vars = { x: 0, y: 0 };
  return {
    fn: (x: number, y: number) => {
      vars.x = x;
      vars.y = y;
      const v = fn(vars);
      if (!Number.isFinite(v)) return 0;
      const LIM = 1e4;
      if (v > LIM) return LIM;
      if (v < -LIM) return -LIM;
      return v;
    },
  };
};

const buildGraphGrid = (fn: (x: number, y: number) => number, domain: GraphDomain, resolution: number): GridBuild => {
  const xSpan = clampSpan(domain.xSpan, 1.5);
  const ySpan = clampSpan(domain.ySpan, 1.5);
  const nx = clampResolution(resolution, 20, 20);
  const ny = clampResolution(resolution, 20, 20);
  const total = nx * ny;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const valid = new Uint8Array(total);
  const xMin = -xSpan;
  const xMax = xSpan;
  const yMin = -ySpan;
  const yMax = ySpan;
  const dx = nx > 1 ? (xMax - xMin) / (nx - 1) : 0;
  const dy = ny > 1 ? (yMax - yMin) / (ny - 1) : 0;

  for (let j = 0; j < ny; j++) {
    const y = yMin + dy * j;
    const v = ny > 1 ? j / (ny - 1) : 0;
    for (let i = 0; i < nx; i++) {
      const x = xMin + dx * i;
      const u = nx > 1 ? i / (nx - 1) : 0;
      const idx = j * nx + i;
      const z = fn(x, y);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        valid[idx] = 1;
      }
      positions[3 * idx] = x;
      positions[3 * idx + 1] = y;
      positions[3 * idx + 2] = Number.isFinite(z) ? z : 0;
      uvs[2 * idx] = u;
      uvs[2 * idx + 1] = v;
    }
  }

  return { positions, uvs, valid, nx, ny };
};

const makeSafeParamExpr = (
  expr: string | undefined,
  fallback: (u: number, v: number) => number
): ((u: number, v: number) => number) => {
  const trimmed = (expr ?? "").trim();
  if (!trimmed) return fallback;
  let compiled: (u: number, v: number, pi: number, e: number, PI: number, E: number) => number;
  try {
    compiled = new Function(
      "u",
      "v",
      "pi",
      "e",
      "PI",
      "E",
      `
        const {
          sin, cos, tan, asin, acos, atan,
          sinh, cosh, tanh,
          exp, log, sqrt, abs, pow
        } = Math;
        return (${trimmed});
      `
    ) as (u: number, v: number, pi: number, e: number, PI: number, E: number) => number;
  } catch {
    return () => NaN;
  }

  return (u: number, v: number) => {
    try {
      const val = compiled(u, v, Math.PI, Math.E, Math.PI, Math.E);
      return Number.isFinite(val) ? val : NaN;
    } catch {
      return NaN;
    }
  };
};

const evalParamSurface = (surfaceId: ParamSurfaceId, u: number, v: number) => {
  let x = 0;
  let y = 0;
  let z = 0;

  switch (surfaceId) {
    case "plane":
      x = u;
      y = v;
      z = 0;
      break;
    case "cylinder":
      x = Math.cos(u);
      y = Math.sin(u);
      z = v;
      break;
    case "cone":
      x = v * Math.cos(u);
      y = v * Math.sin(u);
      z = v;
      break;
    case "helicoid": {
      const a = 0.4;
      x = v * Math.cos(u);
      y = v * Math.sin(u);
      z = a * u;
      break;
    }
    case "catenoid":
      x = Math.cosh(v) * Math.cos(u);
      y = Math.cosh(v) * Math.sin(u);
      z = v;
      break;
    case "sphere": {
      const R = 1;
      x = R * Math.sin(v) * Math.cos(u);
      y = R * Math.sin(v) * Math.sin(u);
      z = R * Math.cos(v);
      break;
    }
    case "ellipsoid": {
      const a = 1.3;
      const b = 0.95;
      const c = 0.7;
      x = a * Math.sin(v) * Math.cos(u);
      y = b * Math.sin(v) * Math.sin(u);
      z = c * Math.cos(v);
      break;
    }
    case "torus": {
      const R = 1.4;
      const r = 0.5;
      const cosV = Math.cos(v);
      x = (R + r * cosV) * Math.cos(u);
      y = (R + r * cosV) * Math.sin(u);
      z = r * Math.sin(v);
      break;
    }
    case "mobius": {
      const half = v / 2;
      const cosHalf = Math.cos(u / 2);
      const sinHalf = Math.sin(u / 2);
      const rho = 1 + half * cosHalf;
      x = rho * Math.cos(u);
      y = rho * Math.sin(u);
      z = half * sinHalf;
      break;
    }
    case "kleinBottle": {
      const r = 4 * (1 - Math.cos(u) / 2);
      const xBase = r * Math.cos(u);
      const yBase = r * Math.sin(u);
      if (u < Math.PI) {
        x = xBase * (1 + Math.sin(u)) + 2 * Math.cos(v);
        z = yBase;
      } else {
        x = xBase + 2 * Math.cos(v + Math.PI);
        z = yBase;
      }
      y = 2 * Math.sin(v);
      break;
    }
    case "hyperbolicParaboloid":
      x = u;
      y = v;
      z = u * v;
      break;
    case "paraboloid":
      x = u * Math.cos(v);
      y = u * Math.sin(v);
      z = 0.6 * u * u;
      break;
    case "enneper":
      x = u - (u * u * u) / 3 + u * v * v;
      y = v - (v * v * v) / 3 + v * u * u;
      z = u * u - v * v;
      break;
    case "pseudosphere": {
      const sech = 1 / Math.cosh(v);
      x = Math.cos(u) * sech;
      y = Math.sin(u) * sech;
      z = v - Math.tanh(v);
      break;
    }
    case "dini": {
      const a = 1;
      const b = 0.2;
      const sinV = Math.sin(v);
      const tanHalf = Math.tan(v / 2);
      const logTerm = Math.log(Math.max(tanHalf, 1e-6));
      x = a * Math.cos(u) * sinV;
      y = a * Math.sin(u) * sinV;
      z = a * (Math.cos(v) + logTerm) + b * u;
      break;
    }
    case "twistedStrip": {
      const twist = 2 * u;
      const rho = 1 + v * Math.cos(twist);
      x = rho * Math.cos(u);
      y = rho * Math.sin(u);
      z = v * Math.sin(twist);
      break;
    }
    case "expCone":
      x = u * Math.cos(v);
      y = u * Math.sin(v);
      z = Math.log(Math.max(u, 1e-9));
      break;
    case "helicoidUV":
      x = u * Math.cos(v);
      y = u * Math.sin(v);
      z = v;
      break;
    case "boy": {
      const sqrt2 = Math.SQRT2;
      const cos2v = Math.cos(2 * v);
      const sin2v = Math.sin(2 * v);
      const cos2u = Math.cos(2 * u);
      const sin2u = Math.sin(2 * u);
      const sin3u = Math.sin(3 * u);
      const cos3u = Math.cos(3 * u);
      const denom = 2 - sqrt2 * sin3u * sin2v;
      const d = Math.abs(denom) < 1e-3 ? (denom < 0 ? -1e-3 : 1e-3) : denom;
      x = (sqrt2 * Math.cos(u) * cos2v + cos2u * sin2v) / d;
      y = (sqrt2 * Math.sin(u) * cos2v - sin2u * sin2v) / d;
      z = cos3u / d;
      break;
    }
  }

  return { x, y, z };
};

const buildParamGrid = (
  surfaceId: ParamSurfaceId,
  domain: ParamDomain,
  resolution: number,
  customX?: string,
  customY?: string,
  customZ?: string
): GridBuild => {
  const nx = clampResolution(resolution, 16, 16);
  const ny = clampResolution(resolution, 16, 16);
  const total = nx * ny;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const valid = new Uint8Array(total);
  const { uMin, uMax, vMin, vMax } = domain;
  const du = nx > 1 ? (uMax - uMin) / (nx - 1) : 0;
  const dv = ny > 1 ? (vMax - vMin) / (ny - 1) : 0;

  let customFns: { x: (u: number, v: number) => number; y: (u: number, v: number) => number; z: (u: number, v: number) => number } | null = null;
  if (surfaceId === "custom") {
    customFns = {
      x: makeSafeParamExpr(customX, (u) => u),
      y: makeSafeParamExpr(customY, (_u, v) => v),
      z: makeSafeParamExpr(customZ, () => 0),
    };
  }

  for (let j = 0; j < ny; j++) {
    const v = vMin + dv * j;
    const vv = ny > 1 ? j / (ny - 1) : 0;
    for (let i = 0; i < nx; i++) {
      const u = uMin + du * i;
      const uu = nx > 1 ? i / (nx - 1) : 0;
      const idx = j * nx + i;
      let x = 0;
      let y = 0;
      let z = 0;
      if (customFns) {
        x = customFns.x(u, v);
        y = customFns.y(u, v);
        z = customFns.z(u, v);
      } else {
        const res = evalParamSurface(surfaceId, u, v);
        x = res.x;
        y = res.y;
        z = res.z;
      }

      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        valid[idx] = 1;
      }
      positions[3 * idx] = Number.isFinite(x) ? x : 0;
      positions[3 * idx + 1] = Number.isFinite(y) ? y : 0;
      positions[3 * idx + 2] = Number.isFinite(z) ? z : 0;
      uvs[2 * idx] = uu;
      uvs[2 * idx + 1] = vv;
    }
  }

  return { positions, uvs, valid, nx, ny };
};

export function bakeGraphSurface(params: {
  surfaceId: SurfaceId;
  graphExpr: string;
  domain: GraphDomain;
  resolution: number;
  label: string;
}): BakeResult {
  const built = buildGraphFn(params.surfaceId, params.graphExpr);
  if ("error" in built) return { error: built.error };
  const grid = buildGraphGrid(built.fn, params.domain, params.resolution);
  const indices = triangulateGrid(grid.nx, grid.ny, grid.valid);
  if (!indices.length) return { error: "No valid triangles produced. Check the expression or domain." };
  return {
    mesh: {
      label: params.label,
      positions: grid.positions,
      indices: Uint32Array.from(indices),
      uvs: grid.uvs,
      source: { kind: "bakedFromExplicit" },
    },
  };
}

export function bakeParamSurface(params: {
  surfaceId: ParamSurfaceId;
  domain: ParamDomain;
  resolution: number;
  label: string;
  customX?: string;
  customY?: string;
  customZ?: string;
}): BakeResult {
  if (params.surfaceId === "weierstrass") {
    return { error: "Weierstrass requires its own baker." };
  }

  const domain = clampDomain(params.domain, { uMin: -1, uMax: 1, vMin: -1, vMax: 1 });
  const grid = buildParamGrid(
    params.surfaceId,
    domain,
    params.resolution,
    params.customX,
    params.customY,
    params.customZ
  );
  const indices = triangulateGrid(grid.nx, grid.ny, grid.valid);
  if (!indices.length) return { error: "No valid triangles produced. Check expressions or domain." };
  return {
    mesh: {
      label: params.label,
      positions: grid.positions,
      indices: Uint32Array.from(indices),
      uvs: grid.uvs,
      source: { kind: "bakedFromParam" },
    },
  };
}

export function bakeWeierstrassSurface(params: {
  gExpr: string;
  phiExpr: string;
  domain: ParamDomain;
  resolution: number;
  label: string;
  recenterRescale: boolean;
}): BakeResult {
  const domain = clampDomain(params.domain, { uMin: -1, uMax: 1, vMin: -1, vMax: 1 });
  const built = buildWeierstrassSurface({
    gExpr: params.gExpr,
    phiExpr: params.phiExpr,
    uMin: domain.uMin,
    uMax: domain.uMax,
    vMin: domain.vMin,
    vMax: domain.vMax,
    resolution: params.resolution,
    recenterRescale: params.recenterRescale,
  });
  if (built.error || built.errorMessage) {
    return { error: built.errorMessage ?? built.error?.message ?? "Invalid Weierstrass data." };
  }

  const resolvedDomain: ParamDomain = {
    uMin: built.uMin,
    uMax: built.uMax,
    vMin: built.vMin,
    vMax: built.vMax,
  };

  const nx = clampResolution(params.resolution, 4, 4);
  const ny = nx;
  const total = nx * ny;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const valid = new Uint8Array(total);
  const du = nx > 1 ? (resolvedDomain.uMax - resolvedDomain.uMin) / (nx - 1) : 0;
  const dv = ny > 1 ? (resolvedDomain.vMax - resolvedDomain.vMin) / (ny - 1) : 0;

  const tmp = { x: 0, y: 0, z: 0 };
  const target = {
    set: (x: number, y: number, z: number) => {
      tmp.x = x;
      tmp.y = y;
      tmp.z = z;
    },
  };
  for (let j = 0; j < ny; j++) {
    const v = resolvedDomain.vMin + dv * j;
    const vv = ny > 1 ? j / (ny - 1) : 0;
    for (let i = 0; i < nx; i++) {
      const u = resolvedDomain.uMin + du * i;
      const uu = nx > 1 ? i / (nx - 1) : 0;
      const idx = j * nx + i;
      built.paramFunc(u, v, target);
      const x = tmp.x;
      const y = tmp.y;
      const z = tmp.z;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        valid[idx] = 1;
      }
      positions[3 * idx] = Number.isFinite(x) ? x : 0;
      positions[3 * idx + 1] = Number.isFinite(y) ? y : 0;
      positions[3 * idx + 2] = Number.isFinite(z) ? z : 0;
      uvs[2 * idx] = uu;
      uvs[2 * idx + 1] = vv;
    }
  }

  const indices = triangulateGrid(nx, ny, valid);
  if (!indices.length) {
    return { error: "No valid triangles produced. Check Weierstrass data or domain." };
  }

  return {
    mesh: {
      label: params.label,
      positions,
      indices: Uint32Array.from(indices),
      uvs,
      source: { kind: "bakedFromWeierstrass" },
    },
  };
}
