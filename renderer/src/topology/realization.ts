import type { OrientationRelation, QuotientComplex, Realization3D, Vec3 } from "./types";

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const normalize = (v: Vec3): Vec3 => {
  const length = norm(v);
  if (length <= 1e-9) return [0, 0, 0];
  return [v[0] / length, v[1] / length, v[2] / length];
};

const average = (points: Vec3[]): Vec3 => {
  if (points.length === 0) return [0, 0, 0];
  let sum: Vec3 = [0, 0, 0];
  for (const point of points) sum = add(sum, point);
  return scale(sum, 1 / points.length);
};

const reverseIfNeeded = (points: Vec3[], reverse: boolean): Vec3[] => (reverse ? [...points].reverse() : points);

const vertexLayout = (count: number): Vec3[] => {
  if (count <= 0) return [];
  if (count === 1) return [[0, 0, 0]];
  const radius = Math.max(1.2, 0.85 + 0.3 * count);
  const points: Vec3[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), 0.25 * Math.sin(2 * angle)]);
  }
  return points;
};

const makeLoopCurve = (center: Vec3, loopIndex: number): Vec3[] => {
  const points: Vec3[] = [];
  const radius = 0.45 + loopIndex * 0.22;
  const zAmplitude = 0.14 + loopIndex * 0.03;
  for (let index = 0; index <= 28; index += 1) {
    const theta = (Math.PI * 2 * index) / 28;
    points.push([
      center[0] + radius * Math.cos(theta),
      center[1] + 0.75 * radius * Math.sin(theta),
      center[2] + zAmplitude * Math.sin(2 * theta),
    ]);
  }
  return points;
};

const makeArcCurve = (from: Vec3, to: Vec3, edgeIndex: number): Vec3[] => {
  const direction = sub(to, from);
  const length = Math.max(0.3, norm(direction));
  const tangent = normalize(direction);
  const up: Vec3 = [0, 0, 1];
  const side = normalize([
    tangent[1] * up[2] - tangent[2] * up[1],
    tangent[2] * up[0] - tangent[0] * up[2],
    tangent[0] * up[1] - tangent[1] * up[0],
  ]);
  const offsetSize = 0.18 + 0.06 * (edgeIndex % 5);
  const offset: Vec3 = norm(side) <= 1e-9 ? [0.12, 0.04, 0.18] : scale(side, offsetSize * Math.min(1.5, length));
  const midpoint = scale(add(from, to), 0.5);
  const lift = [0, 0, 0.12 + 0.05 * ((edgeIndex % 3) + 1)] as Vec3;
  const p1 = add(midpoint, add(offset, lift));
  return [from, p1, to];
};

const buildFaceMesh = (
  quotient: QuotientComplex,
  edgeCurves: Record<string, Vec3[]>
): Realization3D["faceRealizationMesh"] => {
  const result: Realization3D["faceRealizationMesh"] = [];
  for (const face of quotient.faces) {
    const attachment = quotient.attachmentMap[face.attachmentId];
    if (!attachment || attachment.boundary.length === 0) continue;

    const polygon: Vec3[] = [];
    for (const edgeRef of attachment.boundary) {
      const curve = edgeCurves[edgeRef.edgeId];
      if (!curve || curve.length === 0) continue;
      const oriented = reverseIfNeeded(curve, edgeRef.direction < 0);
      const point = oriented[0];
      polygon.push(point);
    }
    if (polygon.length < 3) continue;

    const center = average(polygon);
    const vertices = [...polygon, center];
    const centerIndex = vertices.length - 1;
    const triangles: Array<[number, number, number]> = [];
    for (let index = 0; index < polygon.length; index += 1) {
      triangles.push([index, (index + 1) % polygon.length, centerIndex]);
    }
    result.push({ faceId: face.id, vertices, triangles });
  }
  return result;
};

const TORUS_MAJOR_RADIUS = 1.78;
const TORUS_MINOR_RADIUS = 0.62;
const MOBIUS_RADIUS = 1.78;
const MOBIUS_HALF_WIDTH = 0.44;
const PROJECTIVE_SCALE = 3.15;
const KLEIN_SCALE = 0.42;
const CYLINDER_RADIUS = 1.34;
const CYLINDER_HALF_HEIGHT = 0.9;
const CONE_RADIUS = 1.48;
const CONE_HEIGHT = 1.95;
const DUNCE_MAP_BASE_RADIUS = 1.5;
const DUNCE_MAP_HEIGHT = 2.1;
const SPHERE_RADIUS = 1.32;
const SUSPENSION_RADIUS = 1.28;
const SUSPENSION_HALF_HEIGHT = 1.34;
const STUDIO_SURFACE_SEGMENTS = {
  torus: { u: 160, v: 96 },
  klein: { u: 240, v: 140 },
  cylinder: { u: 160, v: 96 },
} as const;

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const buildOrientationRelationMap = (relations: OrientationRelation[] | undefined): Map<string, "match" | "reverse"> => {
  const out = new Map<string, "match" | "reverse">();
  if (!relations) return out;
  for (const relation of relations) {
    const key = relation.edgeA < relation.edgeB ? `${relation.edgeA}::${relation.edgeB}` : `${relation.edgeB}::${relation.edgeA}`;
    out.set(key, relation.relation);
  }
  return out;
};

const hasClassRelation = (
  quotient: QuotientComplex,
  labelToken: string,
  expected: "match" | "reverse",
  relationMap: Map<string, "match" | "reverse">
): boolean =>
  quotient.edges.some((edge) => {
    if (edge.sourceEdgeIds.length < 2) return false;
    if (edgePrimaryLabel(edge.label) !== labelToken) return false;
    for (let i = 0; i < edge.sourceEdgeIds.length; i += 1) {
      for (let j = i + 1; j < edge.sourceEdgeIds.length; j += 1) {
        const a = edge.sourceEdgeIds[i] ?? "";
        const b = edge.sourceEdgeIds[j] ?? "";
        const key = a < b ? `${a}::${b}` : `${b}::${a}`;
        if (relationMap.get(key) === expected) return true;
      }
    }
    return false;
  });

