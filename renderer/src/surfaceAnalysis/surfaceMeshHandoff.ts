import type { SurfaceMeshData, SurfaceMeshSource } from "../mesh/surfaceMesh";
import type { SurfaceDerivedMeshPayload } from "./contracts";
import type { DerivedSurfaceMeshRecord } from "./derivedSurfaceMesh";

export type SurfaceMeshHandoffRole = "live" | "snapshot" | "detached";

export type SurfaceMeshGeometry = {
  positions: ArrayLike<number>;
  indices: ArrayLike<number> | null | undefined;
  normals?: ArrayLike<number> | null;
};

export const derivedSurfaceMeshRole = (record: DerivedSurfaceMeshRecord): SurfaceMeshHandoffRole =>
  record.identity.state === "frozen-snapshot" ? "snapshot"
    : record.identity.state === "detached" ? "detached"
      : "live";

export const createDerivedSurfaceMeshSource = (
  record: DerivedSurfaceMeshRecord,
  payload: SurfaceDerivedMeshPayload,
  units: Extract<SurfaceMeshSource, { kind: "derivedSurface" }>["units"] = {
    length: "scene-unit", area: "scene-unit²", gaussianCurvature: "scene-unit⁻²", meanCurvature: "scene-unit⁻¹",
  },
): Extract<SurfaceMeshSource, { kind: "derivedSurface" }> => ({
  kind: "derivedSurface",
  role: derivedSurfaceMeshRole(record),
  state: record.identity.state,
  meshId: record.identity.meshId,
  meshRevision: record.identity.meshRevision,
  sourceSurfaceId: record.identity.source.surfaceId,
  sourceSurfaceRevision: record.identity.source.surfaceRevision,
  sourceSurfaceLabel: record.identity.source.label,
  sourceRepresentation: record.identity.sourceRepresentation,
  tessellationMethod: record.identity.tessellation.method,
  backendId: record.identity.backend.id,
  correspondenceId: payload.correspondenceId,
  createdAt: record.identity.createdAt,
  units: { ...units },
});

export const createSurfaceMeshForHandoff = (args: {
  record: DerivedSurfaceMeshRecord;
  payload: SurfaceDerivedMeshPayload;
  geometry: SurfaceMeshGeometry;
  label?: string;
  units?: Extract<SurfaceMeshSource, { kind: "derivedSurface" }>["units"];
}): SurfaceMeshData => {
  const parameterCoordinates = args.payload.correspondence.parameterCoordinates;
  const hasCompleteUvs = parameterCoordinates?.length === args.record.vertexCount * 2 &&
    Array.from(parameterCoordinates).every(Number.isFinite);
  return {
    label: args.label ?? `${args.record.identity.source.label} · ${derivedSurfaceMeshRole(args.record)} mesh`,
    positions: Float32Array.from(args.geometry.positions),
    indices: args.geometry.indices ? Uint32Array.from(args.geometry.indices) : null,
    normals: args.geometry.normals ? Float32Array.from(args.geometry.normals) : null,
    uvs: hasCompleteUvs ? Float32Array.from(parameterCoordinates!) : null,
    source: createDerivedSurfaceMeshSource(args.record, args.payload, args.units),
  };
};

export const isDerivedSurfaceMesh = (mesh: SurfaceMeshData | null | undefined): boolean =>
  mesh?.source.kind === "derivedSurface";

export const derivedSurfaceMeshIsIndependent = (mesh: SurfaceMeshData | null | undefined): boolean =>
  mesh?.source.kind === "derivedSurface" && (mesh.source.role === "snapshot" || mesh.source.role === "detached");

export const derivedSurfaceMeshMatchesRecord = (
  mesh: SurfaceMeshData,
  record: DerivedSurfaceMeshRecord,
): boolean => mesh.source.kind === "derivedSurface" &&
  mesh.source.meshId === record.identity.meshId &&
  mesh.source.meshRevision === record.identity.meshRevision &&
  mesh.source.sourceSurfaceId === record.identity.source.surfaceId &&
  mesh.source.sourceSurfaceRevision === record.identity.source.surfaceRevision;
