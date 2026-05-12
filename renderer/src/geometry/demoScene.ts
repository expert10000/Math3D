import type { GeometryScene, Line3, Plane3, Point3, Segment3 } from "./types";
import {
  angleBisectorLine,
  buildCircleSegments,
  lineFromPointDir,
  lineLineIntersectionCoplanar,
  linePlaneIntersection,
  lineThroughPoints,
  planeThroughPoints,
  triangleIncenter,
} from "./construct";
import { buildPolyhedronFromVertexSets, type FaceInfo } from "./polyhedra";
import {
  constraintAngleBetweenLines,
  constraintCoplanar,
  constraintEqualAngles,
  constraintEqualDistancesToLines,
  constraintLineIntersection,
  constraintPointOnPlane,
  distancePointToLine,
  distancePointToPlane,
  type ConstraintDef,
} from "./analysis";
import { addVec3, distanceVec3, dotVec3, normalizeVec3, scaleVec3, subVec3 } from "./vec";

const pt = (x: number, y: number, z: number, label: string, color?: number): Point3 => ({ x, y, z, label, color });

export type GeometryDemo = {
  scene: GeometryScene;
  constraints: ConstraintDef[];
  points: Record<string, Point3>;
  faces: FaceInfo[];
  faceIncenters: FaceIncenter[];
  incenterPlaneCheck: IncenterPlaneCheck | null;
  faceIncenterTolerance: number;
};

export type FaceIncenter = {
  faceId: string;
  label: string;
  vertices: [Point3, Point3, Point3];
  incenter: Point3 | null;
  radius: number | null;
  bisector: Line3 | null;
  residual: number | null;
};

export type IncenterPlaneCheck = {
  plane: Plane3 | null;
  distance: number | null;
  tolerance: number;
  status: "ok" | "fail" | "invalid";
  targetFaceId: string;
};

export type PlanimetryCircle = {
  id: string;
  label: string;
  center: Point3;
  radius: number;
};

export type PlanimetryDemo = {
  scene: GeometryScene;
  constraints: ConstraintDef[];
  points: Record<string, Point3>;
  circles: PlanimetryCircle[];
  stages?: Array<{
    id: string;
    label: string;
    summary: string;
    scene: GeometryScene;
  }>;
  theoremCheck?: {
    dotResidual: number | null;
    isVerified: boolean;
  };
};

