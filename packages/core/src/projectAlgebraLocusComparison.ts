import { canonicalJsonStringify, structuralHash, type StructuralHash } from "./documentIdentity";
import type { Math3DProject } from "./math3dProject";
import type { SageAlgebraicLocusScene } from "./sageAlgebraicLocusScene";
import { resolveProjectAlgebraLocusInspection, type ProjectAlgebraLocusReturn,
  type ProjectAlgebraLocusInspection } from "./projectAlgebraLocusReturn";

export type SavedLocusComparisonSide = Readonly<{
  documentId: string;
  documentRevision: number;
  documentHash: StructuralHash;
  sceneHash: StructuralHash;
  sourceObjectId: string;
  sourceRevision: number;
  sourceContentHash: StructuralHash;
  kind: ProjectAlgebraLocusInspection["kind"];
  sourceStatus: ProjectAlgebraLocusReturn["sourceStatus"];
  label: string;
  method: string | null;
  sampleCount: number | null;
  equations: readonly string[];
  realBounds: SageAlgebraicLocusScene["domain"]["bounds"];
  precision: SageAlgebraicLocusScene["precision"];
  warnings: readonly string[];
  inspectionPoint: readonly string[] | null;
  classification: string | null;
}>;

export type SavedLocusComparison = Readonly<{
  format: "math3d.saved-locus-comparison";
  schemaVersion: 1;
  projectId: string;
  left: SavedLocusComparisonSide;
  right: SavedLocusComparisonSide;
  sameSourceRevision: boolean;
  sameEquations: boolean;
  sameRealBounds: boolean;
  samePrecision: boolean;
  sameExactScene: boolean;
  comparisonHash: StructuralHash;
}>;

/** Compares pinned contracts only; no numerical overlap or mathematical equivalence is inferred. */
export const compareProjectAlgebraLocusEvidence = (project: Math3DProject,
  leftChoice: ProjectAlgebraLocusReturn, rightChoice: ProjectAlgebraLocusReturn):
  SavedLocusComparison => {
  if (leftChoice.documentId === rightChoice.documentId)
    throw new TypeError("Choose two distinct saved locus checkpoints to compare.");
  const left = resolveProjectAlgebraLocusInspection(project, leftChoice);
  const right = resolveProjectAlgebraLocusInspection(project, rightChoice);
  const scene = (item: ProjectAlgebraLocusInspection) => item.kind === "exact" ? item.scene :
    item.kind === "sampled" ? item.sample.scene : item.analysis.scene;
  const l = scene(left), r = scene(right);
  const summary = (choice: ProjectAlgebraLocusReturn, item: ProjectAlgebraLocusInspection,
    exact: SageAlgebraicLocusScene):
    SavedLocusComparisonSide => ({
    documentId: choice.documentId, documentRevision: choice.documentRevision,
    documentHash: choice.documentHash, sceneHash: exact.sceneHash,
    sourceObjectId: exact.source.target.id, sourceRevision: exact.source.target.revision,
    sourceContentHash: exact.source.target.contentHash,
    kind: item.kind, sourceStatus: choice.sourceStatus,
    label: item.kind === "singularity" ? `Exact tangent at (${item.analysis.point.join(", ")})` :
      item.kind === "sampled" ? "Bounded numerical sample" : "Uncomputed exact contract",
    method: item.kind === "sampled" ? item.sample.algorithm : null,
    sampleCount: item.kind === "sampled" ? item.sample.sampleCount : null,
    equations: exact.source.equations, realBounds: exact.domain.bounds, precision: exact.precision,
    warnings: item.kind === "sampled" ? item.sample.warnings : [],
    inspectionPoint: item.kind === "singularity" ? item.analysis.point : null,
    classification: item.kind === "singularity" ? item.analysis.local.classification : null,
  });
  const same = (a: unknown, b: unknown) => canonicalJsonStringify(a) === canonicalJsonStringify(b);
  const base = {
    format: "math3d.saved-locus-comparison" as const, schemaVersion: 1 as const,
    projectId: project.identity.id,
    left: summary(leftChoice, left, l), right: summary(rightChoice, right, r),
    sameSourceRevision: l.source.projectId === r.source.projectId &&
      l.source.target.id === r.source.target.id &&
      l.source.target.revision === r.source.target.revision &&
      l.source.target.contentHash === r.source.target.contentHash,
    sameEquations: same(l.source.equations, r.source.equations),
    sameRealBounds: same(l.domain.bounds, r.domain.bounds),
    samePrecision: same(l.precision, r.precision), sameExactScene: l.sceneHash === r.sceneHash,
  };
  return { ...base, comparisonHash: structuralHash(base) };
};
