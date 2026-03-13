import type { Point3 } from "./types";
import {
  buildPointLabelSet,
  evaluateConstructionGraph,
  evaluateProblemAngles,
  evaluateProblemChecks,
  evaluateProblemDistances,
  type ConstructionNode,
  type ConstructionObjectSummary,
  type ProblemAngleResult,
  type ProblemCheckResult,
  type ProblemDistanceResult,
} from "./problemGraph";

export type OlympiadArcFreePoints = {
  A: Point3;
  B: Point3;
  C: Point3;
};

export const DEFAULT_OLYMPIAD_ARC_FREE_POINTS: OlympiadArcFreePoints = {
  A: { x: -0.2, y: 1.35, z: 0, label: "A", color: 0xef4444, size: 0.045 },
  B: { x: -1.4, y: -0.7, z: 0, label: "B", color: 0xef4444, size: 0.045 },
  C: { x: 1.6, y: -0.55, z: 0, label: "C", color: 0xef4444, size: 0.045 },
};

export type ProblemVisualizerResult = {
  id: string;
  name: string;
  description: string;
  freePoints: OlympiadArcFreePoints;
  scene: ReturnType<typeof evaluateConstructionGraph>["scene"];
  objects: ConstructionObjectSummary[];
  distances: ProblemDistanceResult[];
  angles: ProblemAngleResult[];
  checks: ProblemCheckResult[];
  errors: string[];
  labels: Array<{
    labels: Array<{
      text: string;
      position: { x: number; y: number; z: number };
      color?: number;
      size?: number;
      opacity?: number;
    }>;
    size?: number;
  }> | null;
};

const sanitizePoint = (p: Point3, fallback: Point3): Point3 => ({
  x: Number.isFinite(p.x) ? p.x : fallback.x,
  y: Number.isFinite(p.y) ? p.y : fallback.y,
  z: Number.isFinite(p.z) ? p.z : fallback.z,
  label: p.label ?? fallback.label,
  color: p.color ?? fallback.color,
  size: p.size ?? fallback.size,
  opacity: p.opacity ?? fallback.opacity,
});

const normalizeFreePoints = (input: Partial<OlympiadArcFreePoints>): OlympiadArcFreePoints => ({
  A: sanitizePoint(input.A ?? DEFAULT_OLYMPIAD_ARC_FREE_POINTS.A, DEFAULT_OLYMPIAD_ARC_FREE_POINTS.A),
  B: sanitizePoint(input.B ?? DEFAULT_OLYMPIAD_ARC_FREE_POINTS.B, DEFAULT_OLYMPIAD_ARC_FREE_POINTS.B),
  C: sanitizePoint(input.C ?? DEFAULT_OLYMPIAD_ARC_FREE_POINTS.C, DEFAULT_OLYMPIAD_ARC_FREE_POINTS.C),
});