export const buildDemoPyramidConstruction = (): GeometryDemo => {
  const A = pt(-1.0, -1.0, 0, "A");
  const B = pt(1.0, -1.0, 0, "B");
  const C = pt(1.0, 1.0, 0, "C");
  const D = pt(-1.0, 1.0, 0, "D");
  const S = pt(0, 0, 1.6, "S", 0x7c3aed);

  const vertexMap = { A, B, C, D, S };
  const { polyhedron: pyramid, faceInfo } = buildPolyhedronFromVertexSets({
    vertices: vertexMap,
    faces: [
      { id: "base", label: "ABCD", vertices: ["A", "B", "C", "D"], opacity: 0.22, color: 0x5c7cfa },
      { id: "abs", label: "ABS", vertices: ["A", "B", "S"], opacity: 0.35 },
      { id: "bcs", label: "BCS", vertices: ["B", "C", "S"], opacity: 0.35 },
      { id: "cds", label: "CDS", vertices: ["C", "D", "S"], opacity: 0.35 },
      { id: "das", label: "DAS", vertices: ["D", "A", "S"], opacity: 0.35 },
    ],
  });

  const basePlane = planeThroughPoints(A, B, C, { color: 0x3b82f6, opacity: 0.12 });
  const sidePlane = planeThroughPoints(B, C, S, { color: 0xf59e0b, opacity: 0.08 });

  const diagAC = lineThroughPoints(A, C, { color: 0xf59e0b, opacity: 0.7 });
  const diagBD = lineThroughPoints(B, D, { color: 0xf59e0b, opacity: 0.7 });
  const diagIntersection = diagAC && diagBD ? lineLineIntersectionCoplanar(diagAC, diagBD) : null;
  const O = diagIntersection
    ? ({ ...diagIntersection.point, label: "O", color: 0xf59e0b } as Point3)
    : null;

  const bisectorB = angleBisectorLine(B, A, C, { color: 0x16a34a, opacity: 0.85, length: 2.3 });
  const bisectorC = angleBisectorLine(C, B, A, { color: 0x16a34a, opacity: 0.85, length: 2.0 });

  const incenter = triangleIncenter(A, B, C);
  const I = incenter ? ({ ...incenter.center, label: "I", color: 0x1d4ed8 } as Point3) : null;
  const baseIncircleSegments = incenter
    ? buildCircleSegments(incenter.center, incenter.normal, incenter.radius, {
        color: 0x1d4ed8,
        opacity: 0.8,
        segments: 48,
      })
    : [];

  const normalLine = basePlane ? lineFromPointDir(S, basePlane.normal, { color: 0x2563eb, opacity: 0.8 }) : null;
  const foot = basePlane && normalLine ? linePlaneIntersection(normalLine, basePlane) : null;
  const H = foot ? ({ ...foot.point, label: "H", color: 0x2563eb } as Point3) : null;

  const dropSegment: Segment3[] =
    H && Number.isFinite(H.x)
      ? [
          {
            a: S,
            b: H,
            color: 0x2563eb,
            opacity: 0.7,
          },
        ]
      : [];

  const faceSpecs: { id: string; label: string; verts: [Point3, Point3, Point3] }[] = [
    { id: "abs", label: "ABS", verts: [A, B, S] },
    { id: "bcs", label: "BCS", verts: [B, C, S] },
    { id: "cds", label: "CDS", verts: [C, D, S] },
    { id: "das", label: "DAS", verts: [D, A, S] },
  ];
  const faceIncenterTolerance = 1e-3;
  const faceIncenters: FaceIncenter[] = [];
  const faceIncircleSegments: Segment3[] = [];
  const bisectorLines: Line3[] = [];
  const incenterPoints: Point3[] = [];

  for (const face of faceSpecs) {
    const [p1, p2, p3] = face.verts;
    const incenter = triangleIncenter(p1, p2, p3);
    const label = `I_${face.label}`;
    const incenterPoint: Point3 | null = incenter
      ? { ...incenter.center, label, color: 0x16a34a, size: 0.03 }
      : null;
    let residual: number | null = null;
    if (incenterPoint) {
      const line12 = lineThroughPoints(p1, p2);
      const line23 = lineThroughPoints(p2, p3);
      const line31 = lineThroughPoints(p3, p1);
      if (line12 && line23 && line31) {
        const d1 = distancePointToLine(incenterPoint, line12);
        const d2 = distancePointToLine(incenterPoint, line23);
        const d3 = distancePointToLine(incenterPoint, line31);
        if (d1 != null && d2 != null && d3 != null) {
          const min = Math.min(d1, d2, d3);
          const max = Math.max(d1, d2, d3);
          residual = max - min;
        }
      }
    }
    if (incenterPoint) {
      incenterPoints.push(incenterPoint);
      faceIncircleSegments.push(
        ...buildCircleSegments(incenter.center, incenter.normal, incenter.radius, {
          color: 0x16a34a,
          opacity: 0.55,
          segments: 36,
        })
      );
    }
    const bisector = angleBisectorLine(S, p1, p2, {
      color: 0x0ea5e9,
      opacity: 0.7,
      length: 1.1,
    });
    if (bisector) bisectorLines.push(bisector);
    faceIncenters.push({
      faceId: face.id,
      label: face.label,
      vertices: face.verts,
      incenter: incenterPoint,
      radius: incenter ? incenter.radius : null,
      bisector: bisector ?? null,
      residual,
    });
  }

  const lines: Line3[] = [];
  if (diagAC) lines.push(diagAC);
  if (diagBD) lines.push(diagBD);
  if (bisectorB) lines.push(bisectorB);
  if (bisectorC) lines.push(bisectorC);
  if (normalLine) lines.push(normalLine);
  lines.push(...bisectorLines);
  for (const face of faceInfo) {
    if (!face.normal) continue;
    const line = lineFromPointDir(face.centroid, face.normal, {
      color: 0x9333ea,
      opacity: 0.7,
      length: 0.6,
    });
    if (line) lines.push(line);
  }

  const planes: Plane3[] = [];
  if (basePlane) planes.push(basePlane);
  if (sidePlane) planes.push(sidePlane);

  const points: Point3[] = [A, B, C, D, S];
  if (O) points.push(O);
  if (I) points.push(I);
  if (H) points.push(H);

  const segments: Segment3[] = [...baseIncircleSegments, ...faceIncircleSegments, ...dropSegment];

  const constraints: ConstraintDef[] = [];
  constraints.push(constraintCoplanar("base-coplanar", "A,B,C,D coplanar", [A, B, C, D], 1e-4));
  if (basePlane && O) {
    constraints.push(constraintPointOnPlane("O-on-plane", "O on base plane", O, basePlane, 1e-4));
  }
  if (basePlane) {
    const minApexHeight = 0.25;
    constraints.push({
      id: "S-above-plane",
      label: "S above base plane",
      tolerance: 0,
      unit: "unit",
      residual: () => {
        const d = distancePointToPlane(S, basePlane);
        if (d == null) return null;
        return Math.max(0, minApexHeight - d);
      },
    });
  }
  if (diagAC && diagBD) {
    constraints.push(constraintLineIntersection("diag-intersect", "AC intersects BD", diagAC, diagBD, 1e-4));
  }
  if (I) {
    const lineAB = lineThroughPoints(A, B);
    const lineBC = lineThroughPoints(B, C);
    const lineCA = lineThroughPoints(C, A);
    if (lineAB && lineBC && lineCA) {
      constraints.push(
        constraintEqualDistancesToLines(
          "incenter",
          "Incenter equidistant to AB, BC, CA",
          I,
          [lineAB, lineBC, lineCA],
          1e-3
        )
      );
    }
  }
  if (bisectorB) {
    const lineBA = lineThroughPoints(B, A);
    const lineBC = lineThroughPoints(B, C);
    if (lineBA && lineBC) {
      constraints.push(
        constraintEqualAngles("bisector-b", "Bisector splits angle ABC", bisectorB, lineBA, lineBC, 0.5)
      );
    }
  }

  const incenterPlaneCheckTolerance = 1e-3;
  let incenterPlaneCheck: IncenterPlaneCheck | null = null;
  const incA = faceIncenters.find((f) => f.faceId === "abs")?.incenter;
  const incB = faceIncenters.find((f) => f.faceId === "bcs")?.incenter;
  const incC = faceIncenters.find((f) => f.faceId === "cds")?.incenter;
  const incTarget = faceIncenters.find((f) => f.faceId === "das")?.incenter;
  if (incA && incB && incC) {
    const plane = planeThroughPoints(incA, incB, incC, { color: 0x7c3aed, opacity: 0.08 });
    if (plane) planes.push({ ...plane, size: 2.2 });
    const distance = plane && incTarget ? distancePointToPlane(incTarget, plane) : null;
    const status =
      distance == null ? "invalid" : distance <= incenterPlaneCheckTolerance ? "ok" : "fail";
    incenterPlaneCheck = {
      plane: plane ?? null,
      distance,
      tolerance: incenterPlaneCheckTolerance,
      status,
      targetFaceId: "das",
    };
    if (plane && incTarget) {
      constraints.push(
        constraintPointOnPlane(
          "incenter-plane",
          "Incenter DAS on incenter plane (ABS/BCS/CDS)",
          incTarget,
          plane,
          incenterPlaneCheckTolerance
        )
      );
    }
  }

  const scene: GeometryScene = {
    points: [...points, ...incenterPoints],
    lines,
    planes,
    segments,
    polyhedra: [pyramid],
  };

  return {
    scene,
    constraints,
    points: { A, B, C, D, S },
    faces: faceInfo,
    faceIncenters,
    incenterPlaneCheck,
    faceIncenterTolerance,
  };
};

