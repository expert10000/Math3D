import type { CanonicalSurfaceDefinition, SurfaceIdentity, SurfaceRepresentation, SurfaceResultKind } from "./contracts";
import type { DerivedSurfaceMeshRecord } from "./derivedSurfaceMesh";

export type SavedSurfaceResultReference = {
  id: string;
  resultKey: string;
  kind: SurfaceResultKind;
  variant: string;
  identity: SurfaceIdentity;
  label: string;
  visible: boolean;
};

export type SurfaceAnalysisWorkspaceDocument = {
  version: 1;
  definitions: CanonicalSurfaceDefinition[];
  savedResults: SavedSurfaceResultReference[];
  derivedMeshes: DerivedSurfaceMeshRecord[];
};

const REPRESENTATIONS: ReadonlySet<SurfaceRepresentation> = new Set([
  "explicit", "implicit", "parametric", "spline", "constructed", "weierstrass", "mesh-backed",
]);

export const createSurfaceAnalysisWorkspaceDocument = (input?: Partial<SurfaceAnalysisWorkspaceDocument>): SurfaceAnalysisWorkspaceDocument => ({
  version: 1,
  definitions: [...(input?.definitions ?? [])],
  savedResults: [...(input?.savedResults ?? [])],
  derivedMeshes: [...(input?.derivedMeshes ?? [])],
});

export const serializeSurfaceAnalysisWorkspace = (document: SurfaceAnalysisWorkspaceDocument): string => JSON.stringify(document);

export const parseSurfaceAnalysisWorkspace = (serialized: string): SurfaceAnalysisWorkspaceDocument => {
  const value = JSON.parse(serialized) as Partial<SurfaceAnalysisWorkspaceDocument> | null;
  if (!value || value.version !== 1 || !Array.isArray(value.definitions) || !Array.isArray(value.savedResults)) {
    throw new Error("Unsupported Surface Analysis workspace document.");
  }
  for (const definition of value.definitions) {
    if (definition?.version !== 1 || !definition.fingerprint || !definition.identity || !REPRESENTATIONS.has(definition.representation)) {
      throw new Error("Invalid canonical Surface definition.");
    }
    if (definition.identity.surfaceId !== definition.identity.surfaceId.trim() || definition.identity.surfaceRevision < 0) {
      throw new Error("Invalid Surface identity.");
    }
  }
  for (const reference of value.savedResults) {
    if (!reference?.id || !reference.resultKey || !reference.identity || !reference.kind || !reference.variant) {
      throw new Error("Invalid saved Surface result reference.");
    }
  }
  for (const mesh of value.derivedMeshes ?? []) {
    if (mesh?.version !== 1 || !mesh.identity?.meshId || mesh.identity.version !== 1 || !mesh.identity.source?.surfaceId || !Array.isArray(mesh.history)) {
      throw new Error("Invalid derived SurfaceMesh metadata.");
    }
  }
  return createSurfaceAnalysisWorkspaceDocument(value);
};
