import { canonicalJsonStringify, structuralHash } from "./documentIdentity";
import { createMixedWorkspaceDocument, parseMixedWorkspaceDocument, MAX_MIXED_WORKSPACE_BYTES, type MixedWorkspaceDocument } from "./mixedWorkspace";
import { PROJECT_HANDOFF_FORMAT, type ProjectHandoffManifest } from "./projectHandoff";
import type { Graph2DDocument } from "./graph2dDocument";

/** Version 2 of the existing handoff envelope carries checkpointed Graph workspaces. */
export type WorkspaceProjectHandoff = Readonly<{
  format: typeof PROJECT_HANDOFF_FORMAT; version: 2;
  producer: ProjectHandoffManifest["producer"];
  projectId: string; projectRevision: string; baseRevision: string | null;
  contentHashes: { workspace: string }; requiredCapabilities: readonly string[];
  project: MixedWorkspaceDocument;
}>;
const hash = (value: unknown): value is string => typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
const bounded = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const workspaceProjectRevision = (project: MixedWorkspaceDocument): string => structuralHash(project);

/** Export the Graph and its promotion targets, without unrelated desktop workspace tabs. */
export const graph2DCompanionCheckpoint = (project: MixedWorkspaceDocument): MixedWorkspaceDocument => {
  const document = graph(project), ids = new Set<string>([document.identity.id]);
  for (const relation of project.relations) if (relation.operation.startsWith("graph2d.") &&
    relation.sources.some((source) => source.documentId === document.identity.id) && relation.target.type === "document")
    ids.add(relation.target.generation.documentId);
  const results = project.results.filter((result) => ids.has(result.provenance.source.documentId));
  const artifactIds = new Set(results.flatMap((result) => result.artifacts.map((artifact) => artifact.artifactId)));
  return createMixedWorkspaceDocument({ entries: project.entries.filter((entry) => ids.has(entry.expected.id)),
    activeDocumentIds: project.activeDocumentIds.filter((id) => ids.has(id)), results,
    artifacts: project.artifacts.filter((artifact) => artifactIds.has(artifact.handle.artifactId)),
    relations: project.relations.filter((relation) => relation.sources.every((source) => ids.has(source.documentId)) &&
      relation.target.type === "document" && ids.has(relation.target.generation.documentId)),
    committedSelection: project.committedSelection && ids.has(project.committedSelection.source.documentId) ? project.committedSelection : null,
    constructions: [] });
};

/** Preserve imported companion/result descriptors as the live Graph is edited by desktop. */
export const mergeGraph2DHandoffCheckpoint = (retained: MixedWorkspaceDocument | null, live: MixedWorkspaceDocument): MixedWorkspaceDocument => {
  if (!retained || graph(retained).identity.id !== graph(live).identity.id) return live;
  const merge = <T>(a: readonly T[], b: readonly T[], key: (item: T) => string): T[] => [...new Map([...a, ...b].map((item) => [key(item), item])).values()];
  return createMixedWorkspaceDocument({ ...retained,
    entries: merge(retained.entries, live.entries, (entry) => entry.expected.id),
    activeDocumentIds: [...new Set([...retained.activeDocumentIds, ...live.activeDocumentIds])],
    results: merge(retained.results, live.results, (result) => result.resultId),
    artifacts: merge(retained.artifacts, live.artifacts, (artifact) => artifact.handle.artifactId),
    relations: merge(retained.relations, live.relations, (relation) => relation.relationId),
    committedSelection: live.committedSelection });
};
const graph = (project: MixedWorkspaceDocument): Graph2DDocument => {
  const graphs = project.entries.filter((entry) => entry.module === "graph2d");
  if (graphs.length !== 1 || project.entries.some((entry) => entry.replay !== null))
    throw new TypeError("Graph handoff requires exactly one Graph and checkpointed companion documents.");
  return graphs[0]!.checkpoint as Graph2DDocument;
};
const capabilities = (project: MixedWorkspaceDocument): string[] => [...new Set([
  ...project.entries.map((entry) => `workspace.${entry.module}.v1`), ...graph(project).requiredCapabilities,
])].sort();

export const createWorkspaceProjectHandoff = (project: MixedWorkspaceDocument, options: {
  producer: WorkspaceProjectHandoff["producer"]; baseRevision?: string | null;
}): WorkspaceProjectHandoff => {
  const normalized = parseMixedWorkspaceDocument(canonicalJsonStringify(project)), document = graph(normalized);
  const revision = workspaceProjectRevision(normalized);
  const manifest: WorkspaceProjectHandoff = { format: PROJECT_HANDOFF_FORMAT, version: 2, producer: options.producer,
    projectId: document.identity.id, projectRevision: revision, baseRevision: options.baseRevision ?? null,
    contentHashes: { workspace: revision }, requiredCapabilities: capabilities(normalized), project: normalized };
  return parseWorkspaceProjectHandoff(canonicalJsonStringify(manifest));
};

export const parseWorkspaceProjectHandoff = (raw: string): WorkspaceProjectHandoff => {
  if (new TextEncoder().encode(raw).length > MAX_MIXED_WORKSPACE_BYTES + 64 * 1024)
    throw new TypeError("Workspace handoff exceeds its size limit.");
  const value: unknown = JSON.parse(raw);
  const keys = ["format", "version", "producer", "projectId", "projectRevision", "baseRevision", "contentHashes", "requiredCapabilities", "project"];
  if (!record(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key)) ||
    value.format !== PROJECT_HANDOFF_FORMAT || value.version !== 2)
    throw new TypeError("Unsupported workspace project handoff format or version.");
  const producer = value.producer;
  if (!record(producer) || Object.keys(producer).length !== 3 || !["desktop", "mobile", "browser", "legacy"].includes(String(producer.platform)) ||
    !bounded(producer.name) || !bounded(producer.version)) throw new TypeError("Invalid workspace handoff producer.");
  const project = parseMixedWorkspaceDocument(canonicalJsonStringify(value.project)), document = graph(project);
  const revision = workspaceProjectRevision(project);
  if (value.projectId !== document.identity.id || !hash(value.projectRevision) || value.projectRevision !== revision ||
    !record(value.contentHashes) || Object.keys(value.contentHashes).length !== 1 || value.contentHashes.workspace !== revision)
    throw new TypeError("Workspace handoff identity, content hash or revision mismatch.");
  if (value.baseRevision !== null && !hash(value.baseRevision)) throw new TypeError("Invalid workspace handoff base revision.");
  if (canonicalJsonStringify(value.requiredCapabilities) !== canonicalJsonStringify(capabilities(project)))
    throw new TypeError("Workspace handoff capabilities mismatch.");
  return { ...value, project } as WorkspaceProjectHandoff;
};
export const serializeWorkspaceProjectHandoff = (manifest: WorkspaceProjectHandoff): string =>
  canonicalJsonStringify(parseWorkspaceProjectHandoff(canonicalJsonStringify(manifest)));

/** Check ancestry against live data immediately before replacement, including display edits. */
export const assertWorkspaceHandoffCanReplace = (incoming: WorkspaceProjectHandoff, current: MixedWorkspaceDocument): void => {
  const verified = parseWorkspaceProjectHandoff(canonicalJsonStringify(incoming));
  if (verified.projectId !== graph(current).identity.id || verified.baseRevision === null || verified.baseRevision !== workspaceProjectRevision(current))
    throw new TypeError("Handoff conflict: local work differs from the incoming base. Keep local work and resolve the divergence explicitly.");
};
