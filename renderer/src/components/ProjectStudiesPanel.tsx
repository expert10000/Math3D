import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { migrateLegacyStudyPaneResearchReference, inspectResearchReference, inspectProjectNoteAnchor,
  inspectProjectStudyMembers, qualifyProjectQwzPair, qualifyProjectQwzQuadStudy, structuralHash,
  type KernelWorkspaceModule, type Math3DProject, type ProjectQuantumSceneReference,
  type StudyRecordV1 } from "@math3d/core";
import type { VerifiedProjectResources } from "../projects/projectResources";
import type { WorkbookStageId } from "@math3d/workbook";
import { projectStudyWorkbookReferences } from "../projects/projectStudyReferences";
import { projectNoteSourceResolver } from "../projects/projectNoteTargets";
import { qualifyStudyGraphCurveLink, studyHasQualifiedGraphCurveLink } from "../projects/studyGraphCurveLink";
import { qualifyStudyCurveSurfaceLink, studyHasQualifiedCurveSurfaceLink } from "../projects/studyCurveSurfaceLink";
import { qualifyStudySurfaceMeshLink, studyHasQualifiedSurfaceMeshLink } from "../projects/studySurfaceMeshLink";
import { StudyGraphCurveControl } from "./StudyGraphCurveControl";
import { StudyCurveSurfaceControl } from "./StudyCurveSurfaceControl";
import { StudySurfaceMeshControl } from "./StudySurfaceMeshControl";
import { CatenoidWaistEvidencePanel } from "./CatenoidWaistEvidencePanel";
import { StudyQwzCursorControl } from "./StudyQwzCursorControl";
import { qualifyStudyScientificSelectionPin } from "../projects/projectStudyNoteAnchor";

const StudyPanePreview = lazy(() => import("./StudyPanePreview").then(module => ({ default: module.StudyPanePreview })));

type DocumentChoice = Readonly<{ id: string; title: string; module: KernelWorkspaceModule }>;
type Props = Readonly<{ project: Math3DProject; documents: readonly DocumentChoice[]; editable: boolean;
  resources?: VerifiedProjectResources;
  focusStudy?: Readonly<{ id: string; token: number; selectionId?: string }> | null;
  onCreate: (title: string, ids: readonly string[]) => void; onRename: (id: string, title: string) => void;
  onFork: (id: string, title: string) => void; onLink: (id: string) => void;
  onLinkCurveSurface: (id: string) => void;
  onLinkSurfaceMesh: (id: string) => void;
  onConfigure: (id: string, description: string, mode: StudyRecordV1["layout"]["mode"], paneIds: readonly string[]) => void;
  onCreateQwz: (quantumStudyId: string) => void;
  onPinQwz: (studyId: string, sampleIndex: number) => void;
  onUnpinQwz: (studyId: string) => void;
  onDeriveQwzProfile?: (studyId: string) => Promise<{ graphId: string; resultId: string }>;
  onPinScientificSelection: (studyId: string, selectionId: string) => void;
  workbookBytes?: (id: string) => Uint8Array | null;
  onOpenWorkbookBlock?: (id: string, stageId: WorkbookStageId, blockId: string) => void;
  onCapturePinnedNote?: (studyId: string, memberId: string, selectionId: string) => void;
  onOpenNote?: (id: string) => void;
  onOpenQuantumSource?: (reference: ProjectQuantumSceneReference) => Promise<void>;
  onInspectResult?: (resultId: string) => void;
  onOpenDocument: (id: string, module: KernelWorkspaceModule) => void }>;

