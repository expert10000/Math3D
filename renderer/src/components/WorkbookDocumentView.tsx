import React from "react";
import type { KernelWorkspaceModule, Math3DProject } from "@math3d/core";
import { inspectNotebookReference, type NotebookArtifactReader, type Workbook, type WorkbookBlock, type WorkbookStageId } from "@math3d/workbook";
import type { NotebookProjectContext } from "../workbook/notebookProjectContext";
import { WorkbookAnalysisRerun } from "./WorkbookAnalysisRerun";
import { WorkbookSnapshotRecord } from "./WorkbookSnapshotRecord";
import { WorkbookProvenance } from "./WorkbookProvenance";
import { WorkbookClaimEditor } from "./WorkbookClaimEditor";
import { renderNotebookMarkdown, renderNotebookMath, workbookDocumentContentHtml } from "../workbook/notebookContent";
import { WorkbookContentEditor } from "./WorkbookContentEditor";
import "katex/dist/katex.min.css";
import { projectNoteRenderedBody } from "../projects/projectNoteValues";

type Props = {
  workbook: Workbook;
  context?: NotebookProjectContext | null;
  project: Math3DProject | null;
  projectLive: boolean;
  readArtifact?: NotebookArtifactReader;
  readOnly: boolean;
  statusFor: (block: WorkbookBlock) => { state: string; label: string };
  onUpdateBlock: (stageId: WorkbookStageId, blockId: string, patch: Partial<WorkbookBlock>) => void;
  onEditBlock: (stageId: WorkbookStageId, blockId: string) => void;
  onOpenDocument: (id: string, module: KernelWorkspaceModule) => void;
  onOpenProjects: () => void;
  onOpenNote: (noteId: string) => void;
};

const blockKinds: Record<WorkbookBlock["type"], string> = {
  text: "Text", formula: "Equation", reference: "Project reference", visualize: "Figure",
  compute: "Result", interaction: "Interaction", assert: "Check",
};

