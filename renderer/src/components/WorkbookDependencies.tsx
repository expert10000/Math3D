import React, { useEffect, useState } from "react";
import type { Math3DProject } from "@math3d/core";
import { addWorkbookDependency, createBlockDependencySource, createNoteDependencySource, createProjectDependencySource,
  inspectWorkbookDependency, refreshWorkbookDependency,
  type Workbook, type WorkbookBlockFreshness, type WorkbookDependency } from "@math3d/workbook";
import type { NotebookProjectContext } from "../workbook/notebookProjectContext";

type Props = {
  workbook: Workbook;
  blockId: string;
  readOnly: boolean;
  getProject: () => NotebookProjectContext | null;
  onChange: (dependencies: WorkbookDependency[]) => void;
  freshness?: WorkbookBlockFreshness;
  project?: Math3DProject | null;
};

export const WorkbookDependencies: React.FC<Props> = ({ workbook, blockId, readOnly, getProject, onChange, freshness, project: liveProject }) => {
  const [context, setContext] = useState<NotebookProjectContext | null>(null);
  const [selection, setSelection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    try { setContext(getProject()); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Project could not be read."); }
  };
  useEffect(() => { refresh(); }, [workbook.id, blockId, liveProject?.identity.id]);
  const project = liveProject === undefined ? context?.project ?? null : liveProject;
  const incoming = (workbook.dependencies ?? []).filter((edge) => edge.targetBlockId === blockId);
  const blocks = workbook.stages.flatMap((stage) => stage.blocks).filter((block) => block.id !== blockId);
  const choices = [
    ...blocks.map((block) => ({ value: `block:${block.id}`, label: `Workbook block · ${block.title}` })),
    ...(context?.live && project ? [
      ...project.workspace.entries.map((entry) => ({ value: `document:${entry.expected.id}`, label: `Project ${entry.module} · ${project.metadata.documents?.[entry.expected.id]?.title ?? entry.expected.id}` })),
      ...project.workspace.results.map((result) => ({ value: `result:${result.resultId}`, label: `Project result · ${result.provenance.operation.type}` })),
      ...(project.notes ?? []).map((note) => ({ value: `note:${note.identity.id}`, label: `Project Note · ${note.title}` })),
    ] : []),
  ];
  const add = () => {
    try {
      const [kind, ...parts] = selection.split(":");
      const id = parts.join(":");
      if (!id) return;
      const latest = kind === "block" ? null : getProject();
      if (kind !== "block" && !latest?.live) throw new Error("Open and save the named Project before linking its content.");
      const source: WorkbookDependency["source"] = kind === "block"
        ? createBlockDependencySource(workbook, id)
        : kind === "note"
          ? createNoteDependencySource(latest!.project, id)
          : kind === "document" || kind === "result"
            ? createProjectDependencySource(latest!.project, kind, id)
            : (() => { throw new TypeError("Unknown dependency type."); })();
      const edge: WorkbookDependency = { id: crypto.randomUUID(), targetBlockId: blockId, source };
      const next = addWorkbookDependency(workbook, edge, latest?.project);
      onChange(next.dependencies ?? []);
      setContext(latest ?? context);
      setSelection("");
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add dependency."); }
  };
  const refreshLink = (edgeId: string) => {
    try {
      const edge = workbook.dependencies?.find((item) => item.id === edgeId);
      const latest = edge?.source.kind === "block" ? context : getProject();
      const next = refreshWorkbookDependency(workbook, edgeId, latest?.live ? latest.project : null);
      onChange(next.dependencies ?? []);
      setContext(latest);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh dependency."); }
  };
  return <details data-testid={`workbook-dependencies-${blockId}`} style={{ marginTop: 8, padding: 7, border: "1px solid #dbeafe", borderRadius: 7, background: "#f8fbff", fontSize: 11 }}>
    <summary style={{ cursor: "pointer", fontWeight: 700 }}>Dependencies ({incoming.length})</summary>
    <div style={{ display: "grid", gap: 6, marginTop: 7 }}>
      {freshness && freshness.status !== "current" && <div role="status" style={{ color: freshness.status === "stale" ? "#92400e" : "#b91c1c" }}>
        {freshness.status}: {freshness.reason}
        {freshness.path.length > 1 && <div>Affected path: {freshness.path.map((id) =>
          workbook.stages.flatMap((stage) => stage.blocks).find((block) => block.id === id)?.title ?? id).join(" → ")}</div>}
      </div>}
      {incoming.map((edge) => {
        const status = inspectWorkbookDependency(edge, workbook, project);
        const source = edge.source;
        const label = source.kind === "block"
          ? `Block · ${blocks.find((block) => block.id === source.blockId)?.title ?? source.blockId}`
          : source.kind === "note"
            ? `Note · ${project?.notes?.find((note) => note.identity.id === source.noteId)?.title ?? source.noteId} · r${source.revision}`
            : `${source.reference.kind === "document" ? "Document" : "Saved result"} · ${source.reference.targetId} · r${source.reference.source.revision}`;
        return <div key={edge.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ overflowWrap: "anywhere", flex: 1 }} title={status.reason}>{label} · <strong>{status.status}</strong></span>
          {!readOnly && status.status === "stale" && <button type="button" onClick={() => refreshLink(edge.id)}>Refresh link</button>}
          {!readOnly && <button type="button" onClick={() => onChange((workbook.dependencies ?? []).filter((item) => item.id !== edge.id))}>Remove</button>}
        </div>;
      })}
      {incoming.length === 0 && <span>No dependency links. Add a source to record what this block relies on.</span>}
      {!readOnly && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <select aria-label="Dependency source" value={selection} onChange={(event) => setSelection(event.target.value)} style={{ flex: 1, minWidth: 180 }}>
          <option value="">Choose block, Project document, result or Note…</option>
          {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
        <button type="button" disabled={!selection} onClick={add}>Add link</button>
        <button type="button" onClick={refresh}>Refresh</button>
      </div>}
      {error && <span role="status" style={{ color: "#b42318" }}>{error}</span>}
      {!context?.live && <span>Project documents, results and Notes appear after opening a saved named Project.</span>}
    </div>
  </details>;
};