const isTorusLikeQuotient = (quotient: QuotientComplex, relations?: OrientationRelation[]): boolean => {
  if (quotient.edges.length < 2) return false;
  const relationMap = buildOrientationRelationMap(relations);
  return (
    hasClassRelation(quotient, "a", "reverse", relationMap) &&
    hasClassRelation(quotient, "b", "reverse", relationMap)
  );
};

const edgePrimaryLabel = (label: string): string => {
  const head = label
    .trim()
    .toLowerCase()
    .split(/[\/\s]+/)[0] ?? "";
  return head.replace(/[^a-z0-9]/g, "");
};

const isMobiusLikeQuotient = (quotient: QuotientComplex): boolean => {
  const identifiedA = quotient.edges.some(
    (edge) => edge.sourceEdgeIds.length >= 2 && edgePrimaryLabel(edge.label) === "a"
  );
  const boundaryLike = quotient.edges.filter(
    (edge) =>
      edge.sourceEdgeIds.length === 1 &&
      edge.sourceEdgeIds[0] &&
      !edge.sourceEdgeIds[0].startsWith("sd_") &&
      !edgePrimaryLabel(edge.label).startsWith("qe")
  );
  return identifiedA && boundaryLike.length >= 2;
};

const isProjectivePlaneLikeQuotient = (quotient: QuotientComplex, relations?: OrientationRelation[]): boolean => {
  const relationMap = buildOrientationRelationMap(relations);
  if (hasClassRelation(quotient, "a", "match", relationMap) && hasClassRelation(quotient, "b", "match", relationMap)) {
    return true;
  }
  const hasAaDigonModel = quotient.edges.some((edge) => {
    if (edge.sourceEdgeIds.length !== 2) return false;
    if (edgePrimaryLabel(edge.label) !== "a") return false;
    const [sourceA, sourceB] = edge.sourceEdgeIds;
    const key = sourceA < sourceB ? `${sourceA}::${sourceB}` : `${sourceB}::${sourceA}`;
    return relationMap.get(key) === "match";
  });
  return hasAaDigonModel;
};

const isKleinBottleLikeQuotient = (quotient: QuotientComplex, relations?: OrientationRelation[]): boolean => {
  const relationMap = buildOrientationRelationMap(relations);
  return (
    (hasClassRelation(quotient, "a", "reverse", relationMap) && hasClassRelation(quotient, "b", "match", relationMap)) ||
    (hasClassRelation(quotient, "a", "match", relationMap) && hasClassRelation(quotient, "b", "reverse", relationMap))
  );
};

const isPresetQuotient = (quotient: QuotientComplex, presetId: string): boolean =>
  quotient.id.startsWith(`${presetId}/quotient`) || quotient.id.includes(`${presetId}/quotient`);

const mobiusPoint = (u: number, v: number, radius = MOBIUS_RADIUS): Vec3 => {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const hu = u * 0.5;
  const c = Math.cos(hu);
  const s = Math.sin(hu);
  return [(radius + v * c) * cu, (radius + v * c) * su, v * s];
};

const mobiusFrame = (u: number, v: number): { point: Vec3; tangentU: Vec3; tangentV: Vec3; normal: Vec3 } => {
  const eps = 1e-3;
  const point = mobiusPoint(u, v);
  const du = scale(sub(mobiusPoint(u + eps, v), mobiusPoint(u - eps, v)), 1 / (2 * eps));
  const dv = scale(sub(mobiusPoint(u, v + eps), mobiusPoint(u, v - eps)), 1 / (2 * eps));
  const normal = normalize(cross(du, dv));
  return { point, tangentU: normalize(du), tangentV: normalize(dv), normal };
};

const pickTorusCycleEdgeIds = (quotient: QuotientComplex): { major: string; minor: string } => {
  const labeled = quotient.edges.map((edge) => ({
    id: edge.id,
    label: edgePrimaryLabel(edge.label),
  }));
  const major = labeled.find((entry) => entry.label === "a")?.id ?? labeled[0]?.id ?? "qE0";
  const minorFallback = labeled.find((entry) => entry.id !== major)?.id ?? major;
  const minor = labeled.find((entry) => entry.label === "b")?.id ?? minorFallback;
  return { major, minor };
};

const torusPoint = (u: number, v: number, major = TORUS_MAJOR_RADIUS, minor = TORUS_MINOR_RADIUS): Vec3 => {
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosV = Math.cos(v);
  const sinV = Math.sin(v);
  return [(major + minor * cosV) * cosU, (major + minor * cosV) * sinU, minor * sinV];
};

const sampleCurve = (builder: (t: number) => Vec3, segments: number, closed = true): Vec3[] => {
  const count = Math.max(8, segments);
  const pts: Vec3[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    pts.push(builder(t));
  }
  return closed ? pts : pts.slice(0, Math.max(2, pts.length - 1));
};

const spherePoint = (u: number, v: number): Vec3 => [Math.sin(u) * Math.cos(v), Math.sin(u) * Math.sin(v), Math.cos(u)];

const projectivePoint = (u: number, v: number, scaleFactor = PROJECTIVE_SCALE): Vec3 => {
  // Roman-surface style immersion RP^2 -> R^3 via quadratic map on S^2 / {x ~ -x}.
  const [sx, sy, sz] = spherePoint(u, v);
  return [scaleFactor * sx * sy, scaleFactor * sy * sz, scaleFactor * sz * sx];
};

const pickProjectiveCycleEdgeIds = (quotient: QuotientComplex): { aEdge: string; bEdge: string } => {
  const labeled = quotient.edges.map((edge) => ({
    id: edge.id,
    label: edgePrimaryLabel(edge.label),
  }));
  const aEdge = labeled.find((entry) => entry.label === "a")?.id ?? labeled[0]?.id ?? "qE0";
  const fallback = labeled.find((entry) => entry.id !== aEdge)?.id ?? aEdge;
  const bEdge = labeled.find((entry) => entry.label === "b")?.id ?? fallback;
  return { aEdge, bEdge };
};

const pickKleinCycleEdgeIds = (quotient: QuotientComplex): { aEdge: string; bEdge: string } => {
  const labeled = quotient.edges.map((edge) => ({
    id: edge.id,
    label: edgePrimaryLabel(edge.label),
  }));
  const aEdge = labeled.find((entry) => entry.label === "a")?.id ?? labeled[0]?.id ?? "qE0";
  const fallback = labeled.find((entry) => entry.id !== aEdge)?.id ?? aEdge;
  const bEdge = labeled.find((entry) => entry.label === "b")?.id ?? fallback;
  return { aEdge, bEdge };
};

