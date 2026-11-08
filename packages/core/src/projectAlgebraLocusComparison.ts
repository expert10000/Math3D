import { canonicalJsonStringify } from "./documentIdentity";
import type { Math3DProject } from "./math3dProject";
import { resolveProjectAlgebraLocusInspection, type ProjectAlgebraLocusReturn,
  type ProjectAlgebraLocusInspection } from "./projectAlgebraLocusReturn";

export type SavedLocusComparisonSide = Readonly<{
  documentId: string;
  kind: ProjectAlgebraLocusInspection["kind"];
  sourceStatus: ProjectAlgebraLocusReturn["sourceStatus"];
  label: string;
  method: string | null;
  sampleCount: number | null;
  inspectionPoint: readonly string[] | null;
}>;

export type SavedLocusComparison = Readonly<{
  left: SavedLocusComparisonSide;
  right: SavedLocusComparisonSide;
  sameSourceRevision: boolean;
  sameEquations: boolean;
  sameRealBounds: boolean;
  samePrecision: boolean;
  sameExactScene: boolean;
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
  const summary = (choice: ProjectAlgebraLocusReturn, item: ProjectAlgebraLocusInspection):
    SavedLocusComparisonSide => ({
    documentId: choice.documentId, kind: item.kind, sourceStatus: choice.sourceStatus,
    label: item.kind === "singularity" ? `Exact tangent at (${item.analysis.point.join(", ")})` :
      item.kind === "sampled" ? "Bounded numerical sample" : "Uncomputed exact contract",
    method: item.kind === "sampled" ? item.sample.algorithm : null,
    sampleCount: item.kind === "sampled" ? item.sample.sampleCount : null,
    inspectionPoint: item.kind === "singularity" ? item.analysis.point : null,
  });
  const same = (a: unknown, b: unknown) => canonicalJsonStringify(a) === canonicalJsonStringify(b);
  return {
    left: summary(leftChoice, left), right: summary(rightChoice, right),
    sameSourceRevision: l.source.projectId === r.source.projectId &&
      l.source.target.id === r.source.target.id &&
      l.source.target.revision === r.source.target.revision &&
      l.source.target.contentHash === r.source.target.contentHash,
    sameEquations: same(l.source.equations, r.source.equations),
    sameRealBounds: same(l.domain.bounds, r.domain.bounds),
    samePrecision: same(l.precision, r.precision), sameExactScene: l.sceneHash === r.sceneHash,
  };
};
