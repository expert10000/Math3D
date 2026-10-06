import { createMeshDocument, createDocumentRelation, createMixedWorkspaceDocument, matchesScientificSourceGeneration, viewerSourceFromDocument, type CanonicalJsonValue, type MixedWorkspaceDocument, type SurfaceDocument } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { additionalRepresentationView, type RepresentationContext } from "./additionalProjectRepresentations";
import { supportsSavedSurfaceResolution, validateSurfaceStudyResolution } from "./surfaceStudyResolution";
import { readSurfaceStudyRun, SURFACE_STUDY_VARIANT_OPERATION } from "./surfaceStudyRun";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { readSurfaceResolutionRun } from "./surfaceResolutionRun";

export const SAVED_SURFACE_MESH_OPERATION = "surface.tessellate-saved";
const samplingParameters = (value: CanonicalJsonValue): Readonly<Record<string, CanonicalJsonValue>> => value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, CanonicalJsonValue>> : {};
/** Create a portable snapshot from the exact same qualified sampler as the editor. */
export const createSavedSurfaceMesh = (workspace: MixedWorkspaceDocument, surface: SurfaceDocument, context: RepresentationContext, samplingSize = 33, studyName?: string) => {
  const resolution = validateSurfaceStudyResolution(samplingSize);
  if (studyName !== undefined && (!studyName.trim() || studyName.trim().length > 160)) throw new TypeError("Study names must contain 1–160 characters.");
  const view = additionalRepresentationView(surface, context, { surfaceResolution: resolution });
  if (view.meshes.length !== 1 || !view.meshes[0].indices?.length) throw new TypeError("This saved Surface has no single triangle mesh to promote.");
  const source = viewerSourceFromDocument(surface), mesh = view.meshes[0], units = surface.source.units;
  const length = units && typeof units === "object" && !Array.isArray(units) && "length" in units && typeof units.length === "string" ? units.length : "unitless";
  const meshId = `saved-surface:${surface.identity.id}:${surface.identity.revision}${resolution === 33 ? "" : `:grid${resolution}`}`;
  let adapter = MeshDocumentAdapter.fromMesh({ ...mesh, label: studyName?.trim() ?? `${surface.metadata.title.slice(0, 120)} Mesh r${surface.identity.revision}${resolution === 33 ? "" : ` · ${resolution}/axis`}`, source: {
    kind: "derivedSurface", role: "snapshot", state: "frozen-snapshot", meshId, meshRevision: 1,
    sourceSurfaceId: surface.identity.id, sourceSurfaceRevision: surface.identity.revision, sourceSurfaceLabel: surface.metadata.title,
    sourceRepresentation: surface.source.representation, tessellationMethod: "saved-source-native-preview-v1", backendId: "Math3D",
    correspondenceId: meshId, createdAt: 0, units: { length, area: `${length}^2`, gaussianCurvature: `${length}^-2`, meanCurvature: `${length}^-1` },
  } });
  let document = adapter.document();
  const reusable = workspace.relations.find(relation => relation.operation === SAVED_SURFACE_MESH_OPERATION && (samplingParameters(relation.parameters).samplingSize ?? 33) === resolution && relation.sources.length === 1 && matchesScientificSourceGeneration(relation.sources[0], source) && relation.target.type === "document" && workspace.entries.some(entry =>
    relation.target.type === "document" && entry.expected.id === relation.target.generation.documentId && matchesScientificSourceGeneration(viewerSourceFromDocument({ identity: entry.expected }), relation.target.generation) && entry.checkpoint.format === "math3d.mesh-document" && entry.checkpoint.source.resource.checksum === document.source.resource.checksum));
  if (reusable?.target.type === "document") {
    const entry = workspace.entries.find(entry => entry.expected.id === (reusable.target.type === "document" ? reusable.target.generation.documentId : ""))!;
    if (entry.checkpoint.format === "math3d.mesh-document") return { workspace, adapter: new MeshDocumentAdapter(entry.checkpoint, adapter.resources), existing: true };
  }
  const existing = workspace.entries.find(entry => entry.expected.id === document.identity.id);
  if (existing && existing.expected.structuralHash === document.identity.structuralHash && existing.expected.revision === document.identity.revision) return { workspace, adapter, existing: true };
  if (existing) {
    let copy = 1;
    do {
      document = createMeshDocument({ source: adapter.document().source, stableKey: { refreshOf: adapter.document().identity.id, copy: copy++ }, label: adapter.document().metadata.label });
    } while (workspace.entries.some(entry => entry.expected.id === document.identity.id));
    adapter = new MeshDocumentAdapter(document, adapter.resources);
  }
  const relation = createDocumentRelation({ kind: "generated-by", sources: [source], sourceOrder: "ordered", target: { type: "document", generation: viewerSourceFromDocument(document) },
    operation: SAVED_SURFACE_MESH_OPERATION, parameters: { sampling: "saved-source-native-preview-v1", samplingSize: supportsSavedSurfaceResolution(surface) ? resolution : null, samplingDimension: surface.source.representation === "implicit" ? 3 : 2, qualification: view.qualification, units: length } });
  const next = createMixedWorkspaceDocument({ ...workspace,
    entries: [...workspace.entries, { module: "mesh", checkpoint: document, expected: document.identity, replay: null }],
    activeDocumentIds: [...workspace.activeDocumentIds, document.identity.id], relations: [...workspace.relations, relation],
  });
  return { workspace: next, adapter, existing: false };
};

