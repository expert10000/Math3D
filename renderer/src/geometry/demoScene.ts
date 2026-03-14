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
