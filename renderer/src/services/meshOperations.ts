import type { CgalMeshRequest } from "./cgalMeshClient";
import { runCgalMesh } from "./cgalMeshClient";
import type { SurfaceMeshData, SurfaceMeshSource } from "../mesh/surfaceMesh";
import {
  vtkCleanNormals,
  vtkDecimate,
  vtkPreviewImplicit,
  vtkSmooth,
  type VtkMeshRequest,
  type VtkPreviewRequest,
} from "./vtkMeshClient";

export type MeshOperationEngine = "auto" | "vtk" | "cgal";
export type ResolvedMeshOperationEngine = "vtk" | "cgal";
export type MeshOperationStatus = "success" | "warning" | "error" | "cancelled";
export type MeshOperationQuality = "fast" | "balanced" | "robust";
export type MeshOperationOutputMode = "new-object" | "replace" | "preview";

export type MeshOperationId =
  | "clean-normals"
  | "decimate"
  | "smooth"
  | "implicit-preview"
  | "implicit-mesh"
  | "boolean-union"
  | "boolean-difference"
  | "boolean-intersection"
  | "boolean-imprint";

export type MeshOperationDiagnostic = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  source?: ResolvedMeshOperationEngine | "math3d";
};

export type MeshMetrics = {
  vertexCount: number;
  faceCount: number;
  memoryBytes: number | null;
};

export type MeshOperationRequest = {
  operation: MeshOperationId;
  inputs: string[];
  engine: MeshOperationEngine;
  parameters: Record<string, unknown>;
  outputMode: MeshOperationOutputMode;
  quality?: MeshOperationQuality;
};

export type MeshOperationResult = {
  status: MeshOperationStatus;
  engine: ResolvedMeshOperationEngine;
  operation: MeshOperationId;
  sourceIds: string[];
  resultMeshId?: string;
  resultMesh?: SurfaceMeshData;
  before: MeshMetrics;
  after?: MeshMetrics;
  durationMs: number;
  warnings: MeshOperationDiagnostic[];
  errors: MeshOperationDiagnostic[];
  provenance: {
    engine: ResolvedMeshOperationEngine;
    version?: string;
    parameters: Record<string, unknown>;
  };
};

export type MeshOperationDomain = VtkPreviewRequest["domain"];

export type MeshOperationMeshInput = {
  label: string;
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array | null;
  source?: SurfaceMeshSource;
};

export type MeshOperationContext = {
  primaryMesh?: MeshOperationMeshInput;
  implicit?: {
    expr: string;
    iso?: number;
    domain: MeshOperationDomain;
    resolution?: number;
    targetFaces?: number;
    targetReduction?: number;
    quality?: CgalMeshRequest["quality"];
    scalars?: string[];
    preflightSamples?: number;
  };
};

export type MeshOperationCapability = {
  operation: MeshOperationId;
  engines: ResolvedMeshOperationEngine[];
  defaultEngine: ResolvedMeshOperationEngine;
};

const VTK_MESH_OPERATIONS = new Set<MeshOperationId>(["clean-normals", "decimate", "smooth"]);
const VTK_IMPLICIT_OPERATIONS = new Set<MeshOperationId>(["implicit-preview"]);
const CGAL_OPERATIONS = new Set<MeshOperationId>(["implicit-mesh"]);

export const MESH_OPERATION_CAPABILITIES: MeshOperationCapability[] = [
  { operation: "clean-normals", engines: ["vtk"], defaultEngine: "vtk" },
  { operation: "decimate", engines: ["vtk"], defaultEngine: "vtk" },
  { operation: "smooth", engines: ["vtk"], defaultEngine: "vtk" },
  { operation: "implicit-preview", engines: ["vtk"], defaultEngine: "vtk" },
  { operation: "implicit-mesh", engines: ["cgal"], defaultEngine: "cgal" },
  { operation: "boolean-union", engines: ["vtk"], defaultEngine: "vtk" },
  { operation: "boolean-difference", engines: ["vtk"], defaultEngine: "vtk" },
  { operation: "boolean-intersection", engines: ["vtk"], defaultEngine: "vtk" },
  { operation: "boolean-imprint", engines: ["vtk"], defaultEngine: "vtk" },
];

export function computeMeshMetrics(mesh?: Pick<SurfaceMeshData, "positions" | "indices" | "normals" | "uvs"> | null): MeshMetrics {
  if (!mesh?.positions?.length) {
    return { vertexCount: 0, faceCount: 0, memoryBytes: 0 };
  }
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const faceCount = mesh.indices ? Math.floor(mesh.indices.length / 3) : Math.floor(vertexCount / 3);
  const memoryBytes =
    mesh.positions.byteLength +
    (mesh.indices?.byteLength ?? 0) +
    (mesh.normals?.byteLength ?? 0) +
    (mesh.uvs?.byteLength ?? 0);
  return { vertexCount, faceCount, memoryBytes };
}

export function resolveMeshOperationEngine(request: MeshOperationRequest): ResolvedMeshOperationEngine {
  if (request.engine !== "auto") return request.engine;
  return MESH_OPERATION_CAPABILITIES.find((entry) => entry.operation === request.operation)?.defaultEngine ?? "vtk";
}

