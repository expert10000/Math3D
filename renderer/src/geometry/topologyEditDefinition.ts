import {
  bevelEdge,
  collapseEdge,
  extrudeFace,
  insetFace,
  moveVertex,
  splitEdge,
  subdivideFace,
  type EdgeCollapseMode,
  type FaceSubdivideMode,
} from "../mesh/meshEditOps";
import { buildMeshEdgeTopology, meshEdgeKey } from "../mesh/edgeSelection";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type GeometryTopologyEditOperation =
  | "Face Subdivide"
  | "Extrude Face"
  | "Inset Face"
  | "Split Edge"
  | "Collapse Edge"
  | "Bevel Edge"
  | "Move Vertex";

export type GeometryTopologySourceVersion = {
  readonly objectId: string;
  readonly label: string;
  readonly revision: number;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly key: string;
};

export type GeometryTopologyEditTarget =
  | { readonly kind: "face"; readonly faceIndex: number; readonly key: string; readonly label: string }
  | { readonly kind: "edge"; readonly edge: readonly [number, number]; readonly key: string; readonly label: string }
  | { readonly kind: "vertex"; readonly vertexIndex: number; readonly key: string; readonly label: string };

export type GeometryTopologyEditParameters =
  | { readonly mode: FaceSubdivideMode }
  | { readonly distance: number }
  | { readonly ratio: number }
  | { readonly mode: EdgeCollapseMode }
  | { readonly amount: number; readonly direction?: { readonly x: number; readonly y: number; readonly z: number } | null };

export type GeometryTopologyEditDefinition = {
  readonly operation: GeometryTopologyEditOperation;
  readonly sourceObjectVersion: GeometryTopologySourceVersion;
  readonly target: GeometryTopologyEditTarget;
  readonly parameters: GeometryTopologyEditParameters;
  readonly selectionKey: string;
  readonly selectionBreadcrumb: string;
  readonly paramsLabel: string;
  readonly replayLabel: string;
};

export type GeometryTopologyDefinitionResolveResult =
  | { readonly ok: true; readonly target: GeometryTopologyEditTarget }
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

export function createGeometryTopologySourceVersion(input: {
  readonly objectId: string;
  readonly label: string;
  readonly revision: number;
  readonly vertexCount: number;
  readonly faceCount: number;
}): GeometryTopologySourceVersion {
  const objectId = normalizeDefinitionPart(input.objectId || "object");
  const label = normalizeDefinitionPart(input.label || "Geometry object");
  const revision = Math.max(0, Math.round(input.revision || 0));
  const vertexCount = Math.max(0, Math.round(input.vertexCount || 0));
  const faceCount = Math.max(0, Math.round(input.faceCount || 0));
  return {
    objectId,
    label,
    revision,
    vertexCount,
    faceCount,
    key: `geometry:${objectId}:r${revision}:v${vertexCount}:f${faceCount}`,
  };
}

export function createGeometryTopologySourceVersionFromMesh(input: {
  readonly objectId: string;
  readonly label: string;
  readonly revision: number;
  readonly mesh: SurfaceMeshData;
}): GeometryTopologySourceVersion {
  return createGeometryTopologySourceVersion({
    objectId: input.objectId,
    label: input.label,
    revision: input.revision,
    vertexCount: Math.floor(input.mesh.positions.length / 3),
    faceCount: countMeshFaces(input.mesh),
  });
}

export function createGeometryTopologyFaceTarget(faceIndex: number): GeometryTopologyEditTarget {
  const resolved = Math.max(0, Math.round(faceIndex || 0));
  return {
    kind: "face",
    faceIndex: resolved,
    key: `face:${resolved}`,
    label: `Face ${resolved}`,
  };
}

