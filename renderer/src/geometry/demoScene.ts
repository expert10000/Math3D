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
  constraintCoplanar,
  constraintEqualAngles,
  constraintEqualDistancesToLines,
  constraintLineIntersection,
  constraintPointOnPlane,
  distancePointToLine,
  distancePointToPlane,
  type ConstraintDef,
} from "./analysis";
import { distanceVec3 } from "./vec";

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
