import type { ProjectResourceReader, VerifiedProjectResources } from "../projects/projectResources";
import React, { useEffect, useState } from "react";
import {
  createDocumentRelationIndex, inspectMixedWorkspaceAvailability, parseMixedWorkspaceDocument,
  serializeMixedWorkspaceDocument, traceViewerLineage, viewerSourceFromDocument,
  type KernelWorkspaceModule, type MixedWorkspaceDocument, type ViewerProvenanceEvidence,
  type Math3DProject,
  type ProjectQuantumSceneReference,
  type QuantumSceneDocument,
  PLATFORM_FACILITIES,
  createMixedWorkspaceDocument, createWorkspaceProjectHandoff, serializeWorkspaceProjectHandoff, parseWorkspaceProjectHandoff,
  graph2DCompanionCheckpoint, mergeGraph2DHandoffCheckpoint, assertWorkspaceHandoffCanReplace,
} from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { probeRendererPlatformCapabilities } from "../kernel/rendererPlatformCapabilities";
import { ProjectWorkspacePanel } from "./ProjectWorkspacePanel";
import type { Workbook } from "@math3d/workbook";
import type { NoteSelectionDescriptor } from "../projects/projectNoteTargets";
import type { ProjectAnalysisRoute } from "../projects/projectAnalysisAvailability";

const STORAGE_KEY = "math3d.mixed-workspace.v1";
const HANDOFF_KEY = "math3d.graph2d-handoff.v2";

export type KernelWorkspacePanelProps = {
  projectNavigation?: { canBack: boolean; canForward: boolean; back: () => void; forward: () => void; recent: readonly { id: string; module: KernelWorkspaceModule }[] };
  projectsOpen: boolean;
  onProjectsOpenChange: (open: boolean) => void;
  onCurrentProjectChange?: (project: Math3DProject) => void;
  verifiedQuantumScene?: ProjectQuantumSceneReference | null;
  onOpenQuantumScene?: (reference: ProjectQuantumSceneReference) => Promise<void>;
  onVerifyQuantumSceneDocument?: (reference: ProjectQuantumSceneReference) => Promise<QuantumSceneDocument>;
  onRelinkQuantumScene?: (reference: ProjectQuantumSceneReference) => Promise<string | null>;
  captureActiveWorkbook?: () => Workbook | null;
  onOpenWorkbook?: (workbook: Workbook, stageId?: import("@math3d/workbook").WorkbookStageId, blockId?: string) => void;
  onViewProjectWorkbook?: (workbook: Workbook) => void;
  noteRequest?: { id: string; token: number } | null;
  captureNoteSelection?: () => NoteSelectionDescriptor | null;
  captureProjectThumbnail?: () => Promise<string>;
  capture: () => MixedWorkspaceDocument;
  activeModule: KernelWorkspaceModule | null;
  activeProjectDocumentId?: string | null;
  activeEvidence: ViewerProvenanceEvidence | null;
  artifactAvailable?: (artifactId: string, hash?: string | null) => boolean;
  onNavigateModule?: (module: KernelWorkspaceModule) => void;
  onNavigateDocument?: (id: string, module: KernelWorkspaceModule) => void;
  onOpenAnalysis?: (id: string, module: KernelWorkspaceModule, route: ProjectAnalysisRoute, workspace: MixedWorkspaceDocument, resources?: VerifiedProjectResources) => void;
  canNavigateDocument?: (id: string, module: KernelWorkspaceModule) => boolean;
  onReopen?: (workspace: MixedWorkspaceDocument) => void;
  resourceReader?: ProjectResourceReader;
  onRestoreProject?: (workspace: MixedWorkspaceDocument, resources?: VerifiedProjectResources, owner?: Math3DProject) => void;
  graphDocumentId?: string;
};

