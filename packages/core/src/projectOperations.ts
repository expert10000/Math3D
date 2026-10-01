import { createStableDocumentId, type CanonicalJsonValue } from "./documentIdentity";
import { createDocumentRelation } from "./documentRelations";
import { parseMath3DProject, serializeMath3DProject, replaceMath3DProjectWorkspace, updateMath3DProjectMetadata, type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument, type KernelWorkspaceDocument } from "./mixedWorkspace";
import { buildProjectExplorer } from "./projectExplorer";
import { viewerSourceFromDocument } from "./viewerProvenance";

const requireProject = (project: Math3DProject) => parseMath3DProject(serializeMath3DProject(project));
const requireEntry = (project: Math3DProject, id: string) => {
  const entry = project.workspace.entries.find((entry) => entry.expected.id === id);
  if (!entry) throw new TypeError("Project document is missing.");
  return entry;
};
/** Exact reference scan is conservative for opaque module extensions/constructions. */
const references = (value: unknown, id: string): boolean => value === id || (!!value && typeof value === "object" && Object.values(value).some((child) => references(child, id)));
export const setProjectDocumentMetadata = (project: Math3DProject, id: string, change: { title?: string; archived?: boolean }): Math3DProject => {
  const current = requireProject(project); requireEntry(current, id);
  return updateMath3DProjectMetadata(current, { ...current.metadata, documents: { ...current.metadata.documents,
    [id]: { ...current.metadata.documents?.[id], ...change, ...(change.title !== undefined ? { title: change.title.trim() } : {}) } } });
};
export const inspectProjectDocumentDelete = (project: Math3DProject, id: string) => {
  const current = requireProject(project); requireEntry(current, id);
  const ownedResultIds = current.workspace.results.filter((result) => result.provenance.source.documentId === id).map((result) => result.resultId);
  const dependentDocumentIds = new Set(current.workspace.entries.filter((entry) => entry.expected.id !== id && (references(entry, id) || ownedResultIds.some((resultId) => references(entry, resultId)))).map((entry) => entry.expected.id));
  const queue = [id], visited = new Set<string>();
  const dependentResultIds = new Set<string>(), dependentArtifactIds = new Set<string>();
  while (queue.length) {
    const source = queue.shift()!; if (visited.has(source)) continue; visited.add(source);
    for (const relation of current.workspace.relations.filter((relation) => relation.sources.some((entry) => entry.documentId === source))) {
      if (relation.target.type === "document" && relation.target.generation.documentId !== id) {
        dependentDocumentIds.add(relation.target.generation.documentId); queue.push(relation.target.generation.documentId);
      } else if (relation.target.type === "result" && !ownedResultIds.includes(relation.target.resultId)) dependentResultIds.add(relation.target.resultId);
      else if (relation.target.type === "artifact") dependentArtifactIds.add(relation.target.artifactId);
    }
  }
  for (const result of current.workspace.results) if (!ownedResultIds.includes(result.resultId) && (references(result, id) || ownedResultIds.some((resultId) => references(result, resultId)))) dependentResultIds.add(result.resultId);
  const dependentRelationIds = current.workspace.relations.filter((relation) =>
    !(relation.target.type === "document" && relation.target.generation.documentId === id) &&
    !(relation.target.type === "result" && ownedResultIds.includes(relation.target.resultId)) &&
    (references(relation.parameters, id) || ownedResultIds.some((resultId) => references(relation, resultId)))).map((relation) => relation.relationId);
  const constructionReferences = current.workspace.constructions.some((construction) => references(construction, id) || ownedResultIds.some((resultId) => references(construction, resultId)));
  return { id, ownedResultIds, dependentDocumentIds: [...dependentDocumentIds].sort(), dependentResultIds: [...dependentResultIds].sort(),
    dependentArtifactIds: [...dependentArtifactIds].sort(), dependentRelationIds, constructionReferences,
    canDelete: !dependentDocumentIds.size && !dependentResultIds.size && !dependentArtifactIds.size && !dependentRelationIds.length && !constructionReferences };
};
/** Delete only an isolated document and its owned results; retain external artifact bytes/manifests. */
export const deleteProjectDocument = (project: Math3DProject, id: string): Math3DProject => {
  const current = requireProject(project), impact = inspectProjectDocumentDelete(current, id);
  if (!impact.canDelete) throw new TypeError("Delete blocked: dependent documents, results, artifacts or construction references remain.");
  const results = new Set(impact.ownedResultIds);
  const workspace = createMixedWorkspaceDocument({ ...current.workspace,
    entries: current.workspace.entries.filter((entry) => entry.expected.id !== id),
    activeDocumentIds: current.workspace.activeDocumentIds.filter((entry) => entry !== id),
    results: current.workspace.results.filter((result) => !results.has(result.resultId)),
    relations: current.workspace.relations.filter((relation) => !relation.sources.some((source) => source.documentId === id) &&
      !(relation.target.type === "document" && relation.target.generation.documentId === id) && !(relation.target.type === "result" && results.has(relation.target.resultId))),
    committedSelection: current.workspace.committedSelection?.source.documentId === id ? null : current.workspace.committedSelection });
  const documents = { ...current.metadata.documents }; delete documents[id];
  return replaceMath3DProjectWorkspace({ ...current, metadata: { ...current.metadata, documents } }, workspace);
};
/** Fork a verified source snapshot. Results stay attached to their original source; replay is checkpointed for the new identity. */
export const duplicateProjectDocument = (project: Math3DProject, id: string, token: string, resolved: ReadonlyMap<string, KernelWorkspaceDocument>): Math3DProject => {
  const current = requireProject(project), tree = buildProjectExplorer(current, resolved), entry = requireEntry(current, id), document = resolved.get(id)!;
  if (!token.trim() || token.length > 200) throw new TypeError("Invalid duplicate token.");
  const nextId = createStableDocumentId(entry.module, { duplicateOf: id, projectId: current.identity.id, token });
  if (current.workspace.entries.some((item) => item.expected.id === nextId)) throw new TypeError("Duplicate identity already exists.");
  const source = "source" in document ? document.source : document;
  if (references("source" in document ? source : { function: document.function, parameters: document.parameters }, id)) throw new TypeError("Self-referencing source requires a module-specific copy adapter.");
  const identity = { ...document.identity, id: nextId, revision: 1 };
  let checkpoint: KernelWorkspaceDocument = { ...document, identity };
  if (checkpoint.format === "math3d.topology-document") checkpoint = { ...checkpoint, canonicalComplex: null, results: [], displayRealizations: [] };
  if (checkpoint.format === "math3d.complex-analysis-document") checkpoint = { ...checkpoint, results: [] };
  const generation = viewerSourceFromDocument({ identity });
  const parents = current.workspace.relations.filter((relation) => relation.target.type === "document" && relation.target.generation.documentId === id)
    .map((relation) => createDocumentRelation({ ...relation, target: { type: "document", generation } }));
  const snapshot = createDocumentRelation({ kind: "snapshot-of", sources: [viewerSourceFromDocument(document)], sourceOrder: "ordered",
    target: { type: "document", generation }, operation: "projects.duplicate-document", parameters: { copiedResults: false } as CanonicalJsonValue });
  const workspace = createMixedWorkspaceDocument({ ...current.workspace,
    entries: [...current.workspace.entries, { module: entry.module, checkpoint, expected: identity, replay: null }],
    relations: [...current.workspace.relations, ...parents, snapshot] });
  const title = tree.groups.flatMap((group) => group.documents).find((item) => item.id === id)!.title;
  return setProjectDocumentMetadata(replaceMath3DProjectWorkspace(current, workspace), nextId, { title: `${title.slice(0, 155)} copy`, archived: false });
};