export const buildDemoPyramidScene = (): GeometryScene => buildDemoPyramidConstruction().scene;

const circumcenterCoplanar = (a: Point3, b: Point3, c: Point3): { center: Point3; radius: number } | null => {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const cx = c.x;
  const cy = c.y;
  const det = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const aSq = ax * ax + ay * ay;
  const bSq = bx * bx + by * by;
  const cSq = cx * cx + cy * cy;
  const ux = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / det;
  const uy = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / det;
  const center: Point3 = { x: ux, y: uy, z: 0, label: "O", color: 0xd97706 };
  const radius = distanceVec3(center, a);
  if (!Number.isFinite(radius) || radius <= 1e-9) return null;
  return { center, radius };
};

export const buildDemoPlanimetryConstruction = (): PlanimetryDemo => {
  const A = pt(-1.35, -0.65, 0, "A", 0xef4444);
  const B = pt(1.45, -0.72, 0, "B", 0xef4444);
  const C = pt(0.15, 1.32, 0, "C", 0xef4444);

  const AB = lineThroughPoints(A, B, { color: 0x64748b, opacity: 0.7, length: 5.2 });
  const BC = lineThroughPoints(B, C, { color: 0x64748b, opacity: 0.7, length: 5.2 });
  const CA = lineThroughPoints(C, A, { color: 0x64748b, opacity: 0.7, length: 5.2 });

  const incenter = triangleIncenter(A, B, C);
  const I = incenter
    ? ({ ...incenter.center, z: 0, label: "I", color: 0x1d4ed8, size: 0.045 } as Point3)
    : null;
  const incircle = incenter
    ? buildCircleSegments({ ...incenter.center, z: 0 }, { x: 0, y: 0, z: 1 }, incenter.radius, {
        segments: 72,
        color: 0x1d4ed8,
        opacity: 0.85,
      })
    : [];

  const circum = circumcenterCoplanar(A, B, C);
  const O = circum
    ? ({ ...circum.center, label: "O", color: 0xd97706, size: 0.043 } as Point3)
    : null;
  const circumcircle = circum
    ? buildCircleSegments(circum.center, { x: 0, y: 0, z: 1 }, circum.radius, {
        segments: 88,
        color: 0xf59e0b,
        opacity: 0.76,
      })
    : [];

  const bisectorA = angleBisectorLine(A, B, C, { color: 0x16a34a, opacity: 0.8, length: 2.8 });
  const bisectorB = angleBisectorLine(B, C, A, { color: 0x16a34a, opacity: 0.8, length: 2.8 });
  const medianAEnd: Point3 = { x: 0.5 * (B.x + C.x), y: 0.5 * (B.y + C.y), z: 0, label: "M_a", color: 0x7c3aed };
  const medianA: Segment3 = { a: A, b: medianAEnd, color: 0x7c3aed, opacity: 0.72 };

  const constraints: ConstraintDef[] = [];
  if (I && AB && BC && CA) {
    constraints.push(
      constraintEqualDistancesToLines("planimetry-incenter", "I is equidistant from AB, BC, CA", I, [AB, BC, CA], 1e-3)
    );
  }
  if (O) {
    constraints.push({
      id: "planimetry-circumcenter",
      label: "O has equal distance to A, B, C",
      tolerance: 1e-3,
      unit: "unit",
      residual: () => {
        const da = distanceVec3(O, A);
        const db = distanceVec3(O, B);
        const dc = distanceVec3(O, C);
        if (!Number.isFinite(da) || !Number.isFinite(db) || !Number.isFinite(dc)) return null;
        return Math.max(da, db, dc) - Math.min(da, db, dc);
      },
    });
  }
  if (bisectorA && AB && CA) {
    constraints.push(
      constraintEqualAngles("planimetry-bisector-A", "Bisector at A splits angle BAC", bisectorA, AB, CA, 0.5)
    );
  }

  const scene: GeometryScene = {
    points: [A, B, C, ...(I ? [I] : []), ...(O ? [O] : []), medianAEnd],
    lines: [AB, BC, CA, bisectorA, bisectorB].filter((line): line is Line3 => !!line),
    segments: [
      { a: A, b: B, color: 0x334155, opacity: 0.92 },
      { a: B, b: C, color: 0x334155, opacity: 0.92 },
      { a: C, b: A, color: 0x334155, opacity: 0.92 },
      medianA,
      ...incircle,
      ...circumcircle,
    ],
    polygons: [
      {
        id: "abc",
        label: "Triangle ABC",
        vertices: [A, B, C],
        color: 0x93c5fd,
        opacity: 0.12,
      },
    ],
  };

  const circles: PlanimetryCircle[] = [];
  if (incenter) circles.push({ id: "incircle", label: "Incircle (I)", center: { ...incenter.center, z: 0 }, radius: incenter.radius });
  if (circum) circles.push({ id: "circumcircle", label: "Circumcircle (O)", center: circum.center, radius: circum.radius });

  return {
    scene,
    constraints,
    points: { A, B, C, ...(I ? { I } : {}), ...(O ? { O } : {}), M_a: medianAEnd },
    circles,
  };
};

