import {
  bevelEdge,
  collapseEdge,
  splitEdge,
  subdivideFace,
  type EdgeCollapseMode,
  type FaceSubdivideMode,
} from "./meshEditOps";
import { buildMeshEdgeTopology, meshEdgeKey } from "./edgeSelection";
import type { SurfaceMeshData } from "./surfaceMesh";

export type MeshTopologyEditOperation = "Face Subdivide" | "Split Edge" | "Collapse Edge" | "Bevel Edge";

export type MeshTopologySourceVersion = {
  readonly label: string;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly key: string;
};

export type MeshTopologyEditTarget =
  | { readonly kind: "face"; readonly faceIndex: number; readonly key: string; readonly label: string }
  | { readonly kind: "edge"; readonly edge: readonly [number, number]; readonly key: string; readonly label: string };

export type MeshTopologyEditParameters =
  | { readonly mode: FaceSubdivideMode }
  | { readonly ratio: number }
  | { readonly mode: EdgeCollapseMode }
  | { readonly amount: number };

export type MeshTopologyEditDefinition = {
  readonly operation: MeshTopologyEditOperation;
  readonly sourceMeshVersion: MeshTopologySourceVersion;
  readonly target: MeshTopologyEditTarget;
  readonly parameters: MeshTopologyEditParameters;
  readonly selectionKey: string;
  readonly selectionBreadcrumb: string;
  readonly paramsLabel: string;
  readonly replayLabel: string;
};

export type MeshTopologyDefinitionResolveResult =
  | { readonly ok: true; readonly target: MeshTopologyEditTarget }
  | { readonly ok: false; readonly reason: string };

const normalizeDefinitionPart = (value: string): string =>
  value.trim().replace(/\s+/g, " ").replace(/[|;]/g, "-");

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(4);
  return fixed.replace(/\.?0+$/, "");
};

const countMeshFaces = (mesh: SurfaceMeshData): number =>
  mesh.indices && mesh.indices.length >= 3
    ? Math.floor(mesh.indices.length / 3)
    : Math.floor(Math.floor(mesh.positions.length / 3) / 3);

export function createMeshTopologySourceVersion(input: {
  readonly label: string;
  readonly vertexCount: number;
  readonly faceCount: number;
}): MeshTopologySourceVersion {
  const label = normalizeDefinitionPart(input.label || "Surface mesh");
  const vertexCount = Math.max(0, Math.round(input.vertexCount || 0));
  const faceCount = Math.max(0, Math.round(input.faceCount || 0));
  return {
    label,
    vertexCount,
    faceCount,
    key: `mesh:${label}:v${vertexCount}:f${faceCount}`,
  };
}

export function createMeshTopologySourceVersionFromMesh(
  mesh: SurfaceMeshData,
  label = mesh.label ?? "Surface mesh"
): MeshTopologySourceVersion {
  return createMeshTopologySourceVersion({
    label,
    vertexCount: Math.floor(mesh.positions.length / 3),
    faceCount: countMeshFaces(mesh),
  });
}

export function createMeshTopologyFaceTarget(faceIndex: number): MeshTopologyEditTarget {
  const resolved = Math.max(0, Math.round(faceIndex || 0));
  return {
    kind: "face",
    faceIndex: resolved,
    key: `face:${resolved}`,
    label: `Face ${resolved}`,
  };
}

export function createMeshTopologyEdgeTarget(edgeA: number, edgeB: number): MeshTopologyEditTarget {
  const a = Math.max(0, Math.round(edgeA || 0));
  const b = Math.max(0, Math.round(edgeB || 0));
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return {
    kind: "edge",
    edge: [min, max],
    key: `edge:${min}-${max}`,
    label: `Edge ${min}-${max}`,
  };
}

export function formatMeshTopologyEditParameters(parameters: MeshTopologyEditParameters): string {
  if ("ratio" in parameters) return `ratio=${formatNumber(parameters.ratio)}`;
  if ("amount" in parameters) return `amount=${formatNumber(parameters.amount)}`;
  return `mode=${parameters.mode}`;
}

