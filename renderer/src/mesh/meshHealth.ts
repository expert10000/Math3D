import type { GeometryMeshReadinessReport } from "../geometry/meshReadiness";
import type { MeshTopologyInspectorDetails } from "./topologyInspector";

export type MeshHealthState = "Healthy" | "Warning" | "Invalid" | "Unverified";
export type MeshHealthBackend = "math3d" | "cgal" | "hybrid";

export type MeshHealthSelfIntersection = {
  checked: boolean;
  suspectedPairs: number;
  sampledFaces: number;
  truncated: boolean;
};

export type MeshHealthResult = {
  state: MeshHealthState;
  backend: MeshHealthBackend;
  cleanMesh: boolean;
  trianglesValid: boolean;
  vertexCount: number;
  faceCount: number;
  edgeCount: number | null;
  componentCount: number | null;
  invalidVertexCount: number;
  invalidFaceCount: number;
  degenerateTriangleCount: number;
  boundaryEdgeCount: number;
  boundaryLoopCount: number;
  nonManifoldEdgeCount: number;
  duplicateVertexCount: number;
  duplicateVertexGroups: number[][];
  duplicateFaceCount: number;
  eulerCharacteristic: number | null;
  manifold: boolean | null;
  watertight: boolean | null;
  orientable: boolean | null;
  orientationConsistent: boolean | null;
  selfIntersection: MeshHealthSelfIntersection;
  /** Compatibility field for existing analysis and visualization consumers. */
  selfIntersectionPairs: number;
  weldTolerance: number;
  diagnostics: string[];
  warnings: string[];
  sphereSeamWarning: boolean;
};

export type MeshHealthValidation = {
  vertexCount: number;
  faceCount: number;
  edgeCount: number;
  componentCount: number;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  invalidFaceCount: number;
  degenerateFaceCount: number;
  duplicateFaceCount: number;
  watertight: boolean;
  manifold: boolean;
  oriented: boolean;
  selfIntersection: MeshHealthSelfIntersection;
  diagnostics: string[];
  warnings: string[];
};

type MeshHealthStateInput = Pick<
  MeshHealthResult,
  | "trianglesValid"
  | "invalidVertexCount"
  | "invalidFaceCount"
  | "degenerateTriangleCount"
  | "boundaryEdgeCount"
  | "nonManifoldEdgeCount"
  | "duplicateVertexCount"
  | "duplicateFaceCount"
  | "manifold"
  | "watertight"
  | "orientable"
  | "orientationConsistent"
  | "selfIntersection"
>;

const nonNegative = (value: number | null | undefined): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;

export const deriveMeshHealthState = (health: MeshHealthStateInput): MeshHealthState => {
  if (
    !health.trianglesValid ||
    health.invalidVertexCount > 0 ||
    health.invalidFaceCount > 0 ||
    health.degenerateTriangleCount > 0 ||
    health.boundaryEdgeCount > 0 ||
    health.nonManifoldEdgeCount > 0 ||
    health.manifold === false ||
    health.watertight === false ||
    health.orientable === false
  ) {
    return "Invalid";
  }
  if (
    health.duplicateVertexCount > 0 ||
    health.duplicateFaceCount > 0 ||
    health.orientationConsistent === false ||
    health.selfIntersection.suspectedPairs > 0
  ) {
    return "Warning";
  }
  if (
    health.manifold === true &&
    health.watertight === true &&
    health.orientationConsistent === true &&
    health.selfIntersection.checked &&
    !health.selfIntersection.truncated
  ) {
    return "Healthy";
  }
  return "Unverified";
};

const finalizeMeshHealth = (health: Omit<MeshHealthResult, "state" | "cleanMesh">): MeshHealthResult => {
  const state = deriveMeshHealthState(health);
  return { ...health, state, cleanMesh: state === "Healthy" || state === "Unverified" };
};

export type CreateLocalMeshHealthOptions = {
  duplicateVertexGroups?: number[][];
  sphereSeamWarning?: boolean;
};

