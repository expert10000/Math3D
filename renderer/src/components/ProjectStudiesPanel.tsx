import { lazy, Suspense, useState } from "react";
import { inspectProjectStudyMembers, qualifyProjectQwzPair, qualifyProjectQwzQuadStudy,
  type KernelWorkspaceModule, type Math3DProject } from "@math3d/core";
import type { VerifiedProjectResources } from "../projects/projectResources";
import { qualifyStudyGraphCurveLink, studyHasQualifiedGraphCurveLink } from "../projects/studyGraphCurveLink";
import { StudyGraphCurveControl } from "./StudyGraphCurveControl";
import { StudyQwzCursorControl } from "./StudyQwzCursorControl";

const StudyPanePreview = lazy(() => import("./StudyPanePreview").then(module => ({ default: module.StudyPanePreview })));

type DocumentChoice = Readonly<{ id: string; title: string; module: KernelWorkspaceModule }>;
type Props = Readonly<{ project: Math3DProject; documents: readonly DocumentChoice[]; editable: boolean;
  resources?: VerifiedProjectResources;
  onCreate: (title: string, ids: readonly string[]) => void; onRename: (id: string, title: string) => void;
  onFork: (id: string, title: string) => void; onLink: (id: string) => void;
  onCreateQwz: (quantumStudyId: string) => void;
  onPinQwz: (studyId: string, sampleIndex: number) => void;
  onOpenDocument: (id: string, module: KernelWorkspaceModule) => void }>;

/** A Study is a saved layout of references; opening a pane delegates to its owning document. */
export function ProjectStudiesPanel({ project, documents, editable, resources, onCreate, onRename, onFork,
  onLink, onCreateQwz, onPinQwz, onOpenDocument }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [visiblePaneId, setVisiblePaneId] = useState<string | null>(null);
  const studies = project.workspace.studies ?? [];
  const open = studies.find(study => study.id === openId) ?? null;
  const graphCurvePair = open ? qualifyStudyGraphCurveLink(project, open) : null;
  const graphCurveLinked = !!open && !!graphCurvePair && studyHasQualifiedGraphCurveLink(open, graphCurvePair);
  const qwzPair = open ? qualifyProjectQwzQuadStudy(project, open) : null;
  const choiceById = new Map(documents.map(document => [document.id, document]));
  const statusByMember = new Map(open ? inspectProjectStudyMembers(project, open).map(item => [item.memberId, item.status]) : []);
  const statusLabel = { "current-reference": "Source current", changed: "Source changed",
    "missing-document": "Document missing", "missing-result": "Result missing" } as const;
  return <section className="project-dashboard-card" data-testid="project-studies-panel" aria-label="Project Studies">
    <div className="project-dashboard-card-heading"><h4>Studies</h4><span>{studies.length}</span></div>
    <p>Save a question and pane layout using existing Project documents.</p>
    {editable && <div data-testid="project-study-create">
      <label>Study title <input aria-label="Study title" value={title} maxLength={160}
        onChange={event => setTitle(event.target.value)} /></label>
      <div role="group" aria-label="Study documents">{documents.map(document => <label key={document.id} style={{ display: "block" }}>
        <input type="checkbox" data-testid={`project-study-choose-${document.id}`} checked={selected.includes(document.id)}
          disabled={!selected.includes(document.id) && selected.length >= 4}
          onChange={event => setSelected(current => event.target.checked ? [...current, document.id] :
            current.filter(id => id !== document.id))} />{document.title} · {document.module}
      </label>)}</div>
      <button type="button" data-testid="project-study-create-button" disabled={!title.trim() || !selected.length}
        onClick={() => { onCreate(title.trim(), selected); setTitle(""); setSelected([]); }}>Create Study</button>
    </div>}
    {editable && project.workspace.quantumStudies?.filter(item => item.templateId === "qwz" &&
      qualifyProjectQwzPair(project, item.id)).map(item => <button type="button" key={item.id}
        data-testid={`project-study-create-qwz-${item.id}`} onClick={() => onCreateQwz(item.id)}>
        Create four-view QWZ Study from {item.title}</button>)}
    <ul>{studies.map(study => <li key={study.id}>
      <button type="button" data-testid={`project-study-open-${study.id}`} onClick={() => {
        setOpenId(study.id); setEditTitle(study.title); setVisiblePaneId(null);
      }}>{study.title}</button> · {study.layout.mode} · {study.members.length} members
    </li>)}</ul>
    {open && <div data-testid="project-study-view" data-study-id={open.id}>
      <h5>{open.title}</h5>
      {editable && <div><label>Rename Study <input aria-label="Rename Study" value={editTitle}
        onChange={event => setEditTitle(event.target.value)} /></label>
        <button type="button" data-testid="project-study-rename" disabled={!editTitle.trim()}
          onClick={() => onRename(open.id, editTitle.trim())}>Rename</button>
        <button type="button" data-testid="project-study-fork" onClick={() => onFork(open.id, `${open.title} copy`)}>Fork</button></div>}
      {graphCurvePair && !graphCurveLinked && editable && <button type="button" data-testid="project-study-link-graph-curve"
        onClick={() => onLink(open.id)}>Link promoted Graph and Curve</button>}
      {graphCurvePair && graphCurveLinked && <StudyGraphCurveControl project={project} pair={graphCurvePair} studyId={open.id} />}
      {qwzPair && <StudyQwzCursorControl project={project} pair={qwzPair} study={open}
        editable={editable} onPin={onPinQwz} />}
      <div data-testid="project-study-panes" data-layout={open.layout.mode} style={{ display: "grid",
        gridTemplateColumns: open.layout.mode === "single" || open.layout.mode === "tabs" ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {open.layout.panes.map(pane => {
          const member = open.members.find(item => item.memberId === pane.memberId)!;
          const choice = choiceById.get(member.documentId);
          const status = statusByMember.get(member.memberId) ?? "missing-document";
          const workspaceEntry = project.workspace.entries.find(entry => entry.expected.id === member.documentId);
          return <div key={pane.paneId} data-testid={`project-study-pane-${pane.paneId}`} style={{ border: "1px solid #cbd5e1", padding: 8, minWidth: 0, overflow: "hidden" }}>
            <strong>{choice?.title ?? member.documentId}</strong><p>{member.role} · {statusLabel[status]} · saved r{member.expected.revision}</p>
            <button type="button" disabled={!workspaceEntry}
              onClick={() => { if (workspaceEntry) onOpenDocument(member.documentId, workspaceEntry.module); }}>Open source document</button>
            <button type="button" data-testid={`project-study-preview-toggle-${pane.paneId}`}
              onClick={() => setVisiblePaneId(current => current === pane.paneId ? null : pane.paneId)}>
              {visiblePaneId === pane.paneId ? "Hide preview" : "Show preview"}</button>
            {visiblePaneId === pane.paneId && <Suspense fallback={<p role="status">Loading Study pane…</p>}>
              <StudyPanePreview project={project} study={open} paneId={pane.paneId} resources={resources} />
            </Suspense>}
          </div>;
        })}
      </div>
    </div>}
  </section>;
}