export function createMeshTopologyEditDefinition(input: {
  readonly operation: MeshTopologyEditOperation;
  readonly sourceMeshVersion: MeshTopologySourceVersion;
  readonly target: MeshTopologyEditTarget;
  readonly parameters: MeshTopologyEditParameters;
}): MeshTopologyEditDefinition {
  const paramsLabel = formatMeshTopologyEditParameters(input.parameters);
  const selectionKey = `${input.sourceMeshVersion.key}|${input.operation}|${input.target.key}`;
  const selectionBreadcrumb = `Mesh > ${input.sourceMeshVersion.label} > ${input.target.label}`;
  const replayLabel = `op=${input.operation}; source=${input.sourceMeshVersion.key}; selection=${input.target.key}; params=${paramsLabel}`;
  return {
    operation: input.operation,
    sourceMeshVersion: input.sourceMeshVersion,
    target: input.target,
    parameters: input.parameters,
    selectionKey,
    selectionBreadcrumb,
    paramsLabel,
    replayLabel,
  };
}

export function updateMeshTopologyEditDefinitionParameters(
  definition: MeshTopologyEditDefinition,
  parameters: MeshTopologyEditParameters
): MeshTopologyEditDefinition {
  return createMeshTopologyEditDefinition({
    operation: definition.operation,
    sourceMeshVersion: definition.sourceMeshVersion,
    target: definition.target,
    parameters,
  });
}

export function retargetMeshTopologyEditDefinition(
  definition: MeshTopologyEditDefinition,
  target: MeshTopologyEditTarget
): MeshTopologyEditDefinition {
  return createMeshTopologyEditDefinition({
    operation: definition.operation,
    sourceMeshVersion: definition.sourceMeshVersion,
    target,
    parameters: definition.parameters,
  });
}

export function resolveMeshTopologyEditDefinitionTarget(
  mesh: SurfaceMeshData,
  definition: MeshTopologyEditDefinition
): MeshTopologyDefinitionResolveResult {
  if (!mesh.positions.length) return { ok: false, reason: "Source mesh is empty." };
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const faceCount = countMeshFaces(mesh);
  if (definition.target.kind === "face") {
    if (definition.target.faceIndex >= 0 && definition.target.faceIndex < faceCount) {
      return { ok: true, target: definition.target };
    }
    return {
      ok: false,
      reason: `${definition.target.label} is missing in source mesh version ${definition.sourceMeshVersion.key}.`,
    };
  }

  const [a, b] = definition.target.edge;
  if (a < 0 || b < 0 || a >= vertexCount || b >= vertexCount || a === b) {
    return {
      ok: false,
      reason: `${definition.target.label} is outside source mesh version ${definition.sourceMeshVersion.key}.`,
    };
  }
  const topology = buildMeshEdgeTopology(mesh);
  if (topology.edges.has(meshEdgeKey(a, b))) return { ok: true, target: definition.target };
  return {
    ok: false,
    reason: `${definition.target.label} is missing in source mesh version ${definition.sourceMeshVersion.key}.`,
  };
}

export function applyMeshTopologyEditDefinition(
  mesh: SurfaceMeshData,
  definition: MeshTopologyEditDefinition
): SurfaceMeshData {
  const resolved = resolveMeshTopologyEditDefinitionTarget(mesh, definition);
  if (!resolved.ok) throw new Error(resolved.reason);
  if (definition.operation === "Face Subdivide") {
    if (definition.target.kind !== "face") throw new Error("Definition target is not a face.");
    const mode = "mode" in definition.parameters ? definition.parameters.mode : "center-fan";
    return subdivideFace(mesh, definition.target.faceIndex, mode);
  }
  if (definition.target.kind !== "edge") throw new Error("Definition target is not an edge.");
  const [edgeA, edgeB] = definition.target.edge;
  if (definition.operation === "Split Edge") {
    const ratio = "ratio" in definition.parameters ? definition.parameters.ratio : 0.5;
    return splitEdge(mesh, edgeA, edgeB, ratio);
  }
  if (definition.operation === "Collapse Edge") {
    const mode = "mode" in definition.parameters ? definition.parameters.mode : "midpoint";
    return collapseEdge(mesh, edgeA, edgeB, mode);
  }
  const amount = "amount" in definition.parameters ? definition.parameters.amount : 0.06;
  return bevelEdge(mesh, edgeA, edgeB, amount);
}
