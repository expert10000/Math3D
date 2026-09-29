import { canonicalJsonStringify, createDocumentIdentity, createStableDocumentId, structuralHash, type CanonicalJsonValue, type DocumentIdentity } from "./documentIdentity";
import { createMixedWorkspaceDocument, type MixedWorkspaceDocument, type KernelWorkspaceDocument } from "./mixedWorkspace";
import { createDocumentRelation } from "./documentRelations";
import type { ScientificSourceGeneration } from "./scientificJobs";
import type { Graph2DDocument } from "./graph2dDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";

/** Copy checkpointed Graph/Curve/Surface projects; expression text, tables and mathematical object IDs remain unchanged. */
export function forkGraph2DWorkspaceProject(input: MixedWorkspaceDocument, token: string, title: string): MixedWorkspaceDocument {
  const workspace = createMixedWorkspaceDocument(input);
  if (!token.trim() || token.length > 200 || !title.trim() || title.trim().length > 160) throw new TypeError("Enter a copy title of 1–160 characters and a valid launch token.");
  if (workspace.entries.filter(e => e.module === "graph2d").length !== 1 || workspace.entries.some(e => e.replay !== null || !["graph2d", "curve", "surface"].includes(e.module)))
    throw new TypeError("Reusable copies require one checkpointed Graph and supported Curve/Surface companions. Save/checkpoint other modules separately first.");
  const ids = new Map<string, DocumentIdentity["id"]>(workspace.entries.map(e => [e.expected.id, createStableDocumentId(e.module, { copyOf: e.expected.id, token })]));
  const identities = new Map<string, DocumentIdentity>();
  const entries = workspace.entries.map(e => {
    const d = e.checkpoint as Graph2DDocument | Extract<KernelWorkspaceDocument, { format: "math3d.curve-document" | "math3d.surface-document" }>;
    let source = d.source;
    if (d.format !== "math3d.graph2d-document") {
      const definition = { ...d.source.definition };
      if (definition.sourceIds) definition.sourceIds = definition.sourceIds.map(id => ids.get(id) ?? id);
      if ("surfaceLink" in definition && definition.surfaceLink) definition.surfaceLink = { ...definition.surfaceLink, surfaceId: ids.get(definition.surfaceLink.surfaceId) ?? definition.surfaceLink.surfaceId };
      source = { ...d.source, definition };
    }
    const identity = createDocumentIdentity(ids.get(d.identity.id)!, source, d.identity.revision);
    identities.set(d.identity.id, identity);
    const checkpoint = { ...d, identity, source, metadata: { ...d.metadata, ...(d.format === "math3d.graph2d-document" ? { title: title.trim() } : {}) } } as KernelWorkspaceDocument;
    return { ...e, checkpoint, expected: identity, replay: null };
  });
  const generation = (s: ScientificSourceGeneration): ScientificSourceGeneration => {
    const previous = workspace.entries.find(e => e.expected.id === s.documentId)?.expected, next = identities.get(s.documentId);
    if (!next) return s;
    return { ...s, documentId: next.id, structuralHash: previous?.revision === s.revision && previous.structuralHash === s.structuralHash ? next.structuralHash : s.structuralHash };
  };
  const resultIds = new Map(workspace.results.map(r => [r.resultId, `graph2d-copy-result:${structuralHash({ original: r.resultId, token }).slice(7)}`]));
  const results = workspace.results.map(r => ({ ...r, resultId: resultIds.get(r.resultId)!,
    provenance: { ...r.provenance, source: generation(r.provenance.source), operation: { ...r.provenance.operation,
      parameters: { ...r.provenance.operation.parameters, copiedObservationOf: { resultId: r.resultId, source: r.provenance.source } as CanonicalJsonValue } } },
    warnings: [...r.warnings, "Copied observation; not recomputed. Original result/source generation retained in copiedObservationOf."] }));
  const relations = workspace.relations.map(r => createDocumentRelation({ ...r, sources: r.sources.map(generation),
    target: r.target.type === "document" ? { ...r.target, generation: generation(r.target.generation) } :
      r.target.type === "result" ? { ...r.target, resultId: resultIds.get(r.target.resultId) ?? r.target.resultId } : r.target,
    ...(r.producer ? { producer: { ...r.producer, ...(r.producer.resultIds ? { resultIds: r.producer.resultIds.map(id => resultIds.get(id) ?? id) } : {}) } } : {}) }));
  const originalGraph = workspace.entries.find(e => e.module === "graph2d")!.expected, copiedGraph = identities.get(originalGraph.id)!;
  relations.push(createDocumentRelation({ kind: "snapshot-of", sourceOrder: "ordered", sources: [viewerSourceFromDocument({ identity: originalGraph })],
    target: { type: "document", generation: viewerSourceFromDocument({ identity: copiedGraph }) },
    operation: "graph2d.personal-copy", parameters: { title: title.trim() }, status: "unavailable" }));
  return createMixedWorkspaceDocument({ ...workspace, entries, activeDocumentIds: workspace.activeDocumentIds.map(id => ids.get(id)!), results, relations,
    committedSelection: workspace.committedSelection ? { ...workspace.committedSelection, source: generation(workspace.committedSelection.source) } : null });
}

export type Graph2DProjectFavorites = Readonly<{ format: "math3d.graph2d-project-favorites"; version: 1; ids: readonly string[] }>;
export const emptyGraph2DProjectFavorites = (): Graph2DProjectFavorites => ({ format: "math3d.graph2d-project-favorites", version: 1, ids: [] });
export function parseGraph2DProjectFavorites(raw: string | null): Graph2DProjectFavorites {
  if (raw === null) return emptyGraph2DProjectFavorites();
  if (raw.length > 32768) throw new TypeError("Project favorites exceed their size limit.");
  const v = JSON.parse(raw);
  if (!v || Object.keys(v).sort().join("|") !== "format|ids|version" || v.format !== "math3d.graph2d-project-favorites" || v.version !== 1 ||
    !Array.isArray(v.ids) || v.ids.length > 128 || v.ids.some((id: unknown) => typeof id !== "string" || !/^math3d:graph2d:[0-9a-f]{32}$/.test(id)) || new Set(v.ids).size !== v.ids.length)
    throw new TypeError("Project favorites are corrupt or unsupported. Saved Graph projects remain available.");
  return v;
}
export const toggleGraph2DProjectFavorite = (value: Graph2DProjectFavorites, id: string) => parseGraph2DProjectFavorites(canonicalJsonStringify({ ...value,
  ids: value.ids.includes(id) ? value.ids.filter(i => i !== id) : [...value.ids, id] }));