export const createLocalMeshHealthResult = (
  readiness: GeometryMeshReadinessReport,
  topology: MeshTopologyInspectorDetails | null,
  options: CreateLocalMeshHealthOptions = {}
): MeshHealthResult => {
  const trianglesValid =
    readiness.stats.invalidVertexCount === 0 &&
    readiness.stats.invalidFaceCount === 0 &&
    readiness.stats.degenerateTriangleCount === 0 &&
    readiness.stats.faceCount > 0;
  const selfIntersection: MeshHealthSelfIntersection = {
    checked: false,
    suspectedPairs: nonNegative(readiness.stats.suspectedSelfIntersectionPairs),
    sampledFaces: readiness.stats.faceCount,
    truncated: false,
  };

  return finalizeMeshHealth({
    backend: "math3d",
    trianglesValid,
    vertexCount: readiness.stats.vertexCount,
    faceCount: readiness.stats.faceCount,
    edgeCount: topology?.edgeCount ?? null,
    componentCount: topology?.connectedComponentCount ?? null,
    invalidVertexCount: nonNegative(readiness.stats.invalidVertexCount),
    invalidFaceCount: nonNegative(readiness.stats.invalidFaceCount),
    degenerateTriangleCount: nonNegative(readiness.stats.degenerateTriangleCount),
    boundaryEdgeCount: nonNegative(topology?.boundaryEdgeCount ?? readiness.stats.boundaryEdgeCount),
    boundaryLoopCount: topology?.boundaryLoops.length ?? 0,
    nonManifoldEdgeCount: nonNegative(topology?.nonManifoldEdgeCount ?? readiness.stats.nonManifoldEdgeCount),
    duplicateVertexCount: nonNegative(readiness.stats.duplicateVertexCount),
    duplicateVertexGroups: options.duplicateVertexGroups ?? [],
    duplicateFaceCount: 0,
    eulerCharacteristic: topology?.eulerCharacteristic ?? null,
    manifold: topology?.manifold ?? null,
    watertight: topology?.watertight ?? null,
    orientable: topology?.orientable ?? null,
    orientationConsistent: topology?.orientationConsistent ?? null,
    selfIntersection,
    selfIntersectionPairs: selfIntersection.suspectedPairs,
    weldTolerance: readiness.suggestions.weldTolerance,
    diagnostics: readiness.notes,
    warnings: readiness.checks
      .filter((check) => check.status === "warning" || check.status === "error")
      .map((check) => check.detail),
    sphereSeamWarning: options.sphereSeamWarning ?? false,
  });
};

export const mergeCgalMeshHealthResult = (
  local: MeshHealthResult,
  validation: MeshHealthValidation
): MeshHealthResult => {
  const selfIntersection = {
    checked: validation.selfIntersection.checked,
    suspectedPairs: nonNegative(validation.selfIntersection.suspectedPairs),
    sampledFaces: nonNegative(validation.selfIntersection.sampledFaces),
    truncated: validation.selfIntersection.truncated,
  };
  return finalizeMeshHealth({
    ...local,
    backend: "hybrid",
    trianglesValid: validation.invalidFaceCount === 0 && validation.degenerateFaceCount === 0 && validation.faceCount > 0,
    vertexCount: nonNegative(validation.vertexCount),
    faceCount: nonNegative(validation.faceCount),
    edgeCount: nonNegative(validation.edgeCount),
    componentCount: nonNegative(validation.componentCount),
    invalidFaceCount: nonNegative(validation.invalidFaceCount),
    degenerateTriangleCount: nonNegative(validation.degenerateFaceCount),
    boundaryEdgeCount: nonNegative(validation.boundaryEdgeCount),
    nonManifoldEdgeCount: nonNegative(validation.nonManifoldEdgeCount),
    duplicateFaceCount: nonNegative(validation.duplicateFaceCount),
    manifold: validation.manifold,
    watertight: validation.watertight,
    orientationConsistent: validation.oriented,
    selfIntersection,
    selfIntersectionPairs: selfIntersection.suspectedPairs,
    diagnostics: [...validation.diagnostics],
    warnings: [...validation.warnings],
  });
};

type MeshHealthBlockerInput = Pick<
  MeshHealthResult,
  | "watertight"
  | "manifold"
  | "nonManifoldEdgeCount"
  | "boundaryEdgeCount"
  | "invalidFaceCount"
  | "degenerateTriangleCount"
  | "duplicateFaceCount"
  | "orientationConsistent"
  | "selfIntersection"
>;

export const getMeshHealthBlockers = (health: MeshHealthBlockerInput | null | undefined): string[] => {
  if (!health) return ["Run Validate first"];
  const blockers: string[] = [];
  if (health.watertight === false) blockers.push("not watertight");
  if (health.manifold === false || health.nonManifoldEdgeCount > 0) {
    blockers.push(
      health.nonManifoldEdgeCount > 0
        ? `${health.nonManifoldEdgeCount.toLocaleString()} non-manifold edges`
        : "non-manifold edges"
    );
  }
  if (health.boundaryEdgeCount > 0) blockers.push(`${health.boundaryEdgeCount.toLocaleString()} boundary edges`);
  if (health.invalidFaceCount > 0) blockers.push(`${health.invalidFaceCount.toLocaleString()} invalid faces`);
  if (health.degenerateTriangleCount > 0) blockers.push(`${health.degenerateTriangleCount.toLocaleString()} degenerate faces`);
  if (health.duplicateFaceCount > 0) blockers.push(`${health.duplicateFaceCount.toLocaleString()} duplicate faces`);
  if (health.orientationConsistent === false) blockers.push("inconsistent orientation");
  if (health.selfIntersection.suspectedPairs > 0) {
    blockers.push(`${health.selfIntersection.suspectedPairs.toLocaleString()} self-intersections suspected`);
  }
  if (!health.selfIntersection.checked || health.selfIntersection.truncated) blockers.push("full self-intersection check required");
  return blockers;
};
