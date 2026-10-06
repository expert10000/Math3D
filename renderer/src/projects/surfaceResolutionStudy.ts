import { createDocumentRelation, createMixedWorkspaceDocument, isScientificSourceGeneration, matchesScientificSourceGeneration, structuralHash, viewerSourceFromDocument,
  type CanonicalJsonValue, type MixedWorkspaceDocument, type SurfaceDocument } from "@math3d/core";
import type { RepresentationContext } from "./additionalProjectRepresentations";
import { createSavedSurfaceMesh, SAVED_SURFACE_MESH_OPERATION } from "./savedSurfaceMesh";
import { analyzeSavedMesh, appendSavedMeshAnalysis } from "./savedMeshAnalysis";
import { savedMeshCurvatureReport } from "./savedMeshExploration";
import { studyInteriorStatistics } from "./savedStudyComparison";
import { SURFACE_STUDY_RESOLUTIONS, supportsSavedSurfaceResolution } from "./surfaceStudyResolution";
import type { SavedMeshChoice } from "./SavedMeshAnalysisPanel";
import type { SurfaceResolutionRun } from "./surfaceResolutionRun";

/** Stage all three numerical snapshots before publishing a workspace. */
export const createSurfaceResolutionStudy = async (workspace: MixedWorkspaceDocument, surface: SurfaceDocument, context: RepresentationContext) => {
  if (!supportsSavedSurfaceResolution(surface)) throw new TypeError("This Surface does not support resolution studies.");
  const source = viewerSourceFromDocument(surface), studyId = `surface-resolution:${structuralHash(source).slice(7)}`;
  let next = workspace;
  const meshes = [] as ReturnType<typeof createSavedSurfaceMesh>["adapter"][];
  for (const resolution of SURFACE_STUDY_RESOLUTIONS) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const made = createSavedSurfaceMesh(next, surface, context, resolution.size, `${surface.metadata.title.slice(0, 110)} · ${resolution.label.split(" · ")[0]} resolution`);
    const result = analyzeSavedMesh(made.adapter, "curvature"), report = savedMeshCurvatureReport(made.adapter.mesh());
    const interior = studyInteriorStatistics({ choice: { id: made.adapter.document().identity.id, title: "", revision: made.adapter.document().identity.revision,
      structuralHash: made.adapter.document().identity.structuralHash, vertexCount: report.K.length, current: true, results: [result] }, mesh: made.adapter.mesh(), report });
    if (!interior.count) throw new TypeError(`The ${resolution.label} Mesh has no valid interior curvature estimates. No resolution study was published.`);
    const resolutionStudy: SurfaceResolutionRun = { studyId, resultId: result.resultId, interior };
    next = appendSavedMeshAnalysis(made.workspace, result);
    next = createMixedWorkspaceDocument({ ...next, relations: next.relations.map(relation => relation.operation === SAVED_SURFACE_MESH_OPERATION && relation.target.type === "document" &&
      matchesScientificSourceGeneration(relation.target.generation, made.adapter.sourceGeneration()) ? createDocumentRelation({ ...relation,
        parameters: { ...(relation.parameters as Record<string, CanonicalJsonValue>), resolutionStudy: resolutionStudy as unknown as CanonicalJsonValue } }) : relation) });
    meshes.push(made.adapter);
  }
  return { workspace: next, meshes, studyId };
};

export const surfaceResolutionReport = (choices: readonly SavedMeshChoice[], studyId: string) => {
  const members = choices.filter(choice => choice.resolutionStudy?.studyId === studyId).sort((a, b) => (a.samplingSize ?? 0) - (b.samplingSize ?? 0));
  const available = members.flatMap(choice => {
    const source = { documentId: choice.id, revision: choice.revision, structuralHash: choice.structuralHash, generation: choice.meshGeneration?.generation ?? choice.revision };
    if (!isScientificSourceGeneration(source)) return [];
    const result = choice.results.find(item => item.resultId === choice.resolutionStudy!.resultId && item.status === "numerical" && item.provenance.operation.type === "mesh.saved.curvature" && matchesScientificSourceGeneration(item.provenance.source, source));
    return result ? [{ choice, source, result }] : [];
  });
  const first = available[0]?.choice;
  if (!first?.surfaceGeneration) throw new TypeError("No matching retained resolution results are available.");
  if (available.some(({ choice }) => !choice.surfaceGeneration || !matchesScientificSourceGeneration(choice.surfaceGeneration, first.surfaceGeneration!) || choice.units !== first.units) ||
      new Set(available.map(item => item.choice.samplingSize)).size !== available.length) throw new TypeError("Resolution comparisons require one exact Surface generation and matching units.");
  return { format: "math3d.surface-resolution-study.v1", studyId, surfaceSource: first.surfaceGeneration, lengthUnits: first.units ?? "unknown",
    qualification: "Discrete Mesh sampling comparison. Interior averages exclude boundary/invalid vertices. Differences are not certified error bounds, convergence rates or proof of minimality.",
    runs: available.map(({ choice, source, result }) => ({ title: choice.title, meshSource: source, samplesPerAxis: choice.samplingSize!, vertexCount: choice.vertexCount,
      current: choice.current, sampling: choice.sampling ?? null, interior: choice.resolutionStudy!.interior, savedResult: result })),
    excludedRuns: members.filter(choice => !available.some(item => item.choice === choice)).map(choice => ({ title: choice.title, meshId: choice.id, reason: "Missing result or changed Mesh generation." })) };
};
