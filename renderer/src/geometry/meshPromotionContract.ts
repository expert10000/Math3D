import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { weldSurfaceMeshVertices } from "../mesh/surfaceMesh";
import { computeAdjacency, computeMeanEdgeLength, computeVertexNormals, validateMesh } from "../mesh/meshOps";
import { evaluateGeometryMeshReadiness, type GeometryMeshReadinessReport } from "./meshReadiness";
import {
  buildTraceMapForPromotion,
  mergeIntoGlobalGeometryMeshTraceMap,
  type GeometryMeshTraceMapSnapshot,
} from "./geometryMeshTraceMap";

export type GeometryToMeshPromotionMode =
  | "raw_mesh"
  | "triangulated_mesh"
  | "repaired_mesh"
  | "analysis_ready_mesh"
  | "frozen_baked_object"
  | "editable_mesh_object";

export const GEOMETRY_TO_MESH_PROMOTION_MODES: GeometryToMeshPromotionMode[] = [
  "raw_mesh",
  "triangulated_mesh",
  "repaired_mesh",
  "analysis_ready_mesh",
  "frozen_baked_object",
  "editable_mesh_object",
];

export type GeometryPromotionBounds = {
  min: [number, number, number];
  max: [number, number, number];
} | null;

export type GeometryToMeshPromotionMetadata = {
  sourceGeometryId: string | null;
  sourceOperationHistory: string[];
  promotionMode: GeometryToMeshPromotionMode;
  traceMap?: GeometryMeshTraceMapSnapshot | null;
  vertexCount: number;
  faceCount: number;
  bounds: GeometryPromotionBounds;
  validityReport: GeometryMeshReadinessReport;
  createdAt: number;
};

export type GeometryToMeshPromotionResult = {
  mesh: SurfaceMeshData;
  metadata: GeometryToMeshPromotionMetadata;
  frozen: boolean;
};

export type PromoteGeometryToMeshArgs = {
  mesh: SurfaceMeshData;
  sourceGeometryId?: string | null;
  sourceOperationHistory?: string[];
  promotionMode: GeometryToMeshPromotionMode;
  createdAt?: number;
  labelOverride?: string;
  traceMeshId?: string | null;
  registerTraceInGlobalMap?: boolean;
};

const cloneMesh = (mesh: SurfaceMeshData, labelOverride?: string): SurfaceMeshData => ({
  ...mesh,
  label: labelOverride ?? mesh.label,
  positions: Float32Array.from(mesh.positions),
  indices: mesh.indices ? Uint32Array.from(mesh.indices) : null,
  normals: mesh.normals ? Float32Array.from(mesh.normals) : null,
  uvs: mesh.uvs ? Float32Array.from(mesh.uvs) : null,
  adjacency: mesh.adjacency ? mesh.adjacency.map((row) => row.slice()) : null,
  meanEdgeLength: mesh.meanEdgeLength ?? null,
  validation: mesh.validation
    ? {
        ...mesh.validation,
        errors: [...mesh.validation.errors],
        warnings: [...mesh.validation.warnings],
        stats: { ...mesh.validation.stats },
      }
    : null,
});

const boundsFromPositions = (positions: ArrayLike<number>): GeometryPromotionBounds => {
  const count = Math.floor((positions?.length ?? 0) / 3);
  if (count <= 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let seenFinite = false;
  for (let i = 0; i < count; i += 1) {
    const p = i * 3;
    const x = Number(positions[p] ?? Number.NaN);
    const y = Number(positions[p + 1] ?? Number.NaN);
    const z = Number(positions[p + 2] ?? Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    seenFinite = true;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!seenFinite) return null;
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
};

const ensureTriangulatedIndices = (mesh: SurfaceMeshData): SurfaceMeshData => {
  if (mesh.indices && mesh.indices.length >= 3) return mesh;
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triCount = Math.floor(vertexCount / 3);
  const indices = new Uint32Array(triCount * 3);
  for (let i = 0; i < indices.length; i += 1) {
    indices[i] = i;
  }
  return {
    ...mesh,
    indices,
    normals: null,
    adjacency: null,
    meanEdgeLength: null,
    validation: null,
  };
};

const faceCountFromMesh = (mesh: Pick<SurfaceMeshData, "positions" | "indices">): number => {
  if (mesh.indices && mesh.indices.length >= 3) return Math.floor(mesh.indices.length / 3);
  return Math.floor((mesh.positions.length ?? 0) / 9);
};

export const promoteGeometryToMesh = (args: PromoteGeometryToMeshArgs): GeometryToMeshPromotionResult => {
  const sourceGeometryId = args.sourceGeometryId ?? null;
  const sourceOperationHistory = args.sourceOperationHistory ?? [];
  const createdAt = Number.isFinite(args.createdAt) ? Number(args.createdAt) : Date.now();
  const mode = args.promotionMode;

  let mesh = cloneMesh(args.mesh, args.labelOverride);
  mesh = ensureTriangulatedIndices(mesh);

  if (mode === "triangulated_mesh") {
    mesh = computeVertexNormals(mesh);
  } else if (mode === "repaired_mesh") {
    const pre = evaluateGeometryMeshReadiness(mesh);
    const tolerance = Math.max(1e-9, pre.suggestions.dedupeTolerance);
    mesh = weldSurfaceMeshVertices(mesh, tolerance, mesh.label);
    mesh = computeVertexNormals(mesh);
    mesh = validateMesh(mesh);
  } else if (mode === "analysis_ready_mesh" || mode === "frozen_baked_object") {
    const pre = evaluateGeometryMeshReadiness(mesh);
    const tolerance = Math.max(1e-9, pre.suggestions.dedupeTolerance);
    mesh = weldSurfaceMeshVertices(mesh, tolerance, mesh.label);
    mesh = computeVertexNormals(mesh);
    mesh = computeAdjacency(mesh);
    mesh = computeMeanEdgeLength(mesh);
    mesh = validateMesh(mesh);
  } else if (mode === "editable_mesh_object") {
    mesh = computeVertexNormals(mesh);
    mesh = validateMesh(mesh);
  }

  const validityReport = evaluateGeometryMeshReadiness(mesh);
  const traceMeshId =
    (args.traceMeshId ?? "").trim() ||
    `${sourceGeometryId ?? "untracked"}:${mode}:${Math.floor(createdAt)}:${Math.floor(mesh.positions.length / 3)}`;
  const traceMap =
    sourceGeometryId && traceMeshId
      ? buildTraceMapForPromotion({
          sourceGeometryId,
          meshId: traceMeshId,
          sourceMesh: args.mesh,
          promotedMesh: mesh,
          sourceOperationHistory,
          promotionMode: mode,
          createdAt,
        })
      : null;
  if (traceMap && args.registerTraceInGlobalMap !== false) {
    mergeIntoGlobalGeometryMeshTraceMap(traceMap);
  }
  const metadata: GeometryToMeshPromotionMetadata = {
    sourceGeometryId,
    sourceOperationHistory: [...sourceOperationHistory],
    promotionMode: mode,
    traceMap: traceMap?.toSnapshot() ?? null,
    vertexCount: Math.floor(mesh.positions.length / 3),
    faceCount: faceCountFromMesh(mesh),
    bounds: boundsFromPositions(mesh.positions),
    validityReport,
    createdAt,
  };

  return {
    mesh,
    metadata,
    frozen: mode === "frozen_baked_object",
  };
};