export const buildDemoPlanimetryEulerConstruction = (): PlanimetryDemo => {
  const A = pt(-1.2, -0.75, 0, "A", 0xef4444);
  const B = pt(1.55, -0.58, 0, "B", 0xef4444);
  const C = pt(0.22, 1.45, 0, "C", 0xef4444);
  const OData = circumcenterCoplanar(A, B, C);
  const O = OData ? ({ ...OData.center, label: "O", color: 0xd97706, size: 0.045 } as Point3) : null;
  const G: Point3 = {
    x: (A.x + B.x + C.x) / 3,
    y: (A.y + B.y + C.y) / 3,
    z: 0,
    label: "G",
    color: 0x2563eb,
    size: 0.045,
  };
  const H = O
    ? ({
        x: A.x + B.x + C.x - 2 * O.x,
        y: A.y + B.y + C.y - 2 * O.y,
        z: 0,
        label: "H",
        color: 0x16a34a,
        size: 0.045,
      } as Point3)
    : null;
  const AB = lineThroughPoints(A, B, { color: 0x64748b, opacity: 0.7, length: 5.2 });
  const BC = lineThroughPoints(B, C, { color: 0x64748b, opacity: 0.7, length: 5.2 });
  const CA = lineThroughPoints(C, A, { color: 0x64748b, opacity: 0.7, length: 5.2 });
  const euler = O && H ? lineThroughPoints(O, H, { color: 0x7c3aed, opacity: 0.88, length: 6.2 }) : null;
  const circumcircle =
    OData && Number.isFinite(OData.radius)
      ? buildCircleSegments(OData.center, { x: 0, y: 0, z: 1 }, OData.radius, {
          segments: 92,
          color: 0xf59e0b,
          opacity: 0.65,
        })
      : [];

  const constraints: ConstraintDef[] = [];
  if (O && H) {
    const oh = lineThroughPoints(O, H);
    constraints.push({
      id: "euler-collinear",
      label: "O, G, H are collinear (Euler line)",
      tolerance: 1e-3,
      unit: "unit",
      residual: () => (oh ? distancePointToLine(G, oh) : null),
    });
    constraints.push({
      id: "euler-ratio",
      label: "OG : GH = 1 : 2",
      tolerance: 1e-3,
      unit: "unit",
      residual: () => {
        const og = distanceVec3(O, G);
        const gh = distanceVec3(G, H);
        if (!Number.isFinite(og) || !Number.isFinite(gh)) return null;
        return Math.abs(2 * og - gh);
      },
    });
  }

  const scene: GeometryScene = {
    points: [A, B, C, G, ...(O ? [O] : []), ...(H ? [H] : [])],
    lines: [AB, BC, CA, euler].filter((line): line is Line3 => !!line),
    segments: [
      { a: A, b: B, color: 0x334155, opacity: 0.92 },
      { a: B, b: C, color: 0x334155, opacity: 0.92 },
      { a: C, b: A, color: 0x334155, opacity: 0.92 },
      ...(O && H ? [{ a: O, b: H, color: 0x7c3aed, opacity: 0.9 }] : []),
      ...(O ? [{ a: A, b: O, color: 0xd97706, opacity: 0.6 }] : []),
      ...(O ? [{ a: B, b: O, color: 0xd97706, opacity: 0.6 }] : []),
      ...(O ? [{ a: C, b: O, color: 0xd97706, opacity: 0.6 }] : []),
      ...circumcircle,
    ],
    polygons: [
      {
        id: "abc",
        label: "Triangle ABC",
        vertices: [A, B, C],
        color: 0xc4b5fd,
        opacity: 0.1,
      },
    ],
  };

  const circles: PlanimetryCircle[] = [];
  if (OData) circles.push({ id: "circumcircle", label: "Circumcircle (O)", center: OData.center, radius: OData.radius });

  return {
    scene,
    constraints,
    points: { A, B, C, G, ...(O ? { O } : {}), ...(H ? { H } : {}) },
    circles,
  };
};