export const KernelWorkspacePanel: React.FC<KernelWorkspacePanelProps> = ({ projectNavigation, projectsOpen, onProjectsOpenChange, onCurrentProjectChange, verifiedQuantumScene, onOpenQuantumScene, onVerifyQuantumSceneDocument, onRelinkQuantumScene, captureActiveWorkbook, onOpenWorkbook, onViewProjectWorkbook, noteRequest, captureNoteSelection, captureProjectThumbnail, capture, activeModule, activeProjectDocumentId, activeEvidence, artifactAvailable, onNavigateModule, onNavigateDocument, onOpenAnalysis, canNavigateDocument, onReopen, onRestoreProject, graphDocumentId, resourceReader }) => {
  const [open, setOpen] = useState(false);
  const [reopened, setReopened] = useState<MixedWorkspaceDocument | null>(null);
  const [message, setMessage] = useState("No mixed workspace opened.");
  const [platform] = useState(probeRendererPlatformCapabilities);
  const [handoffSession, setHandoffSession] = useState<{ project: MixedWorkspaceDocument; baseRevision: string | null } | null>(() => {
    try { const raw = localStorage.getItem(HANDOFF_KEY); if (!raw) return null;
      const manifest = parseWorkspaceProjectHandoff(raw); return { project: manifest.project, baseRevision: manifest.baseRevision };
    } catch { return null; }
  });
  useEffect(() => {
    if (!graphDocumentId) return;
    try { const raw = localStorage.getItem(HANDOFF_KEY), manifest = raw ? parseWorkspaceProjectHandoff(raw) : null;
      setHandoffSession(manifest?.projectId === graphDocumentId ? { project: manifest.project, baseRevision: manifest.baseRevision } : null);
    } catch { setHandoffSession(null); }
  }, [graphDocumentId]);
  const checkpointWorkspace = () => {
    const workspace = capture(), resolved = verifyMixedWorkspaceReplay(workspace);
    return createMixedWorkspaceDocument({ ...workspace, entries: workspace.entries.map((entry) => {
      const document = resolved.get(entry.expected.id)!;
      return { ...entry, checkpoint: document, expected: document.identity, replay: null };
    }) });
  };
  const captureGraph = () => mergeGraph2DHandoffCheckpoint(handoffSession?.project ?? null, graph2DCompanionCheckpoint(checkpointWorkspace()));
  const exportGraph = () => {
    try {
      const project = captureGraph(), manifest = createWorkspaceProjectHandoff(project, {
        producer: { platform: platform.runtime === "browser" ? "browser" : "desktop", name: "Math3D", version: "1.5.0" },
        baseRevision: handoffSession?.baseRevision ?? null });
      const url = URL.createObjectURL(new Blob([serializeWorkspaceProjectHandoff(manifest)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "Graph.math3d.handoff.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setHandoffSession({ project, baseRevision: handoffSession?.baseRevision ?? null });
      localStorage.setItem(HANDOFF_KEY, serializeWorkspaceProjectHandoff(manifest));
      setMessage("Exported Graph handoff with revision ancestry. Data sidecars transfer separately.");
    } catch (error) { setMessage(`Graph export failed: ${(error as Error).message}`); }
  };
  const importGraph = async (file: File) => {
    try {
      if (file.size > 17 * 1024 * 1024) throw new TypeError("Workspace handoff exceeds its size limit.");
      const incoming = parseWorkspaceProjectHandoff(await file.text()), current = captureGraph();
      // Recompute after asynchronous file I/O; a viewport edit also counts as local divergence.
      const currentId = current.entries.find((entry) => entry.module === "graph2d")!.expected.id;
      if (incoming.projectId === currentId) assertWorkspaceHandoffCanReplace(incoming, current);
      verifyMixedWorkspaceReplay(incoming.project);
      localStorage.setItem(`${STORAGE_KEY}.before-handoff`, serializeMixedWorkspaceDocument(capture()));
      localStorage.setItem(STORAGE_KEY, serializeMixedWorkspaceDocument(incoming.project));
      localStorage.setItem(HANDOFF_KEY, serializeWorkspaceProjectHandoff({ ...incoming, baseRevision: incoming.projectRevision }));
      onReopen?.(incoming.project);
      setHandoffSession({ project: incoming.project, baseRevision: incoming.projectRevision });
      setReopened(incoming.project);
      setMessage("Opened Graph handoff. Previous workspace saved locally; compatible result inputs and companions retained. Domain artifacts remain external.");
    } catch (error) { setMessage(`Graph import failed: ${(error as Error).message}`); }
  };
  const save = () => {
    try {
      let workspace = capture();
      verifyMixedWorkspaceReplay(workspace);
      if (handoffSession) {
        const live = checkpointWorkspace();
        workspace = createMixedWorkspaceDocument({ ...mergeGraph2DHandoffCheckpoint(handoffSession.project, live), constructions: live.constructions });
      }
      localStorage.setItem(STORAGE_KEY, serializeMixedWorkspaceDocument(workspace));
      setReopened(workspace);
      setMessage(`Saved ${workspace.entries.length} canonical document(s) and ${workspace.relations.length} relation(s).`);
    } catch (error) { setMessage(`Save failed: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const reopen = () => {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      if (!text) { setMessage("No mixed workspace has been saved in this runtime."); return; }
      const workspace = parseMixedWorkspaceDocument(text);
      verifyMixedWorkspaceReplay(workspace);
      onReopen?.(workspace);
      setReopened(workspace);
      setMessage(`Reopened and replay-verified ${workspace.entries.length} canonical document(s). Domain artifacts remain external.`);
    } catch (error) { setMessage(`Reopen failed: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const availability = reopened ? inspectMixedWorkspaceAvailability(reopened, (artifact) => artifactAvailable?.(artifact.handle.artifactId, artifact.contentHash) ?? false) : null;
  const sourceById = new Map(reopened?.entries.map((entry) => [entry.expected.id, viewerSourceFromDocument({ identity: entry.expected })]) ?? []);
  const moduleById = new Map(reopened?.entries.map((entry) => [entry.expected.id, entry.module]) ?? []);
  const index = reopened?.relations.length ? createDocumentRelationIndex(reopened.relations) : null;
  return (
    <div data-testid="kernel-workspace-shell" style={{ position: "fixed", right: 14, bottom: 14, zIndex: 2500, fontSize: 11 }}>
      <ProjectWorkspacePanel projectNavigation={projectNavigation} activeProjectDocumentId={activeProjectDocumentId} activeModule={activeModule} captureProjectThumbnail={captureProjectThumbnail} resourceReader={resourceReader} open={projectsOpen} onOpenChange={onProjectsOpenChange} onCurrentProjectChange={onCurrentProjectChange} verifiedQuantumScene={verifiedQuantumScene} onOpenQuantumScene={onOpenQuantumScene} onVerifyQuantumSceneDocument={onVerifyQuantumSceneDocument} onRelinkQuantumScene={onRelinkQuantumScene} captureActiveWorkbook={captureActiveWorkbook} onOpenWorkbook={onOpenWorkbook} onViewProjectWorkbook={onViewProjectWorkbook} noteRequest={noteRequest} captureNoteSelection={captureNoteSelection} capture={capture} onNavigateDocument={onNavigateDocument} onOpenAnalysis={onOpenAnalysis} canNavigateDocument={canNavigateDocument} artifactAvailable={artifactAvailable} onRestoreWorkspace={onRestoreProject ?? onReopen} />
      <button type="button" data-testid="kernel-workspace-toggle" onClick={() => setOpen((value) => !value)}
        style={{ border: "1px solid #64748b", borderRadius: 8, background: "#f8fafc", color: "#0f172a", padding: "7px 10px", fontWeight: 700 }}>
        Kernel workspace
      </button>
      {open && <div data-testid="kernel-workspace-panel" style={{ width: 360, maxWidth: "calc(100vw - 28px)", maxHeight: "min(70vh, 620px)", overflow: "auto", marginBottom: 7,
        border: "1px solid #94a3b8", borderRadius: 10, background: "#fff", boxShadow: "0 10px 30px #0f172a30", padding: 12, display: "grid", gap: 8 }}>
        <strong>Shared Viewer / Inspector provenance</strong>
        <div data-testid="kernel-platform-capabilities" style={{ border: "1px solid #dbeafe", borderRadius: 7, padding: 7 }}>
          Platform: {platform.runtime} · adapter {platform.adapterVersion} · {PLATFORM_FACILITIES.filter((facility) => platform.facilities[facility].available).length}/{PLATFORM_FACILITIES.length} facilities
          <div>{PLATFORM_FACILITIES.filter((facility) => !platform.facilities[facility].available)
            .map((facility) => `${facility}: ${platform.facilities[facility].reason}`).join(" · ") || "All declared facilities available."}</div>
        </div>
        {activeEvidence ? <div data-testid="kernel-active-evidence" style={{ display: "grid", gap: 3 }}>
          <div>{activeModule} · {activeEvidence.status} · revision {activeEvidence.source.revision}</div>
          <div style={{ wordBreak: "break-all" }}>{activeEvidence.source.documentId}</div>
          <div>Authority: {activeEvidence.authority ?? "none"} · Operation: {activeEvidence.operation ?? "none"}</div>
          <div>Method: {activeEvidence.method ?? "none"} · Engine: {activeEvidence.engine ?? "none"}</div>
          <div>Tolerance: {activeEvidence.absoluteTolerance ?? "none"} · Precision: {activeEvidence.precision ?? "none"}</div>
          <div>Artifacts: {activeEvidence.artifacts.length ? activeEvidence.artifacts.map((artifact) => `${artifact.artifactId} ${artifact.available ? "available" : "unavailable"}`).join(", ") : "none"}</div>
          <div>Committed selection: {activeEvidence.selectedEntityIds.length ? activeEvidence.selectedEntityIds.join(", ") : "none"}</div>
          <div>Relations: {activeEvidence.relationIds.length ? activeEvidence.relationIds.length : "none"}</div>
        </div> : <div data-testid="kernel-active-evidence">No canonical document is active in this view.</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" data-testid="kernel-workspace-save" onClick={save}>Save mixed workspace</button>
          <button type="button" data-testid="kernel-workspace-reopen" onClick={reopen}>Reopen and replay</button>
        </div>
        <div data-testid="kernel-workspace-message">{message}</div>
        <div style={{ display: "grid", gap: 5 }}>
          <button type="button" data-testid="graph2d-handoff-export" onClick={exportGraph}>Export Graph handoff</button>
          <label>Open Graph handoff <input type="file" accept="application/json,.json" data-testid="graph2d-handoff-import"
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importGraph(file); }} /></label>
        </div>
        {reopened && <div data-testid="kernel-workspace-reopened" style={{ display: "grid", gap: 5 }}>
          <div>{reopened.entries.length} documents · {reopened.results.length} results · {reopened.relations.length} relations</div>
          <div>{availability?.missingArtifactIds.length ?? 0} missing artifacts · {availability?.unavailableResultIds.length ?? 0} unavailable results</div>
          {reopened.entries.map((entry) => <div key={entry.expected.id} data-testid={`kernel-workspace-entry-${entry.module}`}>
            <button type="button" onClick={() => onNavigateDocument ? onNavigateDocument(entry.expected.id, entry.module) : onNavigateModule?.(entry.module)} disabled={!onNavigateModule && !onNavigateDocument}>
              {entry.module} r{entry.expected.revision}
            </button> <span style={{ wordBreak: "break-all" }}>{entry.expected.id}</span>
          </div>)}
          {index && reopened.relations.map((relation) => {
            const paths = traceViewerLineage(index, relation.target, (id) => sourceById.get(id) ?? null);
            const root = paths[0]?.root;
            const targetModule = root ? moduleById.get(root.documentId) : null;
            return <div key={relation.relationId} data-testid="kernel-workspace-lineage">
              {relation.kind} · {relation.operation} · {paths[0]?.steps[0]?.status ?? relation.status}
              {targetModule && <button type="button" onClick={() => onNavigateModule?.(targetModule)} disabled={!onNavigateModule}>Go to {targetModule} source</button>}
            </div>;
          })}
        </div>}
      </div>}
    </div>
  );
};