/** A Study is a saved layout of references; opening a pane delegates to its owning document. */
export function ProjectStudiesPanel({ project, documents, editable, resources, focusStudy, onCreate, onRename, onFork, onConfigure,
  onLink, onLinkCurveSurface, onLinkSurfaceMesh, onCreateQwz, onPinQwz, onUnpinQwz, onDeriveQwzProfile,
  onPinScientificSelection, workbookBytes, onOpenWorkbookBlock,
  onCapturePinnedNote, onOpenNote,
  onOpenQuantumSource, onInspectResult, onOpenDocument }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [description, setDescription] = useState("");
  const [layoutMode, setLayoutMode] = useState<StudyRecordV1["layout"]["mode"]>("single");
  const [paneOrder, setPaneOrder] = useState<string[]>([]);
  const [visiblePaneId, setVisiblePaneId] = useState<string | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const studies = project.workspace.studies ?? [];
  useEffect(() => {
    const study = studies.find(item => item.id === focusStudy?.id);
    if (!study) return;
    setOpenId(study.id); setEditTitle(study.title); setDescription(study.description ?? "");
    setLayoutMode(study.layout.mode); setPaneOrder(study.layout.panes.map(pane => pane.paneId));
    setVisiblePaneId(null);
    window.requestAnimationFrame(() => viewRef.current?.scrollIntoView({ block: "nearest" }));
  }, [focusStudy?.token, project.identity.id]);
  const open = studies.find(study => study.id === openId) ?? null;
  const workbookReferences = open && workbookBytes ?
    projectStudyWorkbookReferences(project, open, workbookBytes) : [];
  const pinnedNotes = open ? (project.notes ?? []).filter(note =>
    note.anchor?.kind === "study-selection" && note.anchor.studyId === open.id) : [];
  const noteResolver = pinnedNotes.length ? projectNoteSourceResolver(project.identity.id, project.workspace) : null;
  const graphCurvePair = open ? qualifyStudyGraphCurveLink(project, open) : null;
  const graphCurveLinked = !!open && !!graphCurvePair && studyHasQualifiedGraphCurveLink(open, graphCurvePair);
  const curveSurfacePair = open ? qualifyStudyCurveSurfaceLink(project, open) : null;
  const curveSurfaceLinked = !!open && !!curveSurfacePair && studyHasQualifiedCurveSurfaceLink(open, curveSurfacePair);
  const surfaceMesh = open ? qualifyStudySurfaceMeshLink(project, open) : null;
  const surfaceMeshPair = surfaceMesh?.status === "ready" ? surfaceMesh.value : null;
  const surfaceMeshLinked = !!open && !!surfaceMeshPair && studyHasQualifiedSurfaceMeshLink(open, surfaceMeshPair);
  const qwzPair = open ? qualifyProjectQwzQuadStudy(project, open) : null;
  const paneModules = open?.layout.panes.map(pane => {
    const id = open.members.find(member => member.memberId === pane.memberId)?.documentId;
    return project.workspace.entries.find(entry => entry.expected.id === id)?.module ?? "missing";
  }) ?? [];
  const pairKind = paneModules.length === 2 ? [...paneModules].sort().join(":") : "";
  const withheldMember = open && inspectProjectStudyMembers(project, open)
    .find(member => member.status !== "current-reference");
  const availableScientificSelections = open ? (project.workspace.scientificSelections ?? []).filter(selection => {
    if (selection.identity.kind !== "authored" || selection.source?.kind !== "document" ||
      !selection.source.checkpoint) return false;
    const source = selection.source;
    return open.members.some(member => member.documentId === source.documentId &&
      member.expected.revision === source.checkpoint?.revision &&
      member.expected.structuralHash === source.checkpoint.structuralHash);
  }) : [];
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
        setOpenId(study.id); setEditTitle(study.title); setDescription(study.description ?? "");
        setLayoutMode(study.layout.mode); setPaneOrder(study.layout.panes.map(pane => pane.paneId));
        setVisiblePaneId(null);
      }}>{study.title}</button> · {study.layout.mode} · {study.members.length} members
    </li>)}</ul>
    {open && <div ref={viewRef} data-testid="project-study-view" data-study-id={open.id}>
      <h5>{open.title}</h5>
      {focusStudy?.id === open.id && focusStudy.selectionId &&
        <p role="status" data-testid="project-study-focused-selection">
          Returned to saved selection {focusStudy.selectionId} · source qualification required before opening a pane.
        </p>}
      {editable && <div><label>Rename Study <input aria-label="Rename Study" value={editTitle}
        onChange={event => setEditTitle(event.target.value)} /></label>
        <button type="button" data-testid="project-study-rename" disabled={!editTitle.trim()}
          onClick={() => onRename(open.id, editTitle.trim())}>Rename</button>
        <button type="button" data-testid="project-study-fork" onClick={() => onFork(open.id, `${open.title} copy`)}>Fork</button></div>}
      {editable && <fieldset data-testid="project-study-configuration"><legend>Study layout and question</legend>
        <label>Question <textarea aria-label="Study question" maxLength={2000} value={description}
          onChange={event => setDescription(event.target.value)} /></label>
        <label>Layout <select aria-label="Study layout" value={layoutMode}
          onChange={event => setLayoutMode(event.target.value as StudyRecordV1["layout"]["mode"])}>
          {open.layout.panes.length === 1 && <option value="single">Single</option>}
          {open.layout.panes.length === 2 && <option value="split-2">Split</option>}
          {open.layout.panes.length === 4 && <option value="quad">Quad</option>}
          <option value="tabs">Tabs</option>
        </select></label>
        <ol>{paneOrder.map((id, index) => <li key={id}>{id}{index > 0 && <button type="button"
          aria-label={`Move ${id} earlier`} onClick={() => setPaneOrder(current => {
            const next = [...current]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next;
          })}>↑</button>}{index < paneOrder.length - 1 && <button type="button"
          aria-label={`Move ${id} later`} onClick={() => setPaneOrder(current => {
            const next = [...current]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; return next;
          })}>↓</button>}</li>)}</ol>
        <button type="button" data-testid="project-study-save-configuration" onClick={() =>
          onConfigure(open.id, description, layoutMode, paneOrder)}>Save Study layout</button>
      </fieldset>}
      {pairKind && ["curve:graph2d", "curve:surface", "mesh:surface"].includes(pairKind) &&
        <p role="status" data-testid="project-study-cursor-qualification">{withheldMember ?
          `Linked selection disabled: ${withheldMember.status}.` : pairKind === "curve:graph2d" ?
          graphCurvePair ? "Graph–Curve parameter mapping qualified by exact promotion and source generation." :
            "Graph–Curve link disabled: no current exact promotion relation or compatible parameter frame." :
          pairKind === "curve:surface" ? curveSurfacePair ?
            "Curve–Surface chart mapping qualified by exact relation and source generation." :
            "Curve–Surface link disabled: no current exact chart relation or compatible parameter frame." :
          surfaceMesh?.status === "ready" ?
            "Surface–Mesh physical marker qualified by exact generations and declared frame; no element correspondence is inferred." :
            `Surface–Mesh link disabled: ${surfaceMesh?.reason ?? "Source unavailable."}`}</p>}
      {open.layout.mode === "quad" && paneModules.includes("quantum") && <p role="status"
        data-testid="project-study-quantum-cursor-qualification">{qwzPair ?
          "QWZ reciprocal k mapping qualified by exact scene generations and reciprocal frame; sample bytes are checked before sharing." :
          "QWZ link disabled: source scenes, Study roles or reciprocal frames differ."}</p>}
      {graphCurvePair && !graphCurveLinked && editable && <button type="button" data-testid="project-study-link-graph-curve"
        onClick={() => onLink(open.id)}>Link promoted Graph and Curve</button>}
      {graphCurvePair && graphCurveLinked && <StudyGraphCurveControl project={project} pair={graphCurvePair} studyId={open.id} />}
      {curveSurfacePair && !curveSurfaceLinked && editable && <button type="button"
        data-testid="project-study-link-curve-surface" onClick={() => onLinkCurveSurface(open.id)}>
        Link Curve parameter and Surface chart</button>}
      {curveSurfacePair && curveSurfaceLinked && <StudyCurveSurfaceControl project={project}
        pair={curveSurfacePair} studyId={open.id} />}
      {surfaceMeshPair && !surfaceMeshLinked && editable && <button type="button"
        data-testid="project-study-link-surface-mesh" onClick={() => onLinkSurfaceMesh(open.id)}>
        Link Surface and Mesh physical coordinates</button>}
      {surfaceMeshPair && surfaceMeshLinked && <StudySurfaceMeshControl project={project}
        pair={surfaceMeshPair} studyId={open.id} />}
      {qwzPair && <StudyQwzCursorControl project={project} pair={qwzPair} study={open}
        editable={editable} onPin={onPinQwz} onUnpin={onUnpinQwz}
        onDeriveProfile={onDeriveQwzProfile}
        onOpenGraphProfile={id => onOpenDocument(id, "graph2d")} />}
      {project.metadata.tags?.includes("catenoid-evidence") && open.members.some(member =>
        project.workspace.entries.find(entry => entry.expected.id === member.documentId)?.module === "surface") &&
        <CatenoidWaistEvidencePanel project={project} resources={resources} />}
      {qwzPair && editable && open.pinnedSelectionIds.filter(id => id.startsWith("qwz:band-0:")).map(id =>
        <button key={id} type="button" data-testid="project-study-note-on-pin"
          disabled={!onCapturePinnedNote}
          onClick={() => onCapturePinnedNote?.(open.id, "bands", id)}>Note on pinned k selection</button>)}
      {availableScientificSelections.length > 0 && <section aria-label="Saved scientific selections">
        <h6>Saved scientific selections</h6>
        {availableScientificSelections.map(selection => {
          if (selection.identity.kind !== "authored" || selection.source?.kind !== "document") return null;
          const source = selection.source, selectionId = selection.identity.id;
          const pin = `selection:${structuralHash(selection)}`;
          const owner = open.members.find(item => item.documentId === source.documentId);
          const pinned = open.pinnedSelectionIds.includes(pin) &&
            !!qualifyStudyScientificSelectionPin(project.workspace, open, pin);
          return <div key={selectionId} data-focused={focusStudy?.selectionId === pin}>
            <span>{selection.geometry.kind} · {selection.role} · source r{source.checkpoint?.revision}</span>{" "}
            {pinned ? <button type="button" disabled={!editable || !onCapturePinnedNote || !owner}
              onClick={() => owner && onCapturePinnedNote?.(open.id, owner.memberId, pin)}>Note on selection</button> :
              <button type="button" disabled={!editable} onClick={() => onPinScientificSelection(open.id, selectionId)}>
                Pin selection to Study</button>}
          </div>;
        })}
      </section>}
      <section aria-label="Notes on this Study" data-testid="project-study-note-references">
        <h6>Notes on this Study ({pinnedNotes.length})</h6>
        {pinnedNotes.length ? <ul>{pinnedNotes.map(note => {
          const inspected = noteResolver && inspectProjectNoteAnchor(note, noteResolver);
          return <li key={note.identity.id}>{note.title} · {inspected?.status ?? "unavailable"}
            {inspected?.status === "current" && note.anchor?.kind === "study-selection" && note.anchor.selectionId.startsWith("qwz:") ?
              " (scene bytes require verification)" : ""}{" "}
            <button type="button" disabled={!onOpenNote} onClick={() => onOpenNote?.(note.identity.id)}>Open Note</button>
          </li>;
        })}</ul> : <p>No Note is anchored to a saved Study selection.</p>}
      </section>
      <section aria-label="Workbook citations of this Study" data-testid="project-study-workbook-references">
        <h6>Referenced by Workbooks ({workbookReferences.length})</h6>
        {workbookReferences.length ? <ul>{workbookReferences.map(reference =>
          <li key={`${reference.workbookId}:${reference.blockId}`}>
            {reference.title} · <span title={reference.reason}>{reference.status === "current" ?
              "Exact citation" : "Historical citation"}</span>{" "}
            <button type="button" disabled={!onOpenWorkbookBlock}
              onClick={() => onOpenWorkbookBlock?.(reference.workbookId, reference.stageId, reference.blockId)}>
              Open cited block</button>
          </li>)}</ul> : <p>No checked Workbook citation is recorded for this Study.</p>}
      </section>
      <div data-testid="project-study-panes" data-layout={open.layout.mode} style={{ display: "grid",
        gridTemplateColumns: open.layout.mode === "single" || open.layout.mode === "tabs" ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {open.layout.panes.map(pane => {
          const member = open.members.find(item => item.memberId === pane.memberId)!;
          const choice = choiceById.get(member.documentId);
          const status = statusByMember.get(member.memberId) ?? "missing-document";
          const paneEvidence = inspectResearchReference(project,
            open.paneReferences?.find(item => item.paneId === pane.paneId)?.reference ??
              migrateLegacyStudyPaneResearchReference(open, pane.paneId),
            resources ? item => resources.bytes(item) : undefined);
          const sourceCurrent = status === "current-reference" && paneEvidence.status === "current";
          const workspaceEntry = project.workspace.entries.find(entry => entry.expected.id === member.documentId);
          const quantumDocument = qwzPair && [qwzPair.curvature, qwzPair.bands]
            .find(document => document.identity.id === member.documentId);
          const quantumReference = quantumDocument && project.quantumScenes?.find(reference =>
            reference.sceneFingerprint === quantumDocument.source.sceneFingerprint &&
            reference.directory === quantumDocument.location.directory);
          return <div key={pane.paneId} data-testid={`project-study-pane-${pane.paneId}`} style={{ border: "1px solid #cbd5e1", padding: 8, minWidth: 0, overflow: "hidden" }}>
            <strong>{choice?.title ?? member.documentId}</strong><p>{member.role} · {statusLabel[status]}
              {paneEvidence.resourceStatus === "missing" ? " · source bytes unavailable" : ""} · saved r{member.expected.revision}</p>
            {quantumDocument ? <button type="button" data-testid={`project-study-open-source-${pane.paneId}`}
              disabled={!quantumReference || !onOpenQuantumSource || !sourceCurrent}
              onClick={() => { if (quantumReference && sourceCurrent) void onOpenQuantumSource?.(quantumReference); }}>
              Verify and view source scene</button> : <button type="button" disabled={!workspaceEntry || !sourceCurrent}
              onClick={() => { if (workspaceEntry && sourceCurrent) onOpenDocument(member.documentId, workspaceEntry.module); }}>Open source document</button>}
            {member.resultId && <button type="button" data-testid={`project-study-open-result-${pane.paneId}`}
              disabled={!sourceCurrent || !onInspectResult}
              onClick={() => onInspectResult?.(member.resultId!)}>Inspect saved result</button>}
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
