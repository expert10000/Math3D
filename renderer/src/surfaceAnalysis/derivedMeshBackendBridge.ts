import type { DerivedSurfaceMeshRecord } from "./derivedSurfaceMesh";

export type SurfaceDerivedMeshBackendKind = "native-tessellation" | "vtk-post-process" | "cgal-robust-mesh";
export type SurfaceDerivedMeshBackendAvailability = "ready" | "checking" | "unavailable" | "browser-limited";

export type SurfaceDerivedMeshValidationSummary = {
  watertight: boolean;
  manifold: boolean;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
};

export type SurfaceDerivedMeshBackendSummary = {
  variant: SurfaceDerivedMeshBackendKind;
  backend: string;
  backendVersion: string | null;
  sourceRevision: number;
  meshRevision: number;
  state: DerivedSurfaceMeshRecord["identity"]["state"];
  vertexCount: number;
  faceCount: number;
  validation: SurfaceDerivedMeshValidationSummary | null;
  availability: SurfaceDerivedMeshBackendAvailability;
  availabilityMessage: string;
  warnings: readonly string[];
};

export type SurfaceDerivedMeshBackendWorkflow = "remesh" | "robust-mesh";
export type SurfaceDerivedMeshBackendRoute = {
  workspace: "mesh-analysis";
  panel: "operations";
  operation: "cgal-remesh" | "implicit-mesh" | "cgal-repair-validate";
  sourceMeshId: string;
  sourceRevision: number;
  backend: "cgal";
};

const backendVariant = (backendId: string): SurfaceDerivedMeshBackendKind => {
  const id = backendId.toLowerCase();
  if (id.includes("cgal")) return "cgal-robust-mesh";
  if (id.includes("vtk")) return "vtk-post-process";
  return "native-tessellation";
};

/** Lightweight topology evidence for the compact Surface card; detailed validation remains in Mesh Analysis. */
export const validateDerivedSurfaceMeshTopology = (mesh: {
  positions: ArrayLike<number>;
  indices?: ArrayLike<number> | null;
}): SurfaceDerivedMeshValidationSummary | null => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  if (!vertexCount) return null;
  const indices = mesh.indices ?? null;
  const faceCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  const incidence = new Map<string, number>();
  const addEdge = (left: number, right: number) => {
    const a = Math.min(left, right); const b = Math.max(left, right);
    const key = `${a}|${b}`;
    incidence.set(key, (incidence.get(key) ?? 0) + 1);
  };
  for (let face = 0; face < faceCount; face += 1) {
    const offset = face * 3;
    const a = indices ? Number(indices[offset]) : offset;
    const b = indices ? Number(indices[offset + 1]) : offset + 1;
    const c = indices ? Number(indices[offset + 2]) : offset + 2;
    if (![a, b, c].every((value) => Number.isInteger(value) && value >= 0 && value < vertexCount) || a === b || b === c || c === a) continue;
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  let boundaryEdgeCount = 0; let nonManifoldEdgeCount = 0;
  incidence.forEach((count) => { if (count === 1) boundaryEdgeCount += 1; else if (count > 2) nonManifoldEdgeCount += 1; });
  const manifold = nonManifoldEdgeCount === 0;
  return { boundaryEdgeCount, nonManifoldEdgeCount, manifold, watertight: manifold && boundaryEdgeCount === 0 };
};

export const buildDerivedSurfaceMeshBackendSummary = (args: {
  record: DerivedSurfaceMeshRecord;
  geometry?: { positions: ArrayLike<number>; indices?: ArrayLike<number> | null } | null;
  backendAvailability?: SurfaceDerivedMeshBackendAvailability;
  backendAvailabilityMessage?: string;
}): SurfaceDerivedMeshBackendSummary => ({
  variant: backendVariant(args.record.identity.backend.id),
  backend: args.record.identity.backend.id,
  backendVersion: args.record.identity.backend.version ?? null,
  sourceRevision: args.record.identity.source.surfaceRevision,
  meshRevision: args.record.identity.meshRevision,
  state: args.record.identity.state,
  vertexCount: args.record.vertexCount,
  faceCount: args.record.faceCount,
  validation: args.geometry ? validateDerivedSurfaceMeshTopology(args.geometry) : null,
  availability: args.backendAvailability ?? "ready",
  availabilityMessage: args.backendAvailabilityMessage ?? "Backend available.",
  warnings: args.record.warnings,
});

/** Routes Surface shortcuts to the shared Mesh operation layer instead of duplicating backend controls. */
export const createDerivedSurfaceMeshBackendRoute = (args: {
  record: DerivedSurfaceMeshRecord;
  workflow: SurfaceDerivedMeshBackendWorkflow;
  sourceRepresentation: string;
}): SurfaceDerivedMeshBackendRoute => ({
  workspace: "mesh-analysis",
  panel: "operations",
  operation: args.workflow === "remesh"
    ? "cgal-remesh"
    : args.sourceRepresentation === "implicit" ? "implicit-mesh" : "cgal-repair-validate",
  sourceMeshId: args.record.identity.meshId,
  sourceRevision: args.record.identity.source.surfaceRevision,
  backend: "cgal",
});