export const buildDemoPlanimetryTangentCirclesConstruction = (): PlanimetryDemo => {
  const O1 = pt(-0.8, 0, 0, "O1", 0x2563eb);
  const O2 = pt(1.0, 0, 0, "O2", 0xd97706);
  const T = pt(0, 0, 0, "T", 0x16a34a);
  const r1 = 0.8;
  const r2 = 1.0;
  const c1 = buildCircleSegments(O1, { x: 0, y: 0, z: 1 }, r1, {
    segments: 96,
    color: 0x2563eb,
    opacity: 0.84,
  });
  const c2 = buildCircleSegments(O2, { x: 0, y: 0, z: 1 }, r2, {
    segments: 96,
    color: 0xd97706,
    opacity: 0.8,
  });
  const tangentLine = lineFromPointDir(T, { x: 0, y: 1, z: 0 }, { color: 0x64748b, opacity: 0.82, length: 6.2 });
  const centerLine = lineThroughPoints(O1, O2, { color: 0x16a34a, opacity: 0.7, length: 4.2 });
  const constraints: ConstraintDef[] = [
    {
      id: "tangent-center-distance",
      label: "|O1O2| = r1 + r2",
      tolerance: 1e-4,
      unit: "unit",
      residual: () => Math.abs(distanceVec3(O1, O2) - (r1 + r2)),
    },
    {
      id: "tangent-touch-1",
      label: "T lies on circle c1",
      tolerance: 1e-4,
      unit: "unit",
      residual: () => Math.abs(distanceVec3(T, O1) - r1),
    },
    {
      id: "tangent-touch-2",
      label: "T lies on circle c2",
      tolerance: 1e-4,
      unit: "unit",
      residual: () => Math.abs(distanceVec3(T, O2) - r2),
    },
  ];
  const scene: GeometryScene = {
    points: [O1, O2, T],
    lines: [tangentLine, centerLine].filter((line): line is Line3 => !!line),
    segments: [
      { a: O1, b: O2, color: 0x16a34a, opacity: 0.72 },
      { a: O1, b: T, color: 0x2563eb, opacity: 0.74 },
      { a: O2, b: T, color: 0xd97706, opacity: 0.74 },
      ...c1,
      ...c2,
    ],
  };
  const circles: PlanimetryCircle[] = [
    { id: "c1", label: "Circle c1", center: O1, radius: r1 },
    { id: "c2", label: "Circle c2", center: O2, radius: r2 },
  ];
  return {
    scene,
    constraints,
    points: { O1, O2, T },
    circles,
  };
};

