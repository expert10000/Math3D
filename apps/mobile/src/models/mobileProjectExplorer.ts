import { buildProjectExplorer, evaluateDocumentRelationStatus, inspectProjectNoteAnchor, isAnalysisResultCurrent, matchesScientificSourceGeneration, structuralHash,
  parseMath3DProject, replayMixedWorkspaceDocument, viewerSourceFromDocument, projectResourceInventory, VerifiedProjectResources, type ProjectResourceSidecar } from "@math3d/core";
import { projectVectorField3DTopologyStatus, projectPoincareReturnStatus,
  projectLyapunovStatus, projectLocalManifoldPatchStatus,
  projectLocalManifoldMeshStatus, reviewProjectDerivedField } from "@math3d/core";
import { mobileSurfaceUnavailableReason } from "./mobileProjectSurface";
import { mobileCurveUnavailableReason } from "./mobileProjectCurve";
import { mobileProjectRefreshOptions } from "./mobileProjectRefresh";
import { resolveMobileProjectWorkspace } from "./mobileProjectReplay";
import { mobileProjectResourceContext } from "./mobileProjectResources";
import { createInMemoryDependencyGraph } from "@math3d/kernel";

const complexContourPreview = (document: import("@math3d/core").KernelWorkspaceDocument | undefined,
  documents: ReadonlyMap<string, import("@math3d/core").KernelWorkspaceDocument>) => {
  if (document?.format !== "math3d.complex-analysis-document") return null;
  const link = document.provenance.graphSource;
  const graph = link ? documents.get(link.documentId) : null;
  const graphStatus = !link ? "unlinked" : document.identity.structuralHash !== link.targetStructuralHash ? "target edited" :
    graph?.format !== "math3d.graph2d-document" ? "Graph unavailable" :
      graph.identity.revision === link.revision && graph.identity.structuralHash === link.structuralHash ?
        "Graph checkpoint matches" : "Graph checkpoint changed";
  return { functionText: document.function.sourceText,
    contours: document.contours.map(contour => ({ id: contour.contourId, points: contour.points.length,
      closed: contour.closed })), graphStatus,
    mapping: link?.mapping ?? null, graphDocumentId: link?.documentId ?? null,
    scientific: link?.scientificSource ? { sceneId: link.scientificSource.sceneId,
      datasetId: link.scientificSource.datasetId, fixedName: link.scientificSource.fixedName,
      fixedCoordinate: link.scientificSource.fixedCoordinate, fixedUnit: link.scientificSource.fixedUnit,
      varyingName: link.scientificSource.varyingName, varyingUnit: link.scientificSource.varyingUnit,
      fingerprint: link.scientificSource.sceneFingerprint } : null };
};