export const buildOlympiadArcProblem = (
  freeInput: Partial<OlympiadArcFreePoints> = DEFAULT_OLYMPIAD_ARC_FREE_POINTS
): ProblemVisualizerResult => {
  const freePoints = normalizeFreePoints(freeInput);
  const graph: ConstructionNode[] = [
    { id: "A", type: "freePoint", label: "A", point: freePoints.A, style: { color: 0xef4444, size: 0.05 } },
    { id: "B", type: "freePoint", label: "B", point: freePoints.B, style: { color: 0xef4444, size: 0.05 } },
    { id: "C", type: "freePoint", label: "C", point: freePoints.C, style: { color: 0xef4444, size: 0.05 } },
    { id: "AB", type: "lineThroughPoints", label: "AB", a: "A", b: "B", style: { color: 0x6b7280, length: 6 } },
    { id: "AC", type: "lineThroughPoints", label: "AC", a: "A", b: "C", style: { color: 0x6b7280, length: 6 } },
    { id: "BC", type: "lineThroughPoints", label: "BC", a: "B", b: "C", style: { color: 0x6b7280, length: 6 } },
    { id: "O", type: "circumcenter", label: "O", a: "A", b: "B", c: "C", style: { color: 0xf59e0b, size: 0.045 } },
    {
      id: "Omega",
      type: "circleThrough3Points",
      label: "Omega",
      a: "A",
      b: "B",
      c: "C",
      style: { color: 0x2563eb, opacity: 0.9, segments: 96, radiusScale: 1.5 },
    },
    {
      id: "M",
      type: "arcMidpointOnCircle",
      label: "M",
      circle: "Omega",
      b: "B",
      c: "C",
      excludePoint: "A",
      style: { color: 0x22c55e, size: 0.05 },
    },
    {
      id: "Gamma",
      type: "circleThrough3Points",
      label: "Gamma",
      a: "A",
      b: "O",
      c: "M",
      style: { color: 0x7c3aed, opacity: 0.92, segments: 96, radiusScale: 1.5 },
    },
    {
      id: "P",
      type: "lineCircleIntersection",
      label: "P",
      line: "AB",
      circle: "Gamma",
      choice: { mode: "otherThan", point: "A" },
      style: { color: 0xf97316, size: 0.045 },
    },
    {
      id: "Q",
      type: "lineCircleIntersection",
      label: "Q",
      line: "AC",
      circle: "Gamma",
      choice: { mode: "otherThan", point: "A" },
      style: { color: 0xf97316, size: 0.045 },
    },
    { id: "PQ", type: "lineThroughPoints", label: "PQ", a: "P", b: "Q", style: { color: 0xf97316, length: 6 } },
    {
      id: "bisPQ",
      type: "perpendicularBisector",
      label: "perpBis(PQ)",
      a: "P",
      b: "Q",
      style: { color: 0x0891b2, length: 6 },
    },
    {
      id: "lineAperpBC",
      type: "perpendicularLine",
      label: "A_perp_BC",
      point: "A",
      line: "BC",
      style: { color: 0x0f766e, length: 6 },
    },
    {
      id: "lineOperpBC",
      type: "perpendicularLine",
      label: "O_perp_BC",
      point: "O",
      line: "BC",
      style: { color: 0x0f766e, length: 6, opacity: 0.55 },
    },
    {
      id: "X",
      type: "lineLineIntersection",
      label: "X",
      lineA: "bisPQ",
      lineB: "lineAperpBC",
      style: { color: 0xdc2626, size: 0.055 },
    },
  ];

  const solved = evaluateConstructionGraph(graph);
  const distances = evaluateProblemDistances(solved, [
    { id: "d_ab", label: "|AB|", a: "A", b: "B" },
    { id: "d_ac", label: "|AC|", a: "A", b: "C" },
    { id: "d_bc", label: "|BC|", a: "B", b: "C" },
    { id: "d_ao", label: "|AO|", a: "A", b: "O" },
    { id: "d_ob", label: "|OB|", a: "O", b: "B" },
    { id: "d_oc", label: "|OC|", a: "O", b: "C" },
    { id: "d_pq", label: "|PQ|", a: "P", b: "Q" },
    { id: "d_xo", label: "|XO|", a: "X", b: "O" },
  ]);
  const angles = evaluateProblemAngles(solved, [
    { id: "ang_bac", label: "<BAC", a: "B", vertex: "A", c: "C" },
    { id: "ang_bam", label: "<BAM", a: "B", vertex: "A", c: "M" },
    { id: "ang_mac", label: "<MAC", a: "M", vertex: "A", c: "C" },
    { id: "ang_paq", label: "<PAQ", a: "P", vertex: "A", c: "Q" },
    { id: "ang_bxc", label: "<BXC", a: "B", vertex: "X", c: "C" },
  ]);
  const checks = evaluateProblemChecks(solved, [
    { id: "check_col_pab", label: "P, A, B collinear", type: "collinear", points: ["P", "A", "B"], tolerance: 1e-3 },
    { id: "check_col_qac", label: "Q, A, C collinear", type: "collinear", points: ["Q", "A", "C"], tolerance: 1e-3 },
    {
      id: "check_concyclic_abcx",
      label: "A, B, C, X concyclic",
      type: "concyclic",
      points: ["A", "B", "C", "X"],
      tolerance: 2e-3,
    },
    {
      id: "check_perp_bis_pq",
      label: "perpBis(PQ) perpendicular PQ",
      type: "perpendicular",
      lines: ["bisPQ", "PQ"],
      toleranceDeg: 0.6,
    },
    {
      id: "check_perp_a_bc",
      label: "A_perp_BC perpendicular BC",
      type: "perpendicular",
      lines: ["lineAperpBC", "BC"],
      toleranceDeg: 0.6,
    },
    {
      id: "check_parallel_two_perps",
      label: "A_perp_BC parallel O_perp_BC",
      type: "parallel",
      lines: ["lineAperpBC", "lineOperpBC"],
      toleranceDeg: 0.6,
    },
    {
      id: "check_x_on_omega",
      label: "X on Omega",
      type: "pointOnCircle",
      point: "X",
      circle: "Omega",
      tolerance: 2e-3,
    },
    {
      id: "check_equal_ob_oc",
      label: "|OB| = |OC|",
      type: "equalLength",
      segments: [["O", "B"], ["O", "C"]],
      tolerance: 2e-3,
    },
    {
      id: "check_equal_angle_bam_mac",
      label: "<BAM = <MAC",
      type: "equalAngle",
      angles: [["B", "A", "M"], ["M", "A", "C"]],
      toleranceDeg: 0.8,
    },
    {
      id: "check_same_power_a",
      label: "pow(A, Omega) = pow(A, Gamma)",
      type: "samePower",
      point: "A",
      circles: ["Omega", "Gamma"],
      tolerance: 3e-3,
    },
  ]);

  return {
    id: "olympiad_arc_problem",
    name: "Olympiad Arc Construction",
    description:
      "Input free points A, B, C. Build O, Omega, arc midpoint M, circle(A,O,M), P/Q intersections, bisector and altitude, then test X on Omega.",
    freePoints,
    scene: solved.scene,
    objects: solved.objects,
    distances,
    angles,
    checks,
    errors: solved.errors,
    labels: buildPointLabelSet(solved.points),
  };
};
