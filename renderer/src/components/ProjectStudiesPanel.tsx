import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { migrateLegacyStudyPaneResearchReference, inspectResearchReference, inspectProjectNoteAnchor,
  inspectProjectStudyMembers, qualifyProjectQwzPair, qualifyProjectQwzQuadStudy, structuralHash,
  type KernelWorkspaceModule, type Math3DProject, type ProjectQuantumSceneReference,
  type StudyRecordV1 } from "@math3d/core";
import type { VerifiedProjectResources } from "../projects/projectResources";
import type { WorkbookStageId } from "@math3d/workbook";
import { projectStudyWorkbookReferences } from "../projects/projectStudyReferences";
import { quantumStudySelectionHash } from "../projects/quantumStudyWorkbook";
import { projectNoteSourceResolver } from "../projects/projectNoteTargets";
import { qualifyStudyGraphCurveLink, studyHasQualifiedGraphCurveLink } from "../projects/studyGraphCurveLink";
import { qualifyStudyCurveSurfaceLink, studyHasQualifiedCurveSurfaceLink } from "../projects/studyCurveSurfaceLink";
import { qualifyStudySurfaceMeshLink, studyHasQualifiedSurfaceMeshLink } from "../projects/studySurfaceMeshLink";
import { StudyGraphCurveControl } from "./StudyGraphCurveControl";
import { StudyCurveSurfaceControl } from "./StudyCurveSurfaceControl";
import { StudySurfaceMeshControl } from "./StudySurfaceMeshControl";
import { CatenoidWaistEvidencePanel } from "./CatenoidWaistEvidencePanel";
import { SurfaceRidgePublicationPanel } from "./SurfaceRidgePublicationPanel";
import { SURFACE_RIDGE_COMPARISON_OPERATION } from "../projects/surfaceRidgePublication";
import { StudyQwzCursorControl } from "./StudyQwzCursorControl";
import { qualifyStudyScientificSelectionPin } from "../projects/projectStudyNoteAnchor";
import { volumeMeshJourneyOptions } from "../projects/volumeMeshStudy";
import { hydrogenGridIndex, pinQuantumStudySample, quantumStudyRecord,
  quantumStudySelectionEvidence } from "../projects/quantumStudySelection";
import { StudyQuantumSelectionPanel } from "./StudyQuantumSelectionPanel";

const StudyPanePreview = lazy(() => import("./StudyPanePreview").then(module => ({ default: module.StudyPanePreview })));

