import { createDocumentRelation } from "./documentRelations";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, serializeMath3DProject, replaceMath3DProjectWorkspace,
  type Math3DProject } from "./math3dProject";
import { createVectorField3DDocument, defaultVectorField3DWorkspace,
  parseVectorField3DDocument, serializeVectorField3DDocument, reviseVectorField3DWorkspace,
  type FieldExplorerWorkflow, type VectorField3DDocument } from "./vectorField3DDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";

export const fieldExplorerWorkflow = (document: VectorField3DDocument): FieldExplorerWorkflow =>
  document.workspace?.explorer ?? { inspectorSection: "all", comparisonSource: null,
    comparisonResolution: 9, comparisonVisible: false };

/** Display changes never advance the scientific source revision or structural hash. */
export function reviseFieldExplorerWorkflow(document: VectorField3DDocument,
  changes: Partial<FieldExplorerWorkflow>): VectorField3DDocument {
  return reviseVectorField3DWorkspace(document, {
    ...(document.workspace ?? defaultVectorField3DWorkspace(document.source)),
    explorer: { ...fieldExplorerWorkflow(document), ...changes },
  });
}

/** A frozen checkpoint is an ordinary Project document with a snapshot-of relation. */
export function pinProjectFieldExplorerBaseline(project: Math3DProject,
  source: VectorField3DDocument, stableKey: string): Readonly<{
    project: Math3DProject; document: VectorField3DDocument; baseline: VectorField3DDocument }> {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const active = parseVectorField3DDocument(serializeVectorField3DDocument(source));
  const { explorer: _workflow, ...display } = active.workspace ?? defaultVectorField3DWorkspace(active.source);
  const baseline = createVectorField3DDocument(active.source, { stableKey,
    title: `${active.metadata.title.slice(0, 135)} · baseline B`, workspace: display });
  if (baseline.identity.id === active.identity.id ||
      current.workspace.entries.some(entry => entry.expected.id === baseline.identity.id))
    throw new TypeError("A baseline requires a new, unused document identity.");
  const document = reviseFieldExplorerWorkflow(active, { inspectorSection: "analyze",
    comparisonSource: baseline.identity, comparisonVisible: true });
  const relation = createDocumentRelation({ kind: "snapshot-of",
    sources: [viewerSourceFromDocument(active)], sourceOrder: "ordered",
    target: { type: "document", generation: viewerSourceFromDocument(baseline) },
    operation: "vector3d.pin-baseline", parameters: {} });
  return { document, baseline, project: replaceMath3DProjectWorkspace(current,
    createMixedWorkspaceDocument({ ...current.workspace,
      entries: [...current.workspace.entries.filter(entry => entry.expected.id !== active.identity.id),
        ...[document, baseline].map(checkpoint => ({ module: "vector3d" as const,
          expected: checkpoint.identity, checkpoint, replay: null }))],
      activeDocumentIds: [...new Set([...current.workspace.activeDocumentIds, active.identity.id])],
      relations: [...current.workspace.relations, relation],
    })) };
}

/** Resolve the exact generation; never silently substitute an edited baseline. */
export function resolveFieldExplorerBaseline(project: Math3DProject | null | undefined,
  document: VectorField3DDocument): VectorField3DDocument | null {
  const pin = fieldExplorerWorkflow(document).comparisonSource;
  if (!pin) return null;
  const source = project?.workspace.entries.find(entry => entry.module === "vector3d" &&
    entry.expected.id === pin.id)?.checkpoint;
  if (source?.format !== "math3d.vector-field3d-document" ||
      source.identity.revision !== pin.revision || source.identity.structuralHash !== pin.structuralHash)
    return null;
  return source;
}

/** Checkpoint edits through the existing Project workspace before saving a dependent result. */
export function checkpointProjectFieldExplorerDocument(project: Math3DProject,
  document: VectorField3DDocument): Math3DProject {
  const checked = parseVectorField3DDocument(serializeVectorField3DDocument(document));
  return replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
    entries: [...project.workspace.entries.filter(entry => entry.expected.id !== checked.identity.id),
      { module: "vector3d", checkpoint: checked, expected: checked.identity, replay: null }],
  }));
}