const intersectLines2D = (a1: Point3, a2: Point3, b1: Point3, b2: Point3): Point3 | null => {
  const r = subVec3(a2, a1);
  const s = subVec3(b2, b1);
  const denom = r.x * s.y - r.y * s.x;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return null;
  const delta = subVec3(b1, a1);
  const t = (delta.x * s.y - delta.y * s.x) / denom;
  if (!Number.isFinite(t)) return null;
  return { x: a1.x + r.x * t, y: a1.y + r.y * t, z: 0 };
};

const projectPointToLine = (p: Point3, a: Point3, b: Point3): Point3 | null => {
  const ab = subVec3(b, a);
  const denom = dotVec3(ab, ab);
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return null;
  const t = dotVec3(subVec3(p, a), ab) / denom;
  if (!Number.isFinite(t)) return null;
  return addVec3(a, scaleVec3(ab, t));
};

const reflectPointAcrossLine = (p: Point3, a: Point3, b: Point3): Point3 | null => {
  const h = projectPointToLine(p, a, b);
  if (!h) return null;
  return subVec3(scaleVec3(h, 2), p);
};

const buildDashedSegment = (
  a: Point3,
  b: Point3,
  opts: { color?: number; opacity?: number; radiusScale?: number; dashCount?: number; gapRatio?: number } = {}
): Segment3[] => {
  const d = subVec3(b, a);
  const len = distanceVec3(a, b);
  if (!Number.isFinite(len) || len <= 1e-9) return [];
  const dir = scaleVec3(d, 1 / len);
  const dashCount = Math.max(2, Math.round(opts.dashCount ?? 7));
  const gapRatio = Math.max(0.05, Math.min(0.9, opts.gapRatio ?? 0.35));
  const slot = len / dashCount;
  const dashLen = slot * (1 - gapRatio);
  const segments: Segment3[] = [];
  for (let i = 0; i < dashCount; i++) {
    const start = addVec3(a, scaleVec3(dir, i * slot));
    const end = addVec3(start, scaleVec3(dir, dashLen));
    segments.push({
      a: { x: start.x, y: start.y, z: 0 },
      b: { x: end.x, y: end.y, z: 0 },
      color: opts.color,
      opacity: opts.opacity,
      radiusScale: opts.radiusScale,
    });
  }
  return segments;
};

const withStageScene = (
  points: Point3[],
  segments: Segment3[],
  polygons: GeometryScene["polygons"],
  lines?: Line3[]
): GeometryScene => ({
  points,
  segments,
  polygons,
  ...(lines && lines.length ? { lines } : {}),
});