function operationError(
  request: MeshOperationRequest,
  engine: ResolvedMeshOperationEngine,
  before: MeshMetrics,
  startedAt: number,
  message: string,
  code = "mesh-operation-failed"
): MeshOperationResult {
  return {
    status: "error",
    engine,
    operation: request.operation,
    sourceIds: request.inputs,
    before,
    durationMs: performance.now() - startedAt,
    warnings: [],
    errors: [{ severity: "error", code, message, source: engine }],
    provenance: { engine, parameters: request.parameters },
  };
}

function meshFromBuffers(
  label: string,
  source: SurfaceMeshSource,
  res: { positions: Float32Array; indices: Uint32Array; normals?: Float32Array | null }
): SurfaceMeshData {
  return {
    label,
    positions: res.positions,
    indices: res.indices,
    normals: res.normals ?? null,
    source,
  };
}

function resultSuccess(
  request: MeshOperationRequest,
  engine: ResolvedMeshOperationEngine,
  before: MeshMetrics,
  startedAt: number,
  resultMesh: SurfaceMeshData,
  warnings: MeshOperationDiagnostic[] = []
): MeshOperationResult {
  return {
    status: warnings.some((warning) => warning.severity === "warning") ? "warning" : "success",
    engine,
    operation: request.operation,
    sourceIds: request.inputs,
    resultMesh,
    before,
    after: computeMeshMetrics(resultMesh),
    durationMs: performance.now() - startedAt,
    warnings,
    errors: [],
    provenance: { engine, parameters: request.parameters },
  };
}

function numericParam(parameters: Record<string, unknown>, key: string): number | undefined {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanParam(parameters: Record<string, unknown>, key: string): boolean | undefined {
  const value = parameters[key];
  return typeof value === "boolean" ? value : undefined;
}

function vtkOptionsFromParameters(parameters: Record<string, unknown>): VtkMeshRequest["options"] {
  return {
    targetReduction: numericParam(parameters, "targetReduction"),
    targetFaces: numericParam(parameters, "targetFaces"),
    iterations: numericParam(parameters, "iterations"),
    passband: numericParam(parameters, "passband"),
    computeNormals: booleanParam(parameters, "computeNormals"),
  };
}

export async function runMeshOperation(
  request: MeshOperationRequest,
  context: MeshOperationContext
): Promise<MeshOperationResult> {
  const startedAt = performance.now();
  const engine = resolveMeshOperationEngine(request);
  const before = computeMeshMetrics(context.primaryMesh ?? null);

  if (VTK_MESH_OPERATIONS.has(request.operation)) {
    if (engine !== "vtk") {
      return operationError(request, engine, before, startedAt, `${request.operation} is not supported by ${engine}.`, "unsupported-engine");
    }
    const mesh = context.primaryMesh;
    if (!mesh?.positions?.length || !mesh.indices?.length) {
      return operationError(request, engine, before, startedAt, "Mesh input is empty.", "missing-input");
    }
    const options = vtkOptionsFromParameters(request.parameters);
    const res =
      request.operation === "clean-normals"
        ? await vtkCleanNormals(mesh.positions, mesh.indices, options)
        : request.operation === "decimate"
          ? await vtkDecimate(mesh.positions, mesh.indices, options)
          : await vtkSmooth(mesh.positions, mesh.indices, options);
    if (!res.ok) return operationError(request, engine, before, startedAt, res.error);
    return resultSuccess(request, engine, before, startedAt, meshFromBuffers(mesh.label, mesh.source ?? { kind: "bakedFromImplicit" }, res));
  }

  if (VTK_IMPLICIT_OPERATIONS.has(request.operation)) {
    if (engine !== "vtk") {
      return operationError(request, engine, before, startedAt, `${request.operation} is not supported by ${engine}.`, "unsupported-engine");
    }
    const implicit = context.implicit;
    if (!implicit?.expr) return operationError(request, engine, before, startedAt, "Implicit expression is empty.", "missing-input");
    const res = await vtkPreviewImplicit({
      expr: implicit.expr,
      iso: implicit.iso ?? 0,
      domain: implicit.domain,
      resolution: Math.max(8, Math.round(implicit.resolution ?? 48)),
      targetFaces: implicit.targetFaces,
      targetReduction: implicit.targetReduction,
    });
    if (!res.ok) return operationError(request, engine, before, startedAt, res.error);
    return resultSuccess(
      request,
      engine,
      before,
      startedAt,
      meshFromBuffers(request.inputs[0] ?? "VTK preview", { kind: "bakedFromImplicit" }, res)
    );
  }

  if (CGAL_OPERATIONS.has(request.operation)) {
    if (engine !== "cgal") {
      return operationError(request, engine, before, startedAt, `${request.operation} is not supported by ${engine}.`, "unsupported-engine");
    }
    const implicit = context.implicit;
    if (!implicit?.expr) return operationError(request, engine, before, startedAt, "Implicit expression is empty.", "missing-input");
    const res = await runCgalMesh({
      f: implicit.expr,
      iso: implicit.iso ?? 0,
      domain: implicit.domain,
      quality: implicit.quality ?? { target_edge: 0.2 },
      scalars: implicit.scalars,
      preflightSamples: implicit.preflightSamples,
    });
    if (!res.ok) return operationError(request, engine, before, startedAt, res.error);
    return resultSuccess(
      request,
      engine,
      before,
      startedAt,
      meshFromBuffers(request.inputs[0] ?? "CGAL mesh", { kind: "bakedFromImplicit" }, {
        positions: Float32Array.from(res.positions),
        indices: Uint32Array.from(res.indices),
      })
    );
  }

  return operationError(request, engine, before, startedAt, `${request.operation} is not registered.`, "unsupported-operation");
}