/** A reading surface over the live Workbook model. Project targets are resolved by ID, never copied. */
export const WorkbookDocumentView: React.FC<Props> = ({
  workbook, context, project, projectLive, readArtifact, readOnly, statusFor, onUpdateBlock, onEditBlock, onOpenDocument, onOpenProjects, onOpenNote,
}) => {
  const projectWorkbook = project?.workbooks?.find((item) => item.id === workbook.id);
  return <article data-testid="workbook-document-view" style={{ display: "grid", gap: 16, fontSize: 12, minWidth: 0 }}>
    <header style={{ borderBottom: "1px solid #cbd5e1", paddingBottom: 10 }}>
      <div style={{ color: "#475569", fontSize: 11 }}>
        <button type="button" onClick={onOpenProjects} style={{ padding: "2px 6px", fontSize: 11 }}>Projects</button>
        {" / "}{projectWorkbook ? `${project?.metadata.title} / Workbook` : "Personal Workbook"}
      </div>
      <h2 style={{ margin: "8px 0 3px", fontSize: 20 }}>{workbook.title}</h2>
      <div style={{ color: "#64748b", fontSize: 11 }}>
        {projectWorkbook
          ? `Project resource · revision ${projectWorkbook.revision}${projectLive ? " · active Project" : " · saved Project preview"}`
          : "Save this Workbook from Projects to make it part of a named Project."}
      </div>
    </header>
    {workbook.stages.map((stage, stageIndex) => <section key={stage.id} aria-labelledby={`wb-document-stage-${stage.id}`} style={{ display: "grid", gap: 10 }}>
      <h3 id={`wb-document-stage-${stage.id}`} style={{ margin: 0, fontSize: 16, color: "#1f3556" }}>
        {stageIndex + 1}. {stage.title}
      </h3>
      {stage.blocks.length === 0 && <p style={{ margin: 0, color: "#64748b" }}>No blocks in this stage.</p>}
      {stage.blocks.map((block) => {
        const status = statusFor(block);
        const reference = block.notebookReference;
        const inspection = reference && project ? inspectNotebookReference(project, reference) : null;
        const source = reference && project?.workspace.entries.find((entry) => entry.expected.id === reference.source.documentId);
        const sourceTitle = source && project?.metadata.documents?.[source.expected.id]?.title;
        const notes = workbook.dependencies?.filter((edge) => edge.targetBlockId === block.id && edge.source.kind === "note") ?? [];
        const runs = block.compute?.runHistory ?? [];
        const latestRun = runs[runs.length - 1];
        const snapshots = [block.visualize?.snapshotA ?? block.visualize?.snapshot, block.visualize?.snapshotB].filter((value) => value != null);
        return <section key={block.id} data-testid={`workbook-document-block-${block.id}`} aria-labelledby={`wb-document-block-${block.id}`}
          style={{ border: "1px solid #dbe2ea", borderLeft: "4px solid #2563eb", borderRadius: 8, padding: 12, background: "#fff", display: "grid", gap: 7, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <small style={{ color: "#64748b" }}>{blockKinds[block.type]}</small>
              <h4 id={`wb-document-block-${block.id}`} style={{ margin: "2px 0", fontSize: 14 }}>{block.title || blockKinds[block.type]}</h4>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span title={status.state} style={{ color: status.state === "ok" ? "#166534" : "#92400e", fontSize: 11, fontWeight: 700 }}>{status.label}</span>
              <button type="button" onClick={() => onEditBlock(stage.id, block.id)} style={{ fontSize: 11 }}>Edit block</button>
            </div>
          </div>
          {block.type === "visualize" && <WorkbookSnapshotRecord block={block} />}
          {block.type === "text" && <textarea aria-label={`${block.title || "Text"} content`} value={block.text ?? ""}
            onChange={(event) => onUpdateBlock(stage.id, block.id, { text: event.target.value })} readOnly={readOnly}
            rows={Math.max(3, Math.min(12, (block.text ?? "").split("\n").length + 1))}
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", font: "inherit", lineHeight: 1.55, border: readOnly ? "none" : "1px solid #e2e8f0", background: "transparent", padding: 5 }} />}
          {block.type === "text" && <div data-testid="workbook-prose-rendered" style={{ overflowWrap: "anywhere", overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: renderNotebookMarkdown(block.text ?? "") }} />}
          {block.type === "formula" && <textarea aria-label={`${block.title || "Equation"} formula`} value={block.formula ?? ""}
            onChange={(event) => onUpdateBlock(stage.id, block.id, { formula: event.target.value })} readOnly={readOnly} rows={3}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", background: "#f8fafc", border: "1px solid #e2e8f0", padding: 6 }} />}
          {block.type === "formula" && <div data-testid="workbook-equation-rendered" style={{ overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: renderNotebookMath(block.formula ?? "", true) }} />}
          {block.documentContent && <div data-testid="workbook-document-content" style={{ minWidth: 0 }} dangerouslySetInnerHTML={{ __html: workbookDocumentContentHtml(block) ?? "" }} />}
          {(block.type === "text" || block.type === "visualize") && <details><summary>Edit document content</summary><WorkbookContentEditor block={block} readOnly={readOnly} onChange={patch => onUpdateBlock(stage.id, block.id, patch)} /></details>}
          {block.type === "reference" && <div style={{ display: "grid", gap: 4 }}>
            {reference ? <>
              <strong>{reference.kind === "document" ? sourceTitle || source?.module || "Project document" : inspection?.result?.provenance.operation.type || "Project result"}</strong>
              <span>{reference.kind === "document" ? "Document" : "Saved result"} · source revision {reference.source.revision} · {inspection?.status ?? "unresolved"}</span>
              <span style={{ color: "#64748b" }}>{inspection?.reason ?? "Open the named Project to inspect this reference."}</span>
              <WorkbookProvenance project={project} reference={reference} reader={readArtifact} />
              {!readOnly && <WorkbookAnalysisRerun context={context ?? null} reference={reference} onRelink={notebookReference => onUpdateBlock(stage.id, block.id, { notebookReference })} />}
              <button type="button" disabled={!projectLive || !source || inspection?.status === "missing" || inspection?.status === "different-project"}
                onClick={() => source && onOpenDocument(source.expected.id, source.module)} style={{ justifySelf: "start", fontSize: 11 }}>Open source document</button>
            </> : <span>No Project target linked yet.</span>}
          </div>}
          {block.type === "compute" && <div style={{ display: "grid", gap: 4 }}>
            <div>{block.compute?.summary || latestRun?.summary || "No saved result summary."}</div>
            {latestRun && <small>Saved run: {latestRun.status} · {new Date(latestRun.savedAt).toLocaleString()} · input {latestRun.inputHash.slice(0, 12)}</small>}
            {!latestRun && <small>No saved run yet.</small>}
          </div>}
          {block.type === "visualize" && !block.documentContent && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {snapshots.length ? snapshots.map((snapshot, index) => <figure key={index} style={{ margin: 0, maxWidth: 260 }}>
              {snapshot?.thumbnail && <img src={snapshot.thumbnail} alt={`${block.title || "Figure"} snapshot ${index + 1}`} style={{ maxWidth: "100%", maxHeight: 180, objectFit: "contain" }} />}
              <figcaption>{snapshot?.datasetRef ?? "Captured view"} · {snapshot?.viewerKind ?? "viewer"}</figcaption>
            </figure>) : <span>No figure captured yet.</span>}
          </div>}
          {block.type === "assert" && !block.claim && <div>{block.assert?.expected || "No expected condition yet."} · {block.assert?.status ?? "pending"}</div>}
          {block.type === "assert" && <WorkbookClaimEditor key={block.id} workbook={workbook} block={block} project={project} projectLive={projectLive} reader={readArtifact} readOnly={readOnly} onChange={claim => onUpdateBlock(stage.id, block.id, { claim })} />}
          {block.type === "interaction" && <div>{block.interaction?.kind || "Interaction"} · open the Block view to use the controls.</div>}
          {workbook.dependencies?.filter(edge => edge.targetBlockId === block.id && edge.source.kind === "project").map(edge => edge.source.kind === "project" &&
            <WorkbookProvenance key={edge.id} project={project} reference={edge.source.reference} reader={readArtifact} />)}
          {notes.map((edge) => {
            if (edge.source.kind !== "note") return null;
            const noteSource = edge.source;
            const note = project?.identity.id === noteSource.projectId ? project.notes?.find((item) => item.identity.id === noteSource.noteId) : null;
            const current = note && note.identity.revision === noteSource.revision && note.identity.structuralHash === noteSource.hash;
            return <aside key={edge.id} style={{ padding: 8, background: "#eff6ff", borderRadius: 6 }}>
              <small>Project Note · {note ? current ? "current" : "stale" : "missing"}</small>
              <div style={{ fontWeight: 700 }}>{note?.title ?? noteSource.noteId}</div>
              {note && <div style={{ whiteSpace: "pre-wrap" }}>{projectNoteRenderedBody(note, project?.workspace ?? null)}</div>}
              <button type="button" disabled={!note || !projectLive} onClick={() => onOpenNote(noteSource.noteId)} style={{ marginTop: 5, fontSize: 11 }}>Open Note</button>
            </aside>;
          })}
        </section>;
      })}
    </section>)}
  </article>;
};