/** Inspect checkpointed named projects without activating an editor or mutating storage. */
export const buildMobileProjectExplorer = (raw: string, sidecars: readonly ProjectResourceSidecar[] = []) => {
  const project = parseMath3DProject(raw);
  if (project.workspace.entries.some(entry => !["graph2d", "curve", "surface"].includes(entry.module) && entry.replay !== null)) throw new TypeError("Export checkpoint JSON for documents other than Graphs, Curves and Surfaces on desktop to inspect these documents on mobile.");
  const resolved = resolveMobileProjectWorkspace(project.workspace);
  const resources = new VerifiedProjectResources(project, sidecars, mobileProjectResourceContext);
  const inventory = projectResourceInventory(project, mobileProjectResourceContext);
  const tree = buildProjectExplorer(project, resolved);
  const sources = new Map([...resolved].map(([id, document]) => [id, viewerSourceFromDocument(document)]));
  const dependencies = createInMemoryDependencyGraph({ relations: project.workspace.relations, resolveSource: id => sources.get(id) ?? null });
  type MobileWorkbook = { id: string; title: string; stages: { id: string; title: string; blocks: { id: string; title: string; type: string; text?: string; formula?: string }[] }[] };
  const workbooks = (project.workbooks ?? []).map(reference => {
    const bytes = resources.bytes({ kind: "workbook-payload", id: reference.id });
    if (!bytes) return { id: reference.id, title: reference.title, revision: reference.revision, available: false, stages: [] as MobileWorkbook["stages"] };
    try {
      const workbook = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as MobileWorkbook;
      if (workbook.id !== reference.id || workbook.title !== reference.title || !Array.isArray(workbook.stages) || workbook.stages.length !== 4 ||
        workbook.stages.some(stage => !stage || typeof stage.id !== "string" || typeof stage.title !== "string" || !Array.isArray(stage.blocks) ||
          stage.blocks.some(block => !block || typeof block.id !== "string" || typeof block.title !== "string" || typeof block.type !== "string" ||
            block.text !== undefined && typeof block.text !== "string" || block.formula !== undefined && typeof block.formula !== "string"))) throw new Error("Invalid Workbook");
      return { id: reference.id, title: reference.title, revision: reference.revision, available: true, stages: workbook.stages };
    } catch { return { id: reference.id, title: reference.title, revision: reference.revision, available: false, stages: [] as MobileWorkbook["stages"] }; }
  });
  const notes = (project.notes ?? []).map(note => ({ id: note.identity.id, title: note.title, body: note.body, kind: note.kind,
    anchor: note.anchor, status: inspectProjectNoteAnchor(note, {
      projectId: project.identity.id, source: id => sources.get(id) ?? null,
      result: id => {
        const result = project.workspace.results.find(item => item.resultId === id);
        return result ? { source: result.provenance.source, hash: structuralHash(result) } : null;
      },
      workbookBlock: (workbookId, blockId) => {
        const workbook = workbooks.find(item => item.id === workbookId && item.available);
        const block = workbook?.stages.flatMap(stage => stage.blocks).find(item => item.id === blockId);
        return workbook && block ? { revision: workbook.revision, hash: structuralHash(block) } : null;
      },
    }).status }));
  const rank = { current: 0, stale: 1, unavailable: 2, broken: 3 } as const;
  const merge = (left: keyof typeof rank, right: keyof typeof rank) => rank[left] >= rank[right] ? left : right;
  const relations = project.workspace.relations.map(relation => {
    const sourceStatus = merge(evaluateDocumentRelationStatus(relation, id => sources.get(id) ?? null), dependencies.relationStatus(relation.relationId) ?? "unavailable");
    const target = relation.target.type === "document" ? sources.get(relation.target.generation.documentId) : null;
    const freshness = relation.target.type === "document" && (!target || !matchesScientificSourceGeneration(target, relation.target.generation)) ?
      merge(sourceStatus, target ? "stale" : "unavailable") : relation.target.type === "artifact" ? merge(sourceStatus, "unavailable") : sourceStatus;
    return { ...relation, freshness };
  });
  const curveReason = (id: string) => mobileCurveUnavailableReason(resolved.get(id)! as import("@math3d/core").CurveDocument,
    project.workspace.entries.find(entry => entry.expected.id === id)?.replay?.payload as import("@math3d/kernel").CurveReplayBundle | undefined);
  const surfaceReason = (id: string) => mobileSurfaceUnavailableReason(resolved.get(id)! as import("@math3d/core").SurfaceDocument,
    project.workspace.entries.find(entry => entry.expected.id === id)?.replay?.payload as import("@math3d/kernel").SurfaceReplayBundle | undefined);
  const tensorOperations = new Set(["q-criterion", "lambda2", "swirling-strength"]);
  const scientificContracts = [
    ...(project.workspace.derivedFields ?? []).filter(item => tensorOperations.has(item.operation.kind))
      .map(item => ({ id: item.identity.id, title: item.metadata.title,
        kind: `Derived ${item.operation.kind}`, sourceId: item.input.documentId,
        status: reviewProjectDerivedField(project, item.identity.id,
          source => source.source.field.kind === "expressions", resolved).status,
        detail: `Operation ${item.operation.kind}; unit ${item.output.unit}; values are not evaluated on mobile.` })),
    ...(project.workspace.timeSources ?? []).map(item => ({ id: item.identity.id,
      title: "Pinned time source", kind: "Moving-surface frame source",
      sourceId: item.source.frames[0]!.documentId, status: "unverified",
      detail: `${item.source.frames.length} pinned frames; external frame bytes are not verified on mobile.` })),
    ...[...resolved.values()].filter((item): item is import("@math3d/core").Graph2DDocument =>
      item.format === "math3d.graph2d-document").flatMap(graph => graph.source.objects.flatMap(item =>
      item.kind === "derivative-curve" ? [{ id: item.id, title: item.label,
        kind: "Saved derivative curve", sourceId: item.sourceObjectId,
        status: "recipe retained", detail: `Order ${item.order}; ${item.method === "finite-difference" ?
          "approximate finite difference" : "symbolic rules"}; fallback ${item.fallback}.` }] :
      item.kind === "point-series" && item.poincareOrigin ? [{ id: item.id,
        title: item.label, kind: "Poincaré Graph row",
        sourceId: item.poincareOrigin.sourceDocumentId, status: "unverified",
        detail: `${item.poincareOrigin.kind === "project-poincare-return/v1" ?
          "Return-map" : "Crossing"} values withheld until the Project source and point table are verified on desktop.` }] : [])),
    ...project.workspace.results.filter(item => ["vector3d.basin-map",
      "vector3d.poincare-section"].includes(item.provenance.operation.type))
      .map(item => ({ id: item.resultId,
        title: item.provenance.operation.type === "vector3d.basin-map" ?
          "Basin map" : "Poincaré section", kind: "Saved topology recipe",
        sourceId: item.provenance.source.documentId,
        status: projectVectorField3DTopologyStatus(project, item).status === "current" ?
          "recipe retained" : "withheld",
        detail: `Recipe retained; ${item.summary.evaluations} bounded evaluations. ` +
          (projectVectorField3DTopologyStatus(project, item).reason ?
            `Values withheld: ${projectVectorField3DTopologyStatus(project, item).reason}.` :
            "Values are not recomputed on mobile.") })),
    ...project.workspace.results.filter(item => ["vector3d.poincare-return-map",
      "vector3d.lyapunov-finite-time", "vector3d.local-manifold-patch"]
      .includes(item.provenance.operation.type)).map(item => {
        const type = item.provenance.operation.type;
        const state = type === "vector3d.poincare-return-map" ?
          projectPoincareReturnStatus(project, item) :
          type === "vector3d.lyapunov-finite-time" ?
            projectLyapunovStatus(project, item) :
            projectLocalManifoldPatchStatus(project, item);
        return { id: item.resultId, title: type === "vector3d.poincare-return-map" ?
          "Poincaré return map" : type === "vector3d.lyapunov-finite-time" ?
            "Finite-time Lyapunov estimate" : "Local manifold patch",
        kind: "Saved advanced topology recipe",
        sourceId: item.provenance.source.documentId,
        status: state.status === "current" ? "recipe retained" : "withheld",
        detail: state.reason ? `Values withheld: ${state.reason}.` :
          "Source-linked recipe retained; values are not recomputed on mobile." };
      }),
    ...project.workspace.entries.flatMap(entry => entry.module === "mesh" &&
      entry.checkpoint.format === "math3d.mesh-document" &&
      (entry.checkpoint.source.origin as { kind?: string }).kind ===
        "vector3d.local-manifold-patch" ? (() => {
          const origin = entry.checkpoint.source.origin as { source: { documentId: string } };
          const state = projectLocalManifoldMeshStatus(project, entry.checkpoint,
            resources.bytes({ kind: "mesh-buffers", id: entry.checkpoint.source.resource.id }));
          return [{ id: entry.checkpoint.identity.id,
            title: entry.checkpoint.metadata.label, kind: "Local manifold Mesh",
            sourceId: origin.source.documentId,
            status: state.status === "current" ? "bytes verified" : "withheld",
            detail: state.reason ? `Mesh withheld: ${state.reason}.` :
              "Mesh bytes verified; scientific local classification remains a saved recipe." }];
        })() : []),
  ];
  return {
    projectId: project.identity.id,
    title: project.metadata.title,
    workbooks, notes,
    scientificContracts,
    refreshOptions: mobileProjectRefreshOptions({ projectType: "project-preview", id: project.identity.id, title: project.metadata.title,
      serializedProject: raw, projectResources: [...sidecars], updatedAt: 0, lastOpenedAt: 0 }),
    resources: inventory.map(item => ({ id: item.id, kind: item.kind, required: item.required, available: resources.bytes(item) !== null })),
    groups: tree.groups.map(group => ({ ...group, documents: group.documents.map(document => ({ ...document,
      complexPreview: document.module === "complex" ? complexContourPreview(resolved.get(document.id), resolved) : null,
      vector3dPreview: document.module === "vector3d" && resolved.get(document.id)?.format === "math3d.vector-field3d-document" ?
        resolved.get(document.id) as import("@math3d/core").VectorField3DDocument : null,
      editing: document.module === "surface" && !document.archived && !surfaceReason(document.id) ? "Surface workspace" : document.module === "curve" && !document.archived && resolved.get(document.id)?.format === "math3d.curve-document" && !curveReason(document.id) ? "Curve workspace" : document.module === "graph2d" && !document.archived && !inventory.some(item => item.kind === "graph-point-table" && item.owners.includes(document.id) && !resources.bytes(item)) ? "Graph workspace" : "Saved preview",
      unavailableReason: document.module === "surface" ? document.archived ? "Archived documents cannot be edited." : surfaceReason(document.id) : document.module === "curve" ? document.archived ? "Archived documents cannot be edited." : curveReason(document.id) : document.module === "vector3d" ? resolved.get(document.id)?.format === "math3d.vector-field3d-document" ? null : "Saved 3D vector field is unavailable on mobile." : document.module !== "graph2d" ? "This module remains a saved preview on mobile." : document.archived ? "Archived documents cannot be edited." :
        inventory.some(item => item.kind === "graph-point-table" && item.owners.includes(document.id) && !resources.bytes(item)) ? "Import missing Graph source tables before editing." : null,
      stale: relations.some(relation => relation.freshness !== "current" && relation.target.type === "document" && relation.target.generation.documentId === document.id),
    })) })),
    relations,
    results: project.workspace.results.map(result => ({ id: result.resultId, operation: result.provenance.operation.type,
      sourceDocumentId: result.provenance.source.documentId, sourceRevision: result.provenance.source.revision,
      authority: result.status, freshness: !sources.has(result.provenance.source.documentId) || result.artifacts.length ? "unavailable" :
        resolved.get(result.provenance.source.documentId)?.format === "math3d.vector-field3d-document" &&
        (resolved.get(result.provenance.source.documentId) as import("@math3d/core").VectorField3DDocument).source.field.kind === "scientific-bundle" ? "unverified" :
        isAnalysisResultCurrent(result, sources.get(result.provenance.source.documentId)!) && !relations.some(relation => relation.freshness !== "current" &&
          (relation.target.type === "document" ? relation.target.generation.documentId === result.provenance.source.documentId : relation.target.type === "result" && relation.target.resultId === result.resultId)) ? "current" : "stale" })),
  };
};
