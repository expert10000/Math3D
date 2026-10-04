import { canonicalJsonStringify, captureProjectResources, createMixedWorkspaceDocument, matchesScientificSourceGeneration,
  parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject, viewerSourceFromDocument,
  type CanonicalJsonValue, type SurfaceDocument, type CurveDocument, type Graph2DDocument, type Graph2DPointTableReference, type Graph2DPointTableStore } from "@math3d/core";
import { Graph2DCommandAdapter, SurfaceCommandAdapter, type SurfaceReplayBundle, CurveCommandAdapter, type CurveReplayBundle, type Graph2DReplayBundle } from "@math3d/kernel";
import { mobileSurfaceUnavailableReason } from "./mobileProjectSurface";
import { mobileCurveUnavailableReason } from "./mobileProjectCurve";
import type { MobileStoredSceneProject } from "./mobileScene";
import { mobileProjectGraphTables, mobileProjectResourceContext, readMobileProjectResources } from "./mobileProjectResources";
import { resolveMobileProjectWorkspace } from "./mobileProjectReplay";

/** Independent Graph kernels; saving keeps the complete surrounding project. */
export class MobileProjectGraphSessions {
  #stored: MobileStoredSceneProject;
  readonly #adapters = new Map<string, Graph2DCommandAdapter>();
  readonly #curves = new Map<string, CurveCommandAdapter>();
  readonly #surfaces = new Map<string, SurfaceCommandAdapter>();
  #tables: Graph2DPointTableStore;
  constructor(stored: MobileStoredSceneProject, readonly fallbackTables?: Graph2DPointTableStore) {
    const project = parseMath3DProject(stored.serializedProject), resolved = resolveMobileProjectWorkspace(project.workspace);
    readMobileProjectResources(stored);
    if (stored.projectType !== "project-preview" || stored.id !== project.identity.id || stored.title !== project.metadata.title)
      throw new TypeError("Mixed project identity is inconsistent.");
    this.#stored = stored; this.#tables = mobileProjectGraphTables(stored, fallbackTables);
    for (const entry of project.workspace.entries) if (entry.module === "graph2d" && !project.metadata.documents?.[entry.expected.id]?.archived)
      this.#adapters.set(entry.expected.id, entry.replay ? Graph2DCommandAdapter.restore(entry.replay.payload as unknown as Graph2DReplayBundle) : new Graph2DCommandAdapter(resolved.get(entry.expected.id) as Graph2DDocument));
    for (const entry of project.workspace.entries) if (entry.module === "curve" && !project.metadata.documents?.[entry.expected.id]?.archived)
      this.#curves.set(entry.expected.id, entry.replay ? CurveCommandAdapter.fromReplayBundle(entry.replay.payload as unknown as CurveReplayBundle) : new CurveCommandAdapter(resolved.get(entry.expected.id) as CurveDocument));
    for (const entry of project.workspace.entries) if (entry.module === "surface" && !project.metadata.documents?.[entry.expected.id]?.archived)
      this.#surfaces.set(entry.expected.id, entry.replay ? SurfaceCommandAdapter.fromReplayBundle(entry.replay.payload as unknown as SurfaceReplayBundle) : new SurfaceCommandAdapter(resolved.get(entry.expected.id) as SurfaceDocument));
  }
  surface(id: string): SurfaceCommandAdapter {
    const adapter = this.#surfaces.get(id);
    if (!adapter) throw new TypeError("This Surface is archived or unavailable.");
    const reason = mobileSurfaceUnavailableReason(adapter.document(), adapter.replayBundle());
    if (reason) throw new TypeError(reason); return adapter;
  }
  curve(id: string): CurveCommandAdapter {
    const adapter = this.#curves.get(id);
    if (!adapter) throw new TypeError("This Curve is archived or unavailable.");
    const reason = mobileCurveUnavailableReason(adapter.document(), adapter.replayBundle());
    if (reason) throw new TypeError(reason); return adapter;
  }
  projectId(): string { return this.#stored.id; }
  has(id: string): boolean { return this.#adapters.has(id); }
  hasCurve(id: string): boolean { return this.#curves.has(id); }
  hasSurface(id: string): boolean { return this.#surfaces.has(id); }
  /** A session ref can change before React has replaced the previous editor state. */
  snapshotForOpenDocumentIds(ids: readonly (string | undefined)[]): MobileStoredSceneProject | null {
    const id = ids.find(id => id !== undefined && (this.has(id) || this.hasCurve(id) || this.hasSurface(id)));
    return id ? this.snapshot(id) : null;
  }
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
  snapshot(activeDocumentId = this.#stored.activeSurfaceDocumentId ?? this.#stored.activeCurveDocumentId ?? this.#stored.activeGraphDocumentId, now = Date.now()): MobileStoredSceneProject {
    const project = parseMath3DProject(this.#stored.serializedProject);
    if (activeDocumentId) { if (this.#surfaces.has(activeDocumentId)) this.surface(activeDocumentId); else if (this.#curves.has(activeDocumentId)) this.curve(activeDocumentId); else this.adapter(activeDocumentId); }
    const entries = project.workspace.entries.map(entry => {
      const surface = this.#surfaces.get(entry.expected.id);
      if (surface) {
        const bundle = surface.replayBundle();
        if (!entry.replay && bundle.transactions.length === 0) return entry;
        return { ...entry, checkpoint: bundle.checkpoint, expected: surface.document().identity,
          replay: { format: "math3d.surface-replay.v1", payload: bundle as unknown as CanonicalJsonValue } };
      }
      const curve = this.#curves.get(entry.expected.id);
      if (curve) {
        const bundle = curve.replayBundle();
        if (!entry.replay && bundle.transactions.length === 0) return entry;
        return { ...entry, checkpoint: bundle.checkpoint, expected: curve.document().identity,
          replay: { format: "math3d.curve-replay.v1", payload: bundle as unknown as CanonicalJsonValue } };
      }
      const adapter = this.#adapters.get(entry.expected.id); if (!adapter) return entry;
      const bundle = adapter.exportReplay();
      if (!entry.replay && bundle.transactions.length === 0) return entry;
      return { ...entry, checkpoint: bundle.checkpoint.document, expected: adapter.document().identity,
        replay: { format: "math3d.graph2d-replay.v1", payload: bundle as unknown as CanonicalJsonValue } };
    });
    const selected = project.workspace.committedSelection;
    const selectedAdapter = selected && (this.#adapters.get(selected.source.documentId) ?? this.#curves.get(selected.source.documentId) ?? this.#surfaces.get(selected.source.documentId));
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
    const { activeSurfaceDocumentId: _surface, activeGraphDocumentId: _graph, activeCurveDocumentId: _curve, ...stored } = this.#stored;
    return { ...stored, updatedAt: now, lastOpenedAt: now, serializedProject: serializeMath3DProject(nextProject),
      ...(activeDocumentId && this.#adapters.has(activeDocumentId) ? { activeGraphDocumentId: activeDocumentId } : {}),
      ...(activeDocumentId && this.#surfaces.has(activeDocumentId) ? { activeSurfaceDocumentId: activeDocumentId } : {}),
      ...(activeDocumentId && this.#curves.has(activeDocumentId) ? { activeCurveDocumentId: activeDocumentId } : {}),
      ...(this.#stored.projectResources !== undefined || resources.sidecars().length ? { projectResources: resources.sidecars() } : {}) };
  }
}