export function createGeometryTopologyEdgeTarget(edgeA: number, edgeB: number): GeometryTopologyEditTarget {
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

export function createGeometryTopologyVertexTarget(vertexIndex: number): GeometryTopologyEditTarget {
  const resolved = Math.max(0, Math.round(vertexIndex || 0));
  return {
    kind: "vertex",
    vertexIndex: resolved,
    key: `vertex:${resolved}`,
    label: `Vertex ${resolved}`,
  };
}

export function formatGeometryTopologyEditParameters(parameters: GeometryTopologyEditParameters): string {
  if ("distance" in parameters) return `distance=${formatNumber(parameters.distance)}`;
  if ("ratio" in parameters) return `ratio=${formatNumber(parameters.ratio)}`;
  if ("amount" in parameters) {
    if (parameters.direction) {
      return `amount=${formatNumber(parameters.amount)}, dirX=${formatNumber(parameters.direction.x)}, dirY=${formatNumber(
        parameters.direction.y
      )}, dirZ=${formatNumber(parameters.direction.z)}`;
    }
    return `amount=${formatNumber(parameters.amount)}`;
  }
  return `mode=${parameters.mode}`;
}

export function createGeometryTopologyEditDefinition(input: {
  readonly operation: GeometryTopologyEditOperation;
  readonly sourceObjectVersion: GeometryTopologySourceVersion;
  readonly target: GeometryTopologyEditTarget;
  readonly parameters: GeometryTopologyEditParameters;
}): GeometryTopologyEditDefinition {
  const paramsLabel = formatGeometryTopologyEditParameters(input.parameters);
  const selectionKey = `${input.sourceObjectVersion.key}|${input.operation}|${input.target.key}`;
  const selectionBreadcrumb = `Geometry > ${input.sourceObjectVersion.label} > ${input.target.label}`;
  const replayLabel = `op=${input.operation}; source=${input.sourceObjectVersion.key}; selection=${input.target.key}; params=${paramsLabel}`;
  return {
    operation: input.operation,
    sourceObjectVersion: input.sourceObjectVersion,
    target: input.target,
    parameters: input.parameters,
    selectionKey,
    selectionBreadcrumb,
    paramsLabel,
    replayLabel,
  };
}

export function updateGeometryTopologyEditDefinitionParameters(
  definition: GeometryTopologyEditDefinition,
  parameters: GeometryTopologyEditParameters
): GeometryTopologyEditDefinition {
  return createGeometryTopologyEditDefinition({
    operation: definition.operation,
    sourceObjectVersion: definition.sourceObjectVersion,
    target: definition.target,
    parameters,
  });
}

export function retargetGeometryTopologyEditDefinition(
  definition: GeometryTopologyEditDefinition,
  target: GeometryTopologyEditTarget
): GeometryTopologyEditDefinition {
  return createGeometryTopologyEditDefinition({
    operation: definition.operation,
    sourceObjectVersion: definition.sourceObjectVersion,
    target,
    parameters: definition.parameters,
  });
}

export function resolveGeometryTopologyEditDefinitionTarget(
  mesh: SurfaceMeshData,
  definition: GeometryTopologyEditDefinition
): GeometryTopologyDefinitionResolveResult {
  if (!mesh.positions.length) return { ok: false, reason: "Source mesh is empty." };
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const faceCount = countMeshFaces(mesh);
  if (definition.target.kind === "face") {
    if (definition.target.faceIndex >= 0 && definition.target.faceIndex < faceCount) {
      return { ok: true, target: definition.target };
    }
    return {
      ok: false,
      reason: `${definition.target.label} is missing in source object revision ${definition.sourceObjectVersion.key}.`,
    };
  }

  if (definition.target.kind === "vertex") {
    if (definition.target.vertexIndex >= 0 && definition.target.vertexIndex < vertexCount) {
      return { ok: true, target: definition.target };
    }
    return {
      ok: false,
      reason: `${definition.target.label} is outside source object revision ${definition.sourceObjectVersion.key}.`,
    };
  }

  const [a, b] = definition.target.edge;
  if (a < 0 || b < 0 || a >= vertexCount || b >= vertexCount || a === b) {
    return {
      ok: false,
      reason: `${definition.target.label} is outside source object revision ${definition.sourceObjectVersion.key}.`,
    };
  }
  const topology = buildMeshEdgeTopology(mesh);
  if (topology.edges.has(meshEdgeKey(a, b))) return { ok: true, target: definition.target };
  return {
    ok: false,
    reason: `${definition.target.label} is missing in source object revision ${definition.sourceObjectVersion.key}.`,
  };
}

export function applyGeometryTopologyEditDefinition(
  mesh: SurfaceMeshData,
  definition: GeometryTopologyEditDefinition
): SurfaceMeshData {
  const resolved = resolveGeometryTopologyEditDefinitionTarget(mesh, definition);
  if (!resolved.ok) throw new Error(resolved.reason);
  if (definition.operation === "Face Subdivide") {
    if (definition.target.kind !== "face") throw new Error("Definition target is not a face.");
    const mode =
      "mode" in definition.parameters &&
      (definition.parameters.mode === "center-fan" || definition.parameters.mode === "four-triangles")
        ? definition.parameters.mode
        : "center-fan";
    return subdivideFace(mesh, definition.target.faceIndex, mode);
  }
  if (definition.operation === "Extrude Face") {
    if (definition.target.kind !== "face") throw new Error("Definition target is not a face.");
    const distance = "distance" in definition.parameters ? definition.parameters.distance : 0.08;
    return extrudeFace(mesh, definition.target.faceIndex, distance);
  }
  if (definition.operation === "Inset Face") {
    if (definition.target.kind !== "face") throw new Error("Definition target is not a face.");
    const ratio = "ratio" in definition.parameters ? definition.parameters.ratio : 0.2;
    return insetFace(mesh, definition.target.faceIndex, ratio);
  }
  if (definition.operation === "Move Vertex") {
    if (definition.target.kind !== "vertex") throw new Error("Definition target is not a vertex.");
    const amount = "amount" in definition.parameters ? definition.parameters.amount : 0.06;
    const direction = "amount" in definition.parameters ? definition.parameters.direction : null;
    return moveVertex(mesh, definition.target.vertexIndex, amount, direction);
  }
  if (definition.target.kind !== "edge") throw new Error("Definition target is not an edge.");
  const [edgeA, edgeB] = definition.target.edge;
  if (definition.operation === "Split Edge") {
    const ratio = "ratio" in definition.parameters ? definition.parameters.ratio : 0.5;
    return splitEdge(mesh, edgeA, edgeB, ratio);
  }
  if (definition.operation === "Collapse Edge") {
    const mode =
      "mode" in definition.parameters &&
      (definition.parameters.mode === "midpoint" ||
        definition.parameters.mode === "keep-a" ||
        definition.parameters.mode === "keep-b")
        ? definition.parameters.mode
        : "midpoint";
    return collapseEdge(mesh, edgeA, edgeB, mode);
  }
  const amount = "amount" in definition.parameters ? definition.parameters.amount : 0.06;
  return bevelEdge(mesh, edgeA, edgeB, amount);
}
