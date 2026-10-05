import { createDocumentRelation, createMixedWorkspaceDocument, createSurfaceDocument, matchesScientificSourceGeneration, structuralHash, viewerSourceFromDocument, type CanonicalJsonValue, type MixedWorkspaceDocument, type SurfaceDocument } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import type { RepresentationContext } from "./additionalProjectRepresentations";
import { createSavedSurfaceMesh, SAVED_SURFACE_MESH_OPERATION } from "./savedSurfaceMesh";
import { analyzeSavedMesh, appendSavedMeshAnalysis } from "./savedMeshAnalysis";
import { surfaceStudySource, type SurfaceStudyPresetId } from "./surfaceStudyPresets";
import { SURFACE_STUDY_RESOLUTIONS, validateSurfaceStudyResolution, type SurfaceStudyResolution } from "./surfaceStudyResolution";
import { savedMeshCurvatureReport } from "./savedMeshExploration";
import { studyInteriorStatistics } from "./savedStudyComparison";

export { readSurfaceStudyRun, type SurfaceStudyRun, SURFACE_STUDY_VARIANT_OPERATION } from "./surfaceStudyRun";
import { type SurfaceStudyRun, SURFACE_STUDY_VARIANT_OPERATION } from "./surfaceStudyRun";
export const validateSweepValues = (values: readonly number[]) => {
  if (values.length < 2 || values.length > 5 || new Set(values).size !== values.length || values.some(value => !Number.isFinite(value) || value <= 0 || value > 100))
    throw new TypeError("Choose 2–5 distinct positive parameter values up to 100.");
  return [...values].sort((a, b) => a - b);
};
export const parseSweepValues = (raw: string) => {
  const parts = raw.split(",").map(value => value.trim());
  if (parts.some(value => !value)) throw new TypeError("Enter comma-separated parameter values without empty entries.");
  return validateSweepValues(parts.map(Number));
};
/** Prepare all variants and results before publishing. No original document or live adapter is edited. */
export const createSurfaceStudySweep = async (workspace: MixedWorkspaceDocument, surface: SurfaceDocument, context: RepresentationContext,
  presetId: SurfaceStudyPresetId, requestedValues: readonly number[], requestedResolution: SurfaceStudyResolution) => {
  const values = validateSweepValues(requestedValues), resolution = validateSurfaceStudyResolution(requestedResolution);
  // Validate the source before the first allocation, including imported/custom sources.
  surfaceStudySource(surface.source, presetId, values[0]);
  const baseSource = viewerSourceFromDocument(surface), sweepId = `surface-sweep:${structuralHash({ baseSource, presetId, values, resolution }).slice(7)}`;
  let next = workspace;
  const surfaces: SurfaceDocument[] = [], meshes: MeshDocumentAdapter[] = [];
  for (const value of values) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const source = surfaceStudySource(surface.source, presetId, value);
    const title = `${presetId === "helicoid" ? "Helicoid pitch" : "Catenoid waist"} ${value} · ${resolution}/axis`;
    let copy = 0, variant: SurfaceDocument;
    do {
      variant = createSurfaceDocument({ stableKey: { sweepId, value, copy }, source, metadata: { ...surface.metadata, title } });
      const collision = next.entries.find(entry => entry.expected.id === variant.identity.id);
      if (!collision || matchesScientificSourceGeneration(viewerSourceFromDocument({ identity: collision.expected }), viewerSourceFromDocument(variant))) break;
      copy++;
    } while (true);
    const previous = next.entries.find(entry => entry.expected.id === variant.identity.id);
    if (previous?.checkpoint.format === "math3d.surface-document") variant = previous.checkpoint;
    if (!previous) {
      const relation = createDocumentRelation({ kind: "generated-by", sources: [baseSource], sourceOrder: "ordered",
        target: { type: "document", generation: viewerSourceFromDocument(variant) }, operation: SURFACE_STUDY_VARIANT_OPERATION,
        parameters: { sweepId, presetId, value, resolution } });
      next = createMixedWorkspaceDocument({ ...next, entries: [...next.entries, { module: "surface", checkpoint: variant, expected: variant.identity, replay: null }],
        activeDocumentIds: [...next.activeDocumentIds, variant.identity.id], relations: [...next.relations, relation] });
    }
    const documents = new Map(context.documents); documents.set(variant.identity.id, variant);
    const name = `${presetId === "helicoid" ? "Helicoid pitch" : "Catenoid waist"} ${value} · ${SURFACE_STUDY_RESOLUTIONS.find(item => item.size === resolution)!.label.split(" · ")[0]}`;
    const made = createSavedSurfaceMesh(next, variant, { ...context, documents }, resolution, name);
    const result = analyzeSavedMesh(made.adapter, "curvature"), report = savedMeshCurvatureReport(made.adapter.mesh());
    const interior = studyInteriorStatistics({ choice: { id: made.adapter.document().identity.id, title, revision: made.adapter.document().identity.revision,
      structuralHash: made.adapter.document().identity.structuralHash, vertexCount: report.K.length, current: true, results: [result] }, mesh: made.adapter.mesh(), report });
    if (!interior.count) throw new TypeError(`The ${value} variant has no valid interior curvature estimates. No sweep was published.`);
    const studyRun: SurfaceStudyRun = { sweepId, presetId, value, resolution, baseSource, resultId: result.resultId, interior };
    next = appendSavedMeshAnalysis(made.workspace, result);
    next = createMixedWorkspaceDocument({ ...next, relations: next.relations.map(relation => relation.operation === SAVED_SURFACE_MESH_OPERATION && relation.target.type === "document" &&
      matchesScientificSourceGeneration(relation.target.generation, made.adapter.sourceGeneration()) ? createDocumentRelation({ ...relation,
        parameters: { ...(relation.parameters as Record<string, CanonicalJsonValue>), studyRun: studyRun as unknown as CanonicalJsonValue } }) : relation) });
    surfaces.push(variant); meshes.push(made.adapter);
  }
  return { workspace: next, surfaces, meshes, sweepId };
};
