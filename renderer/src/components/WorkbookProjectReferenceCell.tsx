import React, { useEffect, useState } from "react";
import type { KernelWorkspaceModule } from "@math3d/core";
import {
  createNotebookReference,
  inspectNotebookReference,
  normalizeNotebookReference,
  type NotebookReference,
} from "@math3d/workbook";
import type { NotebookProjectContext } from "../workbook/notebookProjectContext";
import { WorkbookAnalysisRerun } from "./WorkbookAnalysisRerun";
import { WorkbookProvenance } from "./WorkbookProvenance";

type Props = {
  reference?: NotebookReference;
  readOnly: boolean;
  getProject: () => NotebookProjectContext | null;
  onChange: (reference: NotebookReference) => void;
  onOpenDocument: (id: string, module: KernelWorkspaceModule) => void;
  onOpenProjects: () => void;
};

const titleFor = (entry: NotebookProjectContext["project"]["workspace"]["entries"][number], context: NotebookProjectContext): string => {
  const saved = context.project.metadata.documents?.[entry.expected.id]?.title;
  if (saved) return saved;
  const metadata = "metadata" in entry.checkpoint ? entry.checkpoint.metadata as { title?: string; label?: string } : null;
  return metadata?.title ?? metadata?.label ?? `${entry.module} · ${entry.expected.id}`;
};

export const WorkbookProjectReferenceCell: React.FC<Props> = ({ reference, readOnly, getProject, onChange, onOpenDocument, onOpenProjects }) => {
  const [context, setContext] = useState<NotebookProjectContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const refresh = () => {
    try {
      setContext(getProject());
      setError(null);
    } catch (cause) {
      setContext(null);
      setError(cause instanceof Error ? cause.message : "Project status could not be read.");
    }
  };
  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 3000); return () => window.clearInterval(timer); }, [reference?.projectId, reference?.targetId, getProject]);

  const validReference = reference ? normalizeNotebookReference(reference) : null;
  const project = context?.project;
  const inspection = validReference && project ? inspectNotebookReference(project, validReference) : null;
  const sourceEntry = validReference && project?.workspace.entries.find((entry) => entry.expected.id === validReference.source.documentId);
  const targetEntry = validReference?.kind === "document" ? sourceEntry : null;
  const result = validReference?.kind === "result" ? inspection?.result : null;
  const currentTitle = targetEntry && context ? titleFor(targetEntry, context) : result?.provenance.operation.type ?? validReference?.targetId;
  const options = project ? [
    ...project.workspace.entries.map((entry) => ({ value: `d:${entry.expected.id}`, label: `${entry.module} · ${titleFor(entry, context!)}` })),
    ...project.workspace.results.map((entry) => ({ value: `r:${entry.resultId}`, label: `Analysis · ${entry.provenance.operation.type} · source r${entry.provenance.source.revision}` })),
  ] : [];

  const link = () => {
    if (!selection) return;
    try {
      const latest = getProject();
      if (!latest?.live) throw new Error("Open the saved project in Projects before linking a cell.");
      const kind = selection.startsWith("d:") ? "document" : "result";
      onChange(createNotebookReference(latest.project, kind, selection.slice(2)));
      setContext(latest);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not link project target.");
    }
  };

  return <div data-testid="workbook-project-reference-cell" style={{ border: "1px solid #bfdbfe", borderRadius: 8, background: "#f8fbff", padding: 10, display: "grid", gap: 7, fontSize: 11 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <strong>Project document or result</strong>
      <button type="button" onClick={refresh} style={{ fontSize: 11 }}>Refresh status</button>
    </div>
    {error && <div role="status" style={{ color: "#b42318" }}>{error}</div>}
    {project ? <div>{project.metadata.title} · {context?.live ? "active named project" : "saved project preview"}</div> : <div>No saved named project is available. Create or open one in Projects, then save it.</div>}
    {!context?.live && <button type="button" onClick={onOpenProjects} style={{ width: "fit-content", fontSize: 11 }}>Open Projects</button>}
    {context?.live && !readOnly && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <select data-testid="workbook-project-reference-target" value={selection} onChange={(event) => setSelection(event.target.value)} style={{ minWidth: 180, maxWidth: "100%", flex: 1 }}>
        <option value="">Choose a Project document or result…</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button type="button" onClick={link} disabled={!selection}>Link selection</button>
    </div>}
    {reference && !validReference && <div role="status" style={{ color: "#b42318" }}>Invalid saved Project reference. Choose a new target from the active Project.</div>}
    {validReference ? <div data-testid="workbook-project-reference-status" style={{ borderTop: "1px solid #dbeafe", paddingTop: 7, display: "grid", gap: 3 }}>
      <strong>{currentTitle ?? validReference.targetId}</strong>
      <span>{validReference.kind === "document" ? "Document" : "Saved result"} · source revision {validReference.source.revision} · {inspection?.status ?? "unresolved"}</span>
      <span style={{ overflowWrap: "anywhere", color: "#64748b" }}>{validReference.targetId}</span>
      <span>{inspection?.reason ?? "Open the referenced Project to verify this link."}</span>
      <WorkbookProvenance project={project ?? null} reference={validReference} reader={context?.readArtifact} />
      {!readOnly && <WorkbookAnalysisRerun context={context} reference={validReference} onRelink={onChange} />}
      <button type="button" disabled={!context?.live || !sourceEntry || inspection?.status === "different-project" || inspection?.status === "missing"} onClick={() => sourceEntry && onOpenDocument(sourceEntry.expected.id, sourceEntry.module)} style={{ width: "fit-content", fontSize: 11 }}>
        {validReference.kind === "result" ? "Open source document" : "Open current document"}
      </button>
    </div> : <div>No target linked yet. The cell will store a Project ID, target ID and source generation.</div>}
  </div>;
};
