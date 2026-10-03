import { canonicalJsonStringify, captureProjectResources, createMixedWorkspaceDocument, matchesScientificSourceGeneration,
  parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject, viewerSourceFromDocument,
  type CanonicalJsonValue, type Graph2DDocument, type Graph2DPointTableReference, type Graph2DPointTableStore } from "@math3d/core";
import { Graph2DCommandAdapter, type Graph2DReplayBundle } from "@math3d/kernel";
import type { MobileStoredSceneProject } from "./mobileScene";
import { mobileProjectGraphTables, mobileProjectResourceContext, readMobileProjectResources } from "./mobileProjectResources";
import { resolveMobileProjectWorkspace } from "./mobileProjectReplay";

/** Independent Graph kernels; saving keeps the complete surrounding project. */
export class MobileProjectGraphSessions {
  #stored: MobileStoredSceneProject;
  readonly #adapters = new Map<string, Graph2DCommandAdapter>();
  #tables: Graph2DPointTableStore;
  constructor(stored: MobileStoredSceneProject, readonly fallbackTables?: Graph2DPointTableStore) {
    const project = parseMath3DProject(stored.serializedProject), resolved = resolveMobileProjectWorkspace(project.workspace);
    readMobileProjectResources(stored);
    if (stored.projectType !== "project-preview" || stored.id !== project.identity.id || stored.title !== project.metadata.title)
      throw new TypeError("Mixed project identity is inconsistent.");
    this.#stored = stored; this.#tables = mobileProjectGraphTables(stored, fallbackTables);
    for (const entry of project.workspace.entries) if (entry.module === "graph2d" && !project.metadata.documents?.[entry.expected.id]?.archived)
      this.#adapters.set(entry.expected.id, entry.replay ? Graph2DCommandAdapter.restore(entry.replay.payload as unknown as Graph2DReplayBundle) : new Graph2DCommandAdapter(resolved.get(entry.expected.id) as Graph2DDocument));
  }
  projectId(): string { return this.#stored.id; }
  has(id: string): boolean { return this.#adapters.has(id); }
  tables(): Graph2DPointTableStore { return this.#tables; }
  adapter(id: string): Graph2DCommandAdapter {
    const adapter = this.#adapters.get(id); if (!adapter) throw new TypeError("This document is archived or has no mobile Graph editor."); return adapter;
  }
  requireEditable(id: string): Graph2DCommandAdapter {
    const adapter = this.adapter(id);
    if (readMobileProjectResources(this.#stored).inventory.some(item => item.kind === "graph-point-table" && item.owners.includes(id) && !item.available))
      throw new TypeError("Graph source tables are missing. Import the matching project resource package before editing.");
    return adapter;
  }
  updateRecord(stored: MobileStoredSceneProject): void {
    if (stored.id !== this.#stored.id) throw new TypeError("Cannot replace this project session identity.");
    readMobileProjectResources(stored); this.#stored = stored; this.#tables = mobileProjectGraphTables(stored, this.fallbackTables);
  }
  snapshot(activeGraphDocumentId = this.#stored.activeGraphDocumentId, now = Date.now()): MobileStoredSceneProject {
    const project = parseMath3DProject(this.#stored.serializedProject);
    if (activeGraphDocumentId) this.adapter(activeGraphDocumentId);
    const entries = project.workspace.entries.map(entry => {
      const adapter = this.#adapters.get(entry.expected.id); if (!adapter) return entry;
      const bundle = adapter.exportReplay();
      if (!entry.replay && bundle.transactions.length === 0) return entry;
      return { ...entry, checkpoint: bundle.checkpoint.document, expected: adapter.document().identity,
        replay: { format: "math3d.graph2d-replay.v1", payload: bundle as unknown as CanonicalJsonValue } };
    });
    const selected = project.workspace.committedSelection;
    const selectedAdapter = selected && this.#adapters.get(selected.source.documentId);
    const workspace = createMixedWorkspaceDocument({ ...project.workspace, entries,
      committedSelection: selected && selectedAdapter && !matchesScientificSourceGeneration(selected.source, viewerSourceFromDocument(selectedAdapter.document())) ? null : selected });
    const nextProject = replaceMath3DProjectWorkspace(project, workspace);
    const retained = readMobileProjectResources(this.#stored).resources;
    const resources = captureProjectResources(nextProject, item => {
      const existing = retained.bytes(item); if (existing) return existing;
      if (item.kind !== "graph-point-table") return null;
      const rows = this.#tables.resolve(item.reference as Graph2DPointTableReference);
      return rows ? new TextEncoder().encode(canonicalJsonStringify(rows)) : null;
    }, true, mobileProjectResourceContext);
    return { ...this.#stored, updatedAt: now, lastOpenedAt: now, serializedProject: serializeMath3DProject(nextProject),
      ...(activeGraphDocumentId ? { activeGraphDocumentId } : {}),
      ...(this.#stored.projectResources !== undefined || resources.sidecars().length ? { projectResources: resources.sidecars() } : {}) };
  }
}
