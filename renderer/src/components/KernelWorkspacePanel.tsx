import React, { useState } from "react";
import {
  createDocumentRelationIndex, inspectMixedWorkspaceAvailability, parseMixedWorkspaceDocument,
  serializeMixedWorkspaceDocument, traceViewerLineage, viewerSourceFromDocument,
  type KernelWorkspaceModule, type MixedWorkspaceDocument, type ViewerProvenanceEvidence,
} from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

const STORAGE_KEY = "math3d.mixed-workspace.v1";

export type KernelWorkspacePanelProps = {
  capture: () => MixedWorkspaceDocument;
  activeModule: KernelWorkspaceModule | null;
  activeEvidence: ViewerProvenanceEvidence | null;
  artifactAvailable?: (artifactId: string) => boolean;
  onNavigateModule?: (module: KernelWorkspaceModule) => void;
};

export const KernelWorkspacePanel: React.FC<KernelWorkspacePanelProps> = ({ capture, activeModule, activeEvidence, artifactAvailable, onNavigateModule }) => {
  const [open, setOpen] = useState(false);
  const [reopened, setReopened] = useState<MixedWorkspaceDocument | null>(null);
  const [message, setMessage] = useState("No mixed workspace opened.");
  const save = () => {
    try {
      const workspace = capture();
      verifyMixedWorkspaceReplay(workspace);
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
      setReopened(workspace);
      setMessage(`Reopened and replay-verified ${workspace.entries.length} canonical document(s). Domain artifacts remain external.`);
    } catch (error) { setMessage(`Reopen failed: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const availability = reopened ? inspectMixedWorkspaceAvailability(reopened, (artifact) => artifactAvailable?.(artifact.handle.artifactId) ?? false) : null;
  const sourceById = new Map(reopened?.entries.map((entry) => [entry.expected.id, viewerSourceFromDocument({ identity: entry.expected })]) ?? []);
  const moduleById = new Map(reopened?.entries.map((entry) => [entry.expected.id, entry.module]) ?? []);
  const index = reopened?.relations.length ? createDocumentRelationIndex(reopened.relations) : null;
  return (
    <div data-testid="kernel-workspace-shell" style={{ position: "fixed", right: 14, bottom: 14, zIndex: 2500, fontSize: 11 }}>
      <button type="button" data-testid="kernel-workspace-toggle" onClick={() => setOpen((value) => !value)}
        style={{ border: "1px solid #64748b", borderRadius: 8, background: "#f8fafc", color: "#0f172a", padding: "7px 10px", fontWeight: 700 }}>
        Kernel workspace
      </button>
      {open && <div data-testid="kernel-workspace-panel" style={{ width: 360, maxWidth: "calc(100vw - 28px)", maxHeight: "min(70vh, 620px)", overflow: "auto", marginBottom: 7,
        border: "1px solid #94a3b8", borderRadius: 10, background: "#fff", boxShadow: "0 10px 30px #0f172a30", padding: 12, display: "grid", gap: 8 }}>
        <strong>Shared Viewer / Inspector provenance</strong>
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
        {reopened && <div data-testid="kernel-workspace-reopened" style={{ display: "grid", gap: 5 }}>
          <div>{reopened.entries.length} documents · {reopened.results.length} results · {reopened.relations.length} relations</div>
          <div>{availability?.missingArtifactIds.length ?? 0} missing artifacts · {availability?.unavailableResultIds.length ?? 0} unavailable results</div>
          {reopened.entries.map((entry) => <div key={entry.expected.id} data-testid={`kernel-workspace-entry-${entry.module}`}>
            <button type="button" onClick={() => onNavigateModule?.(entry.module)} disabled={!onNavigateModule}>
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