type DocumentChoice = Readonly<{ id: string; title: string; module: KernelWorkspaceModule }>;
type Props = Readonly<{ project: Math3DProject; documents: readonly DocumentChoice[]; editable: boolean;
  resources?: VerifiedProjectResources;
  focusStudy?: Readonly<{ id: string; token: number; selectionId?: string;
    quantumSelectionHash?: string }> | null;
  onCreate: (title: string, ids: readonly string[]) => void; onRename: (id: string, title: string) => void;
  onFork: (id: string, title: string) => void; onLink: (id: string) => void;
  onLinkCurveSurface: (id: string) => void;
  onLinkSurfaceMesh: (id: string) => void;
  onConfigure: (id: string, description: string, mode: StudyRecordV1["layout"]["mode"], paneIds: readonly string[]) => void;
  onCreateQwz: (quantumStudyId: string) => void;
  onPinQwz: (studyId: string, sampleIndex: number) => void;
  onPinQuantumSample: (studyId: string, role: "density" | "phase" | "chain" | "bands", index: number,
    objectId: string | null) => void;
  onPublishQuantumWorkbook?: (studyId: string) => Promise<void>;
  onUnpinQwz: (studyId: string) => void;
  onDeriveQwzProfile?: (studyId: string) => Promise<{ graphId: string; resultId: string }>;
  onPublishSurfaceRidge?: (surfaceId: string, meshId: string, ridgeIndex: number) => Promise<void>;
  onSaveProject?: () => Promise<void>;
  onOpenWorkbook?: (id: string) => void;
  onPublishVolumeMesh?: (resultId: string) => void;
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
  onPinQuantumSample, onPublishQuantumWorkbook,
  onPublishSurfaceRidge, onSaveProject, onOpenWorkbook,
  onPublishVolumeMesh,
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
  const [quantumSelectionMessage, setQuantumSelectionMessage] = useState("");
  const [catenoidStep, setCatenoidStep] = useState<"study" | "curvature" | "comparison" | "workbook">("study");
  const quantumSelectionSerial = useRef(0);
  const viewRef = useRef<HTMLDivElement>(null);
  const studies = project.workspace.studies ?? [];
  const catenoidStudy = project.metadata.tags?.includes("curated-study-v1") &&
    project.metadata.tags.includes("catenoid-evidence") ? studies[0] : null;
  const catenoidSurface = catenoidStudy && project.workspace.entries.find(entry => entry.module === "surface" &&
    catenoidStudy.members.some(member => member.documentId === entry.expected.id));
  const catenoidSurfaceStatus = catenoidStudy && catenoidSurface && inspectProjectStudyMembers(project, catenoidStudy)
    .find(member => member.documentId === catenoidSurface.expected.id)?.status;
  const ridgeResult = project.workspace.results.find(result =>
    result.provenance.operation.type === SURFACE_RIDGE_COMPARISON_OPERATION);
  const ridgeWorkbook = project.workbooks?.find(book =>
    book.title === "Surface ridge and discrete curvature comparison");
  useEffect(() => {
    const study = studies.find(item => item.id === focusStudy?.id);
    if (!study) return;
    quantumSelectionSerial.current++;
    setQuantumSelectionMessage("");
    setOpenId(study.id); setEditTitle(study.title); setDescription(study.description ?? "");
    setLayoutMode(study.layout.mode); setPaneOrder(study.layout.panes.map(pane => pane.paneId));
    setVisiblePaneId(null);
    if (project.metadata.tags?.includes("catenoid-evidence")) setCatenoidStep("study");
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
  const volumeMeshOptions = editable ? volumeMeshJourneyOptions(project).filter(option =>
    !studies.some(study => study.members.some(member => member.resultId === option.resultId))) : [];
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
  const focusStudySection = (testId: string) => {
    const section = [...viewRef.current?.querySelectorAll<HTMLElement>("[data-testid]") ?? []]
      .find(element => element.dataset.testid === testId);
    section?.scrollIntoView({ block: "start" }); section?.focus({ preventScroll: true });
  };
  return <section className="project-dashboard-card" data-testid="project-studies-panel" aria-label="Project Studies">
    <div className="project-dashboard-card-heading"><h4>Studies</h4><span>{studies.length}</span></div>
    {catenoidStudy && <section className="catenoid-journey-flow" data-testid="catenoid-journey-flow"
      aria-label="Catenoid evidence journey">
      <div className="catenoid-journey-heading"><strong>Catenoid evidence journey</strong>
        <span>{ridgeResult ? "Comparison recorded" : "Continue the saved Study"}</span></div>
      <div className="catenoid-journey-tabs" role="tablist" aria-label="Catenoid journey steps">
        {([ ["study", "1 · Study"], ["curvature", "2 · Curvature"],
          ["comparison", "3 · Comparison"], ["workbook", "4 · Workbook"] ] as const).map(([id, label]) =>
          <button key={id} type="button" role="tab" id={`catenoid-flow-tab-${id}`}
            data-testid={`catenoid-flow-tab-${id}`} aria-selected={catenoidStep === id}
            aria-controls="catenoid-flow-panel" tabIndex={catenoidStep === id ? 0 : -1}
            onClick={() => setCatenoidStep(id)} onKeyDown={event => {
              const order = ["study", "curvature", "comparison", "workbook"] as const;
              const index = order.indexOf(id);
              const next = event.key === "ArrowRight" ? order[(index + 1) % order.length] :
                event.key === "ArrowLeft" ? order[(index + order.length - 1) % order.length] :
                event.key === "Home" ? order[0] : event.key === "End" ? order[order.length - 1] : null;
              if (next) { event.preventDefault(); setCatenoidStep(next);
                document.getElementById(`catenoid-flow-tab-${next}`)?.focus(); }
            }}>{label}</button>)}
      </div>
      <div role="tabpanel" id="catenoid-flow-panel" aria-labelledby={`catenoid-flow-tab-${catenoidStep}`}
        data-testid={`catenoid-flow-panel-${catenoidStep}`}>
        {catenoidStep === "study" && <><h5>Inspect the saved Study</h5>
          <p>Review the exact Surface and retained Mesh before running a new curvature computation.</p>
          <button type="button" data-testid="catenoid-flow-open-study" onClick={() => {
            setOpenId(catenoidStudy.id); setEditTitle(catenoidStudy.title);
            setDescription(catenoidStudy.description ?? ""); setLayoutMode(catenoidStudy.layout.mode);
            setPaneOrder(catenoidStudy.layout.panes.map(pane => pane.paneId)); setVisiblePaneId(null);
          }}>Open saved Study</button>{" "}
          <button type="button" onClick={() => setCatenoidStep("curvature")}>Next: Curvature</button></>}
        {catenoidStep === "curvature" && <><h5>Compute Surface curvature</h5>
          <p>Open the saved Surface, then choose Analysis → Curvature field → Compute. Return to Projects when the result is ready.</p>
          <button type="button" data-testid="catenoid-flow-open-surface"
            disabled={!editable || !catenoidSurface || catenoidSurfaceStatus !== "current-reference"}
            onClick={() => { if (catenoidSurface) onOpenDocument(catenoidSurface.expected.id, "surface"); }}>
            Open Surface</button>{" "}
          <button type="button" onClick={() => setCatenoidStep("comparison")}>Next: Comparison</button>
          {catenoidSurfaceStatus !== "current-reference" && <p role="status">Saved Surface source changed or is missing; reopen a current source before computing.</p>}</>}
        {catenoidStep === "comparison" && <><h5>Publish the comparison</h5>
          <p>Choose a sampled ridge and its retained Mesh. The action checks exact sources, records local curvature error, and stages a Curve and Workbook.</p>
          <SurfaceRidgePublicationPanel project={project} resources={resources} editable={editable}
            onPublish={onPublishSurfaceRidge} />
          {ridgeResult && <button type="button" onClick={() => setCatenoidStep("workbook")}>Next: Workbook</button>}</>}
        {catenoidStep === "workbook" && <><h5>Save and review evidence</h5>
          <p>{ridgeWorkbook ? "The comparison Workbook is recorded. Save the Project, then inspect its source-qualified citation." :
            "Publish a current Surface–Mesh comparison to stage its Workbook."}</p>
          <button type="button" data-testid="catenoid-flow-save-project" disabled={!editable || !onSaveProject || !ridgeWorkbook}
            onClick={() => { void onSaveProject?.(); }}>Save Project</button>{" "}
          <button type="button" data-testid="catenoid-flow-open-workbook"
            disabled={!ridgeWorkbook || !onOpenWorkbook} onClick={() => {
              if (ridgeWorkbook) onOpenWorkbook?.(ridgeWorkbook.id);
            }}>Open comparison Workbook</button>
          {!ridgeWorkbook && <button type="button" onClick={() => setCatenoidStep("comparison")}>Back to comparison</button>}</>}
      </div>
    </section>}
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
    {!catenoidStudy && <SurfaceRidgePublicationPanel project={project} resources={resources} editable={editable}
      onPublish={onPublishSurfaceRidge} />}
    {!!onPublishVolumeMesh && volumeMeshOptions.length > 0 && <div data-testid="project-volume-mesh-journeys">
      <strong>Volume → isosurface → Mesh</strong>
      <p>Pin a current extraction, its retained Mesh, and a Workbook citation in one Study.</p>
      {volumeMeshOptions.map(option => <button type="button" key={option.resultId}
        data-testid={`project-volume-mesh-publish-${option.resultId}`}
        onClick={() => onPublishVolumeMesh(option.resultId)}>
        Create Study from {option.volumeTitle} · iso {option.isoValue} · {option.meshTitle}
      </button>)}
    </div>}
    <ul>{studies.map(study => <li key={study.id}>
      <button type="button" data-testid={`project-study-open-${study.id}`} onClick={() => {
        quantumSelectionSerial.current++;
        setQuantumSelectionMessage("");
        setOpenId(study.id); setEditTitle(study.title); setDescription(study.description ?? "");
        setLayoutMode(study.layout.mode); setPaneOrder(study.layout.panes.map(pane => pane.paneId));
        setVisiblePaneId(null);
      }}>{study.title}</button> · {study.layout.mode} · {study.members.length} members
    </li>)}</ul>
    {open && <div ref={viewRef} className="project-study-view" data-testid="project-study-view" data-study-id={open.id}>
      <button type="button" data-testid="project-study-back" onClick={() => {
        quantumSelectionSerial.current++;
        setQuantumSelectionMessage("");
        const id = open.id;
        setOpenId(null); setVisiblePaneId(null);
        window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="project-study-open-${CSS.escape(id)}"]`)?.focus());
      }}>Back to Studies</button>
      <h5>{open.title}</h5>
      <nav className="project-study-jump" aria-label="Study research path">
        <button type="button" onClick={() => focusStudySection("project-study-note-references")}>Notes</button>
        <button type="button" onClick={() => focusStudySection("project-study-workbook-references")}>Citations</button>
        <button type="button" onClick={() => focusStudySection("project-study-panes")}>Source panes</button>
      </nav>
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
        onOpenGraphProfile={id => { setVisiblePaneId(null); onOpenDocument(id, "graph2d"); }} />}
      {focusStudy?.id === open.id && focusStudy.quantumSelectionHash &&
        focusStudy.quantumSelectionHash === quantumStudySelectionHash(project, open) &&
        <p role="status" data-testid="project-study-quantum-return">
          Returned to cited selection: {quantumStudyRecord(project, open)?.panels.map(panel =>
            `${panel.role} ${panel.sampleIndex === null ? "unselected" : `index ${panel.sampleIndex}`}`).join(" · ")}.
          Exact source bundles are being rechecked below.
        </p>}
      {quantumStudyRecord(project, open) && <StudyQuantumSelectionPanel
        key={`${open.id}:${focusStudy?.id === open.id ? focusStudy.token : 0}`}
        project={project} study={open}
        editable={editable} onPin={onPinQuantumSample} onPublishWorkbook={onPublishQuantumWorkbook} />}
      {quantumSelectionMessage && quantumStudyRecord(project, open) &&
        <p role="status" data-testid="project-study-quantum-selection-message">{quantumSelectionMessage}</p>}
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
      <section aria-label="Notes on this Study" data-testid="project-study-note-references" tabIndex={-1}>
        <h6>Notes on this Study ({pinnedNotes.length})</h6>
        {pinnedNotes.length ? <ul>{pinnedNotes.map(note => {
          const inspected = noteResolver && inspectProjectNoteAnchor(note, noteResolver);
          return <li key={note.identity.id}>{note.title} · {inspected?.status ?? "unavailable"}
            {inspected?.status === "current" && note.anchor?.kind === "study-selection" && note.anchor.selectionId.startsWith("qwz:") ?
              " (scene bytes require verification)" : ""}{" "}
            <button type="button" disabled={!onOpenNote} onClick={() => { setVisiblePaneId(null); onOpenNote?.(note.identity.id); }}>Open Note</button>
          </li>;
        })}</ul> : <p>No Note is anchored to a saved Study selection.</p>}
      </section>
      <section aria-label="Workbook citations of this Study" data-testid="project-study-workbook-references" tabIndex={-1}>
        <h6>Referenced by Workbooks ({workbookReferences.length})</h6>
        {workbookReferences.length ? <ul>{workbookReferences.map(reference =>
          <li key={`${reference.workbookId}:${reference.blockId}`}>
            {reference.title} · <span title={reference.reason}>{reference.status === "current" ?
              "Exact citation" : "Historical citation"}</span>{" "}
            <button type="button" disabled={!onOpenWorkbookBlock}
              onClick={() => { setVisiblePaneId(null); onOpenWorkbookBlock?.(reference.workbookId, reference.stageId, reference.blockId); }}>
              Open cited block</button>
          </li>)}</ul> : <p>No checked Workbook citation is recorded for this Study.</p>}
      </section>
      <div className="project-study-panes" data-testid="project-study-panes" data-layout={open.layout.mode} tabIndex={-1}>
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
          return <div key={pane.paneId} className="project-study-pane" data-testid={`project-study-pane-${pane.paneId}`}>
            <strong>{choice?.title ?? member.documentId}</strong><p>{member.role} · {statusLabel[status]}
              {paneEvidence.resourceStatus === "missing" ? " · source bytes unavailable" : ""} · saved r{member.expected.revision}</p>
            <p role="status" data-testid={`project-study-source-status-${pane.paneId}`} title={paneEvidence.reason}>
              Saved source pin: {paneEvidence.status} · resource {paneEvidence.resourceStatus}</p>
            {!sourceCurrent && <p role="status" data-testid={`project-study-source-reason-${pane.paneId}`}>
              {paneEvidence.reason}</p>}
            {quantumDocument ? <button type="button" data-testid={`project-study-open-source-${pane.paneId}`}
              disabled={!quantumReference || !onOpenQuantumSource || !sourceCurrent}
              title={!sourceCurrent ? paneEvidence.reason : !quantumReference ? "Saved Quantum source scene is unavailable." : undefined}
              onClick={() => { if (quantumReference && sourceCurrent) { setVisiblePaneId(null); void onOpenQuantumSource?.(quantumReference); } }}>
              Verify and view source scene</button> : <button type="button" data-testid={`project-study-open-source-${pane.paneId}`}
              disabled={!workspaceEntry || !sourceCurrent} title={!sourceCurrent ? paneEvidence.reason : undefined}
              onClick={() => { if (workspaceEntry && sourceCurrent) { setVisiblePaneId(null); onOpenDocument(member.documentId, workspaceEntry.module); } }}>Open source document</button>}
            {member.resultId && <button type="button" data-testid={`project-study-open-result-${pane.paneId}`}
              disabled={!sourceCurrent || !onInspectResult}
              onClick={() => { setVisiblePaneId(null); onInspectResult?.(member.resultId!); }}>Inspect saved result</button>}
            <button type="button" data-testid={`project-study-preview-toggle-${pane.paneId}`}
              onClick={() => setVisiblePaneId(current => current === pane.paneId ? null : pane.paneId)}>
              {visiblePaneId === pane.paneId ? "Hide preview" : "Show preview"}</button>
            {visiblePaneId === pane.paneId && <Suspense fallback={<p role="status">Loading Study pane…</p>}>
              <StudyPanePreview project={project} study={open} paneId={pane.paneId} resources={resources}
                onHydrogenSample={sample => {
                  if (!editable) return;
                  const fingerprint = quantumStudyRecord(project, open)?.panels[0]?.sceneFingerprint;
                  if (!fingerprint) return;
                  const serial = ++quantumSelectionSerial.current;
                  setQuantumSelectionMessage("Checking the exact hydrogen bundle before pinning…");
                  try {
                    const index = hydrogenGridIndex(project, sample.grid, fingerprint);
                    const candidate = pinQuantumStudySample(project, open, "density", index, null);
                    void quantumStudySelectionEvidence(candidate, open).then(checked => {
                      if (serial !== quantumSelectionSerial.current) return;
                      if (!("density" in checked.values)) throw new TypeError(checked.omissions.join(" "));
                      onPinQuantumSample(open.id, "density", index, null);
                      setQuantumSelectionMessage("Hydrogen grid point staged. Save Project to retain it.");
                    }).catch(error => { if (serial === quantumSelectionSerial.current)
                      setQuantumSelectionMessage(`Selection withheld: ${String((error as Error).message)}`); });
                  } catch (error) { setQuantumSelectionMessage(`Selection withheld: ${String((error as Error).message)}`); }
                }} />
            </Suspense>}
          </div>;
        })}
      </div>
    </div>}
  </section>;
}