const kleinPoint = (u: number, v: number, scaleFactor = KLEIN_SCALE): Vec3 => {
  const r = 2.0;
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const hu = u * 0.5;
  const common = r + Math.cos(hu) * Math.sin(v) - Math.sin(hu) * Math.sin(2 * v);
  const x = common * cu;
  const y = common * su;
  const z = Math.sin(hu) * Math.sin(v) + Math.cos(hu) * Math.sin(2 * v);
  return [x * scaleFactor, z * scaleFactor, y * scaleFactor];
};

const buildKleinFaceMesh = (faceId: string): Realization3D["faceRealizationMesh"] => {
  const uSegments = STUDIO_SURFACE_SEGMENTS.klein.u;
  const vSegments = STUDIO_SURFACE_SEGMENTS.klein.v;
  const vertices: Vec3[] = [];
  for (let iu = 0; iu <= uSegments; iu += 1) {
    const u = (Math.PI * 2 * iu) / uSegments;
    for (let iv = 0; iv <= vSegments; iv += 1) {
      const v = (Math.PI * 2 * iv) / vSegments;
      vertices.push(kleinPoint(u, v));
    }
  }
  const row = vSegments + 1;
  const triangles: Array<[number, number, number]> = [];
  for (let iu = 0; iu < uSegments; iu += 1) {
    for (let iv = 0; iv < vSegments; iv += 1) {
      const a = iu * row + iv;
      const b = (iu + 1) * row + iv;
      const c = (iu + 1) * row + iv + 1;
      const d = iu * row + iv + 1;
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return [{ faceId, vertices, triangles }];
};

const cylinderPoint = (u: number, v: number): Vec3 => [
  CYLINDER_RADIUS * Math.cos(u),
  CYLINDER_RADIUS * Math.sin(u),
  CYLINDER_HALF_HEIGHT * v,
];

const conePoint = (u: number, s: number): Vec3 => {
  const r = CONE_RADIUS * (1 - s);
  const z = -CONE_HEIGHT * 0.5 + CONE_HEIGHT * s;
  return [r * Math.cos(u), r * Math.sin(u), z];
};

const dunceMapPoint = (u: number, s: number): Vec3 => {
  const taper = 1 - s;
  const ripple = 0.24 * Math.sin(2.1 * u) * s * (1 - 0.45 * s);
  const phase = 0.38 * s;
  const radiusX = DUNCE_MAP_BASE_RADIUS * taper * (1 + 0.08 * Math.cos(3 * u));
  const radiusY = DUNCE_MAP_BASE_RADIUS * taper * (1 - 0.08 * Math.cos(3 * u));
  const x = (radiusX + ripple) * Math.cos(u + phase);
  const y = (radiusY - ripple) * Math.sin(u - 0.26 * s);
  const z = -DUNCE_MAP_HEIGHT * 0.5 + DUNCE_MAP_HEIGHT * s + 0.28 * Math.sin(3 * u) * s * taper;
  return [x, y, z];
};

const sphereSurfacePoint = (u: number, v: number): Vec3 => [
  SPHERE_RADIUS * Math.sin(u) * Math.cos(v),
  SPHERE_RADIUS * Math.sin(u) * Math.sin(v),
  SPHERE_RADIUS * Math.cos(u),
];

const suspensionPoint = (u: number, w: number): Vec3 => {
  const r = SUSPENSION_RADIUS * (1 - Math.abs(w));
  return [r * Math.cos(u), r * Math.sin(u), SUSPENSION_HALF_HEIGHT * w];
};

const buildCylinderFaceMesh = (faceId: string): Realization3D["faceRealizationMesh"] => {
  const uSegments = STUDIO_SURFACE_SEGMENTS.cylinder.u;
  const vSegments = STUDIO_SURFACE_SEGMENTS.cylinder.v;
  const vertices: Vec3[] = [];
  for (let iu = 0; iu <= uSegments; iu += 1) {
    const u = (Math.PI * 2 * iu) / uSegments;
    for (let iv = 0; iv <= vSegments; iv += 1) {
      const v = -1 + (2 * iv) / vSegments;
      vertices.push(cylinderPoint(u, v));
    }
  }
  const row = vSegments + 1;
  const triangles: Array<[number, number, number]> = [];
  for (let iu = 0; iu < uSegments; iu += 1) {
    for (let iv = 0; iv < vSegments; iv += 1) {
      const a = iu * row + iv;
      const b = (iu + 1) * row + iv;
      const c = (iu + 1) * row + iv + 1;
      const d = iu * row + iv + 1;
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return [{ faceId, vertices, triangles }];
};

const buildConeFaceMesh = (faceId: string): Realization3D["faceRealizationMesh"] => {
  const uSegments = 88;
  const sSegments = 26;
  const vertices: Vec3[] = [];
  for (let iu = 0; iu <= uSegments; iu += 1) {
    const u = (Math.PI * 2 * iu) / uSegments;
    for (let is = 0; is <= sSegments; is += 1) {
      const s = is / sSegments;
      vertices.push(conePoint(u, s));
    }
  }
  const row = sSegments + 1;
  const triangles: Array<[number, number, number]> = [];
  for (let iu = 0; iu < uSegments; iu += 1) {
    for (let is = 0; is < sSegments; is += 1) {
      const a = iu * row + is;
      const b = (iu + 1) * row + is;
      const c = (iu + 1) * row + is + 1;
      const d = iu * row + is + 1;
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return [{ faceId, vertices, triangles }];
};

const buildDunceMapFaceMesh = (faceId: string): Realization3D["faceRealizationMesh"] => {
  const uSegments = 108;
  const sSegments = 32;
  const vertices: Vec3[] = [];
  for (let iu = 0; iu <= uSegments; iu += 1) {
    const u = (Math.PI * 2 * iu) / uSegments;
    for (let is = 0; is <= sSegments; is += 1) {
      const s = is / sSegments;
      vertices.push(dunceMapPoint(u, s));
    }
  }
  const row = sSegments + 1;
  const triangles: Array<[number, number, number]> = [];
  for (let iu = 0; iu < uSegments; iu += 1) {
    for (let is = 0; is < sSegments; is += 1) {
      const a = iu * row + is;
      const b = (iu + 1) * row + is;
      const c = (iu + 1) * row + is + 1;
      const d = iu * row + is + 1;
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return [{ faceId, vertices, triangles }];
};

const buildSphereFaceMesh = (faceId: string): Realization3D["faceRealizationMesh"] => {
  const uSegments = 64;
  const vSegments = 92;
  const vertices: Vec3[] = [];
  for (let iu = 0; iu <= uSegments; iu += 1) {
    const u = (Math.PI * iu) / uSegments;
    for (let iv = 0; iv <= vSegments; iv += 1) {
      const v = (Math.PI * 2 * iv) / vSegments;
      vertices.push(sphereSurfacePoint(u, v));
    }
  }
  const row = vSegments + 1;
  const triangles: Array<[number, number, number]> = [];
  for (let iu = 0; iu < uSegments; iu += 1) {
    for (let iv = 0; iv < vSegments; iv += 1) {
      const a = iu * row + iv;
      const b = (iu + 1) * row + iv;
      const c = (iu + 1) * row + iv + 1;
      const d = iu * row + iv + 1;
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return [{ faceId, vertices, triangles }];
};

const buildSuspensionFaceMesh = (faceId: string): Realization3D["faceRealizationMesh"] => {
  const uSegments = 76;
  const wSegments = 32;
  const vertices: Vec3[] = [];
  for (let iu = 0; iu <= uSegments; iu += 1) {
    const u = (Math.PI * 2 * iu) / uSegments;
    for (let iw = 0; iw <= wSegments; iw += 1) {
      const w = -1 + (2 * iw) / wSegments;
      vertices.push(suspensionPoint(u, w));
    }
  }
  const row = wSegments + 1;
  const triangles: Array<[number, number, number]> = [];
  for (let iu = 0; iu < uSegments; iu += 1) {
    for (let iw = 0; iw < wSegments; iw += 1) {
      const a = iu * row + iw;
      const b = (iu + 1) * row + iw;
      const c = (iu + 1) * row + iw + 1;
      const d = iu * row + iw + 1;
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return [{ faceId, vertices, triangles }];
};

const buildProjectiveFaceMesh = (faceId: string): Realization3D["faceRealizationMesh"] => {
  const uSegments = 64;
  const vSegments = 88;
  const vertices: Vec3[] = [];
  for (let iu = 0; iu <= uSegments; iu += 1) {
    const u = (Math.PI * iu) / uSegments;
    for (let iv = 0; iv <= vSegments; iv += 1) {
      const v = (Math.PI * 2 * iv) / vSegments;
      vertices.push(projectivePoint(u, v));
    }
  }
  const row = vSegments + 1;
  const triangles: Array<[number, number, number]> = [];
  for (let iu = 0; iu < uSegments; iu += 1) {
    for (let iv = 0; iv < vSegments; iv += 1) {
      const a = iu * row + iv;
      const b = (iu + 1) * row + iv;
      const c = (iu + 1) * row + iv + 1;
      const d = iu * row + iv + 1;
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return [{ faceId, vertices, triangles }];
};

const buildTorusFaceMesh = (faceId: string): Realization3D["faceRealizationMesh"] => {
  const uSegments = STUDIO_SURFACE_SEGMENTS.torus.u;
  const vSegments = STUDIO_SURFACE_SEGMENTS.torus.v;
  const vertices: Vec3[] = [];
  for (let iu = 0; iu <= uSegments; iu += 1) {
    const u = (Math.PI * 2 * iu) / uSegments;
    for (let iv = 0; iv <= vSegments; iv += 1) {
      const v = (Math.PI * 2 * iv) / vSegments;
      vertices.push(torusPoint(u, v));
    }
  }
  const row = vSegments + 1;
  const triangles: Array<[number, number, number]> = [];
  for (let iu = 0; iu < uSegments; iu += 1) {
    for (let iv = 0; iv < vSegments; iv += 1) {
      const a = iu * row + iv;
      const b = (iu + 1) * row + iv;
      const c = (iu + 1) * row + iv + 1;
      const d = iu * row + iv + 1;
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return [{ faceId, vertices, triangles }];
};

const buildMobiusFaceMesh = (
  faceId: string,
  kind: "smooth" | "cut-open"
): Realization3D["faceRealizationMesh"] => {
  const uSegments = 84;
  const vSegments = 26;
  const vertices: Vec3[] = [];

  if (kind === "smooth") {
    for (let iu = 0; iu < uSegments; iu += 1) {
      const u = (Math.PI * 2 * iu) / uSegments;
      for (let iv = 0; iv <= vSegments; iv += 1) {
        const v = -MOBIUS_HALF_WIDTH + (2 * MOBIUS_HALF_WIDTH * iv) / vSegments;
        vertices.push(mobiusPoint(u, v));
      }
    }
    const row = vSegments + 1;
    const triangles: Array<[number, number, number]> = [];
    const idx = (iu: number, iv: number) => iu * row + iv;
    for (let iu = 0; iu < uSegments; iu += 1) {
      const nextIu = (iu + 1) % uSegments;
      const wrap = nextIu === 0;
      for (let iv = 0; iv < vSegments; iv += 1) {
        const ivA = iv;
        const ivB = iv + 1;
        const jvA = wrap ? vSegments - ivA : ivA;
        const jvB = wrap ? vSegments - ivB : ivB;
        const a = idx(iu, ivA);
        const b = idx(nextIu, jvA);
        const c = idx(nextIu, jvB);
        const d = idx(iu, ivB);
        triangles.push([a, b, c], [a, c, d]);
      }
    }
    return [{ faceId, vertices, triangles }];
  }

  for (let iu = 0; iu <= uSegments; iu += 1) {
    const u = (Math.PI * 2 * iu) / uSegments;
    for (let iv = 0; iv <= vSegments; iv += 1) {
      const v = -MOBIUS_HALF_WIDTH + (2 * MOBIUS_HALF_WIDTH * iv) / vSegments;
      vertices.push(mobiusPoint(u, v));
    }
  }
  const row = vSegments + 1;
  const triangles: Array<[number, number, number]> = [];
  const idx = (iu: number, iv: number) => iu * row + iv;
  for (let iu = 0; iu < uSegments; iu += 1) {
    for (let iv = 0; iv < vSegments; iv += 1) {
      const a = idx(iu, iv);
      const b = idx(iu + 1, iv);
      const c = idx(iu + 1, iv + 1);
      const d = idx(iu, iv + 1);
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return [{ faceId, vertices, triangles }];
};

const buildTorusRealizationBase = (
  quotient: QuotientComplex,
  kind: "smooth" | "cut-open",
  relations?: OrientationRelation[]
): Realization3D | null => {
  if (!isTorusLikeQuotient(quotient, relations)) return null;
  const faceId = quotient.faces[0]?.id ?? "qF0";
  const { major, minor } = pickTorusCycleEdgeIds(quotient);
  const edgeCurves: Record<string, Vec3[]> = {};
  const phaseOffset = new Map<string, number>();
  let offsetCounter = 0;
  for (const edge of quotient.edges) {
    const phi = (Math.PI * 2 * offsetCounter) / Math.max(3, quotient.edges.length + 1);
    phaseOffset.set(edge.id, phi);
    offsetCounter += 1;
  }

  for (const edge of quotient.edges) {
    if (edge.id === major) {
      edgeCurves[edge.id] = sampleCurve((t) => torusPoint(t * Math.PI * 2, 0), 180, true);
      continue;
    }
    if (edge.id === minor) {
      edgeCurves[edge.id] = sampleCurve((t) => torusPoint(0, t * Math.PI * 2), 160, true);
      continue;
    }
    const shift = phaseOffset.get(edge.id) ?? 0;
    edgeCurves[edge.id] = sampleCurve((t) => torusPoint(t * Math.PI * 2, shift), 120, true);
  }

  if (kind === "cut-open") {
    edgeCurves.cut_u = sampleCurve((t) => torusPoint(t * Math.PI * 2, 0), 150, false);
    edgeCurves.cut_v = sampleCurve((t) => torusPoint(0, t * Math.PI * 2), 130, false);
  }

  const cornerPoint = torusPoint(0, 0);
  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    if (index === 0) {
      vertexPositions[vertex.id] = cornerPoint;
      return;
    }
    const theta = (Math.PI * 2 * index) / Math.max(2, quotient.vertices.length);
    vertexPositions[vertex.id] = torusPoint(theta, 0.26 * Math.sin(theta));
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/torus-${kind}`,
    name: kind === "smooth" ? "Smooth torus realization" : "Cut-open torus model",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildTorusFaceMesh(faceId),
    seams,
    singularityMarkers,
    style: {
      faceFill: kind === "smooth" ? "#dbeafe" : "#ede9fe",
      edgeStroke: "#0f172a",
      seamStroke: kind === "smooth" ? "#be123c" : "#92400e",
      singularityColor: "#b45309",
    },
  };
};

const buildProjectiveImmersedRealization = (
  quotient: QuotientComplex,
  relations?: OrientationRelation[]
): Realization3D | null => {
  if (!isProjectivePlaneLikeQuotient(quotient, relations)) return null;
  const faceId = quotient.faces[0]?.id ?? "qF0";
  const { aEdge, bEdge } = pickProjectiveCycleEdgeIds(quotient);
  const edgeCurves: Record<string, Vec3[]> = {};
  for (const edge of quotient.edges) {
    if (edge.id === aEdge) {
      edgeCurves[edge.id] = sampleCurve((t) => projectivePoint(Math.PI * 0.5, t * Math.PI * 2), 180, true);
      continue;
    }
    if (edge.id === bEdge) {
      edgeCurves[edge.id] = sampleCurve((t) => projectivePoint(t * Math.PI, 0), 180, true);
      continue;
    }
    const phase = quotient.edges.indexOf(edge);
    edgeCurves[edge.id] = sampleCurve((t) => projectivePoint(t * Math.PI, phase * 0.8), 140, true);
  }

  // Trace one self-intersection locus in the immersed model for pedagogy.
  edgeCurves.rp2_self_intersection = sampleCurve((t) => [0, 0, PROJECTIVE_SCALE * (2 * t - 1)], 120, false);

  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    if (index === 0) {
      vertexPositions[vertex.id] = projectivePoint(Math.PI * 0.5, 0);
      return;
    }
    const theta = (Math.PI * 2 * index) / Math.max(2, quotient.vertices.length);
    vertexPositions[vertex.id] = projectivePoint(Math.PI * 0.52, theta);
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/projective-immersed`,
    name: "Immersed realization of RP^2 in R^3 (cross-cap style)",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildProjectiveFaceMesh(faceId),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#ffedd5",
      edgeStroke: "#0f172a",
      seamStroke: "#be123c",
      singularityColor: "#b45309",
    },
  };
};

const buildKleinImmersedRealization = (
  quotient: QuotientComplex,
  relations?: OrientationRelation[]
): Realization3D | null => {
  if (!isKleinBottleLikeQuotient(quotient, relations)) return null;
  const faceId = quotient.faces[0]?.id ?? "qF0";
  const { aEdge, bEdge } = pickKleinCycleEdgeIds(quotient);
  const edgeCurves: Record<string, Vec3[]> = {};
  for (const edge of quotient.edges) {
    if (edge.id === aEdge) {
      edgeCurves[edge.id] = sampleCurve((t) => kleinPoint(t * Math.PI * 2, 0), 190, true);
      continue;
    }
    if (edge.id === bEdge) {
      edgeCurves[edge.id] = sampleCurve((t) => kleinPoint(0, t * Math.PI * 2), 170, true);
      continue;
    }
    const phase = quotient.edges.indexOf(edge);
    edgeCurves[edge.id] = sampleCurve((t) => kleinPoint(t * Math.PI * 2, (phase * Math.PI) / Math.max(2, quotient.edges.length)), 140, true);
  }
  edgeCurves.klein_self_intersection = sampleCurve(
    (t) => [0.78 * Math.cos(Math.PI * 2 * t), 0.44 * Math.sin(Math.PI * 2 * t), 0],
    140,
    true
  );

  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    if (index === 0) {
      vertexPositions[vertex.id] = kleinPoint(0, 0);
      return;
    }
    const theta = (Math.PI * 2 * index) / Math.max(2, quotient.vertices.length);
    vertexPositions[vertex.id] = kleinPoint(theta, Math.PI * 0.35);
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/klein-immersed`,
    name: "Immersed Klein bottle realization in R^3",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildKleinFaceMesh(faceId),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#e0f2fe",
      edgeStroke: "#0f172a",
      seamStroke: "#be123c",
      singularityColor: "#b45309",
    },
  };
};

const buildCylinderPresetRealization = (quotient: QuotientComplex): Realization3D | null => {
  if (!isPresetQuotient(quotient, "preset/cylinder")) return null;
  const faceId = quotient.faces[0]?.id ?? "qF0";
  const edgeCurves: Record<string, Vec3[]> = {};
  for (const edge of quotient.edges) {
    const token = edgePrimaryLabel(edge.label);
    if (token === "a") {
      edgeCurves[edge.id] = sampleCurve((t) => cylinderPoint(t * Math.PI * 2, 0), 170, true);
      continue;
    }
    if (token === "u") {
      edgeCurves[edge.id] = sampleCurve((t) => cylinderPoint(t * Math.PI * 2, 1), 150, true);
      continue;
    }
    if (token === "v") {
      edgeCurves[edge.id] = sampleCurve((t) => cylinderPoint(t * Math.PI * 2, -1), 150, true);
      continue;
    }
    const phase = quotient.edges.indexOf(edge);
    edgeCurves[edge.id] = sampleCurve((t) => cylinderPoint(t * Math.PI * 2, 0.7 * Math.sin((phase + 1) * Math.PI * 0.33)), 130, true);
  }
  edgeCurves.cylinder_boundary_top = sampleCurve((t) => cylinderPoint(t * Math.PI * 2, 1), 150, true);
  edgeCurves.cylinder_boundary_bottom = sampleCurve((t) => cylinderPoint(t * Math.PI * 2, -1), 150, true);

  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    const t = index / Math.max(1, quotient.vertices.length);
    const v = index % 2 === 0 ? 1 : -1;
    vertexPositions[vertex.id] = cylinderPoint(t * Math.PI * 2, v);
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/cylinder-smooth`,
    name: "Smooth cylinder realization",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildCylinderFaceMesh(faceId),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#dbeafe",
      edgeStroke: "#0f172a",
      seamStroke: "#be123c",
      singularityColor: "#b45309",
    },
  };
};

const buildConePresetRealization = (quotient: QuotientComplex): Realization3D | null => {
  if (!isPresetQuotient(quotient, "preset/cone")) return null;
  const faceId = quotient.faces[0]?.id ?? "qF0";
  const edgeCurves: Record<string, Vec3[]> = {};
  for (const edge of quotient.edges) {
    const token = edgePrimaryLabel(edge.label);
    if (token === "c") {
      edgeCurves[edge.id] = sampleCurve((t) => conePoint(t * Math.PI * 2, 0), 170, true);
      continue;
    }
    const phase = quotient.edges.indexOf(edge);
    edgeCurves[edge.id] = sampleCurve((t) => conePoint(t * Math.PI * 2, 0.1 + 0.85 * Math.abs(Math.sin((phase + 1) * Math.PI * 0.35))), 130, true);
  }
  edgeCurves.cone_boundary = sampleCurve((t) => conePoint(t * Math.PI * 2, 0), 170, true);

  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    if (index === 0) {
      vertexPositions[vertex.id] = conePoint(0, 1);
      return;
    }
    const t = (Math.PI * 2 * index) / Math.max(2, quotient.vertices.length);
    vertexPositions[vertex.id] = conePoint(t, 0.1);
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/cone-smooth`,
    name: "Smooth cone realization",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildConeFaceMesh(faceId),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#fee2e2",
      edgeStroke: "#0f172a",
      seamStroke: "#be123c",
      singularityColor: "#b45309",
    },
  };
};

const buildDunceMapPresetRealization = (quotient: QuotientComplex): Realization3D | null => {
  if (!isPresetQuotient(quotient, "preset/dunce-map")) return null;
  const faceId = quotient.faces[0]?.id ?? "qF0";
  const mainEdgeId = quotient.edges[0]?.id ?? "qE0";
  const edgeCurves: Record<string, Vec3[]> = {};

  for (const edge of quotient.edges) {
    const phase = quotient.edges.indexOf(edge);
    edgeCurves[edge.id] = sampleCurve((t) => dunceMapPoint((t + phase * 0.08) * Math.PI * 2, 0.08), 180, true);
  }

  // Keep the three source-edge tracks visible on the same loop to mimic a, a^-1, a attachment.
  edgeCurves["a/dunce-red"] = sampleCurve((t) => dunceMapPoint(t * Math.PI * 2, 0.03), 170, true);
  edgeCurves["a/dunce-blue"] = sampleCurve((t) => dunceMapPoint((1 - t) * Math.PI * 2 + 0.22, 0.09), 170, true);
  edgeCurves["a/dunce-green"] = sampleCurve((t) => dunceMapPoint((t + 0.37) * Math.PI * 2, 0.15), 170, true);
  edgeCurves.dunce_vertex_track = sampleCurve((t) => dunceMapPoint(0.24 * Math.PI + t * Math.PI * 2, 0.16), 130, true);

  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    if (index === 0) {
      vertexPositions[vertex.id] = dunceMapPoint(0.24 * Math.PI, 0.1);
      return;
    }
    const t = (Math.PI * 2 * index) / Math.max(2, quotient.vertices.length);
    vertexPositions[vertex.id] = dunceMapPoint(t, 0.12 + 0.06 * Math.sin(index));
  });

  if (vertexPositions[quotient.vertices[0]?.id ?? ""]) {
    edgeCurves[mainEdgeId] = sampleCurve((t) => dunceMapPoint(t * Math.PI * 2, 0.1), 190, true);
  }

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/dunce-map-smooth`,
    name: "Dunce map smooth realization (a a^-1 a)",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildDunceMapFaceMesh(faceId),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#f3f4f6",
      edgeStroke: "#0f172a",
      seamStroke: "#be123c",
      singularityColor: "#111827",
    },
  };
};

const buildSpherePresetRealization = (quotient: QuotientComplex): Realization3D | null => {
  if (!isPresetQuotient(quotient, "preset/sphere-boundary-contraction")) return null;
  const faceId = quotient.faces[0]?.id ?? "qF0";
  const edgeCurves: Record<string, Vec3[]> = {};
  for (const edge of quotient.edges) {
    const token = edgePrimaryLabel(edge.label);
    if (token === "s") {
      edgeCurves[edge.id] = sampleCurve((t) => sphereSurfacePoint(Math.PI * 0.5, t * Math.PI * 2), 170, true);
      continue;
    }
    const phase = quotient.edges.indexOf(edge);
    edgeCurves[edge.id] = sampleCurve((t) => sphereSurfacePoint(Math.PI * (0.25 + 0.5 * Math.abs(Math.sin((phase + 1) * 1.1))), t * Math.PI * 2), 130, true);
  }
  edgeCurves.sphere_equator = sampleCurve((t) => sphereSurfacePoint(Math.PI * 0.5, t * Math.PI * 2), 170, true);

  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    const u = ((index % 3) + 1) * (Math.PI / 4);
    const v = (Math.PI * 2 * index) / Math.max(2, quotient.vertices.length);
    vertexPositions[vertex.id] = sphereSurfacePoint(u, v);
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/sphere-smooth`,
    name: "Smooth sphere realization",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildSphereFaceMesh(faceId),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#dbeafe",
      edgeStroke: "#0f172a",
      seamStroke: "#be123c",
      singularityColor: "#b45309",
    },
  };
};

const buildSuspensionPresetRealization = (quotient: QuotientComplex): Realization3D | null => {
  if (!isPresetQuotient(quotient, "preset/suspension")) return null;
  const faceId = quotient.faces[0]?.id ?? "qF0";
  const edgeCurves: Record<string, Vec3[]> = {};
  for (const edge of quotient.edges) {
    const token = edgePrimaryLabel(edge.label);
    if (token === "a") {
      edgeCurves[edge.id] = sampleCurve((t) => suspensionPoint(t * Math.PI * 2, 0.24), 170, true);
      continue;
    }
    if (token === "b") {
      edgeCurves[edge.id] = sampleCurve((t) => suspensionPoint(t * Math.PI * 2, -0.24), 170, true);
      continue;
    }
    const phase = quotient.edges.indexOf(edge);
    edgeCurves[edge.id] = sampleCurve((t) => suspensionPoint(t * Math.PI * 2, Math.sin((phase + 1) * 0.7) * 0.7), 140, true);
  }
  edgeCurves.suspension_equator = sampleCurve((t) => suspensionPoint(t * Math.PI * 2, 0), 170, true);

  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    if (index === 0) {
      vertexPositions[vertex.id] = [0, 0, SUSPENSION_HALF_HEIGHT];
      return;
    }
    if (index === 1) {
      vertexPositions[vertex.id] = [0, 0, -SUSPENSION_HALF_HEIGHT];
      return;
    }
    const t = (Math.PI * 2 * index) / Math.max(2, quotient.vertices.length);
    vertexPositions[vertex.id] = suspensionPoint(t, 0);
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/suspension-bicone`,
    name: "Suspension-style bicone realization",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildSuspensionFaceMesh(faceId),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#ede9fe",
      edgeStroke: "#0f172a",
      seamStroke: "#be123c",
      singularityColor: "#b45309",
    },
  };
};

const buildMobiusBoundaryCurve = (): Vec3[] => {
  const points: Vec3[] = [];
  const samples = 200;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    if (t <= 0.5) {
      const local = t * 2;
      points.push(mobiusPoint(local * Math.PI * 2, MOBIUS_HALF_WIDTH));
    } else {
      const local = (t - 0.5) * 2;
      points.push(mobiusPoint((1 - local) * Math.PI * 2, -MOBIUS_HALF_WIDTH));
    }
  }
  return points;
};

const buildMobiusRealizationBase = (
  quotient: QuotientComplex,
  kind: "smooth" | "cut-open"
): Realization3D | null => {
  if (!isMobiusLikeQuotient(quotient)) return null;
  const faceId = quotient.faces[0]?.id ?? "qF0";
  const edgeCurves: Record<string, Vec3[]> = {};
  const aEdgeId =
    quotient.edges.find((edge) => edge.sourceEdgeIds.length >= 2 && edgePrimaryLabel(edge.label) === "a")?.id ??
    quotient.edges[0]?.id ??
    "qE0";
  const boundaryEdges = quotient.edges.filter(
    (edge) =>
      edge.sourceEdgeIds.length === 1 &&
      edge.sourceEdgeIds[0] &&
      !edge.sourceEdgeIds[0].startsWith("sd_") &&
      !edgePrimaryLabel(edge.label).startsWith("qe")
  );

  for (const edge of quotient.edges) {
    if (edge.id === aEdgeId) {
      edgeCurves[edge.id] = sampleCurve((t) => mobiusPoint(t * Math.PI * 2, 0.15), 180, true);
      continue;
    }
    const boundaryIndex = boundaryEdges.findIndex((entry) => entry.id === edge.id);
    if (boundaryIndex >= 0) {
      const side = boundaryIndex % 2 === 0 ? 1 : -1;
      const offset = boundaryIndex > 1 ? boundaryIndex * 0.17 : 0;
      edgeCurves[edge.id] = sampleCurve((t) => mobiusPoint((t + offset) * Math.PI * 2, side * MOBIUS_HALF_WIDTH), 120, true);
      continue;
    }
    const phase = quotient.edges.indexOf(edge);
    edgeCurves[edge.id] = sampleCurve(
      (t) => mobiusPoint(t * Math.PI * 2, 0.08 + 0.2 * Math.sin((phase + 1) * Math.PI * 0.25)),
      110,
      true
    );
  }

  edgeCurves.mobius_boundary = buildMobiusBoundaryCurve();
  edgeCurves.mobius_core = sampleCurve((t) => mobiusPoint(t * Math.PI * 2, 0), 190, true);
  edgeCurves.mobius_orient_track = sampleCurve((t) => mobiusPoint(t * Math.PI * 2, 0.05), 170, true);
  edgeCurves.mobius_orient_track_iconografic = edgeCurves.mobius_orient_track;
  edgeCurves.mobius_orient_track_user5 = sampleCurve((t) => mobiusPoint(t * Math.PI * 2, -0.05), 170, true);

  const startFrame = mobiusFrame(0, 0);
  const endFrame = mobiusFrame(Math.PI * 2, 0);
  const startNormalTip = add(startFrame.point, scale(startFrame.normal, 0.38));
  const endNormalTip = add(endFrame.point, scale(endFrame.normal, 0.38));
  edgeCurves.mobius_orient_normal_start = [startFrame.point, startNormalTip];
  edgeCurves.mobius_orient_normal_end = [endFrame.point, endNormalTip];
  edgeCurves.mobius_orient_normal_start_iconografic = edgeCurves.mobius_orient_normal_start;
  edgeCurves.mobius_orient_normal_end_iconografic = edgeCurves.mobius_orient_normal_end;
  edgeCurves.mobius_orient_normal_start_user5 = [startFrame.point, sub(startFrame.point, scale(startFrame.normal, 0.38))];
  edgeCurves.mobius_orient_normal_end_user5 = [endFrame.point, sub(endFrame.point, scale(endFrame.normal, 0.38))];

  if (kind === "cut-open") {
    edgeCurves.mobius_cut = sampleCurve((t) => mobiusPoint(t * Math.PI * 2, 0), 160, false);
  }

  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    if (index === 0) {
      vertexPositions[vertex.id] = mobiusPoint(0, MOBIUS_HALF_WIDTH);
      return;
    }
    const angle = (Math.PI * 2 * index) / Math.max(2, quotient.vertices.length);
    vertexPositions[vertex.id] = mobiusPoint(angle, -MOBIUS_HALF_WIDTH * 0.75);
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/mobius-${kind}`,
    name: kind === "smooth" ? "Smooth Möbius realization" : "Cut-open Möbius model",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildMobiusFaceMesh(faceId, kind),
    seams,
    singularityMarkers,
    style: {
      faceFill: kind === "smooth" ? "#dcfce7" : "#ecfeff",
      edgeStroke: "#0f172a",
      seamStroke: "#be123c",
      singularityColor: "#b45309",
    },
  };
};

export const buildDefaultRealization = (quotient: QuotientComplex): Realization3D => {
  const layout = vertexLayout(quotient.vertices.length);
  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    vertexPositions[vertex.id] = layout[index] ?? [0, 0, 0];
  });

  const loopCountByVertex: Record<string, number> = {};
  const edgeCurves: Record<string, Vec3[]> = {};
  quotient.edges.forEach((edge, index) => {
    const from = vertexPositions[edge.endpointVertexIds[0]] ?? [0, 0, 0];
    const to = vertexPositions[edge.endpointVertexIds[1]] ?? [0, 0, 0];
    if (edge.endpointVertexIds[0] === edge.endpointVertexIds[1]) {
      const loopIndex = loopCountByVertex[edge.endpointVertexIds[0]] ?? 0;
      loopCountByVertex[edge.endpointVertexIds[0]] = loopIndex + 1;
      edgeCurves[edge.id] = makeLoopCurve(from, loopIndex);
      return;
    }
    edgeCurves[edge.id] = makeArcCurve(from, to, index);
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/default`,
    name: "Default immersed realization",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildFaceMesh(quotient, edgeCurves),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#dbeafe",
      edgeStroke: "#0f172a",
      seamStroke: "#be123c",
      singularityColor: "#b45309",
    },
  };
};

export const buildFlatSchematicRealization = (quotient: QuotientComplex): Realization3D => {
  const vertexPositions: Record<string, Vec3> = {};
  const count = quotient.vertices.length;
  quotient.vertices.forEach((vertex, index) => {
    if (count <= 1) {
      vertexPositions[vertex.id] = [0, 0, 0];
      return;
    }
    const angle = (Math.PI * 2 * index) / count;
    vertexPositions[vertex.id] = [1.7 * Math.cos(angle), 1.25 * Math.sin(angle), 0];
  });

  const edgeCurves: Record<string, Vec3[]> = {};
  let loopIndex = 0;
  for (const edge of quotient.edges) {
    const from = vertexPositions[edge.endpointVertexIds[0]] ?? [0, 0, 0];
    const to = vertexPositions[edge.endpointVertexIds[1]] ?? [0, 0, 0];
    if (edge.endpointVertexIds[0] === edge.endpointVertexIds[1]) {
      edgeCurves[edge.id] = makeLoopCurve(from, loopIndex);
      loopIndex += 1;
      continue;
    }
    edgeCurves[edge.id] = [from, to];
  }

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/flat`,
    name: "Flat schematic realization",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildFaceMesh(quotient, edgeCurves),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#ede9fe",
      edgeStroke: "#312e81",
      seamStroke: "#be123c",
      singularityColor: "#a16207",
    },
  };
};

export const buildRealizationChoices = (
  quotient: QuotientComplex,
  relations?: OrientationRelation[]
): Realization3D[] => {
  const cylinderPreset = buildCylinderPresetRealization(quotient);
  const conePreset = buildConePresetRealization(quotient);
  const dunceMapPreset = buildDunceMapPresetRealization(quotient);
  const spherePreset = buildSpherePresetRealization(quotient);
  const suspensionPreset = buildSuspensionPresetRealization(quotient);
  const kleinImmersed = buildKleinImmersedRealization(quotient, relations);
  const projectiveImmersed = buildProjectiveImmersedRealization(quotient, relations);
  const mobiusSmooth = buildMobiusRealizationBase(quotient, "smooth");
  const mobiusCutOpen = buildMobiusRealizationBase(quotient, "cut-open");
  const smooth = buildTorusRealizationBase(quotient, "smooth", relations);
  const cutOpen = buildTorusRealizationBase(quotient, "cut-open", relations);
  return [
    ...(cylinderPreset ? [cylinderPreset] : []),
    ...(conePreset ? [conePreset] : []),
    ...(dunceMapPreset ? [dunceMapPreset] : []),
    ...(spherePreset ? [spherePreset] : []),
    ...(suspensionPreset ? [suspensionPreset] : []),
    ...(kleinImmersed ? [kleinImmersed] : []),
    ...(projectiveImmersed ? [projectiveImmersed] : []),
    ...(mobiusSmooth ? [mobiusSmooth] : []),
    ...(mobiusCutOpen ? [mobiusCutOpen] : []),
    ...(smooth ? [smooth] : []),
    ...(cutOpen ? [cutOpen] : []),
    buildDefaultRealization(quotient),
    buildFlatSchematicRealization(quotient),
  ];
};