export const buildDemoPlanimetryIncircleReflectionConstruction = (): PlanimetryDemo => {
  const A = pt(-0.35, 1.35, 0, "A", 0x111111);
  const B = pt(-1.0, 0.0, 0, "B", 0x111111);
  const C = pt(1.0, 0.0, 0, "C", 0x111111);

  const incenter = triangleIncenter(A, B, C);
  if (!incenter) {
    return {
      scene: { points: [A, B, C] },
      constraints: [],
      points: { A, B, C },
      circles: [],
    };
  }

  const I: Point3 = { ...incenter.center, z: 0, label: "I", color: 0x2563eb, size: 0.045 };
  const D = projectPointToLine(I, B, C);
  const E = projectPointToLine(I, C, A);
  const F = projectPointToLine(I, A, B);
  if (!D || !E || !F) {
    return {
      scene: { points: [A, B, C, I] },
      constraints: [],
      points: { A, B, C, I },
      circles: [{ id: "incircle", label: "Incircle (I)", center: I, radius: incenter.radius }],
    };
  }
  D.label = "D";
  E.label = "E";
  F.label = "F";
  D.color = 0xf97316;
  E.color = 0xf97316;
  F.color = 0xf97316;
  D.size = 0.045;
  E.size = 0.045;
  F.size = 0.045;

  const M: Point3 = { x: 0.5 * (B.x + C.x), y: 0.5 * (B.y + C.y), z: 0, label: "M", color: 0xf59e0b, size: 0.045 };

  const bc = subVec3(C, B);
  const bcUnit = normalizeVec3({ x: bc.x, y: bc.y, z: 0 });
  if (!bcUnit) {
    return {
      scene: { points: [A, B, C, I, D, E, F, M] },
      constraints: [],
      points: { A, B, C, I, D, E, F, M },
      circles: [{ id: "incircle", label: "Incircle (I)", center: I, radius: incenter.radius }],
    };
  }
  const bcPerp = { x: -bcUnit.y, y: bcUnit.x, z: 0 };

  const X = intersectLines2D(E, F, B, addVec3(B, bcPerp));
  const Y = intersectLines2D(E, F, C, addVec3(C, bcPerp));
  if (!X || !Y) {
    return {
      scene: { points: [A, B, C, I, D, E, F, M] },
      constraints: [],
      points: { A, B, C, I, D, E, F, M },
      circles: [{ id: "incircle", label: "Incircle (I)", center: I, radius: incenter.radius }],
    };
  }
  X.label = "X";
  X.color = 0x2563eb;
  X.size = 0.043;
  Y.label = "Y";
  Y.color = 0x2563eb;
  Y.size = 0.043;

  const Bprime = reflectPointAcrossLine(B, M, X);
  const Cprime = reflectPointAcrossLine(C, M, Y);
  if (!Bprime || !Cprime) {
    return {
      scene: { points: [A, B, C, I, D, E, F, M, X, Y] },
      constraints: [],
      points: { A, B, C, I, D, E, F, M, X, Y },
      circles: [{ id: "incircle", label: "Incircle (I)", center: I, radius: incenter.radius }],
    };
  }
  Bprime.label = "B'";
  Bprime.color = 0xdc2626;
  Bprime.size = 0.04;
  Cprime.label = "C'";
  Cprime.color = 0xdc2626;
  Cprime.size = 0.04;

  const Z = intersectLines2D(X, Bprime, Y, Cprime);
  if (!Z) {
    return {
      scene: { points: [A, B, C, I, D, E, F, M, X, Y, Bprime, Cprime] },
      constraints: [],
      points: { A, B, C, I, D, E, F, M, X, Y, B_prime: Bprime, C_prime: Cprime },
      circles: [{ id: "incircle", label: "Incircle (I)", center: I, radius: incenter.radius }],
    };
  }
  Z.label = "Z";
  Z.color = 0xdc2626;
  Z.size = 0.065;

  const lineBC = lineThroughPoints(B, C, { color: 0x111111, opacity: 0.75, length: 4.8 });
  const lineZD = lineThroughPoints(Z, D, { color: 0x16a34a, opacity: 0.9, length: 3.6 });
  const lineEF = lineThroughPoints(E, F, { color: 0x7c3aed, opacity: 0.88, length: 4.6 });
  const lineRefBX = lineThroughPoints(X, Bprime, { color: 0xdc2626, opacity: 0.88, length: 4.2 });
  const lineRefCY = lineThroughPoints(Y, Cprime, { color: 0xdc2626, opacity: 0.88, length: 4.2 });

  const incircle = buildCircleSegments({ ...incenter.center, z: 0 }, { x: 0, y: 0, z: 1 }, incenter.radius, {
    segments: 84,
    color: 0x60a5fa,
    opacity: 0.9,
  });

  const triangleEdges: Segment3[] = [
    { a: A, b: B, color: 0x111111, opacity: 0.95 },
    { a: B, b: C, color: 0x111111, opacity: 0.95 },
    { a: C, b: A, color: 0x111111, opacity: 0.95 },
  ];

  const lineEFSegment: Segment3 = { a: E, b: F, color: 0x7c3aed, opacity: 0.92, radiusScale: 1.15 };
  const bxDashed = buildDashedSegment(B, X, { color: 0x2563eb, opacity: 0.84, radiusScale: 0.95 });
  const cyDashed = buildDashedSegment(C, Y, { color: 0x2563eb, opacity: 0.84, radiusScale: 0.95 });
  const mxDashed = buildDashedSegment(M, X, { color: 0xf59e0b, opacity: 0.88, radiusScale: 0.95 });
  const myDashed = buildDashedSegment(M, Y, { color: 0xf59e0b, opacity: 0.88, radiusScale: 0.95 });

  const reflectedSegments: Segment3[] = [
    { a: X, b: Bprime, color: 0xdc2626, opacity: 0.92, radiusScale: 1.2 },
    { a: Y, b: Cprime, color: 0xdc2626, opacity: 0.92, radiusScale: 1.2 },
  ];

  const zdSegment: Segment3 = { a: Z, b: D, color: 0x16a34a, opacity: 0.95, radiusScale: 1.6 };

  const zdDir = normalizeVec3(subVec3(Z, D)) ?? { x: 0, y: 1, z: 0 };
  const markerSize = 0.12;
  const pU = addVec3(D, scaleVec3(bcUnit, markerSize));
  const pV = addVec3(D, scaleVec3(zdDir, markerSize));
  const pUV = addVec3(pU, scaleVec3(zdDir, markerSize));
  const rightAngleMarker: Segment3[] = [
    { a: D, b: pU, color: 0x16a34a, opacity: 0.95, radiusScale: 1.05 },
    { a: pU, b: pUV, color: 0x16a34a, opacity: 0.95, radiusScale: 1.05 },
    { a: pUV, b: pV, color: 0x16a34a, opacity: 0.95, radiusScale: 1.05 },
    { a: pV, b: D, color: 0x16a34a, opacity: 0.95, radiusScale: 1.05 },
  ];

  const theoremDotResidual = Math.abs(dotVec3(subVec3(Z, D), subVec3(C, B)));
  const abLen = distanceVec3(A, B);
  const acLen = distanceVec3(A, C);
  const abLtAcResidual = Math.max(0, abLen - acLen);

  const acuteResidual = (() => {
    const atA = dotVec3(subVec3(B, A), subVec3(C, A));
    const atB = dotVec3(subVec3(A, B), subVec3(C, B));
    const atC = dotVec3(subVec3(A, C), subVec3(B, C));
    const eps = 1e-9;
    return Math.max(0, eps - atA, eps - atB, eps - atC);
  })();

  const constraints: ConstraintDef[] = [
    {
      id: "tri_ab_lt_ac",
      label: "AB < AC",
      tolerance: 1e-9,
      unit: "unit",
      residual: () => abLtAcResidual,
    },
    {
      id: "tri_acute",
      label: "Triangle ABC is acute",
      tolerance: 1e-9,
      unit: "unit",
      residual: () => acuteResidual,
    },
    ...(lineBC && lineZD
      ? [constraintAngleBetweenLines("theorem_perp", "ZD perpendicular BC", lineZD, lineBC, 90, 0.06)]
      : []),
    {
      id: "theorem_dot",
      label: "|(Z-D) dot (C-B)| = 0",
      tolerance: 1e-6,
      unit: "unit",
      residual: () => theoremDotResidual,
    },
  ];

  const trianglePolygon: GeometryScene["polygons"] = [
    {
      id: "abc",
      label: "Triangle ABC",
      vertices: [A, B, C],
      color: 0xe2e8f0,
      opacity: 0.12,
    },
  ];

  const stage1 = withStageScene([A, B, C, I, D, E, F], [...triangleEdges, ...incircle], trianglePolygon);
  const stage2 = withStageScene(
    [A, B, C, I, D, E, F, X, Y],
    [...triangleEdges, ...incircle, lineEFSegment, ...bxDashed, ...cyDashed],
    trianglePolygon,
    lineEF ? [lineEF] : []
  );
  const stage3 = withStageScene(
    [A, B, C, I, D, E, F, M, X, Y],
    [...triangleEdges, ...incircle, lineEFSegment, ...bxDashed, ...cyDashed, ...mxDashed, ...myDashed],
    trianglePolygon,
    lineEF ? [lineEF] : []
  );
  const stage4 = withStageScene(
    [A, B, C, I, D, E, F, M, X, Y, Bprime, Cprime, Z],
    [
      ...triangleEdges,
      ...incircle,
      lineEFSegment,
      ...bxDashed,
      ...cyDashed,
      ...mxDashed,
      ...myDashed,
      ...reflectedSegments,
    ],
    trianglePolygon,
    [lineEF, lineRefBX, lineRefCY].filter((line): line is Line3 => !!line)
  );
  const stage5 = withStageScene(
    [A, B, C, I, D, E, F, M, X, Y, Bprime, Cprime, Z],
    [
      ...triangleEdges,
      ...incircle,
      lineEFSegment,
      ...bxDashed,
      ...cyDashed,
      ...mxDashed,
      ...myDashed,
      ...reflectedSegments,
      zdSegment,
      ...rightAngleMarker,
    ],
    trianglePolygon,
    [lineEF, lineRefBX, lineRefCY, lineZD].filter((line): line is Line3 => !!line)
  );

  return {
    scene: stage5,
    constraints,
    points: {
      A,
      B,
      C,
      I,
      D,
      E,
      F,
      M,
      X,
      Y,
      B_prime: Bprime,
      C_prime: Cprime,
      Z,
    },
    circles: [{ id: "incircle", label: "Incircle (I)", center: I, radius: incenter.radius }],
    stages: [
      { id: "stage1", label: "Stage 1", summary: "Triangle ABC, incircle, and tangency points D/E/F.", scene: stage1 },
      { id: "stage2", label: "Stage 2", summary: "Contact line EF and perpendiculars through B and C.", scene: stage2 },
      { id: "stage3", label: "Stage 3", summary: "Midpoint M and reflection axes MX and MY.", scene: stage3 },
      { id: "stage4", label: "Stage 4", summary: "Reflected lines XB' and YC' intersect at Z.", scene: stage4 },
      { id: "stage5", label: "Stage 5", summary: "Draw ZD and verify ZD ⟂ BC.", scene: stage5 },
    ],
    theoremCheck: {
      dotResidual: theoremDotResidual,
      isVerified: theoremDotResidual <= 1e-6,
    },
  };
};