/** Recover exact lineage even when opened directly in the Mesh module. */
export const savedMeshSurfaceSource = (workspace: MixedWorkspaceDocument, meshId: string) => {
  const relation = workspace.relations.find(item => item.operation === SAVED_SURFACE_MESH_OPERATION && item.target.type === "document" && item.target.generation.documentId === meshId && item.sources.length === 1);
  if (!relation) return null;
  const generation = relation.sources[0], document = verifyMixedWorkspaceReplay(workspace).get(generation.documentId);
  return { generation, document: document?.format === "math3d.surface-document" ? document : null,
    current: !!document && matchesScientificSourceGeneration(viewerSourceFromDocument(document), generation), sampling: relation.parameters };
};

export const savedSurfaceMeshLinks = (workspace: MixedWorkspaceDocument, surface: SurfaceDocument, adapters: ReadonlyMap<string, MeshDocumentAdapter>) => {
  const variants = workspace.relations.filter(relation => relation.operation === SURFACE_STUDY_VARIANT_OPERATION && relation.sources.length === 1 && relation.sources[0].documentId === surface.identity.id && relation.target.type === "document");
  const documents = verifyMixedWorkspaceReplay(workspace);
  return workspace.relations.filter(relation => relation.operation === SAVED_SURFACE_MESH_OPERATION && relation.sources.length === 1 && (relation.sources[0].documentId === surface.identity.id || variants.some(variant => variant.target.type === "document" && matchesScientificSourceGeneration(variant.target.generation, relation.sources[0]))) && relation.target.type === "document")
    .flatMap(relation => {
      if (relation.target.type !== "document") return [];
      const adapter = adapters.get(relation.target.generation.documentId);
      if (!adapter) return [];
      const sampling = samplingParameters(relation.parameters);
      const source = relation.sources[0].documentId === surface.identity.id ? surface : documents.get(relation.sources[0].documentId), studyRun = readSurfaceStudyRun(relation.parameters);
      return [{ id: adapter.document().identity.id, title: adapter.document().metadata.label, revision: adapter.document().identity.revision, structuralHash: adapter.document().identity.structuralHash,
        vertexCount: adapter.document().source.resource.vertexCount, meshGeneration: adapter.sourceGeneration(), sourceRevision: relation.sources[0].revision, surfaceGeneration: relation.sources[0],
        samplingSize: typeof sampling.samplingSize === "number" ? sampling.samplingSize : undefined,
        units: typeof sampling.units === "string" ? sampling.units : "unknown", sampling: relation.parameters, studyRun, resolutionStudy: readSurfaceResolutionRun(relation.parameters),
        current: !!source && matchesScientificSourceGeneration(relation.sources[0], viewerSourceFromDocument(source)) && matchesScientificSourceGeneration(relation.target.generation, adapter.sourceGeneration()) && (!studyRun || matchesScientificSourceGeneration(studyRun.baseSource, viewerSourceFromDocument(surface))),
        results: workspace.results.filter(result => result.provenance.source.documentId === adapter.document().identity.id && result.provenance.operation.type.startsWith("mesh.saved.")),
      }];
    });
};
