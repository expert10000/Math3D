import * as THREE from "three";
import type { SceneDocument, SurfaceDefinition } from "@math3d/core";

export type MobileRenderQuality = "performance" | "balanced" | "sharp";

type MobileIndexArray = Uint16Array | Uint32Array;

export type MobileMeshPayload = {
  positions: Float32Array;
  indices: MobileIndexArray;
  normals?: Float32Array;
  vertexCount: number;
  triCount: number;
};

export type MobileSurfacePreview = {
  id: string;
  geometry: THREE.BufferGeometry;
  color: string;
  warning?: string;
};

type SurfacePreviewBuildOptions = {
  implicitMeshBySurfaceId?: Record<string, MobileMeshPayload | undefined>;
};

const QUALITY_CAP: Record<MobileRenderQuality, number> = {
  performance: 36,
  balanced: 56,
  sharp: 80,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const MAX_COORD_MAGNITUDE = 1e4;

const asFinite = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const sanitizeCoord = (value: unknown): number => clamp(asFinite(value, 0), -MAX_COORD_MAGNITUDE, MAX_COORD_MAGNITUDE);

type ScalarFn = (x: number, y: number, z: number, u: number, v: number) => number;

const compileScalar = (expression: string, fallback: number): ScalarFn => {
  try {
    const fn = new Function(
      "x",
      "y",
      "z",
      "u",
      "v",
      "const { sin, cos, tan, sinh, cosh, tanh, asin, acos, atan, atan2, exp, log, sqrt, abs, pow, min, max, floor, ceil, round, PI, E } = Math;\n" +
        `return (${expression});`
    ) as ScalarFn;

    return (x: number, y: number, z: number, u: number, v: number) => {
      const result = fn(x, y, z, u, v);
      return Number.isFinite(result) ? result : fallback;
    };
  } catch {
    return () => fallback;
  }
};

type GridArgs = {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  segments: number;
  wrapU?: boolean;
  evaluate: (u: number, v: number) => [number, number, number];
};

const buildGridGeometry = ({ uMin, uMax, vMin, vMax, segments, wrapU = false, evaluate }: GridArgs): THREE.BufferGeometry => {
  const rows = segments + 1;
  const cols = wrapU ? segments : segments + 1;
  const vertexCount = rows * cols;
  const positions = new Float32Array(rows * cols * 3);
  const indexCount = segments * segments * 6;
  const indices: MobileIndexArray =
    vertexCount <= 65535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);

  let p = 0;
  for (let iy = 0; iy <= segments; iy += 1) {
    const vT = iy / segments;
    const v = vMin + (vMax - vMin) * vT;
    for (let ix = 0; ix < cols; ix += 1) {
      const uT = wrapU ? ix / cols : ix / segments;
      const u = uMin + (uMax - uMin) * uT;
      const [x, y, z] = evaluate(u, v);
      positions[p++] = sanitizeCoord(x);
      positions[p++] = sanitizeCoord(y);
      positions[p++] = sanitizeCoord(z);
    }
  }

  let t = 0;
  for (let iy = 0; iy < segments; iy += 1) {
    for (let ix = 0; ix < segments; ix += 1) {
      const a = iy * cols + ix;
      const nextIx = wrapU ? (ix + 1) % cols : ix + 1;
      const b = iy * cols + nextIx;
      const c = (iy + 1) * cols + ix;
      const d = (iy + 1) * cols + nextIx;

      indices[t++] = a;
      indices[t++] = c;
      indices[t++] = b;

      indices[t++] = b;
      indices[t++] = c;
      indices[t++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

const buildExplicitGeometry = (surface: Extract<SurfaceDefinition, { kind: "explicit" }>, segments: number) => {
  const xSpan = clamp(surface.domain?.xSpan ?? 4, 0.1, 40);
  const ySpan = clamp(surface.domain?.ySpan ?? 4, 0.1, 40);
  const zFn = compileScalar(surface.expression, 0);

  return buildGridGeometry({
    uMin: -xSpan,
    uMax: xSpan,
    vMin: -ySpan,
    vMax: ySpan,
    segments,
    evaluate: (x, y) => [x, y, zFn(x, y, 0, x, y)],
  });
};

const buildParametricGeometry = (surface: Extract<SurfaceDefinition, { kind: "parametric" }>, segments: number) => {
  const domain = surface.domain ?? { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI, vMax: Math.PI };
  const xFn = compileScalar(surface.xExpr, 0);
  const yFn = compileScalar(surface.yExpr, 0);
  const zFn = compileScalar(surface.zExpr, 0);
  const evaluate = (u: number, v: number): [number, number, number] => [
    sanitizeCoord(xFn(0, 0, 0, u, v)),
    sanitizeCoord(yFn(0, 0, 0, u, v)),
    sanitizeCoord(zFn(0, 0, 0, u, v)),
  ];

  // Auto-close periodic U seams (e.g. catenoid/torus-like surfaces) to avoid visible white slit.
  const wrapU = (() => {
    const sampleRows = 7;
    let maxSeamGap = 0;
    let maxRadius = 0;
    for (let i = 0; i < sampleRows; i += 1) {
      const t = sampleRows <= 1 ? 0 : i / (sampleRows - 1);
      const v = domain.vMin + (domain.vMax - domain.vMin) * t;
      const a = evaluate(domain.uMin, v);
      const b = evaluate(domain.uMax, v);
      const gap = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const radiusA = Math.hypot(a[0], a[1], a[2]);
      const radiusB = Math.hypot(b[0], b[1], b[2]);
      maxSeamGap = Math.max(maxSeamGap, gap);
      maxRadius = Math.max(maxRadius, radiusA, radiusB);
    }
    const scale = Math.max(1, maxRadius);
    return maxSeamGap <= scale * 1e-3;
  })();

  return buildGridGeometry({
    uMin: domain.uMin,
    uMax: domain.uMax,
    vMin: domain.vMin,
    vMax: domain.vMax,
    segments,
    wrapU,
    evaluate,
  });
};

const buildWeierstrassPreviewGeometry = (surface: Extract<SurfaceDefinition, { kind: "weierstrass" }>, segments: number) => {
  const domain = surface.domain ?? { uMin: -1.4, uMax: 1.4, vMin: -1.4, vMax: 1.4 };

  return buildGridGeometry({
    uMin: domain.uMin,
    uMax: domain.uMax,
    vMin: domain.vMin,
    vMax: domain.vMax,
    segments,
    evaluate: (u, v) => {
      const x = u - (u * u * u) / 3 + u * v * v;
      const y = v - (v * v * v) / 3 + v * u * u;
      const z = u * u - v * v;
      return [x, y, z];
    },
  });
};

const buildImplicitProxyGeometry = (surface: Extract<SurfaceDefinition, { kind: "implicit" }>, segments: number) => {
  const expression = surface.expression.replace(/\s+/g, "").toLowerCase();

  if (expression.includes("(x*x+y*y+z*z+3-4)^2-4*(x*x+y*y)")) {
    return new THREE.TorusGeometry(1.4, 0.48, Math.max(12, Math.floor(segments / 2)), segments);
  }

  if (expression.includes("x*x+y*y+z*z-1")) {
    return new THREE.SphereGeometry(1, segments, segments);
  }

  return new THREE.SphereGeometry(1.1, segments, segments);
};

const buildGeometryFromMeshPayload = (mesh: MobileMeshPayload): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  if (mesh.normals && mesh.normals.length > 0) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

export const buildSurfacePreviewGeometry = (
  surface: SurfaceDefinition,
  quality: MobileRenderQuality,
  options?: SurfacePreviewBuildOptions
): MobileSurfacePreview => {
  const qualityCap = QUALITY_CAP[quality] ?? QUALITY_CAP.balanced;
  const requestedResolution = asFinite((surface as any).resolution, 48);
  const segments = clamp(Math.floor(requestedResolution), 12, qualityCap);

  if (surface.kind === "explicit") {
    return {
      id: surface.id,
      geometry: buildExplicitGeometry(surface, segments),
      color: "#3b82f6",
    };
  }

  if (surface.kind === "parametric") {
    return {
      id: surface.id,
      geometry: buildParametricGeometry(surface, segments),
      color: "#0f766e",
    };
  }

  if (surface.kind === "weierstrass") {
    return {
      id: surface.id,
      geometry: buildWeierstrassPreviewGeometry(surface, segments),
      color: "#7c3aed",
      warning: "Weierstrass preview uses local Enneper-style approximation in mobile v1.",
    };
  }

  if (surface.kind === "implicit") {
    const implicitMesh = options?.implicitMeshBySurfaceId?.[surface.id];
    if (implicitMesh) {
      return {
        id: surface.id,
        geometry: buildGeometryFromMeshPayload(implicitMesh),
        color: "#b45309",
      };
    }
    return {
      id: surface.id,
      geometry: buildImplicitProxyGeometry(surface, segments),
      color: "#c2410c",
      warning: "Implicit preview is proxy-only until backend mesh compute is integrated.",
    };
  }

  return {
    id: surface.id,
    geometry: new THREE.BoxGeometry(1, 1, 1),
    color: "#374151",
    warning: "Mesh source token preview placeholder.",
  };
};

export const buildSceneSurfacePreviews = (
  scene: SceneDocument,
  quality: MobileRenderQuality,
  options?: SurfacePreviewBuildOptions
): MobileSurfacePreview[] => {
  return (scene.surfaces ?? []).map((surface) => buildSurfacePreviewGeometry(surface, quality, options));
};
