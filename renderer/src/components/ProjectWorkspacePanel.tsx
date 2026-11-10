import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adoptMixedWorkspaceProject, buildProjectExplorer, createMath3DProject, parseMath3DProject,
  parseMixedWorkspaceDocument, createMixedWorkspaceDocument, updateMath3DProjectMetadata, replaceMath3DProjectWorkspace,
  deleteProjectDocument, duplicateProjectDocument, serializeMath3DProject, setProjectDocumentMetadata,
  instantiateMath3DProjectTemplate, MATH3D_PROJECT_TEMPLATES, type Math3DProjectTemplateId,
  upsertMath3DProjectWorkbook, upsertMath3DProjectNote, updateProjectNote, inspectResearchReference,
  relinkMath3DProjectQuantumScene, upsertMath3DProjectQuantumScene, type ProjectQuantumSceneReference,
  linkQuantumSceneDocuments,
  createQuantumStudyFromTemplate, QUANTUM_STUDY_TEMPLATES, type QuantumStudyTemplateId,
  createDocumentRelation, viewerSourceFromDocument,
  relinkMath3DProjectScientificScene, upsertMath3DProjectScientificScene, type ProjectScientificSceneReference,
  upsertMath3DProjectComposition, upsertMath3DProjectSavedMeshComparison, inspectProjectCompositionAvailability,
  migrateProjectScientificSelections,
  createProjectStudyFromDocuments, renameProjectStudy, forkProjectStudy,
  createProjectQwzQuadStudy, pinProjectQwzSample, unpinProjectQwzSample, qualifyProjectQwzPair,
  type ProjectComposition, type ProjectSavedMeshComparison,
  type ProjectNote,
  type Math3DProject, type MixedWorkspaceDocument, type KernelWorkspaceModule, type QuantumSceneDocument, type ViewerProvenanceEvidence } from "@math3d/core";
import { deriveProjectOpenIn, deriveProjectMeshGeometry, linkProjectFieldProfileGraph,
  projectOpenInActions, projectOpenInReturn,
  matchesScientificSourceGeneration, type ProjectOpenInAction } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { findProjectStarterCopy, importLibraryProject, loadLibraryProject, MAX_PROJECT_THUMBNAIL_BYTES, orderProjectLibrary, parseProjectLibrary, PROJECT_LIBRARY_KEY,
  PROJECT_STORAGE_KEY, projectPayloadKey, readProjectThumbnail, isAutomaticProjectThumbnail, saveLibraryProject, updateLibraryActivity, type ProjectLibrary } from "../projects/projectLibrary";
import { ProjectCommandAdapter } from "../projects/projectCommandAdapter";
import { ProjectGalleryFrame, type ProjectPlacement } from "./ProjectGalleryFrame";
import { ProjectTemplatesPanel, StarterArtwork } from "./ProjectTemplatesPanel";
import { ProjectDocumentActions, type ProjectDocumentAction } from "./ProjectDocumentActions";
import { ProjectOpenInMenu } from "./ProjectOpenInMenu";
import { ProjectAlgebraOpenInMenu } from "./ProjectAlgebraOpenInMenu";
import { ProjectAlgebraReturnButton } from "./ProjectAlgebraReturnButton";
import { projectAlgebraLocusReturn, resolveProjectAlgebraLocusReturn,
  type ProjectAlgebraLocusReturn } from "@math3d/core";
import { projectSavedAlgebraOpenInActions, resolveProjectSavedAlgebraOpenIn,
  type ProjectSavedAlgebraOpenInAction } from "@math3d/core";
import { projectAlgebraCasHandoff, resolveProjectAlgebraCasHandoff,
  type ProjectAlgebraCasHandoff, type AlgebraObjectRef } from "@math3d/core";
import { projectAlgebraLocusCurveSourceStatus, resolveProjectAlgebraLocusCurveSource,
  resolveProjectAlgebraLocusCurveAlgebraReturn } from "@math3d/core";
import { createSavedSurfaceMesh } from "../projects/savedSurfaceMesh";
import { inspectProjectDependencies } from "../projects/projectDependencies";
import { presentProjectFreshness, presentProjectRelationFreshness } from "../projects/projectFreshnessPresentation";
import { projectDependencyRefreshOptions, refreshProjectDependency, projectAnalysisRefreshOptions, recomputeProjectAnalysis } from "../projects/projectDependencyRefresh";
import { ProjectDependenciesPanel } from "./ProjectDependenciesPanel";
import { ProjectRelationshipMap } from "./ProjectRelationshipMap";
import { ProjectCursorInspector } from "./ProjectCursorInspector";
import { ProjectStudiesPanel } from "./ProjectStudiesPanel";
import { addQualifiedStudyGraphCurveLink } from "../projects/studyGraphCurveLink";
import { prepareCuratedStudyBundle } from "../projects/curatedStudyProject";
import { measureCuratedStudyAssets } from "../projects/curatedStudyQualification";
import { probeRendererPlatformCapabilities } from "../kernel/rendererPlatformCapabilities";
const ProjectCompositionView = React.lazy(() => import("./ProjectCompositionView").then(module => ({ default: module.ProjectCompositionView })));
const QuantumNativeOverlayView = React.lazy(() => import("./QuantumNativeOverlayView").then(module => ({ default: module.QuantumNativeOverlayView })));
const ProjectSavedMeshResultComparisonView = React.lazy(() => import("./ProjectSavedMeshResultComparisonView").then(module => ({ default: module.ProjectSavedMeshResultComparisonView })));
const ProjectSavedMeshResultTrendView = React.lazy(() => import("./ProjectSavedMeshResultTrendView").then(module => ({ default: module.ProjectSavedMeshResultTrendView })));
import { ProjectResultsBrowser } from "./ProjectResultsBrowser";
import { comparableSavedMeshResults } from "../projects/projectSavedMeshResultComparison";
import type { SavedMeshTrendComparison } from "../projects/projectSavedMeshTrendPoint";
import { createSavedMeshPinnedComparison } from "../projects/projectSavedMeshPinnedComparison";
import { createProjectSavedMeshComparisonNote, inspectProjectSavedMeshComparisonNote } from "../projects/projectSavedMeshComparisonNotes";
import { buildSavedMeshComparisonReview } from "../projects/projectSavedMeshComparisonReview";
import { createSavedMeshComparisonReviewSnapshot, savedMeshComparisonReviewHtml } from "../projects/projectSavedMeshComparisonReviewReport";
import { downloadStudyBlob } from "../projects/studyComparisonExport";
import { ProjectSavedMeshComparisonReviewIndex } from "./ProjectSavedMeshComparisonReviewIndex";
import { ProjectCoordinateObservationReviewIndex } from "./ProjectCoordinateObservationReviewIndex";
import { buildProjectCoordinateObservationReview } from "../projects/projectCoordinateObservationReview";
import { createProjectCoordinateObservationReviewSnapshot, projectCoordinateObservationReviewHtml } from "../projects/projectCoordinateObservationReviewReport";
import { ProjectResearchLinks } from "./ProjectResearchLinks";
import { ProjectActivityTimeline } from "./ProjectActivityTimeline";
import { exportProjectFile, exportProjectCheckpointFile, inspectProjectCompatibility, MAX_PROJECT_IMPORT_BYTES, mergeProjectLiveWorkspace, previewProjectImport, projectCheckpoint, type ProjectCompatibility } from "../projects/projectTransfer";
import { ProjectCompatibilityPanel } from "./ProjectCompatibilityPanel";
import { assertIndependentNarrativeImport, previewResearchNarrativeImport } from "../projects/projectResearchNarrativeImport";
import { MAX_RESEARCH_NARRATIVE_FILE_BYTES, RESEARCH_NARRATIVE_FORMAT,
  type createPortableResearchNarrative } from "../workbook/researchNarrative";
import { captureProjectResources, captureProjectResourcesAsync, exportProjectPackage, parseProjectPackage, projectResourceInventory, MAX_PROJECT_PACKAGE_BYTES, type ProjectResourceReader, type VerifiedProjectResources } from "../projects/projectResources";
import { canReuseProjectResourceArchive, commitProjectResources, loadProjectResources, stageProjectBackupResources } from "../projects/projectResourceArchive";
import { canonicalJsonStringify, inspectProjectNoteAnchor, structuralHash, VECTOR_FIELD3D_REGION_RESULT_TYPE,
  VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE,
  type ProjectNoteAnchor, type StableDocumentId } from "@math3d/core";
import type { CombinedRegionSourceStatus, SavedRegionSourceStatus } from
  "../vectorfield3d/checkSavedRegionResultSources";
import { pointTableStore, installPortablePointTables } from "../graph2d/pointTableStore";
import { prepareProjectExampleCollection, importProjectExamples, SAMSUNG_EXAMPLE_COUNT } from "../projects/projectExampleCollection";
import { addRippleWaveResearch, instantiateNotebookStarter, NOTEBOOK_STARTERS, type NotebookStarterId } from "../projects/notebookStarters";
import { prewarmNotebookStarter, takePreparedNotebookStarter } from "../projects/notebookStarterPreparation";
import type { ProjectStarterId } from "./ProjectTemplatesPanel";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";
import { projectWorkbookUses } from "../projects/projectWorkbookUsage";
import { createScientificSubrectangleWorkbook, scientificSubrectangleReportMarkdown,
  verifyScientificSubrectangleReport, inspectScientificSubrectangleReport,
  subrectangleSourcesCurrent, primeScientificSubrectangleReport,
  clearJustCreatedScientificSubrectangleReport,
  rerunScientificSubrectangleReport,
  SCIENTIFIC_SUBRECTANGLE_REPORT } from "../projects/scientificSubrectangleWorkbook";
import { createScientificTrajectoryWorkbook, isScientificTrajectory,
  verifyScientificTrajectoryReport } from "../projects/scientificTrajectoryWorkbook";
import { createScientificEquilibriumWorkbook, isScientificEquilibrium,
  verifyScientificEquilibriumReport } from "../projects/scientificEquilibriumWorkbook";
import { createNotebookReference } from "@math3d/workbook";
import { addWorkbookDependency, createNoteDependencySource, type Workbook, type WorkbookStageId } from "@math3d/workbook";
import { ProjectNotesPanel } from "./ProjectNotesPanel";
import { createProjectComparisonNote, inspectProjectComparisonNote } from "../projects/projectComparisonNotes";
import { declareLegacyGeometryCoordinateFrame, declareLegacyMeshCoordinateFrame,
  declareLegacySurfaceCoordinateFrame } from "../projects/projectLegacyCoordinateFrame";
import { bindProjectNoteDrafts, createProjectNoteDraft, type NoteCaptureKind, type ProjectNoteDraft } from "../projects/projectNoteDrafts";
import { createProjectNoteSelectionAnchor, projectNoteSourceResolver, type NoteSelectionDescriptor } from "../projects/projectNoteTargets";
import { createProjectStudySelectionNoteAnchor, pinProjectStudyScientificSelection } from "../projects/projectStudyNoteAnchor";
import { resolveProjectNoteValues } from "../projects/projectNoteValues";
import { projectAnalysisAvailability, type ProjectAnalysisRoute } from "../projects/projectAnalysisAvailability";
import { verifyProjectQuantumSceneDocuments } from "../projects/quantumSceneAdmission";
import { quantumSceneDocumentFromVerifiedOpen } from "../projects/quantumSceneAdmission";
import { promoteQuantumNative, type QuantumNativeTarget } from "../projects/quantumNativePromotion";
import { admitVerifiedQwzStudy } from "../projects/quantumStudyAdmission";
import type { NoteValuePatch } from "./ProjectNoteLiveValues";
import { PROJECT_RESUME_KEY, PROJECT_UI_KEY, projectUiPreferences, rememberProjectUi, selectProjectDocument, rememberProjectDocument } from "../projects/projectResume";

export { PROJECT_STORAGE_KEY } from "../projects/projectLibrary";
type StudyLaunchResponse = Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["consumeStudyLaunch"]>>;
const ProjectThumbnail: React.FC<{ src: string | null; modules: string[] }> = ({ src, modules }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return src && !failed ? <img src={src} alt="Project thumbnail" onError={() => setFailed(true)} /> :
    <div data-testid="project-thumbnail-fallback" className="project-gallery-fallback"><strong aria-hidden="true">{modules.includes("Surface") ? "σ(u,v)" : modules.includes("Graph") ? "f(x)" : "M³"}</strong><span>{modules.join(" · ") || "Project"}</span><small>No saved thumbnail</small></div>;
};
type Props = {
  projectNavigation?: { canBack: boolean; canForward: boolean; back: () => void; forward: () => void; recent: readonly { id: string; module: KernelWorkspaceModule }[] };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCurrentProjectChange?: (project: Math3DProject, resources?: VerifiedProjectResources) => void;
  verifiedQuantumScene?: ProjectQuantumSceneReference | null;
  onImportQuantumScene?: () => void;
  onOpenCasGallery?: () => void;
  onImportScientificScene?: () => void;
  onOpenQuantumScene?: (reference: ProjectQuantumSceneReference) => Promise<void>;
  onVerifyQuantumSceneDocument?: (reference: ProjectQuantumSceneReference) => Promise<QuantumSceneDocument>;
  onRelinkQuantumScene?: (reference: ProjectQuantumSceneReference) => Promise<string | null>;
  verifiedScientificScene?: ProjectScientificSceneReference | null;
  onOpenScientificScene?: (reference: ProjectScientificSceneReference) => Promise<void>;
  onRelinkScientificScene?: (reference: ProjectScientificSceneReference) => Promise<string | null>;
  captureActiveWorkbook?: () => Workbook | null;
  onOpenWorkbook?: (workbook: Workbook, stageId?: WorkbookStageId, blockId?: string) => void;
  onViewProjectWorkbook?: (workbook: Workbook, stageId?: WorkbookStageId, blockId?: string) => void;
  onViewProjectDetail?: () => void;
  noteRequest?: { id: string; token: number; openTarget?: boolean } | null;
  resultRequest?: { id: string; token: number } | null;
  pairRequest?: { id: string; token: number } | null;
  regionResultStatuses?: Readonly<Record<string, SavedRegionSourceStatus>>;
  captureNoteSelection?: () => NoteSelectionDescriptor | null;
  captureProjectThumbnail?: () => Promise<string>;
  capture: () => MixedWorkspaceDocument;
  canNavigateDocument?: (id: string, module: KernelWorkspaceModule) => boolean;
  onNavigateDocument?: (id: string, module: KernelWorkspaceModule) => void;
  onOpenAlgebra?: (projectId: string, target: AlgebraObjectRef, contentHash: string,
    evidence?: ProjectAlgebraLocusReturn) => void;
  onOpenAnalysis?: (id: string, module: KernelWorkspaceModule, route: ProjectAnalysisRoute, workspace: MixedWorkspaceDocument, resources?: VerifiedProjectResources) => void;
  artifactAvailable?: (id: string, hash?: string | null) => boolean;
  resourceReader?: ProjectResourceReader;
  activeModule?: KernelWorkspaceModule | null;
  activeEvidence?: ViewerProvenanceEvidence | null;
  activeProjectDocumentId?: string | null;
  onRestoreWorkspace?: (workspace: MixedWorkspaceDocument, resources?: VerifiedProjectResources, owner?: Math3DProject) => void;
};
export const ProjectWorkspacePanel: React.FC<Props> = ({ projectNavigation, open, onOpenChange, onCurrentProjectChange, verifiedQuantumScene, onImportQuantumScene, onOpenCasGallery, onImportScientificScene, onOpenQuantumScene, onVerifyQuantumSceneDocument, onRelinkQuantumScene, verifiedScientificScene, onOpenScientificScene, onRelinkScientificScene, captureActiveWorkbook, onOpenWorkbook, onViewProjectWorkbook, onViewProjectDetail, noteRequest, resultRequest, pairRequest, regionResultStatuses = {}, captureNoteSelection, captureProjectThumbnail, capture, canNavigateDocument, onNavigateDocument, onOpenAlgebra, onOpenAnalysis, artifactAvailable, onRestoreWorkspace, resourceReader, activeModule, activeEvidence, activeProjectDocumentId }) => {

  const loadedProject = useRef<Math3DProject | null>(null);
  const resourceSession = useRef<VerifiedProjectResources | undefined>(undefined);
  const quantumPromotionMeshBytes = useRef(new Map<string, Uint8Array>());
  const stagedBackup = useRef<{ snapshot: string; inputToken: number; session: VerifiedProjectResources | undefined; project: Math3DProject; resources: VerifiedProjectResources; slot: "before-open-a" | "before-open-b" } | null>(null);
  const backupStageSequence = useRef(0);
  const backupStaging = useRef<Promise<void> | null>(null);
  const currentCapture = useRef(capture); currentCapture.current = capture;
  const workspaceInputSequence = useRef(0);
  useEffect(() => {
    // Unapplied source/Note text is absent from scientific capture, but must
    // still supersede an opening operation that is preparing in the background.
    const edited = () => { workspaceInputSequence.current++; };
    document.addEventListener("input", edited, true);
    return () => document.removeEventListener("input", edited, true);
  }, []);
  const resourceSessionId = useRef<string | null>(null);
  const [resourceVersion, setResourceVersion] = useState(0);
  const [quick, setQuick] = useState(false), [detailView, setDetailView] = useState(false), [viewerCompanion, setViewerCompanion] = useState(false), [collection, setCollection] = useState("All projects");
  const [detailPage, setDetailPage] = useState<"overview" | "documents" | "relations" | "results" | "history" | "settings" | "transfer">("overview");
  const [resultFocus, setResultFocus] = useState<{ id: string; token: number } | null>(null);
  const [studyFocus, setStudyFocus] = useState<{ id: string; token: number; selectionId?: string } | null>(null);
  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(() => projectUiPreferences(localStorage.getItem(PROJECT_UI_KEY)));
  const [projectPlacement, setProjectPlacement] = useState<ProjectPlacement>(preferences.placement);
  const [hasOpenProject, setHasOpenProject] = useState(false);
  useEffect(() => {
    if (open && quick && viewerCompanion) window.dispatchEvent(new CustomEvent("math3d:project-dock-visible", { detail: projectPlacement }));
  }, [open, quick, viewerCompanion, projectPlacement]);
  const [resumeStatus, setResumeStatus] = useState<string | null>(null);
  useEffect(() => {
    if (activeProjectDocumentId !== undefined) setViewingDocumentId(activeProjectDocumentId);
  }, [activeProjectDocumentId, open]);
  useEffect(() => {
    if (activeProjectDocumentId !== undefined || !open || !viewerCompanion || !activeModule) return;
    try {
      const workspace = capture();
      const entry = workspace.entries.find(entry => entry.module === activeModule && workspace.activeDocumentIds.includes(entry.expected.id));
      if (entry) setViewingDocumentId(entry.expected.id);
    } catch { /* Keep the selected document while its module is loading. */ }
  }, [activeModule, open, viewerCompanion, activeProjectDocumentId]);
  useEffect(() => {
    if (!open || !quick || !viewerCompanion) return;
    const timer = window.setTimeout(() => {
      const workspace = document.querySelector('[data-testid="module-workspace"]');
      const viewer = [...workspace?.querySelectorAll('[data-testid="main-viewer"], [data-testid="surface-primary-viewer"], canvas') ?? []]
        .find(element => element.getBoundingClientRect().height > 100) ?? workspace;
      viewer?.scrollIntoView({ block: "center", behavior: "auto" });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open, quick, viewerCompanion, viewingDocumentId]);
  const [moduleFilter, setModuleFilter] = useState("All modules");
  const workspacePanel = useRef<HTMLElement>(null);
  const detailsSection = useRef<HTMLElement>(null), contentsSection = useRef<HTMLElement>(null), transferSection = useRef<HTMLElement>(null);
  const jumpTo = (section: React.RefObject<HTMLElement | null>) => { section.current?.scrollIntoView({ block: "start" }); section.current?.focus({ preventScroll: true }); };
  const openDetailPage = (page: typeof detailPage, section?: React.RefObject<HTMLElement | null>) => {
    setDetailPage(page);
    if (page === "relations") setInspectionOpen(true);
    workspacePanel.current?.scrollTo({ top: 0 });
    if (section) window.requestAnimationFrame(() => window.requestAnimationFrame(() => jumpTo(section)));
  };
  useEffect(() => {
    if (!open || !resultRequest) return;
    setNotesOpen(false); setQuick(false); setViewerCompanion(false); setDetailView(true);
    setResultFocus(resultRequest); openDetailPage("results");
  }, [open, resultRequest?.token]);
  useEffect(() => { if (!open) { setQuick(false); setDetailView(false); setViewerCompanion(false); setViewingDocumentId(null); } }, [open]);
  const [busy, setBusy] = useState(false);
  const subrectangleRerunPending = useRef(false);
  const openingStarter = useRef(false);
  const rippleResearchAttempted = useRef(new Set<string>());
  const [quantumSceneMessage, setQuantumSceneMessage] = useState("");
  const [comparisonA, setComparisonA] = useState("");
  const [comparisonB, setComparisonB] = useState("");
  const [quantumComparison, setQuantumComparison] = useState<Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["compare"]>> | null>(null);
  const [comparisonPolicy,setComparisonPolicy]=useState<"exact"|"linear-1d">("exact");
  const [studySampleDraft, setStudySampleDraft] = useState<Record<string, string>>({});
  const [studyProjection, setStudyProjection] = useState("");
  const [studyLaunch, setStudyLaunch] = useState<{ mode: "new" | "attach"; title: string; model: "qwz" | "hofstadter"; roles: string[]; runId: string;
    resultSha256: string; references: ProjectQuantumSceneReference[] } | null>(null);
  const [scientificSceneMessage, setScientificSceneMessage] = useState("");
  const [analysisError, setAnalysisError] = useState<{ id: string; message: string } | null>(null);
  const [project, setProject] = useState<Math3DProject | null>(null);
  const algebraLoci = useMemo(() => project?.algebraObjects?.flatMap(entry =>
    [...entry.revisions].reverse().filter(record => record.definition.kind === "polynomial-ring" ||
      record.definition.kind === "ideal").map(record => {
      const target = { objectId: entry.id, revision: record.revision };
      return { entry, record, target, actions: projectSavedAlgebraOpenInActions(project, target),
        casAction: projectAlgebraCasHandoff(project, target),
        menuId: record.revision === entry.revisions.length ? entry.id : `${entry.id}-revision-${record.revision}` };
    }).filter(item => item.record.revision === entry.revisions.length ||
      item.actions.some(action => action.documentId))) ?? [], [project]);
  const algebraReturns = useMemo(() => new Map<string, ProjectAlgebraLocusReturn>((project?.workspace.entries ?? [])
    .map(entry => project ? projectAlgebraLocusReturn(project, entry.expected.id) : null)
    .filter((action): action is ProjectAlgebraLocusReturn => action !== null)
    .map(action => [action.documentId, action] as const)), [project]);
  const studyLaunchRequest = useRef<Promise<StudyLaunchResponse> | null>(null);
  useEffect(() => {
    let mounted = true;
    if (!window.quantumScenes?.consumeStudyLaunch) return;
    const request = studyLaunchRequest.current ??= window.quantumScenes.consumeStudyLaunch();
    void request.then(result => {
      if (!mounted) return;
      if (result.ok) { setStudyLaunch(result); onOpenChange(true); }
      else if (!result.canceled) { setQuantumSceneMessage(`Study handoff refused: ${result.error}`); onOpenChange(true); }
    }).catch(error => { if (mounted) { setQuantumSceneMessage(`Study handoff refused: ${String(error)}`); onOpenChange(true); } });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!project || resourceSessionId.current === project.identity.id) return;
    let cancelled = false;
    void loadProjectResources(project).then(resources => {
      if (cancelled || resourceSessionId.current === project.identity.id) return;
      resourceSession.current = resources;
      resourceSessionId.current = project.identity.id;
      setResourceVersion(version => version + 1);
    }).catch(() => { /* Exact source checks in each view report unavailable resources. */ });
    return () => { cancelled = true; };
  }, [project?.identity.id]);
  useEffect(() => {
    const refreshExternalSave = () => {
      try {
        const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
        if (!raw || !project) return;
        const saved = parseMath3DProject(raw);
        if (saved.identity.id !== project.identity.id) return;
        setProject(saved);
        loadedProject.current = saved;
      } catch { /* Keep the current Project draft if the saved copy is unavailable. */ }
    };
    window.addEventListener("math3d:project-saved-externally", refreshExternalSave);
    return () => window.removeEventListener("math3d:project-saved-externally", refreshExternalSave);
  }, [project?.identity.id]);
  const [compositionOpen, setCompositionOpen] = useState(false);
  const [quantumOverlay, setQuantumOverlay] = useState<ProjectQuantumSceneReference | null>(null);
  const [meshResultComparisonOpen, setMeshResultComparisonOpen] = useState(false);
  const [meshResultTrendOpen, setMeshResultTrendOpen] = useState(false);
  const [meshTrendComparison, setMeshTrendComparison] = useState<SavedMeshTrendComparison | null>(null);
  const [savedMeshComparison, setSavedMeshComparison] = useState<ProjectSavedMeshComparison | null>(null);
  useEffect(() => {
    if (!open || !pairRequest || !project) return;
    const pair = project.savedMeshComparisons?.find(item => item.id === pairRequest.id);
    if (!pair) return;
    setMeshTrendComparison(null); setSavedMeshComparison(pair); setMeshResultComparisonOpen(true);
  }, [open, pairRequest?.token, project?.identity.id]);
  const [comparisonInitialId, setComparisonInitialId] = useState<string | undefined>();
  const [comparisonInitialProbeId, setComparisonInitialProbeId] = useState<string | undefined>();
  const comparisonResource = useCallback<ProjectResourceReader>((item) => resourceSession.current?.bytes(item) ?? resourceReader?.(item) ?? null, [resourceReader, resourceVersion]);
  const savedMeshReview = useMemo(() => project ? buildSavedMeshComparisonReview(project, comparisonResource) : [], [project, comparisonResource]);
  const coordinateReview = useMemo(() => project ? buildProjectCoordinateObservationReview(project, comparisonResource) : [], [project, comparisonResource]);
  const projectWorkbookBytes = useCallback((id: string) => resourceSessionId.current === project?.identity.id
    ? resourceSession.current?.bytes({ kind: "workbook-payload", id }) ?? null : null, [project?.identity.id]);
  useEffect(() => { setDetailPage("overview"); }, [project?.identity.id]);
  const projectStateRef = useRef(project); projectStateRef.current = project;
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesPlacement, setNotesPlacement] = useState<"floating" | "project">("floating");
  useEffect(() => { if (!open && notesPlacement === "project") setNotesOpen(false); }, [open, notesPlacement]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [notesProject, setNotesProject] = useState<Math3DProject | null>(null);
  const [notesWorkspace, setNotesWorkspace] = useState<MixedWorkspaceDocument | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<ProjectNoteDraft[]>([]);
  const [notesMessage, setNotesMessage] = useState("");
  const [noteWorkbooks, setNoteWorkbooks] = useState<Array<{ workbook: Workbook; revision: number }>>([]);
  const noteRefreshSequence = useRef(0);
  const [title, setTitle] = useState("Untitled project");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [thumbnail, setThumbnail] = useState<{ id: string; data: string } | null>(null);
  const [automaticThumbnail, setAutomaticThumbnail] = useState(true), [replaceThumbnail, setReplaceThumbnail] = useState(false);
  const [thumbnailMessage, setThumbnailMessage] = useState("");
  const [library, setLibrary] = useState<ProjectLibrary>(parseProjectLibrary(null));
  useEffect(() => {
    if (!open || quick || hasOpenProject || !["All projects", "Starter projects"].includes(collection)) return;
    try {
      if (parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY)).entries.some(entry => entry.tags.includes("catenoid-evidence"))) return;
    } catch { /* An invalid library is reported by normal Gallery loading. */ }
    // Let the Gallery paint before preparing the first copy off the UI thread.
    const timer = window.setTimeout(() => {
      void prewarmNotebookStarter("catenoid-evidence").then(() => performance.mark("project-open:catenoid-starter-ready"), () => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, quick, hasOpenProject, collection, library]);
  const [highlightedSavedId, setHighlightedSavedId] = useState<string | null>(null);
  const [libraryMessage, setLibraryMessage] = useState("");
  const [exampleMessage, setExampleMessage] = useState("");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(false);
  const [managed, setManaged] = useState<ProjectCommandAdapter | null>(null);
  const [managedBytes, setManagedBytes] = useState<string | undefined>();
  const openLinkedQuantumScene = async (item: ProjectQuantumSceneReference) => {
    if (!onOpenQuantumScene) return;
    setQuantumSceneMessage("Verifying external .qscene…");
    try { await onOpenQuantumScene(item); setQuantumSceneMessage("Verified read-only quantum scene opened."); }
    catch (error) { setQuantumSceneMessage(`Scene unavailable: ${String((error as Error).message)}`); }
  };
  const openLinkedScientificScene = async (item: ProjectScientificSceneReference) => {
    if (!onOpenScientificScene) return;
    setScientificSceneMessage("Verifying external .sscene…");
    try { await onOpenScientificScene(item); setScientificSceneMessage("Verified read-only scientific scene opened."); }
    catch (error) { setScientificSceneMessage(`Scene unavailable: ${String((error as Error).message)}`); }
  };
  const relinkQuantumScene = async (item: ProjectQuantumSceneReference) => {
    if (busy || managed || !project || !onRelinkQuantumScene) return;
    const before = serializeMath3DProject(project);
    setBusy(true); setQuantumSceneMessage("Choose the relocated copy of this exact scene…");
    try {
      const directory = await onRelinkQuantumScene(item);
      if (directory === null) { setQuantumSceneMessage("Relink canceled; Project unchanged."); return; }
      const current = projectStateRef.current;
      if (!current || serializeMath3DProject(current) !== before)
        throw new TypeError("Project changed while the picker was open; relink it again.");
      const next = relinkMath3DProjectQuantumScene(current, item.sceneFingerprint, directory);
      if (next === current) { setQuantumSceneMessage("This verified source is already linked at that location."); return; }
      if (preview) {
        const saved = loadLibraryProject(localStorage, current.identity.id);
        if (serializeMath3DProject(saved) !== before) throw new TypeError("Saved Project changed; reopen it before relinking.");
        const resources = await loadProjectResources(saved);
        setLibrary(await commitProjectResources(next, resources, () => saveLibraryProject(localStorage, next, Date.now(), undefined,
          { activate: false, expectedBytes: before })));
        resourceSession.current = resources; resourceSessionId.current = next.identity.id;
        setProject(next); setExplorer(buildProjectExplorer(next, verifyMixedWorkspaceReplay(next.workspace)));
        setQuantumSceneMessage("Exact source relinked in the saved Project. Open it to activate the verified document.");
        return;
      }
      setProject(next);
      setQuantumSceneMessage("Exact scene verified at the new location. Save project to retain the relink.");
    } catch (error) { setQuantumSceneMessage(`Relink refused: ${String((error as Error).message)}`); }
    finally { setBusy(false); }
  };
  const attachScientificScene = async () => {
    if (busy || preview || managed || !project || !verifiedScientificScene || !onOpenScientificScene) return;
    const before = serializeMath3DProject(project), reference = verifiedScientificScene;
    setBusy(true); setScientificSceneMessage("Re-verifying scientific source before attachment…");
    try {
      await onOpenScientificScene(reference);
      const current = projectStateRef.current;
      if (!current || serializeMath3DProject(current) !== before) throw new TypeError("Project changed during verification. Retry attachment.");
      setProject(upsertMath3DProjectScientificScene(current, reference));
      setScientificSceneMessage("Verified scientific source staged. Save project to retain the link.");
    } catch (error) { setScientificSceneMessage(`Attachment refused: ${String((error as Error).message)}`); }
    finally { setBusy(false); }
  };
  const relinkScientificScene = async (item: ProjectScientificSceneReference) => {
    if (busy || managed || !project || !onRelinkScientificScene) return;
    const before = serializeMath3DProject(project);
    setBusy(true); setScientificSceneMessage("Choose a relocated copy of this exact scientific scene…");
    try {
      const directory = await onRelinkScientificScene(item);
      if (directory === null) { setScientificSceneMessage("Relink canceled; Project unchanged."); return; }
      const current = projectStateRef.current;
      if (!current || serializeMath3DProject(current) !== before) throw new TypeError("Project changed while the picker was open; relink again.");
      const next = relinkMath3DProjectScientificScene(current, item.sceneFingerprint, directory);
      if (next === current) { setScientificSceneMessage("This source is already linked at that location."); return; }
      if (preview) {
        const saved = loadLibraryProject(localStorage, current.identity.id);
        if (serializeMath3DProject(saved) !== before) throw new TypeError("Saved Project changed; reopen it before relinking.");
        const resources = await loadProjectResources(saved);
        setLibrary(await commitProjectResources(next, resources, () => saveLibraryProject(localStorage, next, Date.now(), undefined,
          { activate: false, expectedBytes: before })));
        resourceSession.current = resources; resourceSessionId.current = next.identity.id;
        setProject(next); setExplorer(buildProjectExplorer(next, verifyMixedWorkspaceReplay(next.workspace)));
        setScientificSceneMessage("Exact source relinked in saved Project.");
        return;
      }
      setProject(next);
      setScientificSceneMessage("Exact source verified at the new location. Save project to retain the relink.");
    } catch (error) { setScientificSceneMessage(`Relink refused: ${String((error as Error).message)}`); }
    finally { setBusy(false); }
  };
  const admitQuantumScene = async (item: ProjectQuantumSceneReference) => {
    if (busy || preview || managed || !project || !onVerifyQuantumSceneDocument) return;
    const before = serializeMath3DProject(project);
    setBusy(true); setQuantumSceneMessage("Verifying complete source before Project admission…");
    try {
      const document = await onVerifyQuantumSceneDocument(item);
      if (document.source.sceneFingerprint !== item.sceneFingerprint || document.location.directory !== item.directory)
        throw new TypeError("Verified scene does not match the attached source.");
      const current = projectStateRef.current;
      if (!current || serializeMath3DProject(current) !== before) throw new TypeError("Project changed during verification. Retry admission.");
      if (current.workspace.entries.some((entry) => entry.expected.id === document.identity.id))
        throw new TypeError("This scene is already a Project document.");
      const stagedEntries = [...current.workspace.entries, { module: "quantum" as const, checkpoint: document, expected: document.identity, replay: null }];
      const linkedDocuments = new Map(linkQuantumSceneDocuments(stagedEntries.filter(entry => entry.module === "quantum")
        .map(entry => entry.checkpoint as QuantumSceneDocument)).map(item => [item.source.sceneFingerprint, item]));
      const workspace = createMixedWorkspaceDocument({ ...current.workspace,
        entries: stagedEntries.map(entry => entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document"
          ? { ...entry, checkpoint: linkedDocuments.get(entry.checkpoint.source.sceneFingerprint)! } : entry),
        activeDocumentIds: [...current.workspace.activeDocumentIds, document.identity.id] });
      const next = replaceMath3DProjectWorkspace(current, workspace);
      setProject(next);
      setExplorer(buildProjectExplorer(next, verifyMixedWorkspaceReplay(next.workspace)));
      setQuantumSceneMessage("Read-only quantum document staged in Project contents. Save project to retain it.");
    } catch (error) { setQuantumSceneMessage(`Admission refused: ${String((error as Error).message)}`); }
    finally { setBusy(false); }
  };
  const [message, setMessage] = useState("");
  const [explorer, setExplorer] = useState<ReturnType<typeof buildProjectExplorer> | null>(null);
  const [inspectionOpen, setInspectionOpen] = useState(false), [inspectedId, setInspectedId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<ReturnType<typeof previewProjectImport> | null>(null);
  const [incomingNarrative, setIncomingNarrative] = useState<ReturnType<typeof createPortableResearchNarrative> | null>(null);
  const [galleryAssetBytes, setGalleryAssetBytes] = useState<Record<string, number>>({});
  const galleryHost = useMemo(() => probeRendererPlatformCapabilities(), []);
  const importSequence = useRef(0);
  useEffect(() => {
    if (!highlightedSavedId) return;
    const card = document.getElementById(`project-library-${highlightedSavedId}`);
    card?.scrollIntoView({ block: "center" });
    card?.focus({ preventScroll: true });
  }, [highlightedSavedId]);
  const dependencies = useMemo(() => project && inspectionOpen ? inspectProjectDependencies(project, artifactAvailable) : null, [project, artifactAvailable, inspectionOpen]);
  const dashboardDependencies = useMemo(() => {
    if (!project || quick || !detailView) return null;
    try { return inspectProjectDependencies(project, artifactAvailable); }
    catch { return null; }
  }, [project, quick, detailView, artifactAvailable]);
  // The explorer describes its captured Project snapshot; Refresh captures new bytes and generations.
  const analyses = useMemo(() => {
    if (!project) return new Map();
    try {
      const resources = captureProjectResources(project, item => resourceSession.current?.bytes(item) ?? resourceReader?.(item) ?? null, true);
      return new Map(projectAnalysisAvailability(project, { resources, artifactAvailable, tableAvailable: reference => pointTableStore.resolve(reference) !== null }).map(item => [item.id, item]));
    } catch (error) {
      return new Map(project.workspace.entries.map(entry => [entry.expected.id, { route: null, tools: [], reason: `Analysis unavailable: ${(error as Error).message}`, qualification: "" }]));
    }
  }, [project]);
  const documentTitles = new Map(explorer?.groups.flatMap((group) => group.documents.map((document) => [document.id, document.title] as const)) ?? []);
  const contourSources = useMemo(() => new Map<string, ReturnType<typeof projectAlgebraLocusCurveSourceStatus>>(
    project?.workspace.entries.flatMap(entry =>
    entry.module === "curve" && entry.checkpoint.format === "math3d.curve-document" &&
    entry.checkpoint.source.definition.familyId === "algebra.bounded-locus-contour"
      ? [[entry.expected.id, projectAlgebraLocusCurveSourceStatus(project!, entry.checkpoint)] as const]
      : []) ?? []), [project]);
  const relatedSummary = useMemo(() => {
    const empty = { sources: [] as { id: string; module: KernelWorkspaceModule; revision: number; historical: boolean }[],
      derived: [] as { id: string; module: KernelWorkspaceModule; revision: number; historical: boolean }[],
      evidence: [] as { id: string; operation: string; revision: number; historical: boolean }[],
      notes: [] as ProjectNote[] };
    if (!project || !viewingDocumentId) return empty;
    const entries = new Map<string, (typeof project.workspace.entries)[number]>(project.workspace.entries.map(entry => [entry.expected.id, entry]));
    const add = (items: typeof empty.sources, id: string, revision: number, hash: string) => {
      const entry = entries.get(id);
      if (!entry || items.some(item => item.id === id)) return;
      items.push({ id, module: entry.module, revision,
        historical: entry.expected.revision !== revision || entry.expected.structuralHash !== hash });
    };
    for (const relation of project.workspace.relations) {
      if (relation.target.type !== "document") continue;
      if (relation.target.generation.documentId === viewingDocumentId)
        for (const source of relation.sources) add(empty.sources, source.documentId, source.revision, source.structuralHash);
      if (relation.sources.some(source => source.documentId === viewingDocumentId)) {
        const target = relation.target.generation;
        add(empty.derived, target.documentId, target.revision, target.structuralHash);
      }
    }
    const sourceEntry = entries.get(viewingDocumentId);
    empty.evidence = project.workspace.results.filter(result => result.provenance.source.documentId === viewingDocumentId)
      .map(result => ({ id: result.resultId, operation: result.provenance.operation.type,
        revision: result.provenance.source.revision,
        historical: sourceEntry?.expected.revision !== result.provenance.source.revision ||
          sourceEntry?.expected.structuralHash !== result.provenance.source.structuralHash }));
    empty.notes = project.notes?.filter(note => note.anchor && "source" in note.anchor && note.anchor.source.documentId === viewingDocumentId) ?? [];
    return empty;
  }, [project, viewingDocumentId]);
  const workbookUsage = useMemo(() => project && viewingDocumentId
    ? projectWorkbookUses(project, viewingDocumentId, id => resourceSession.current?.bytes({ kind: "workbook-payload", id }) ?? null)
    : { uses: [], unavailable: 0 }, [project, viewingDocumentId]);

  type CardSummary = { description: string; documents: number; results: number; modules: string[] };
  const [summaries, setSummaries] = useState<Map<string, CardSummary>>(new Map());
  const summaryCache = useRef(new Map<string, { savedAt: number; summary: CardSummary }>());
  useEffect(() => {
    if (!open || (quick && viewerCompanion)) return;
    const entries = orderProjectLibrary(library);
    const fresh = new Map<string, CardSummary>();
    for (const entry of entries) {
      const cached = summaryCache.current.get(entry.id);
      if (cached?.savedAt === entry.savedAt) fresh.set(entry.id, cached.summary);
    }
    setSummaries(fresh);
    let loaded = fresh;
    let index = 0, cancelled = false;
    const batch = () => {
      if (cancelled) return;
      const next = new Map(loaded);
      for (let count = 0; index < entries.length && count < 2; index++, count++) {
        const entry = entries[index]!;
        if (next.has(entry.id)) continue;
        let summary: CardSummary;
        try {
          const saved = loadLibraryProject(localStorage, entry.id);
          summary = { description: saved.metadata.description ?? "", documents: saved.workspace.entries.length, results: saved.workspace.results.length,
            modules: [...new Set([...saved.workspace.entries.map(item => ({ graph2d: "Graph", field: "Scientific field", vector2d: "2D vector field", vector3d: "3D vector field", surface: "Surface", curve: "Curve", mesh: "Mesh", volume: "Volume", geometry: "Geometry", topology: "Topology", complex: "Complex", quantum: "Quantum scene" }[item.module] ?? item.module)),
              ...(saved.workbooks?.length ? ["Workbook"] : []), ...(saved.notes?.length ? ["Notes"] : []), ...(saved.workspace.results.length ? ["Analysis"] : [])])] };
        } catch { summary = { description: "Saved payload unavailable. Preview reports the recovery details.", documents: 0, results: 0, modules: [] }; }
        summaryCache.current.set(entry.id, { savedAt: entry.savedAt, summary });
        next.set(entry.id, summary);
      }
      setSummaries(next);
      loaded = next;
      if (index < entries.length) timer = window.setTimeout(batch, 0);
    };
    let timer = window.setTimeout(batch, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [library, open, quick, viewerCompanion]);
  const filteredProjects = orderProjectLibrary(library).filter(entry => (collection !== "Favorites" || entry.favorite) &&
    (moduleFilter === "All modules" || !summaries.has(entry.id) || summaries.get(entry.id)?.modules.includes(moduleFilter)) &&
    `${entry.title} ${entry.tags.join(" ")} ${summaries.get(entry.id)?.description ?? ""} ${summaries.get(entry.id)?.modules.join(" ") ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const readActiveProjectId = () => { const raw = localStorage.getItem(PROJECT_STORAGE_KEY); return raw ? parseMath3DProject(raw).identity.id : null; };
  const starterCopies = useMemo(() => {
    let activeId: string | null = null;
    try { activeId = readActiveProjectId(); } catch { /* Open reports invalid saved bytes without replacing them. */ }
    return Object.fromEntries([...MATH3D_PROJECT_TEMPLATES, ...NOTEBOOK_STARTERS].flatMap(item => {
      const copy = findProjectStarterCopy(library, item.id, activeId);
      return copy ? [[item.id, copy]] : [];
    }));
  }, [library, project]);
  const guidedCopies = useMemo(() => {
    let activeId: string | null = null;
    try { activeId = readActiveProjectId(); } catch { /* Saved bytes are validated on open. */ }
    const guidedLibrary = { ...library, entries: library.entries.filter(entry => entry.tags.includes("curated-study-v1")) };
    return Object.fromEntries([...MATH3D_PROJECT_TEMPLATES, ...NOTEBOOK_STARTERS].flatMap(item => {
      const copy = findProjectStarterCopy(guidedLibrary, item.id, activeId);
      return copy ? [[item.id, copy]] : [];
    }));
  }, [library, project]);
  const display = (next: Math3DProject, savedPreview: boolean, keepManagement = false, resolved?: ReturnType<typeof verifyMixedWorkspaceReplay>) => {
    if (!keepManagement) workspacePanel.current?.scrollTo({ top: 0 });
    const tree = buildProjectExplorer(next, resolved ?? verifyMixedWorkspaceReplay(next.workspace));
    setProject(next); setTitle(next.metadata.title); setDescription(next.metadata.description ?? ""); setTags((next.metadata.tags ?? []).join(", "));
    if (!keepManagement) { setThumbnail(null); setReplaceThumbnail(false); setThumbnailMessage(""); } setExplorer(tree); setPreview(savedPreview);
    if (!keepManagement) { setManaged(null); setManagedBytes(undefined); }
    if (!keepManagement) { setInspectionOpen(false); setInspectedId(null); }
    if (!keepManagement) { setIncoming(null); importSequence.current++; }
    if (!savedPreview) { loadedProject.current = next; onCurrentProjectChange?.(next, resourceSession.current ?? undefined); }
  };
  const refreshLibrary = () => {
    try { setLibrary(parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY))); setLibraryMessage(""); }
    catch (error) { setLibrary(parseProjectLibrary(null)); setLibraryMessage(`Library unavailable: ${(error as Error).message}`); }
  };
  const liveProject = (capturedWorkspace?: MixedWorkspaceDocument) => {
    let base = preview ? null : project;
    // Read the saved name/identity once; workspace content always comes from the
    // live capture. Invalid saved bytes must not be silently replaced.
    if (!base) {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
      if (raw) base = parseMath3DProject(raw);
    }
    const workspace = capturedWorkspace ?? capture();
    verifyMixedWorkspaceReplay(workspace);
    const next = base ? replaceMath3DProjectWorkspace(base, mergeProjectLiveWorkspace(base.workspace, workspace)) :
      createMath3DProject(workspace, { stableKey: crypto.randomUUID(), title: title.trim() || "Untitled project" });
    return migrateProjectScientificSelections(next, verifyMixedWorkspaceReplay(next.workspace));
  };
  const refresh = () => {
    setAnalysisError(null);
    refreshLibrary();
    try { display(liveProject(), false); setMessage("Current workspace documents."); }
    catch (error) {
      try {
        const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
        if (!raw) throw error;
        const saved = parseMath3DProject(raw);
        display(saved, false);
        setMessage("Showing the saved Project while its editor documents load. Refresh workspace after loading to include live edits.");
      } catch { setMessage(`Project unavailable: ${(error as Error).message}`); }
    }
  };
  useEffect(() => {
    if (!open) return;
    // Reopening a dock is presentation only. Refresh/Save capture live sources;
    // doing that here replays and hashes every document on each panel switch.
    if (hasOpenProject && viewerCompanion && project) return;
    setNotesOpen(false);
    setMessage("Loading current workspace…");
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, [open]);
  const refreshNotes = () => {
    const sequence = ++noteRefreshSequence.current;
    try {
      const workspace = capture(); verifyMixedWorkspaceReplay(workspace);
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
      const active = raw ? parseMath3DProject(raw) : null;
      const saved = active && parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY)).entries.some((entry) => entry.id === active.identity.id) ? active : null;
      setNotesWorkspace(workspace); setNotesProject(saved); setNotesMessage(saved ? "Notes for the active named Project." : "Notes remain session drafts until a named Project is saved.");
      setNoteWorkbooks([]);
      if (saved?.workbooks?.length) void loadProjectResources(saved).then((resources) => {
        const loaded = saved.workbooks!.flatMap((reference) => {
          const bytes = resources.bytes({ kind: "workbook-payload", id: reference.id });
          return bytes ? [{ workbook: readProjectWorkbook(bytes, reference), revision: reference.revision }] : [];
        });
        if (noteRefreshSequence.current === sequence) setNoteWorkbooks(loaded);
      }).catch((error) => { if (noteRefreshSequence.current === sequence) setNotesMessage(`Workbook Note targets unavailable: ${(error as Error).message}`); });
    } catch (error) { setNotesMessage(`Notes unavailable: ${(error as Error).message}`); }
  };
  useEffect(() => {
    if (!noteRequest) return;
    if (noteRequest.openTarget) {
      const note = project?.notes?.find(item => item.identity.id === noteRequest.id);
      if (note?.anchor?.kind === "comparison" && note.anchor.coordinateProbe &&
        inspectProjectComparisonNote(project!, note, comparisonResource).status === "current") {
        setComparisonInitialId(note.anchor.compositionId);
        setComparisonInitialProbeId(note.identity.id);
        setCompositionOpen(true);
        setNotesOpen(false);
        onOpenChange(true);
      } else setMessage("The exact saved coordinate Note or one of its sources is unavailable.");
      return;
    }
    setSelectedNoteId(null);
    setNotesPlacement("floating");
    onOpenChange(false);
    refreshNotes();
    setNotesOpen(true);
  }, [noteRequest?.token]);
  const captureNote = (kind: NoteCaptureKind) => {
    try {
      const workspace = capture(); verifyMixedWorkspaceReplay(workspace);
      const selection = kind === "selection" ? captureNoteSelection?.() : null;
      if (kind === "selection" && !selection) throw new Error("Select a Geometry, Mesh, or Graph object first.");
      const selectionAnchor = selection ? createProjectNoteSelectionAnchor(workspace, selection) : undefined;
      const draft = createProjectNoteDraft(kind, workspace, crypto.randomUUID(), Date.now(), selectionAnchor);
      setNoteDrafts((current) => [...current, draft]); setNotesWorkspace(workspace);
      setNotesMessage("Note captured as a session draft. Add your observation, then save it to the Project.");
    } catch (error) { setNotesMessage(`Note capture failed: ${(error as Error).message}`); }
  };
  const openProjectNotes = (noteId?: string, create = false) => {
    setSelectedNoteId(noteId ?? null);
    if (!viewerCompanion) setQuick(false);
    setDetailView(true);
    setNotesPlacement("project");
    workspacePanel.current?.scrollTo({ top: 0 });
    refreshNotes();
    setNotesOpen(true);
    if (create) captureNote("global");
  };
  const captureAnchoredNote = (anchor: ProjectNoteAnchor, title: string, body: string) => {
    const draft: ProjectNoteDraft = { id: crypto.randomUUID(), title, body, anchor, createdAt: Date.now() };
    setNoteDrafts((current) => [...current, draft]);
    setNotesMessage("Note captured as a session draft. Add your observation, then save it to the Project.");
  };
  const captureResultNote = (resultId: string) => {
    try {
      const workspace = capture(); verifyMixedWorkspaceReplay(workspace);
      const draft = createProjectNoteDraft("result", workspace, crypto.randomUUID(), Date.now(), undefined, resultId);
      setNoteDrafts((current) => [...current, draft]); setNotesWorkspace(workspace);
      setNotesMessage("Result Note captured as a session draft.");
    } catch (error) { setNotesMessage(`Result Note capture failed: ${(error as Error).message}`); }
  };
  const captureWorkbookBlockNote = (workbookId: string, blockId: string) => {
    const target = noteWorkbooks.find((item) => item.workbook.id === workbookId);
    const stage = target?.workbook.stages.find((item) => item.blocks.some((block) => block.id === blockId));
    const block = stage?.blocks.find((item) => item.id === blockId);
    if (!target || !block) { setNotesMessage("Workbook block is unavailable. Refresh Notes."); return; }
    captureAnchoredNote({ kind: "workbook-block", workbookId: target.workbook.id as StableDocumentId,
      workbookRevision: target.revision, blockId, blockHash: structuralHash(block) },
      `${block.title} observation`, `Workbook: ${target.workbook.title}; block: ${block.title}. Add your observation.`);
  };
  const openNoteTarget = (note: ProjectNote) => {
    const anchor = note.anchor;
    if (!anchor) return;
    if (anchor.kind === "study-selection") {
      const current = project?.identity.id === note.projectId ? project : notesProject;
      const checked = current && inspectProjectNoteAnchor(note,
        projectNoteSourceResolver(current.identity.id, current.workspace));
      const pinned = current && anchor.researchReference &&
        inspectResearchReference(current, anchor.researchReference, comparisonResource);
      if (!checked || checked.status !== "current" || pinned && pinned.status !== "current") {
        setNotesMessage("The exact Study selection or its source generation is unavailable."); return;
      }
      setStudyFocus(previous => ({ id: anchor.studyId, selectionId: anchor.selectionId,
        token: (previous?.token ?? 0) + 1 }));
      setQuick(false); setDetailView(true); setDetailPage("overview");
      setNotesOpen(false); onOpenChange(true);
      return;
    }
    if (anchor.kind === "comparison") {
      const current = project?.identity.id === note.projectId ? project : notesProject;
      if (!current || inspectProjectComparisonNote(current, note, comparisonResource).status !== "current") {
        setNotesMessage("The exact saved comparison or one of its sources is unavailable. Reopen or relink the Project.");
        return;
      }
      setComparisonInitialId(anchor.compositionId);
      setComparisonInitialProbeId(anchor.coordinateProbe ? note.identity.id : undefined);
      setCompositionOpen(true); setNotesOpen(false); onOpenChange(true);
      return;
    }
    if (anchor.kind === "saved-mesh-comparison") {
      const current = project?.identity.id === note.projectId ? project : notesProject;
      if (!current || inspectProjectSavedMeshComparisonNote(current, note, comparisonResource).status !== "current") {
        setNotesMessage("The exact saved Mesh comparison or one of its sources is unavailable."); return;
      }
      const pair = current.savedMeshComparisons?.find(item => item.id === anchor.comparisonId);
      if (!pair) return;
      setSavedMeshComparison(pair); setMeshTrendComparison(null); setMeshResultComparisonOpen(true); setNotesOpen(false); onOpenChange(true);
      return;
    }
    const current = project?.identity.id === note.projectId ? project : notesProject;
    const qualification = current && inspectProjectNoteAnchor(note, {
      ...projectNoteSourceResolver(current.identity.id, current.workspace),
      workbookBlock: (workbookId, blockId) => {
        const target = noteWorkbooks.find(item => item.workbook.id === workbookId);
        const block = target?.workbook.stages.flatMap(stage => stage.blocks).find(item => item.id === blockId);
        return target && block ? { revision: target.revision, hash: structuralHash(block) } : null;
      },
    });
    const pinned = current && anchor.researchReference &&
      inspectResearchReference(current, anchor.researchReference, comparisonResource);
    if (!qualification || qualification.status !== "current" || pinned && pinned.status !== "current") {
      setNotesMessage("The Note's exact saved target or source generation is unavailable."); return;
    }
    if (anchor.kind === "workbook-block") {
      const target = noteWorkbooks.find((item) => item.workbook.id === anchor.workbookId);
      const stage = target?.workbook.stages.find((item) => item.blocks.some((block) => block.id === anchor.blockId));
      if (target && stage) {
        onOpenWorkbook?.(target.workbook, stage.id, anchor.blockId);
        if (notesPlacement === "project") { setViewingDocumentId(null); setQuick(true); setViewerCompanion(true); setDetailView(true); }
        else setNotesOpen(false);
      }
      else setNotesMessage("Workbook block is unavailable in this Project.");
      return;
    }
    const entry = notesWorkspace?.entries.find((item) => item.expected.id === anchor.source.documentId);
    if (entry && canNavigateDocument?.(entry.expected.id, entry.module)) {
      onNavigateDocument?.(entry.expected.id, entry.module);
      if (notesPlacement === "project") { setViewingDocumentId(entry.expected.id); setQuick(true); setViewerCompanion(true); setDetailView(true); }
      else setNotesOpen(false);
    } else setNotesMessage("Source document is unavailable to open.");
  };
  const resourceBytes = (extra = resourceSession.current, workbook?: { id: string; bytes: Uint8Array }): ProjectResourceReader => (item) => {
    if (item.kind === "workbook-payload" && item.id === workbook?.id) return workbook.bytes;
    if (item.kind === "mesh-buffers" && quantumPromotionMeshBytes.current.has(item.id))
      return quantumPromotionMeshBytes.current.get(item.id)!;
    const live = resourceReader?.(item); if (live) return live;
    if (item.kind === "graph-point-table") { const rows = pointTableStore.resolve(item.reference as import("@math3d/core").Graph2DPointTableReference); if (rows) return new TextEncoder().encode(canonicalJsonStringify(rows)); }
    return extra?.bytes(item) ?? null;
  };
  useEffect(() => {
    if (!open) return;
    const sequence = ++backupStageSequence.current;
    const timer = window.setTimeout(() => {
      const earlier = backupStaging.current;
      const work = async () => {
        try {
          await earlier;
          if (sequence !== backupStageSequence.current) return;
          const workspace = currentCapture.current(), snapshot = canonicalJsonStringify(workspace);
          const inputToken = workspaceInputSequence.current, session = resourceSession.current;
          if (stagedBackup.current?.snapshot === snapshot && stagedBackup.current.session === session && stagedBackup.current.inputToken === inputToken) return;
          const project = adoptMixedWorkspaceProject(workspace, "Before project open");
          const resources = await captureProjectResourcesAsync(project, resourceBytes(session), true);
          if (!resources.byteEntries().length || sequence !== backupStageSequence.current) return;
          const slot = await stageProjectBackupResources(project, resources);
          if (sequence !== backupStageSequence.current || inputToken !== workspaceInputSequence.current || session !== resourceSession.current || canonicalJsonStringify(currentCapture.current()) !== snapshot) return;
          stagedBackup.current = { snapshot, inputToken, session, project, resources, slot };
          performance.clearMarks("project-open:backup-ready");
          performance.mark("project-open:backup-ready");
        } catch { /* Opening still captures and commits a fresh backup. */ }
      };
      backupStaging.current = work();
    }, 200);
    return () => { window.clearTimeout(timer); backupStageSequence.current++; };
  }, [open]);
  const collectResources = (next: Math3DProject, extra = resourceSession.current, allowMissing = false, workbook?: { id: string; bytes: Uint8Array }) => captureProjectResources(next, resourceBytes(extra, workbook), allowMissing);
  const promoteQuantumScene = async (reference: ProjectQuantumSceneReference, target: QuantumNativeTarget,
    expectedSource?: ProjectOpenInAction["source"]): Promise<string | null> => {
    const current = projectStateRef.current;
    if (!current || busy || !window.quantumScenes?.openReference) return null;
    const before = serializeMath3DProject(current);
    setBusy(true);
    try {
      const opened = await window.quantumScenes.openReference({ directory: reference.directory,
        sceneFingerprint: reference.sceneFingerprint });
      if (!opened.ok) throw new Error(opened.canceled ? "Scene opening was cancelled" : opened.error);
      if (!projectStateRef.current || serializeMath3DProject(projectStateRef.current) !== before)
        throw new Error("Project changed during quantum promotion");
      const source = quantumSceneDocumentFromVerifiedOpen(opened);
      if (expectedSource && !matchesScientificSourceGeneration(viewerSourceFromDocument(source), expectedSource))
        throw new Error("The verified Quantum scene differs from the selected source generation.");
      const promotion = promoteQuantumNative(opened, target, rows => pointTableStore.publish(rows));
      const entries = [...current.workspace.entries];
      if (!entries.some(entry => entry.expected.id === source.identity.id))
        entries.push({ module: "quantum", checkpoint: source, expected: source.identity, replay: null });
      for (const document of promotion.documents) {
        if (entries.some(entry => entry.expected.id === document.identity.id))
          throw new Error("This native copy is already staged in the Project");
        const module: KernelWorkspaceModule = document.format === "math3d.graph2d-document" ? "graph2d" :
          document.format === "math3d.geometry-document" ? "geometry" :
          document.format === "math3d.curve-document" ? "curve" :
          document.format === "math3d.surface-document" ? "surface" : "mesh";
        entries.push({ module, checkpoint: document, expected: document.identity, replay: null });
      }
      const relations = [...current.workspace.relations, ...promotion.documents.map(document => createDocumentRelation({
        kind: "derived-from", sources: [viewerSourceFromDocument(source)], sourceOrder: "ordered",
        target: { type: "document", generation: viewerSourceFromDocument(document) },
        operation: `quantum.promote-${target}`, parameters: { sceneFingerprint: reference.sceneFingerprint,
          resultSha256: source.source.provenance.resultSha256, precision: target === "mesh" || target === "surface" ? "float32-copy" : "source-coordinates" },
      }))];
      const workspace = createMixedWorkspaceDocument({ ...current.workspace, entries, relations,
        activeDocumentIds: [...current.workspace.activeDocumentIds, source.identity.id,
          ...promotion.documents.map(document => document.identity.id)].filter((id, index, all) => all.indexOf(id) === index) });
      const next = replaceMath3DProjectWorkspace(current, workspace);
      if (promotion.meshBytes) quantumPromotionMeshBytes.current.set(promotion.meshBytes.id, promotion.meshBytes.bytes);
      const resources = collectResources(next);
      onRestoreWorkspace?.(next.workspace, resources, next);
      resourceSession.current = resources; resourceSessionId.current = next.identity.id;
      display(next, false);
      const primary = promotion.documents.at(-1)!;
      setViewingDocumentId(primary.identity.id);
      setViewerCompanion(true); setQuick(true); setDetailView(true);
      onNavigateDocument?.(primary.identity.id, target);
      setQuantumSceneMessage(`${target} copy staged with exact quantum source relation. Save Project to retain it.` +
        (target === "geometry" ? " This bounded copy opens in the current Project source editor; pinned pre-QEC rollback still shows a compatibility preview." : ""));
      return primary.identity.id;
    } catch (error) { setQuantumSceneMessage(`Native promotion refused: ${String((error as Error).message)}`); return null; }
    finally { setBusy(false); }
  };
  const stageQuantumStudyTemplate = (anchor: QuantumSceneDocument, templateId: QuantumStudyTemplateId) => {
    const current = projectStateRef.current;
    if (!current || busy || preview || managed) return;
    try {
      const documents = current.workspace.entries.filter(entry => entry.module === "quantum" &&
        entry.checkpoint.format === "math3d.quantum-scene-document")
        .map(entry => entry.checkpoint as QuantumSceneDocument);
      const study = createQuantumStudyFromTemplate(templateId, anchor, documents);
      const workspace = createMixedWorkspaceDocument({ ...current.workspace,
        quantumStudies: [...(current.workspace.quantumStudies ?? []).filter(item => item.id !== study.id), study] });
      const next = replaceMath3DProjectWorkspace(current, workspace);
      setProject(next); setExplorer(buildProjectExplorer(next, verifyMixedWorkspaceReplay(next.workspace)));
      setQuantumSceneMessage(`${QUANTUM_STUDY_TEMPLATES[templateId].label} layout staged. Save Project to retain it.`);
    } catch (error) { setQuantumSceneMessage(`Study template refused: ${String((error as Error).message)}`); }
  };
  const save = async () => {
    if (busy) return; setBusy(true);
    try {
      const capturedWorkspace = managed ? undefined : capture();
      let next = updateMath3DProjectMetadata(managed?.project() ?? liveProject(capturedWorkspace), { ...(managed?.project() ?? project)?.metadata,
        title: title.trim(), description, tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))] });
      next = migrateProjectScientificSelections(next, verifyMixedWorkspaceReplay(next.workspace));
      if (!managed && noteDrafts.length) next = bindProjectNoteDrafts(next, noteDrafts);
      await verifyProjectQuantumSceneDocuments(next, onVerifyQuantumSceneDocument);
      if (next.quantumScenes?.length && window.quantumScenes?.pinProjectSources)
        await window.quantumScenes.pinProjectSources(next.identity.id, next.quantumScenes.map(item =>
          ({ directory: item.directory, sceneFingerprint: item.sceneFingerprint })));
      if (managed && serializeMath3DProject(next) !== serializeMath3DProject(managed.project())) next = managed.commit(next);
      const tree = buildProjectExplorer(next, verifyMixedWorkspaceReplay(next.workspace));
      const previousResources = managed ? await loadProjectResources(loadLibraryProject(localStorage, next.identity.id)) : resourceSessionId.current === next.identity.id ? resourceSession.current : project ? await loadProjectResources(project) : undefined;
      const resources = collectResources(next, previousResources, !!managed);
      let image = thumbnail?.id === next.identity.id ? thumbnail.data : undefined;
      let imageMode: "automatic" | "manual" = "manual", imageMessage = "";
      const existing = parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY)).entries.find(entry => entry.id === next.identity.id);
      if (!managed && !image && automaticThumbnail && (replaceThumbnail || !existing || !readProjectThumbnail(localStorage, existing) || isAutomaticProjectThumbnail(localStorage, existing))) {
        try {
          if (!captureProjectThumbnail) throw new Error("Automatic previews are available in the desktop app.");
          if (canonicalJsonStringify(capture()) !== canonicalJsonStringify(capturedWorkspace!)) throw new Error("The view changed during saving; save again to update its preview.");
          const captured = await captureProjectThumbnail();
          if (canonicalJsonStringify(capture()) !== canonicalJsonStringify(capturedWorkspace!)) throw new Error("The view changed during capture; the previous preview was kept.");
          image = captured; imageMode = "automatic";
        } catch (error) { imageMessage = `Preview kept: ${(error as Error).message}`; }
      }
      const savedLibrary = await commitProjectResources(next, resources, () => saveLibraryProject(localStorage, next, Date.now(), image,
        { ...(managed ? { activate: false, expectedBytes: managedBytes } : {}), thumbnailMode: imageMode }));
      setLibrary(savedLibrary);
      if (imageMode === "automatic") imageMessage = readProjectThumbnail(localStorage, savedLibrary.entries.find(entry => entry.id === next.identity.id)!) === image ? "Current view saved as the project preview." : "Project saved; preview kept because image storage is full.";
      else if (image) imageMessage = "Uploaded preview saved. It stays in place until you choose Use current view.";
      setThumbnailMessage(imageMessage); setReplaceThumbnail(false);
      resourceSession.current = resources; resourceSessionId.current = next.identity.id;
      if (managed) setManagedBytes(serializeMath3DProject(next));
      setProject(next); setTags((next.metadata.tags ?? []).join(", ")); setTitle(next.metadata.title); setThumbnail(null); setExplorer(tree); setPreview(!!managed); setLibraryMessage("");
      if (!managed) { setHasOpenProject(true); loadedProject.current = next; onCurrentProjectChange?.(next, resources); }
      if (!managed) { setNotesProject(next); setNoteDrafts([]); }
      setMessage(`Saved “${next.metadata.title}” with ${next.workspace.entries.length} documents.`);
    } catch (error) { setMessage(`Project save failed: ${(error as Error).message}`); }
    finally { setBusy(false); }
  };
  const commitNotes = async (change: (saved: Math3DProject) => Math3DProject, success: string, syncWorkspace = false): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
      if (!raw) throw new Error("Save a named Project first.");
      const saved = parseMath3DProject(raw);
      if (!parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY)).entries.some((entry) => entry.id === saved.identity.id))
        throw new Error("Save a named Project first.");
      const workspace = syncWorkspace ? capture() : null;
      if (workspace) verifyMixedWorkspaceReplay(workspace);
      const base = workspace ? replaceMath3DProjectWorkspace(saved, mergeProjectLiveWorkspace(saved.workspace, workspace)) : saved;
      const next = change(base);
      const previous = await loadProjectResources(saved);
      const resources = workspace ? collectResources(next, previous) : captureProjectResources(next, (item) => previous.bytes(item), true);
      setLibrary(await commitProjectResources(next, resources, () => saveLibraryProject(localStorage, next, Date.now(), undefined,
        { expectedBytes: serializeMath3DProject(saved) })));
      resourceSession.current = resources; resourceSessionId.current = next.identity.id;
      display(next, false); setNotesProject(next); if (workspace) setNotesWorkspace(workspace); setNotesMessage(success);
      return true;
    } catch (error) { setNotesMessage(`Note save failed: ${(error as Error).message}`); return false; }
    finally { setBusy(false); }
  };
  const saveNoteDrafts = () => {
    const drafts = [...noteDrafts];
    if (!drafts.length) return;
    void commitNotes((saved) => bindProjectNoteDrafts(saved, drafts), `Saved ${drafts.length} Note${drafts.length === 1 ? "" : "s"} to the Project.`, true)
      .then((saved) => { if (saved) setNoteDrafts((current) => current.filter((item) => !drafts.some((draft) => draft.id === item.id))); });
  };
  const saveEditedNote = (note: ProjectNote, noteTitle: string, body: string): Promise<boolean> =>
    commitNotes((saved) => {
      const current = saved.notes?.find((item) => item.identity.id === note.identity.id);
      if (!current || current.identity.revision !== note.identity.revision) throw new Error("Note changed. Reopen the Project before editing it.");
      return upsertMath3DProjectNote(saved, updateProjectNote(current, { title: noteTitle.trim(), body }, Date.now()));
    }, `Saved “${noteTitle.trim()}”.`);
  const changeNoteValues = (note: ProjectNote, patch: NoteValuePatch): Promise<boolean> => commitNotes(saved => {
    const current = saved.notes?.find(item => item.identity.id === note.identity.id);
    if (!current || current.identity.revision !== note.identity.revision || current.identity.structuralHash !== note.identity.structuralHash) throw new Error("Note changed. Refresh before binding values.");
    const capturedPatch = patch.valueSnapshot ? { ...patch, valueSnapshot: { capturedAt: Date.now(), values: resolveProjectNoteValues({ ...current, valueSnapshot: null }, saved.workspace) } } : patch;
    return upsertMath3DProjectNote(saved, updateProjectNote(current, capturedPatch, Date.now()));
  }, `Saved values for “${note.title}”.`, true);
  useEffect(() => {
    if (!notesOpen) return;
    try {
      const workspace = capture(); verifyMixedWorkspaceReplay(workspace);
      setNotesWorkspace(current => current && canonicalJsonStringify(current) === canonicalJsonStringify(workspace) ? current : workspace);
    } catch { setNotesWorkspace(null); }
  }, [notesOpen, capture]);
  const sendNoteToWorkbook = async (note: ProjectNote, workbookId: string, blockId: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
      if (!raw) throw new Error("Save a named Project first.");
      const saved = parseMath3DProject(raw);
      if (saved.identity.id !== note.projectId || !parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY)).entries.some((entry) => entry.id === saved.identity.id))
        throw new Error("Open the Note's named Project first.");
      const currentNote = saved.notes?.find((item) => item.identity.id === note.identity.id);
      if (!currentNote || currentNote.identity.revision !== note.identity.revision || currentNote.identity.structuralHash !== note.identity.structuralHash)
        throw new Error("Note changed. Refresh Notes before linking it.");
      const reference = saved.workbooks?.find((item) => item.id === workbookId);
      if (!reference) throw new Error("The target Workbook is not in this Project.");
      const previous = await loadProjectResources(saved);
      const bytes = previous.bytes({ kind: "workbook-payload", id: workbookId });
      if (!bytes) throw new Error("The target Workbook resource is unavailable.");
      const workbook = readProjectWorkbook(bytes, reference);
      const stage = workbook.stages.find((item) => item.blocks.some((block) => block.id === blockId));
      if (!stage) throw new Error("The target block is no longer in this Workbook.");
      if (workbook.dependencies?.some((edge) => edge.targetBlockId === blockId && edge.source.kind === "note" && edge.source.noteId === note.identity.id))
        throw new Error("This Note is already linked to that block. Use Refresh link in the Workbook after a Note edit.");
      const linked = addWorkbookDependency(workbook, {
        id: crypto.randomUUID(), targetBlockId: blockId, source: createNoteDependencySource(saved, note.identity.id),
      }, saved);
      const prepared = prepareProjectWorkbook(saved, { ...linked, updatedAt: Date.now() }, crypto.randomUUID());
      const next = upsertMath3DProjectWorkbook(saved, prepared.reference);
      const resources = collectResources(next, previous, false, { id: prepared.reference.id, bytes: prepared.bytes });
      setLibrary(await commitProjectResources(next, resources, () => saveLibraryProject(localStorage, next, Date.now(), undefined,
        { expectedBytes: serializeMath3DProject(saved) })));
      resourceSession.current = resources; resourceSessionId.current = next.identity.id;
      display(next, false); setNotesProject(next);
      setNoteWorkbooks((current) => current.map((item) => item.workbook.id === workbookId
        ? { workbook: prepared.workbook, revision: prepared.reference.revision } : item));
      setNotesMessage(`Linked “${note.title}” to ${workbook.title} / ${stage.title}.`);
      onOpenWorkbook?.(prepared.workbook, stage.id, blockId);
      setNotesOpen(false);
      if (notesPlacement === "project") onOpenChange(false);
      return true;
    } catch (error) { setNotesMessage(`Workbook link failed: ${(error as Error).message}`); return false; }
    finally { setBusy(false); }
  };
  const saveActiveWorkbook = async () => {
    if (busy || preview || managed || !project) return;
    setBusy(true);
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
      if (!raw) throw new Error("Save a named Project before adding a Workbook.");
      const saved = parseMath3DProject(raw);
      if (saved.identity.id !== project.identity.id || !library.entries.some((entry) => entry.id === saved.identity.id))
        throw new Error("Open and save this Project before adding a Workbook.");
      const source = captureActiveWorkbook?.();
      if (!source) throw new Error("Select a Workbook first.");
      // Attaching a Workbook must not import unrelated live module editors into
      // the saved Project. The Workbook reference belongs to this exact Project.
      const base = saved;
      const prepared = prepareProjectWorkbook(base, source, crypto.randomUUID());
      const next = upsertMath3DProjectWorkbook(base, prepared.reference);
      const previous = await loadProjectResources(saved);
      const resources = collectResources(next, previous, false, { id: prepared.reference.id, bytes: prepared.bytes });
      setLibrary(await commitProjectResources(next, resources, () => saveLibraryProject(localStorage, next, Date.now())));
      resourceSession.current = resources; resourceSessionId.current = next.identity.id;
      display(next, false);
      if (prepared.adopted) onOpenWorkbook?.(prepared.workbook);
      setMessage(prepared.adopted ? `Added “${prepared.workbook.title}” to this Project. The personal Workbook remains available.` :
        `Saved “${prepared.workbook.title}” in this Project at revision ${prepared.reference.revision}.`);
    } catch (error) { setMessage(`Workbook save failed: ${(error as Error).message}`); }
    finally { setBusy(false); }
  };
  const createSubrectangleWorkbook = async (resultId: string) => {
    if (busy || preview || managed || !project) return;
    setBusy(true);
    try {
      const saved = loadLibraryProject(localStorage, project.identity.id);
      const base = liveProject();
      const result = base.workspace.results.find(item => item.resultId === resultId);
      if (!result) throw new TypeError("Published result is unavailable.");
      const trajectory = isScientificTrajectory(result);
      const equilibrium = isScientificEquilibrium(result);
      const inspection = trajectory || equilibrium ? null : await inspectScientificSubrectangleReport(base,
        createNotebookReference(base, "result", resultId));
      if (trajectory) await verifyScientificTrajectoryReport(base,
        createNotebookReference(base, "result", resultId));
      else if (equilibrium) await verifyScientificEquilibriumReport(base,
        createNotebookReference(base, "result", resultId));
      else if (!subrectangleSourcesCurrent(inspection?.status))
        throw new TypeError("A saved source or profile row changed; report creation is withheld.");
      const workbook = trajectory ? createScientificTrajectoryWorkbook(base, result,
        crypto.randomUUID(), crypto.randomUUID()) : equilibrium ?
        createScientificEquilibriumWorkbook(base, result,
          crypto.randomUUID(), crypto.randomUUID()) :
        createScientificSubrectangleWorkbook(base, result,
          crypto.randomUUID(), crypto.randomUUID());
      const prepared = prepareProjectWorkbook(base, workbook, crypto.randomUUID());
      const next = upsertMath3DProjectWorkbook(base, prepared.reference);
      const previous = await loadProjectResources(saved);
      const resources = collectResources(next, previous, false,
        { id: prepared.reference.id, bytes: prepared.bytes });
      setLibrary(await commitProjectResources(next, resources,
        () => saveLibraryProject(localStorage, next, Date.now())));
      resourceSession.current = resources; resourceSessionId.current = next.identity.id;
      if (inspection) primeScientificSubrectangleReport(next, inspection);
      display(next, false);
      onOpenWorkbook?.(prepared.workbook, "compute", prepared.workbook.stages[1]!.blocks[0]!.id);
      onOpenChange(false);
      setMessage(trajectory ? "Created a verified trajectory solver Workbook report." :
        equilibrium ? "Created a verified equilibrium solver Workbook report." :
        "Created a source-linked Workbook report from verified subrectangle data.");
    } catch (error) { setMessage(`Workbook report failed: ${(error as Error).message}`); }
    finally { setBusy(false); }
  };
  const exportSubrectangleReport = async (resultId: string) => {
    if (!project || busy) return;
    setBusy(true);
    try {
      const current = preview || managed ? project : liveProject();
      const result = await verifyScientificSubrectangleReport(current,
        createNotebookReference(current, "result", resultId));
      const markdown = scientificSubrectangleReportMarkdown(result);
      const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
      const link = document.createElement("a");
      link.href = url; link.download = `scientific-subrectangle-${resultId.replace(/[^a-zA-Z0-9_-]/g, "-")}.report.md`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Verified and exported scientific subrectangle report.");
    } catch (error) { setMessage(`Report export withheld: ${(error as Error).message}`); }
    finally { setBusy(false); }
  };
  const rerunSubrectangleWorkbook = async (workbookId: string, resultId: string,
    progress: (message: string) => void = () => {}) => {
    if (subrectangleRerunPending.current || busy) throw new Error("A Project operation is already running.");
    if (preview || managed || !project) throw new Error("Open the saved Project before rerunning its Workbook.");
    subrectangleRerunPending.current = true;
    setBusy(true);
    try {
      progress("Loading the saved Workbook and Project resources…");
      const saved = loadLibraryProject(localStorage, project.identity.id);
      const base = liveProject();
      const workbookRef = base.workbooks?.find(item => item.id === workbookId);
      if (!workbookRef) throw new Error("The Workbook is no longer in this Project.");
      const previous = await loadProjectResources(saved);
      const bytes = previous.bytes({ kind: "workbook-payload", id: workbookId });
      if (!bytes) throw new Error("The saved Workbook resource is missing.");
      const workbook = readProjectWorkbook(bytes, workbookRef);
      if (!workbook.stages.some(stage => stage.blocks.some(block =>
        block.scientificRegionReport?.kind === SCIENTIFIC_SUBRECTANGLE_REPORT &&
        block.notebookReference?.targetId === resultId)))
        throw new Error("The selected report is no longer in this Workbook.");
      progress("Reverifying the vector source and six saved profile rows…");
      const rerun = await rerunScientificSubrectangleReport(base,
        createNotebookReference(base, "result", resultId));
      progress("Publishing the verified result revision…");
      const reportBlockId = crypto.randomUUID();
      const updated: Workbook = { ...workbook, updatedAt: Date.now(),
        stages: workbook.stages.map(stage => stage.id === "compute" ? { ...stage,
          blocks: [...stage.blocks,
            { id: crypto.randomUUID(), type: "text", title: "Rerun numerical differences",
              text: rerun.differences },
            { id: reportBlockId, type: "reference", title: "Verified subrectangle report · new revision",
              notebookReference: createNotebookReference(rerun.project, "result", rerun.result.resultId),
              scientificRegionReport: { schemaVersion: 1, kind: SCIENTIFIC_SUBRECTANGLE_REPORT,
                previousResultId: rerun.previous.resultId } }] } : stage) };
      const prepared = prepareProjectWorkbook(rerun.project, updated, crypto.randomUUID());
      const next = upsertMath3DProjectWorkbook(rerun.project, prepared.reference);
      const resources = collectResources(next, previous, false,
        { id: prepared.reference.id, bytes: prepared.bytes });
      setLibrary(await commitProjectResources(next, resources,
        () => saveLibraryProject(localStorage, next, Date.now(), undefined,
          { expectedBytes: serializeMath3DProject(saved) })));
      resourceSession.current = resources; resourceSessionId.current = next.identity.id;
      display(next, false);
      onRestoreWorkspace?.(next.workspace, resources, next);
      onOpenWorkbook?.(prepared.workbook, "compute", reportBlockId);
      setMessage(`Published ${rerun.result.resultId}; previous report retained. ${rerun.differences}`);
      return rerun.differences;
    } catch (cause) {
      setMessage(`Workbook rerun blocked: ${(cause as Error).message}`);
      throw cause;
    } finally { subrectangleRerunPending.current = false; setBusy(false); }
  };
  const rerunSubrectangleWorkbookRef = useRef(rerunSubrectangleWorkbook);
  rerunSubrectangleWorkbookRef.current = rerunSubrectangleWorkbook;
  const rerunProjectIdRef = useRef(project?.identity.id);
  rerunProjectIdRef.current = project?.identity.id;
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; resultId: string;
        workbookId: string; requestId: string }>).detail;
      if (!detail) return;
      if (detail.projectId !== rerunProjectIdRef.current) {
        window.dispatchEvent(new CustomEvent("math3d:subrectangle-rerun-complete", {
          detail: { requestId: detail.requestId,
            error: "Open this Workbook's named Project before rerunning it." } }));
        return;
      }
      const progress = (message: string) => window.dispatchEvent(new CustomEvent(
        "math3d:subrectangle-rerun-progress", { detail: {
          requestId: detail.requestId, message } }));
      progress("Project accepted the Workbook rerun request…");
      window.setTimeout(() => {
        void rerunSubrectangleWorkbookRef.current(detail.workbookId,
          detail.resultId, progress).then(message =>
          window.dispatchEvent(new CustomEvent("math3d:subrectangle-rerun-complete", {
            detail: { requestId: detail.requestId, message } }))).catch(cause =>
          window.dispatchEvent(new CustomEvent("math3d:subrectangle-rerun-complete", {
            detail: { requestId: detail.requestId, error: (cause as Error).message } })));
      }, 0);
    };
    window.addEventListener("math3d:subrectangle-rerun", onRequest);
    return () => window.removeEventListener("math3d:subrectangle-rerun", onRequest);
  }, []);
  const addRippleResearchToSavedProject = async (useSavedSnapshot = false) => {
    if (busy || preview || managed || !project) return;
    setBusy(true);
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
      if (!raw) throw new Error("Save this Project first.");
      const saved = parseMath3DProject(raw);
      if (saved.identity.id !== project.identity.id || !library.entries.some(entry => entry.id === saved.identity.id))
        throw new Error("Open and save this Project first.");
      const research = addRippleWaveResearch(useSavedSnapshot ? saved : liveProject());
      if (!research) throw new Error("Ripple Wave Research is already in this Project.");
      const previous = await loadProjectResources(saved);
      const resources = collectResources(research.project, previous, false, research.workbook);
      setLibrary(await commitProjectResources(research.project, resources, () => saveLibraryProject(localStorage,
        research.project, Date.now(), undefined, { expectedBytes: serializeMath3DProject(saved) })));
      resourceSession.current = resources; resourceSessionId.current = research.project.identity.id;
      display(research.project, false);
      setMessage("Added Ripple Wave Research with four exact document citations and two anchored Notes.");
    } catch (error) { setMessage(`Ripple research update failed: ${(error as Error).message}`); }
    finally { setBusy(false); }
  };
  const openProjectWorkbook = async (id: string, besideProject = false, stageId?: WorkbookStageId, blockId?: string) => {
    if (!project || busy) return;
    setBusy(true);
    try {
      const reference = project.workbooks?.find((item) => item.id === id);
      if (!reference) throw new Error("Workbook is not in this Project.");
      const resources = resourceSessionId.current === project.identity.id && resourceSession.current
        ? resourceSession.current : await loadProjectResources(project);
      const bytes = resources.bytes({ kind: "workbook-payload", id });
      if (!bytes) throw new Error("Workbook data is unavailable. Import a Project package with resources.");
      const workbook = readProjectWorkbook(bytes, reference);
      if (besideProject && onViewProjectWorkbook) onViewProjectWorkbook(workbook, stageId, blockId);
      else onOpenWorkbook?.(workbook, stageId, blockId);
      setMessage(`Opened “${workbook.title}” from this Project.`);
      if (besideProject) { setQuick(true); setViewerCompanion(true); setDetailView(true); }
      else onOpenChange(false);
    } catch (error) { setMessage(`Workbook open failed: ${(error as Error).message}`); }
    finally { setBusy(false); }
  };
  const manageSaved = () => {
    if (!project) return;
    try {
      const next = loadLibraryProject(localStorage, project.identity.id);
      display(next, true); setManaged(new ProjectCommandAdapter(next)); setManagedBytes(serializeMath3DProject(next));
      setMessage("Managing saved project. Changes stay in this saved snapshot; Save changes persists them. Undo/redo is available during this session.");
    } catch (error) { setMessage(`Saved project unavailable: ${(error as Error).message}`); }
  };
  const documentAction = (action: ProjectDocumentAction, id: string, documentTitle?: string) => {
    if (!managed) return;
    try {
      const current = updateMath3DProjectMetadata(managed.project(), { ...managed.project().metadata, title: title.trim(), description,
        tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))] });
      const next = action === "duplicate" ? duplicateProjectDocument(current, id, crypto.randomUUID(), verifyMixedWorkspaceReplay(current.workspace)) :
        action === "delete" ? deleteProjectDocument(current, id) : setProjectDocumentMetadata(current, id, action === "rename" ? { title: documentTitle } : { archived: action === "archive" });
      display(managed.commit(next), true, true);
      setMessage(action === "duplicate" ? "Duplicated source with a new identity and snapshot lineage. Analysis was not copied. Save changes to keep it." : "Saved-project change ready. Save changes to keep it.");
    } catch (error) { setMessage(`Project change failed: ${(error as Error).message}`); }
  };
  const history = (direction: "undo" | "redo") => {
    if (!managed) return;
    try { display(managed[direction](), true, true); setMessage(`Project ${direction} applied. Save changes to keep it.`); }
    catch (error) { setMessage(`Project ${direction} failed: ${(error as Error).message}`); }
  };
  const refreshDependency = (relationId: string) => {
    if (!managed || busy) return;
    try {
      display(managed.commit(refreshProjectDependency(managed.project(), relationId)), true, true);
      setMessage("Refreshed companion created. The original document and analysis are retained. Save changes to keep it.");
    } catch (error) { setMessage(`Dependency refresh failed: ${(error as Error).message}`); }
  };
  const recomputeAnalysis = (resultId: string) => {
    if (!managed || busy) return;
    try {
      const next = recomputeProjectAnalysis(managed.project(), resultId);
      display(managed.commit(next), true, true);
      setMessage(`Analysis recomputed with authority ${next.workspace.results.at(-1)!.status}. Historical analysis retained. Save changes to keep it.`);
    } catch (error) { setMessage(`Analysis recomputation failed: ${(error as Error).message}`); }
  };
  const viewSaved = () => {
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY), legacy = raw ? null : localStorage.getItem("math3d.mixed-workspace.v1");
      if (!raw && !legacy) { setMessage("No saved project is available."); return; }
      const next = raw ? parseMath3DProject(raw) : adoptMixedWorkspaceProject(parseMixedWorkspaceDocument(legacy!));
      display(next, true);
      recordView(next.identity.id);
      setMessage(legacy ? "Legacy workspace preview." : "Saved preview. Choose Current workspace to continue editing.");
    } catch (error) { setMessage(`Saved project unavailable: ${(error as Error).message}`); }
  };
  const recordView = (id: string) => {
    try {
      const current = parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY));
      if (current.entries.some((entry) => entry.id === id)) setLibrary(updateLibraryActivity(localStorage, id, { viewedAt: Date.now() }));
    } catch (error) { setLibraryMessage(`Activity unavailable: ${(error as Error).message}`); }
  };
  const viewLibraryProject = (id: string) => {
    try { display(loadLibraryProject(localStorage, id), true); recordView(id); setMessage("Saved preview. Choose Current workspace to continue editing."); }
    catch (error) { setMessage(`Saved project unavailable: ${(error as Error).message}`); }
  };
  const newProject = () => {
    try { display(createMath3DProject(capture(), { stableKey: crypto.randomUUID() }), false); setMessage("New project from the current workspace. Save to add it to the library."); }
    catch (error) { setMessage(`Project unavailable: ${(error as Error).message}`); }
  };
  const chooseThumbnail = async (file: File | undefined) => {
    if (!file || !project) return;
    const id = project.identity.id;
    try {
      if (file.size > MAX_PROJECT_THUMBNAIL_BYTES || !["image/png", "image/jpeg"].includes(file.type)) throw new Error("Choose a PNG or JPEG thumbnail up to 128 KiB.");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Thumbnail could not be read.")); reader.readAsDataURL(file);
      });
      const image = new Image(); image.src = data; await image.decode();
      setThumbnail({ id, data }); setMessage("Thumbnail ready. Save project to keep it.");
      setReplaceThumbnail(false); setThumbnailMessage("Uploaded preview ready. Save project to keep it.");
    } catch (error) { setMessage(`Thumbnail unavailable: ${(error as Error).message}`); }
  };
  const favorite = (id: string, value: boolean) => {
    try { setLibrary(updateLibraryActivity(localStorage, id, { favorite: value })); setLibraryMessage(""); }
    catch (error) { setLibraryMessage(`Favorite unavailable: ${(error as Error).message}`); }
  };
  const transferOptions = (resources = resourceSession.current) => ({ artifactAvailable, resources, tableAvailable: (reference: Parameters<typeof pointTableStore.resolve>[0]) => pointTableStore.resolve(reference) !== null });
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const sequence = ++importSequence.current;
    setIncoming(null);
    setIncomingNarrative(null);
    try {
      if (file.size > MAX_RESEARCH_NARRATIVE_FILE_BYTES) throw new Error("Import exceeds its size limit.");
      const raw = await file.text();
      const header = JSON.parse(raw) as { format?: string };
      const research = header?.format === RESEARCH_NARRATIVE_FORMAT ?
        previewResearchNarrativeImport(raw, transferOptions()) : null;
      const prepared = research?.preview ?? previewProjectImport(raw, transferOptions());
      if (sequence !== importSequence.current) return;
      if (research) {
        assertIndependentNarrativeImport(prepared.project,
          parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY)).entries.map(entry => entry.id),
          localStorage.getItem(projectPayloadKey(prepared.project.identity.id)) !== null ? prepared.project.identity.id : project?.identity.id);
        setIncomingNarrative(research.narrative);
      }
      setIncoming(prepared); setMessage("Project validated. Review compatibility before importing or opening.");
    } catch (error) { if (sequence === importSequence.current) setMessage(`Project import rejected: ${(error as Error).message}`); }
  };
  const exportPortableQuantumProject = async () => {
    if (!project || busy || !window.quantumScenes?.exportPortableProject) return;
    setBusy(true); setQuantumSceneMessage("Verifying quantum sources and packing by hash…");
    try {
      if (!project.quantumScenes?.length) throw new Error("Attach a verified quantum scene first.");
      if (project.scientificScenes?.length) throw new Error("This quantum pack does not include scientific-scene folders.");
      let portable = project;
      for (const reference of project.quantumScenes) portable = relinkMath3DProjectQuantumScene(portable,
        reference.sceneFingerprint, `scenes/${reference.sceneFingerprint}.qscene`);
      const result = await window.quantumScenes.exportPortableProject({ projectJson: exportProjectPackage(portable, collectResources(portable)),
        references: project.quantumScenes.map(item => ({ sceneFingerprint: item.sceneFingerprint, directory: item.directory })) });
      if (!result.ok) { if (!result.canceled) throw new Error(result.error); return; }
      setQuantumSceneMessage(`Portable quantum Project exported: ${result.directory}`);
    } catch (error) { setQuantumSceneMessage(`Portable export refused: ${String((error as Error).message)}`); }
    finally { setBusy(false); }
  };
  const openPortableQuantumProject = async () => {
    if (busy || !window.quantumScenes?.openPortableProject) return;
    setBusy(true); setQuantumSceneMessage("Checking portable quantum Project blobs…");
    try {
      const result = await window.quantumScenes.openPortableProject();
      if (!result.ok) { if (!result.canceled) throw new Error(result.error); return; }
      const packageContent = parseProjectPackage(result.projectJson);
      let restored = packageContent.project;
      if (result.references.length !== restored.quantumScenes?.length) throw new Error("Portable scene inventory disagrees with Project.");
      for (const reference of result.references) restored = relinkMath3DProjectQuantumScene(restored,
        reference.sceneFingerprint, reference.directory);
      const prepared = previewProjectImport(exportProjectPackage(restored, packageContent.resources), transferOptions());
      setIncoming(prepared);
      setQuantumSceneMessage("Portable quantum Project verified. Review compatibility before opening.");
    } catch (error) { setQuantumSceneMessage(`Portable import refused: ${String((error as Error).message)}`); }
    finally { setBusy(false); }
  };
  const stageVerifiedStudy = async (mode: "new" | "attach") => {
    const handoff = studyLaunch;
    if (!handoff || busy || !onVerifyQuantumSceneDocument) return;
    setBusy(true); setQuantumSceneMessage(`Independently re-verifying both declared ${handoff.model} scenes…`);
    try {
      const base = mode === "new"
        ? createMath3DProject(capture(), { stableKey: crypto.randomUUID(), title: handoff.title })
        : !preview && !managed ? projectStateRef.current : null;
      if (!base) throw new Error("Open the intended editable Math3D Project before attaching this study.");
      const expectedProjectId = base.identity.id;
      const expectedProjectBytes = mode === "attach" ? serializeMath3DProject(base) : null;
      const next = await admitVerifiedQwzStudy(base, handoff, onVerifyQuantumSceneDocument);
      if (mode === "attach" && (projectStateRef.current?.identity.id !== expectedProjectId ||
          serializeMath3DProject(projectStateRef.current) !== expectedProjectBytes))
        throw new Error("The intended Project changed during verification.");
      display(next, false);
      setStudyLaunch(null);
      setQuantumSceneMessage(`Both exact ${handoff.model === "qwz" ? "QWZ" : "Hofstadter"} views staged in ${next.metadata.title}. Save Project to retain them.`);
    } catch (error) { setQuantumSceneMessage(`Study attachment refused: ${String((error as Error).message)}`); }
    finally { setBusy(false); }
  };
  const importSamsungExamples = async () => {
    if (busy) return; setBusy(true); setExampleMessage("Validating Samsung project collection…");
    try {
      const { default: raw } = await import("../projects/examples/samsung-projects.json?raw");
      const examples = prepareProjectExampleCollection(raw);
      const progress = await importProjectExamples(localStorage, examples, example => commitProjectResources(example.project, example.resources,
        () => importLibraryProject(localStorage, example.project, Date.now(), { activate: false })),
        progress => setExampleMessage(`Imported ${progress.imported}; kept ${progress.kept} existing; ${progress.remaining} remaining…`));
      refreshLibrary(); setQuery(""); setCollection("Your saved projects"); setModuleFilter("All modules");
      setExampleMessage(progress.error ? `Import stopped: ${progress.error}. Imported ${progress.imported}; kept ${progress.kept} existing; ${progress.remaining} remaining. Retry to continue.` :
        `Imported ${progress.imported} Samsung projects; kept ${progress.kept} existing versions.${progress.previewOnly ? ` ${progress.previewOnly} imported project is available as a compatibility preview.` : ""} Choose Open on a saved project below.`);
    } catch (failure) { setExampleMessage(`Samsung collection import failed: ${(failure as Error).message}`); }
    finally { setBusy(false); }
  };
  const importPreview = async (openWorkspace: boolean, candidate = incoming, reuseExistingResources = false,
    inspectedForThisOpen = false, preferredVectorDocumentId?: string) => {
    if (!candidate || busy) return false;
    setBusy(true);
    const activationToken = ++importSequence.current;
    const inputToken = workspaceInputSequence.current;
    const previousResources = resourceSession.current, previousOwner = loadedProject.current;
    let previous: MixedWorkspaceDocument | null = null, rollbackTables: (() => void) | undefined, hostRestored = false;
    try {
      let phaseStart = performance.now();
      const measurePhase = (name: string) => {
        performance.clearMeasures(`project-open:${name}`);
        performance.measure(`project-open:${name}`, { start: phaseStart, end: performance.now() });
        phaseStart = performance.now();
      };
      const measurePart = (name: string, start: number) => {
        performance.clearMeasures(`project-open:${name}`);
        performance.measure(`project-open:${name}`, { start, end: performance.now() });
      };
      // Immediate Open already inspected these exact bytes in its click handler.
      // File previews still recheck when the user later commits their import.
      const prepared = inspectedForThisOpen ? candidate : inspectProjectCompatibility(candidate.project, transferOptions(candidate.resources));
      if (incomingNarrative && candidate === incoming) assertIndependentNarrativeImport(prepared.project,
        parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY)).entries.map(entry => entry.id),
        localStorage.getItem(projectPayloadKey(prepared.project.identity.id)) !== null ? prepared.project.identity.id : project?.identity.id);
      measurePhase("compatibility");
      if (openWorkspace && (!onRestoreWorkspace || !prepared.canOpenWorkspace)) throw new Error("This project is preview-only on this host.");
      if (openWorkspace) await verifyProjectQuantumSceneDocuments(prepared.project, onVerifyQuantumSceneDocument);
      previous = openWorkspace ? currentCapture.current() : null;
      measurePhase("capture");
      if (openWorkspace) await backupStaging.current;
      const staged = previous && stagedBackup.current?.snapshot === canonicalJsonStringify(previous)
        && stagedBackup.current.inputToken === inputToken && stagedBackup.current.session === previousResources ? stagedBackup.current : null;
      performance.clearMarks("project-open:used-staged-backup");
      performance.mark("project-open:used-staged-backup", { detail: !!staged });
      const backupProject = previous ? staged?.project ?? adoptMixedWorkspaceProject(previous, "Before project open") : null;
      const backup = backupProject ? serializeMath3DProject(backupProject) : undefined;
      measurePhase("backup-document");
      const backupResources = backupProject ? staged?.resources ?? await captureProjectResourcesAsync(backupProject, resourceBytes(previousResources), true) : null;
      measurePhase("backup-resources");
      if (inputToken !== workspaceInputSequence.current || previous && canonicalJsonStringify(currentCapture.current()) !== canonicalJsonStringify(previous)) throw new Error("The workspace changed while preparing its backup. Retry opening the Project.");
      // Preview-only JSON may deliberately lack resources. Preserve that explicit state.
      const resources = candidate.resources ?? await loadProjectResources(prepared.project);
      if (openWorkspace) await verifyProjectQuantumSceneDocuments(prepared.project, onVerifyQuantumSceneDocument);
      if (activationToken !== importSequence.current || inputToken !== workspaceInputSequence.current ||
        previous && canonicalJsonStringify(currentCapture.current()) !== canonicalJsonStringify(previous))
        throw new Error("The workspace changed during source verification. Retry opening the Project.");
      const preferred = preferredVectorDocumentId ? prepared.project.workspace.entries.find(entry =>
        entry.expected.id === preferredVectorDocumentId && entry.module === "vector3d" &&
        !prepared.project.metadata.documents?.[entry.expected.id]?.archived) : null;
      if (preferredVectorDocumentId && !preferred) throw new Error("Saved 3D field is unavailable in this Project.");
      const choice = openWorkspace ? preferred ? { selected: preferred, recovery: null } :
        selectProjectDocument(prepared.project, localStorage.getItem(PROJECT_RESUME_KEY)) : null;
      const rollback = () => { rollbackTables?.(); if (hostRestored && previous && onRestoreWorkspace) onRestoreWorkspace(previous, previousResources, previousOwner ?? undefined); };
      const commitStart = performance.now();
      setLibrary(await commitProjectResources(prepared.project, resources, () => {
        const writeStart = performance.now();
        const saved = importLibraryProject(localStorage, prepared.project, Date.now(), { activate: openWorkspace, backup,
        ...(openWorkspace && previous && onRestoreWorkspace ? { afterWrite: () => {
          const restoreStart = performance.now();
          if (activationToken !== importSequence.current || inputToken !== workspaceInputSequence.current || canonicalJsonStringify(currentCapture.current()) !== canonicalJsonStringify(previous)) throw new Error("Project opening was superseded or the workspace changed. Retry opening the Project.");
          rollbackTables = installPortablePointTables(projectResourceInventory(prepared.project).filter((item) => item.kind === "graph-point-table").flatMap((item) => {
            const bytes = resources.bytes(item);
            return bytes ? [{ id: item.id, content: new TextDecoder().decode(bytes) }] : [];
          }));
          measurePart("pre-restore-check", restoreStart);
          const hostStart = performance.now();
          onRestoreWorkspace(prepared.project.workspace, resources, prepared.project);
          measurePart("host-restore", hostStart);
          hostRestored = true;
          if (choice) onNavigateDocument?.(choice.selected.expected.id, choice.selected.module);
        } } : {}) });
        measurePart("library-write", writeStart);
        return saved;
      }, rollback, backupProject && backupResources ? { project: backupProject, resources: backupResources } : undefined,
      { reuseExistingProject: reuseExistingResources, stagedBackupSlot: staged?.slot }));
      measurePart("resource-commit-total", commitStart);
      measurePhase("commit-and-restore");
      resourceSession.current = resources; resourceSessionId.current = prepared.project.identity.id;
      display(prepared.project, !openWorkspace, false, prepared.resolved);
      setIncoming(null);
      setIncomingNarrative(null);
      if (candidate.inputKind === "Independent starter project") { setHighlightedSavedId(prepared.project.identity.id); setCollection("All projects"); setQuery(""); setModuleFilter("All modules"); }
      if (openWorkspace) {
        stagedBackup.current = null; backupStageSequence.current++;
        const first = { id: choice!.selected.expected.id, module: choice!.selected.module };
        setViewingDocumentId(first.id);
        setHasOpenProject(true);
        setResumeStatus(choice?.recovery ?? null);
        rememberProjectDocument(localStorage, prepared.project, first.id);
        placeProject("left");
        onOpenChange(true);
      }
      setMessage(openWorkspace ? "Opened supported project workspace. Previous workspace saved locally; historical analysis and external refs are retained." : "Imported into the library as a verified saved preview. The current workspace is unchanged.");
      return true;
    } catch (error) { setMessage(`Project import failed: ${(error as Error).message}`); return false; }
    finally { setBusy(false); }
  };
  const openLibraryProject = async (id: string, showDetails = false, preferredVectorDocumentId?: string) => {
    if (busy) return;
    clearJustCreatedScientificSubrectangleReport();
    const sequence = ++importSequence.current;
    setBusy(true);
    try {
      const next = loadLibraryProject(localStorage, id), resources = await loadProjectResources(next);
      if (sequence !== importSequence.current) return;
      const prepared = { ...inspectProjectCompatibility(next, transferOptions(resources)), resources, inputKind: showDetails ? "Saved starter copy" : "Saved project" };
      recordView(id);
      if (!onRestoreWorkspace || !prepared.canOpenWorkspace) {
        display(next, true); setIncoming(prepared);
        setMessage("This saved project has preview support. Review its compatibility details below.");
        return;
      }
      await importPreview(true, prepared, canReuseProjectResourceArchive(next, resources), true,
        preferredVectorDocumentId);
    } catch (error) { setMessage(`Saved project unavailable: ${(error as Error).message}`); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (hasOpenProject && project && !preview && !managed && activeProjectDocumentId)
      rememberProjectDocument(localStorage, project, activeProjectDocumentId);
  }, [hasOpenProject, project, preview, managed, activeProjectDocumentId]);
  useEffect(() => {
    const show = (event: Event) => { if (hasOpenProject) {
      const placement = (event as CustomEvent).detail;
      if (["left", "middle", "right", "all"].includes(placement)) {
        setProjectPlacement(placement);
        setPreferences(previous => { const next = { ...previous, placement }; rememberProjectUi(localStorage, next); return next; });
      }
      setQuick(true); setViewerCompanion(true); setDetailView(true); onOpenChange(true);
    } };
    const hide = (event: Event) => { if (viewerCompanion && (event as CustomEvent).detail === projectPlacement) onOpenChange(false); };
    window.addEventListener("math3d:open-project-dock", show); window.addEventListener("math3d:hide-project-dock", hide);
    return () => { window.removeEventListener("math3d:open-project-dock", show); window.removeEventListener("math3d:hide-project-dock", hide); };
  }, [hasOpenProject, viewerCompanion, projectPlacement, onOpenChange]);
  useEffect(() => {
    const showFullDetails = () => { if (!hasOpenProject) return; setDetailPage("overview"); setQuick(false); setViewerCompanion(false); setDetailView(true); onOpenChange(true); };
    window.addEventListener("math3d:project-full-details", showFullDetails);
    return () => window.removeEventListener("math3d:project-full-details", showFullDetails);
  }, [hasOpenProject, onOpenChange]);
  const previewSavedOpen = async () => {
    if (!project || busy) return;
    const sequence = ++importSequence.current;
    try {
      const next = loadLibraryProject(localStorage, project.identity.id), resources = await loadProjectResources(next);
      if (sequence !== importSequence.current) return;
      setIncoming({ ...inspectProjectCompatibility(next, transferOptions(resources)), resources, inputKind: "Saved project" });
      setMessage("Review editor compatibility before opening this saved project.");
    } catch (error) { setMessage(`Saved project unavailable: ${(error as Error).message}`); }
  };
  const previewTemplate = async (id: ProjectStarterId, curated = false) => {
    if (busy) return;
    const sequence = ++importSequence.current;
    try {
      const available = parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY));
      const copy = findProjectStarterCopy(curated ? { ...available, entries: available.entries.filter(entry => entry.tags.includes("curated-study-v1")) } :
        available, id, readActiveProjectId());
      if (copy) {
        const next = loadLibraryProject(localStorage, copy.id), resources = await loadProjectResources(next);
        if (sequence !== importSequence.current) return;
        if (curated) setGalleryAssetBytes(current => ({ ...current,
          [id]: measureCuratedStudyAssets(next, resources).totalBytes }));
        setIncoming({ ...inspectProjectCompatibility(next, transferOptions(resources)), resources, inputKind: "Saved starter copy" });
        setMessage(`Previewing your saved copy “${next.metadata.title}”. Opening or saving this preview keeps the same project.`);
        return;
      }
      const token = crypto.randomUUID(), bundle = id === "catenoid-evidence" ? await takePreparedNotebookStarter(id) :
        NOTEBOOK_STARTERS.some(item => item.id === id) ? instantiateNotebookStarter(id as NotebookStarterId, token) : { project: instantiateMath3DProjectTemplate(id, token), resources: undefined };
      if (sequence !== importSequence.current) return;
      const prepared = curated ? prepareCuratedStudyBundle(bundle, id, token) : bundle;
      const next = prepared.project;
      if (curated) setGalleryAssetBytes(current => ({ ...current,
        [id]: measureCuratedStudyAssets(next, prepared.resources).totalBytes }));
      const inspection = !curated && "inspection" in bundle ? bundle.inspection as ProjectCompatibility : inspectProjectCompatibility(next, transferOptions(prepared.resources));
      setIncoming({ ...inspection, resources: prepared.resources, inputKind: "Independent starter project" });
      setMessage("Starter preview ready. Current work is unchanged until you choose to open it.");
    } catch (error) { if (sequence === importSequence.current) { setIncoming(null); setMessage(`Starter unavailable: ${(error as Error).message}`); } }
  };
  const openTemplate = async (id: ProjectStarterId, newCopy = false, curated = false) => {
    if (busy || openingStarter.current) return;
    openingStarter.current = true;
    const sequence = ++importSequence.current;
    try {
      if (!newCopy) {
        const activeId = readActiveProjectId(), available = parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY));
        const copy = findProjectStarterCopy(curated ? { ...available, entries: available.entries.filter(entry => entry.tags.includes("curated-study-v1")) } :
          available, id, activeId);
        if (copy) {
          loadLibraryProject(localStorage, copy.id);
          if (hasOpenProject && copy.id === activeId && !preview && !managed && project?.identity.id === copy.id) {
            const first = (["geometry", "surface", "mesh", "volume", "curve", "graph2d"] as const)
              .map(module => project.workspace.entries.find(entry => entry.module === module)).find(Boolean) ?? project.workspace.entries[0];
            if (first) { onNavigateDocument?.(first.expected.id, first.module); setViewingDocumentId(first.expected.id); }
            placeProject("left"); onOpenChange(true); // Keep the active edited Project; do not restore an older saved snapshot.
          } else await openLibraryProject(copy.id, true);
          return;
        }
      }
      const starterStart = performance.now();
      if (id === "catenoid-evidence") setMessage("Preparing the Catenoid source and saved Mesh…");
      const token = crypto.randomUUID(), bundle = id === "catenoid-evidence" ? await takePreparedNotebookStarter(id) :
        NOTEBOOK_STARTERS.some(item => item.id === id) ? instantiateNotebookStarter(id as NotebookStarterId, token) : { project: instantiateMath3DProjectTemplate(id, token), resources: undefined };
      if (sequence !== importSequence.current) return;
      performance.clearMeasures("project-open:starter-construction");
      performance.measure("project-open:starter-construction", { start: starterStart, end: performance.now() });
      const prepared = curated ? prepareCuratedStudyBundle(bundle, id, token) : bundle;
      const next = prepared.project;
      if (curated) setGalleryAssetBytes(current => ({ ...current,
        [id]: measureCuratedStudyAssets(next, prepared.resources).totalBytes }));
      const inspectionStart = performance.now();
      const inspection = !curated && "inspection" in bundle ? bundle.inspection as ProjectCompatibility : inspectProjectCompatibility(next, transferOptions(prepared.resources));
      const candidate = { ...inspection, resources: prepared.resources, inputKind: "Independent starter project" };
      performance.clearMeasures("project-open:starter-inspection");
      performance.measure("project-open:starter-inspection", { start: inspectionStart, end: performance.now() });
      await importPreview(true, candidate, false, true);
    } catch (error) { setMessage(`Starter unavailable: ${(error as Error).message}`); }
    finally { openingStarter.current = false; }
  };
  const exportFile = async (checkpointOnly = false, withResources = false) => {
    if (!project) return;
    try {
      let next = managed?.project() ?? (preview ? project : liveProject());
      if (!preview || managed) next = updateMath3DProjectMetadata(next, { ...next.metadata, title: title.trim(), description, tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))] });
      const storedResources = withResources && (preview || managed || resourceSessionId.current !== next.identity.id) ? await loadProjectResources(localStorage.getItem(`math3d.project.v1.payload.${next.identity.id}`) ? loadLibraryProject(localStorage, next.identity.id) : project) : resourceSession.current;
      const bytes = withResources ? exportProjectPackage(next, collectResources(next, storedResources)) : checkpointOnly ? exportProjectCheckpointFile(next) : exportProjectFile(next);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/json" })), link = document.createElement("a");
      link.href = url; link.download = `${next.metadata.title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "Project"}${withResources ? ".resources" : checkpointOnly ? ".checkpoint" : ""}.math3d.project.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage(withResources ? "Exported project with verified source resources and undo/redo buffers. Optional analysis caches and thumbnails remain local." : checkpointOnly ? "Exported verified document checkpoints. Scientific identities and records are retained; undo history is not transferred. Mobile editing supports one Graph with Curve/Surface companions; sidecars transfer separately." : "Exported verified project JSON with original identities and replay. Sidecar bytes and thumbnails transfer separately.");
    } catch (error) { setMessage(`Project export failed: ${(error as Error).message}`); }
  };
  const navigate = (id: string, module: KernelWorkspaceModule) => {
    if (!preview && canNavigateDocument?.(id, module)) { onNavigateDocument?.(id, module); onOpenChange(false); }
  };
  const viewBesideProject = (id: string, module: KernelWorkspaceModule) => {
    if (preview || !canNavigateDocument?.(id, module)) return;
    onNavigateDocument?.(id, module);
    setViewingDocumentId(id);
    setNotesOpen(false);
    setDetailView(true);
    setViewerCompanion(true);
    setQuick(true);
  };
  const meshGeometryAvailability = (id: string) => {
    const entry = project?.workspace.entries.find(item => item.expected.id === id);
    if (!project || entry?.module !== "mesh" || entry.checkpoint.format !== "math3d.mesh-document")
      return { available: false, reason: "The Mesh source is unavailable." };
    const resourceId = entry.checkpoint.source.resource.id;
    const requirement = projectResourceInventory(project).find(item => item.kind === "mesh-buffers" &&
      item.id === resourceId);
    return { available: !!(requirement && resourceBytes()(requirement)),
      reason: "The verified Mesh source buffers are unavailable on this host." };
  };
  const openInDestination = async (choice: ProjectOpenInAction) => {
    if (busy || preview || managed || !project || !onRestoreWorkspace) return;
    try {
      const current = liveProject();
      if (choice.id === "vector3d.open-profile-graph") {
        if (!choice.enabled || !choice.targetDocumentId ||
            !canNavigateDocument?.(choice.targetDocumentId, "graph2d"))
          throw new TypeError("The saved Graph profile is unavailable on this host.");
        const linked = linkProjectFieldProfileGraph(current, choice);
        const resources = collectResources(linked.project);
        if (!linked.existing) onRestoreWorkspace(linked.project.workspace, resources, linked.project);
        resourceSession.current = resources; resourceSessionId.current = linked.project.identity.id;
        display(linked.project, false);
        setViewingDocumentId(linked.targetDocumentId);
        setViewerCompanion(true); setQuick(true); setDetailView(true);
        onNavigateDocument?.(linked.targetDocumentId, "graph2d");
        setMessage(linked.existing ? "Opened the existing exact Field profile Graph." :
          "Linked the saved Field profile Graph. Save the Project to retain its return path.");
        return;
      }
      if (choice.id === "mesh.promote-geometry") {
        const entry = current.workspace.entries.find(item => item.expected.id === choice.source.documentId);
        const resourceId = entry?.checkpoint.format === "math3d.mesh-document" ?
          entry.checkpoint.source.resource.id : null;
        const requirement = entry?.checkpoint.format === "math3d.mesh-document" ?
          projectResourceInventory(current).find(item => item.kind === "mesh-buffers" &&
            item.id === resourceId) : null;
        const bytes = requirement ? resourceBytes()(requirement) : null;
        if (!choice.enabled || !bytes) throw new TypeError("The verified Mesh source buffers are unavailable.");
        const made = deriveProjectMeshGeometry(current, choice.source, bytes);
        const resources = captureProjectResources(made.project, resourceBytes());
        if (!made.existing) onRestoreWorkspace(made.project.workspace, resources, made.project);
        resourceSession.current = resources; resourceSessionId.current = made.project.identity.id;
        display(made.project, false);
        setViewingDocumentId(made.targetDocumentId);
        setViewerCompanion(true); setQuick(true); setDetailView(true);
        onNavigateDocument?.(made.targetDocumentId, "geometry");
        setMessage(made.existing ? "Opened the existing exact Mesh Geometry copy." :
          "Created a source-linked Mesh Geometry copy. Save the Project to retain it.");
        return;
      }
      if (choice.id === "quantum.promote-graph2d" || choice.id === "quantum.promote-curve") {
        const entry = current.workspace.entries.find(item => item.expected.id === choice.source.documentId);
        const scene = entry?.checkpoint.format === "math3d.quantum-scene-document" ? entry.checkpoint : null;
        const reference = scene ? current.quantumScenes?.find(item =>
          item.sceneFingerprint === scene.source.sceneFingerprint) : null;
        if (!choice.enabled || !reference || !entry ||
          !matchesScientificSourceGeneration(viewerSourceFromDocument(entry.checkpoint), choice.source))
          throw new TypeError("The Quantum source changed or its verified scene link is unavailable.");
        const target = choice.id === "quantum.promote-graph2d" ? "graph2d" : "curve";
        const targetId = await promoteQuantumScene(reference, target, choice.source);
        setMessage(targetId ? `Created a source-linked Quantum ${target === "curve" ? "Curve" : "Graph"}. Save the Project to retain it.` :
          "Open in refused. See the Quantum scene status for details.");
        return;
      }
      if (choice.id === "surface.tessellate-saved") {
        const entry = current.workspace.entries.find(item => item.expected.id === choice.source.documentId);
        if (!choice.enabled || entry?.checkpoint.format !== "math3d.surface-document" ||
          !matchesScientificSourceGeneration(viewerSourceFromDocument(entry.checkpoint), choice.source))
          throw new TypeError("The Surface source changed; review Open in destinations again.");
        const analysis = analyses.get(entry.expected.id);
        if (analysis?.route !== "surface" && analysis?.route !== "surface-mesh")
          throw new TypeError(analysis?.reason ?? "The saved Surface sampler is unavailable.");
        const made = createSavedSurfaceMesh(current.workspace, entry.checkpoint,
          { documents: verifyMixedWorkspaceReplay(current.workspace), resources: resourceSession.current });
        const next = replaceMath3DProjectWorkspace(current, made.workspace);
        const mesh = made.adapter.document();
        const bytes = made.adapter.resources.bytes(mesh.source.resource);
        if (!bytes) throw new TypeError("The sampled Mesh source buffers are unavailable.");
        const resources = captureProjectResources(next, item => item.kind === "mesh-buffers" &&
          item.id === mesh.source.resource.id ? bytes : resourceBytes()(item));
        if (!made.existing) onRestoreWorkspace(next.workspace, resources, next);
        resourceSession.current = resources; resourceSessionId.current = next.identity.id;
        display(next, false);
        setViewingDocumentId(mesh.identity.id);
        setViewerCompanion(true); setQuick(true); setDetailView(true);
        onNavigateDocument?.(mesh.identity.id, "mesh");
        setMessage(made.existing ? "Opened the existing exact sampled Mesh." :
          "Created a source-linked sampled Mesh. Save the Project to retain it.");
        return;
      }
      const result = deriveProjectOpenIn(current, choice);
      if (!result.existing) onRestoreWorkspace(result.project.workspace, resourceSession.current, result.project);
      display(result.project, false);
      setViewingDocumentId(result.targetDocumentId);
      setViewerCompanion(true); setQuick(true); setDetailView(true);
      onNavigateDocument?.(result.targetDocumentId, result.targetModule);
      setMessage(result.existing ? "Opened the existing exact companion." :
        "Created a source-linked companion. Save the Project to retain it.");
    } catch (error) { setMessage(`Open in refused: ${(error as Error).message}`); }
  };
  const openSavedAlgebraDestination = (target: { objectId: StableDocumentId; revision: number },
    choice: ProjectSavedAlgebraOpenInAction) => {
    if (busy || preview || managed || !project) return;
    try {
      const documentId = resolveProjectSavedAlgebraOpenIn(liveProject(), target, choice);
      if (!onNavigateDocument || !canNavigateDocument?.(documentId, "geometry"))
        throw new TypeError("The saved locus Geometry is unavailable in this workspace.");
      navigate(documentId, "geometry");
    } catch (error) { setMessage(`Open in refused: ${(error as Error).message}`); }
  };
  const prepareAlgebraInCas = (target: AlgebraObjectRef, choice: ProjectAlgebraCasHandoff) => {
    if (busy || preview || managed || !project) return;
    try {
      const current = liveProject();
      const checked = resolveProjectAlgebraCasHandoff(current, target, choice);
      if (!onOpenAlgebra) throw new TypeError("CAS navigation is unavailable on this host.");
      onOpenAlgebra(current.identity.id, checked, choice.source.contentHash);
      onOpenChange(false);
    } catch (error) { setMessage(`Open in refused: ${(error as Error).message}`); }
  };
  const returnToAlgebraInCas = (choice: ProjectAlgebraLocusReturn) => {
    if (busy || preview || managed || !project) return;
    try {
      const source = resolveProjectAlgebraLocusReturn(liveProject(), choice);
      if (!onOpenAlgebra) throw new TypeError("CAS navigation is unavailable on this host.");
      onOpenAlgebra(source.projectId, source.target, source.contentHash, choice);
      onOpenChange(false);
    } catch (error) { setMessage(`Return to CAS refused: ${(error as Error).message}`); }
  };
  const returnContourToAlgebraInCas = (curveId: string) => {
    if (preview || managed || !project) return;
    try {
      const current = liveProject();
      const entry = current.workspace.entries.find(item => item.expected.id === curveId);
      if (entry?.checkpoint.format !== "math3d.curve-document")
        throw new TypeError("The saved contour Curve is unavailable.");
      const choice = resolveProjectAlgebraLocusCurveAlgebraReturn(current, entry.checkpoint);
      const source = resolveProjectAlgebraLocusReturn(current, choice);
      if (!onOpenAlgebra) throw new TypeError("CAS navigation is unavailable on this host.");
      onOpenAlgebra(source.projectId, source.target, source.contentHash, choice);
      onOpenChange(false);
    } catch (error) { setMessage(`Return to CAS refused: ${(error as Error).message}`); }
  };
  const viewerDocuments = explorer?.groups.flatMap(group => group.documents).filter(document => !document.archived && canNavigateDocument?.(document.id, document.module)) ?? [];
  const dashboardDocuments = explorer?.groups.flatMap(group => group.documents).filter(document => !document.archived) ?? [];
  const savedProjectEntry = project ? library.entries.find(entry => entry.id === project.identity.id) : undefined;
  const projectNotesView = open && notesOpen && notesPlacement === "project";
  const placeProject = (placement: ProjectPlacement) => {
    setProjectPlacement(placement);
    const next = { ...preferences, placement }; setPreferences(next); rememberProjectUi(localStorage, next);
    setDetailView(true);
    setViewerCompanion(true);
    setQuick(true);
    window.dispatchEvent(new CustomEvent("math3d:project-dock-visible", { detail: placement }));
  };
  const stageStudy = (change: (source: Math3DProject) => Math3DProject, success: string) => {
    if (!project || busy || preview || managed) return;
    try { setProject(change(project)); setMessage(`${success} Save Project to keep it.`); }
    catch (error) { setMessage(`Study change refused: ${(error as Error).message}`); }
  };
  const stageQwzQuadStudy = async (quantumStudyId: string) => {
    const source = projectStateRef.current;
    if (!source || busy || preview || managed) return;
    const pair = qualifyProjectQwzPair(source, quantumStudyId);
    if (!pair || !onVerifyQuantumSceneDocument) {
      setMessage("QWZ Study refused: exact desktop source verification is unavailable."); return;
    }
    const before = serializeMath3DProject(source);
    setBusy(true);
    try {
      for (const document of [pair.curvature, pair.bands]) {
        const reference = source.quantumScenes?.find(item => item.sceneFingerprint === document.source.sceneFingerprint);
        if (!reference) throw new TypeError("QWZ scene reference is missing.");
        const verified = await onVerifyQuantumSceneDocument(reference);
        if (canonicalJsonStringify(verified.source) !== canonicalJsonStringify(document.source) ||
            verified.location.directory !== document.location.directory)
          throw new TypeError("QWZ source changed since this Project was saved.");
      }
      if (!projectStateRef.current || serializeMath3DProject(projectStateRef.current) !== before)
        throw new TypeError("Project changed during QWZ source verification.");
      const next = createProjectQwzQuadStudy(source, quantumStudyId, crypto.randomUUID(),
        `${source.workspace.quantumStudies?.find(item => item.id === quantumStudyId)?.title ?? "QWZ"} four-view Study`);
      setProject(next); setMessage("Four-view QWZ Study staged. Save Project to keep it.");
    } catch (error) { setMessage(`QWZ Study refused: ${(error as Error).message}`); }
    finally { setBusy(false); }
  };
  const renderNotesPanel = (layout: "floating" | "page") => <ProjectNotesPanel layout={layout} project={notesProject} workspace={notesWorkspace} readResource={comparisonResource} drafts={noteDrafts} busy={busy} message={notesMessage} focusNoteId={selectedNoteId ?? noteRequest?.id}
    selectionAvailable={Boolean(captureNoteSelection?.())} workbooks={noteWorkbooks}
    onClose={() => setNotesOpen(false)} onOpenProjects={() => { setNotesOpen(false); if (layout === "floating") { setDetailView(true); onOpenChange(true); } }} onRefresh={refreshNotes}
    onCapture={captureNote} onCaptureResult={captureResultNote} onCaptureWorkbookBlock={captureWorkbookBlockNote} onOpenTarget={openNoteTarget}
    onUpdateDraft={(id, patch) => setNoteDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft))}
    onDiscardDraft={(id) => setNoteDrafts((current) => current.filter((draft) => draft.id !== id))}
    onSaveDrafts={saveNoteDrafts} onSaveNote={saveEditedNote} onChangeValues={changeNoteValues} onSendToWorkbook={sendNoteToWorkbook} />;
  const fullDetails = !quick && detailView;
  useEffect(() => {
    if (!hasOpenProject || busy || preview || managed || !project?.metadata.tags?.includes("ripple-wave-study") ||
      project.workbooks?.some(item => item.title === "Ripple Wave Research") ||
      !library.entries.some(entry => entry.id === project.identity.id) || rippleResearchAttempted.current.has(project.identity.id)) return;
    rippleResearchAttempted.current.add(project.identity.id);
    void addRippleResearchToSavedProject(true);
  }, [hasOpenProject, busy, preview, managed, project, library]);
  return <div style={{ position: "fixed", right: 14, top: 90, zIndex: 2501, fontSize: 13 }}>
    <button type="button" data-testid="notes-toggle" aria-label="Open Notes" aria-expanded={notesOpen} onClick={() => {
      if (notesOpen) { setNotesOpen(false); return; }
      setSelectedNoteId(null);
      setNotesPlacement("floating"); onOpenChange(false); refreshNotes(); setNotesOpen(true);
    }} style={{ position: "fixed", right: 14, bottom: 60, zIndex: 2502, border: "1px solid #64748b", borderRadius: 8, padding: "7px 10px", background: "#f8fafc", color: "#0f172a", fontWeight: 700 }}>Notes{noteDrafts.length ? ` (${noteDrafts.length})` : ""}</button>
    {notesOpen && notesPlacement === "floating" && renderNotesPanel("floating")}
    {resumeStatus && <p role="status" data-testid="project-resume-status" style={{ position: "fixed", bottom: 10, left: 14, maxWidth: 340, pointerEvents: "none", background: "#fff", padding: 10 }}>{resumeStatus}</p>}
    {hasOpenProject && createPortal(<button type="button" data-testid="projects-quick-toggle" data-active-project={hasOpenProject} aria-label={hasOpenProject ? "Project" : "Open quick Projects"}
      aria-expanded={open} aria-controls="project-explorer-panel" aria-pressed={hasOpenProject && open && viewerCompanion}
      onClick={() => {
        if (hasOpenProject && open && document.getElementById("project-explorer-panel")?.getClientRects().length) { onOpenChange(false); return; }
        setNotesOpen(false);
        if (hasOpenProject) {
          placeProject(projectPlacement);
        } else setQuick(true);
        onOpenChange(true);
      }} className="project-context-toggle">{hasOpenProject ? "Project" : "Quick projects"}</button>, document.body)}
    {open && <ProjectGalleryFrame quick={quick} viewerCompanion={viewerCompanion} placement={projectPlacement} onClose={() => onOpenChange(false)}>
      <header data-testid="project-explorer-header" className={`project-gallery-header${viewerCompanion && quick ? " project-companion-header" : ""}`}>
        <div className="project-gallery-heading"><div><p>{viewerCompanion && quick ? "PROJECT" : "MATH3D · PROJECTS"}</p><h2>{quick && !viewerCompanion ? "Quick Projects" : detailView ? project?.metadata.title ?? "Project" : "Projects Gallery"}</h2></div><div className="project-gallery-heading-actions" style={{ display:"flex",gap:8 }}>
          {fullDetails ? <>
            {!preview && viewingDocumentId && <button type="button" data-testid="project-viewer-return" onClick={() => { setViewerCompanion(true); setQuick(true); }}>Open current document</button>}
            <button type="button" data-testid="project-detail-toggle" aria-pressed={detailView} onClick={() => { setNotesOpen(false); workspacePanel.current?.scrollTo({ top: 0 }); setDetailView(false); }}>Browse projects</button>
            <details className="project-header-more"><summary>More</summary><div>
              <button type="button" onClick={() => openDetailPage("settings", detailsSection)}>Project settings</button>
              <button type="button" onClick={() => openDetailPage("documents", contentsSection)}>All contents</button>
              <button type="button" onClick={() => openDetailPage("transfer", transferSection)}>Import / export</button>
            </div></details>
          </> : <>
            {!quick && <button type="button" data-testid="project-detail-toggle" aria-pressed={detailView} onClick={() => { setNotesOpen(false); workspacePanel.current?.scrollTo({ top: 0 }); setDetailView(value => !value); }}>{detailView ? "Browse projects" : "View current project"}</button>}
            <button data-testid="project-gallery-layout-toggle" aria-label={viewerCompanion && quick ? "Project details" : undefined} title={viewerCompanion && quick ? "Project details" : undefined} onClick={() => { if (!viewerCompanion) setNotesOpen(false); if (viewerCompanion) setDetailPage("overview"); setQuick(value => !value); setViewerCompanion(false); }}>{quick ? viewerCompanion ? "⋯" : "Full gallery" : "Quick panel"}</button>
          </>}
          <button type="button" aria-label="Close project explorer" title="Close Project panel" onClick={() => onOpenChange(false)}>{(viewerCompanion && quick) || fullDetails ? "×" : "Close"}</button></div></div>
        <div className="project-gallery-statusline"><p data-testid="project-view-mode" role="status">{managed ? "Managing saved project" : preview ? "Saved project preview" : "Current workspace"}{!fullDetails && ` · ${project?.metadata.title ?? "Untitled project"}`}{project && library.entries.some((entry) => entry.id === project.identity.id) && <strong className="project-gallery-saved-badge">Saved in Your saved projects</strong>}</p>
          {!fullDetails && <button type="button" data-testid="project-restore-saved" disabled={busy || !!managed || !project || !library.entries.some((entry) => entry.id === project.identity.id)} onClick={previewSavedOpen}>{preview ? "Open saved project" : "Review saved version"}</button>}</div>
      {hasOpenProject && !preview && viewingDocumentId && !fullDetails && <nav className="project-context-breadcrumb" data-testid="project-breadcrumb" aria-label="Project breadcrumb">
        {!viewerCompanion && <><button type="button" data-testid="project-breadcrumb-root" onClick={() => { setQuick(true); setViewerCompanion(true); onViewProjectDetail?.(); }}>{project?.metadata.title ?? "Project"}</button><span aria-hidden="true">›</span></>}
        <span className="project-breadcrumb-module">{project?.workspace.entries.find(entry => entry.expected.id === viewingDocumentId)?.module ?? activeModule ?? "Document"}</span>
        <span aria-hidden="true">/</span><strong title={documentTitles.get(viewingDocumentId) ?? viewingDocumentId}>{documentTitles.get(viewingDocumentId) ?? viewingDocumentId}</strong>
        {activeEvidence?.source.documentId === viewingDocumentId && activeEvidence.operation && <><span aria-hidden="true">›</span><span title={`Evidence ${activeEvidence.status}`}>{activeEvidence.operation} · {activeEvidence.status}</span></>}
        {activeEvidence?.source.documentId === viewingDocumentId && !!activeEvidence.selectedEntityIds.length && <><span aria-hidden="true">›</span><span>{activeEvidence.selectedEntityIds[0]}{activeEvidence.selectedEntityIds.length > 1 ? ` +${activeEvidence.selectedEntityIds.length - 1}` : ""}</span></>}
      </nav>}
      {preview && !managed && <p data-testid="project-open-guidance" style={{ marginBottom: 0 }}>Open saved project, then choose Open project in the compatibility preview to enable document buttons.</p>}
      {hasOpenProject && projectNavigation && !fullDetails && <div className="project-history-controls" aria-label="Project navigation"><button data-testid="project-navigation-back" aria-label="Back" title="Back" disabled={!projectNavigation.canBack} onClick={projectNavigation.back}>{viewerCompanion && quick ? "‹" : "Back"}</button><button data-testid="project-navigation-forward" aria-label="Forward" title="Forward" disabled={!projectNavigation.canForward} onClick={projectNavigation.forward}>{viewerCompanion && quick ? "›" : "Forward"}</button></div>}
      {hasOpenProject && !preview && !managed && detailView && !fullDetails && <div className="project-placement-controls" role="group" aria-label="Project placement">
        {viewerCompanion && quick && <span className="project-placement-label">Layout</span>}
        {(["left", "middle", "right", "all"] as const).map(placement => <button key={placement} type="button" data-testid={`project-placement-${placement}`}
          aria-pressed={viewerCompanion && quick && projectPlacement === placement} onClick={() => placeProject(placement)}>{placement[0].toUpperCase() + placement.slice(1)}</button>)}
      </div>}
      </header>
      <div className={`project-gallery-layout${detailView && (!quick || viewerCompanion) ? " project-gallery-layout-detail" : ""}`} data-detail-page={fullDetails ? detailPage : undefined}>
<section data-testid="project-library" className="project-gallery-library">
        <div className="project-gallery-browse-controls">
          <div className="project-gallery-filters" aria-label="Project collection">{["All projects", "Starter projects", "Your saved projects", "Favorites"].map(value => <button type="button" key={value} aria-pressed={collection === value} onClick={() => setCollection(value)}>{value}</button>)}</div>
          <div className="project-gallery-search-row"><label>Search projects<input data-testid="project-library-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search names, topics or tags" /></label>
            <label>Module<select data-testid="project-library-module" value={moduleFilter} onChange={event => setModuleFilter(event.target.value)}>{["All modules", "Graph", "3D vector field", "Curve", "Surface", "Mesh", "Volume", "Geometry", "Topology", "Complex", "Quantum scene", "Algebra", "Workbook", "Notes", "Analysis"].map(value => <option key={value}>{value}</option>)}</select></label>
            {(query || moduleFilter !== "All modules") && <button type="button" onClick={() => { setQuery(""); setModuleFilter("All modules"); }}>Clear filters</button>}
          </div>
        </div>
        {(collection === "All projects" || collection === "Starter projects") && <ProjectTemplatesPanel query={query} moduleFilter={moduleFilter} copies={starterCopies} guidedCopies={guidedCopies} host={galleryHost} assetBytes={galleryAssetBytes} onPreview={id => { void previewTemplate(id); }} onOpen={(id) => { void openTemplate(id); }} onNewCopy={id => { void openTemplate(id, true); }}
          onPreviewCurated={id => { void previewTemplate(id, true); }} onOpenCurated={id => { void openTemplate(id, false, true); }}
          onNewCuratedCopy={id => { void openTemplate(id, true, true); }}
          onImportQuantumScene={onImportQuantumScene} quantumImportAvailable={!!window.quantumScenes?.open}
          onOpenCasGallery={onOpenCasGallery} busy={busy} />}
        {collection !== "Starter projects" && <>
        <h3>Your saved projects ({library.entries.length})</h3><p>Favorites first, then recent. Open a project or preview its documents and compatibility.</p>
        {libraryMessage && <p role="status" data-testid="project-library-message">{libraryMessage}</p>}
        {!library.entries.length && !libraryMessage && <p>No saved projects yet. Save the current workspace or import the included Samsung collection.</p>}
        {!!library.entries.length && !filteredProjects.length && <p>No projects match this search or collection.</p>}
        <div className="project-gallery-grid" data-testid="project-gallery-grid">{filteredProjects.map(entry => {
          const src = readProjectThumbnail(localStorage, entry), summary = summaries.get(entry.id) ?? { description: "Loading project details…", documents: 0, results: 0, modules: [] };
          const starter = [...MATH3D_PROJECT_TEMPLATES, ...NOTEBOOK_STARTERS].find((item) => entry.tags.includes(item.id) || entry.title === item.title);
          return <article id={`project-library-${entry.id}`} tabIndex={-1} className={`project-gallery-card${highlightedSavedId === entry.id ? " is-new" : ""}`} key={entry.id} data-testid={`project-library-${entry.id}`}>
            {src || !starter ? <ProjectThumbnail key={src ?? "missing"} src={src} modules={summary.modules} />
              : <div className="project-starter-art"><StarterArtwork id={starter.id} /></div>}
            <div className="project-gallery-card-content"><h4>{entry.title}</h4><p>{summary.description || `${summary.documents} document(s) · ${summary.results} saved result(s)`}</p>
              <div className="project-starter-modules">{summary.modules.map(module => <span key={module}>{module}</span>)}</div>
              <span className="project-gallery-card-tags">{entry.tags.join(" · ")}</span>
              <div className="project-gallery-card-actions"><button type="button" data-testid={`project-open-saved-${entry.id}`} aria-label={`Open ${entry.title}`} disabled={busy} onClick={() => { void openLibraryProject(entry.id); }}>Open</button>
              <button type="button" data-testid={`project-preview-${entry.id}`} disabled={busy} aria-label={`Preview ${entry.title}`} onClick={() => { viewLibraryProject(entry.id); }}>Preview</button>
              <button type="button" data-testid={`project-details-${entry.id}`} disabled={busy} aria-label={`View ${entry.title} details`} onClick={() => { viewLibraryProject(entry.id); setDetailView(true); }}>Details</button>
              <button type="button" aria-label={`Favorite ${entry.title}`} aria-pressed={entry.favorite} onClick={() => favorite(entry.id, !entry.favorite)}>{entry.favorite ? "★" : "☆"}</button></div>
              <small className="project-gallery-card-time">Saved {new Date(entry.savedAt).toLocaleDateString()}{entry.viewedAt > 0 ? ` · Viewed ${new Date(entry.viewedAt).toLocaleDateString()}` : ""}</small>
            </div>
          </article>;
        })}</div></>}
      </section>

      <aside ref={workspacePanel} className="project-gallery-workspace" aria-label="Project workspace" data-notes-view={projectNotesView ? "true" : undefined}>
        {viewerCompanion && quick && <div className="project-viewer-switcher"><label>Viewer document
          <select data-testid="project-viewer-document" value={viewingDocumentId ?? ""} onChange={event => {
            const selected = viewerDocuments.find(document => document.id === event.target.value);
            if (!selected) return;
            onNavigateDocument?.(selected.id, selected.module);
            setViewingDocumentId(selected.id);
          }}><option value="">Choose document</option>{viewerDocuments.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}</select>
        </label></div>}
        {viewerCompanion && quick && <nav className="project-document-tree" data-testid="project-document-tree" aria-label="Project documents">
          <h3>Documents</h3>
          {explorer?.groups.filter(group => group.documents.some(document => !document.archived)).map(group => <section key={group.module}>
            <strong>{group.title}</strong>
            <ul>{group.documents.filter(document => !document.archived).map(document => <li key={document.id}>
              <button type="button" data-testid={`project-tree-document-${document.id}`} aria-current={viewingDocumentId === document.id ? "page" : undefined}
                disabled={preview || !canNavigateDocument?.(document.id, document.module)} onClick={() => viewBesideProject(document.id, document.module)}>{document.title}</button>
            </li>)}</ul>
          </section>)}
        </nav>}
        {projectNotesView && <div className="project-notes-workspace"><p className="project-workspace-eyebrow">PROJECT / NOTES</p>{renderNotesPanel("page")}</div>}
        <div className="project-workspace-main">
        {project && !preview && !managed && <section aria-label="Project comparison" data-testid="project-composition-entry" style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, margin: "12px 0" }}>
          <h4 style={{ margin: "0 0 4px" }}>Compare saved documents</h4>
          <p style={{ margin: "0 0 8px" }}>View two saved Mesh, Geometry or bounded Surface documents without copying their sources. {project.compositions?.length ?? 0} saved compositions.</p>
          <button type="button" data-testid="project-open-composition" disabled={busy ||
            project.workspace.entries.filter(entry => ["mesh", "geometry", "surface"].includes(entry.module)).length < 2 &&
            !project.workspace.entries.some(entry => ["mesh", "geometry", "surface"].includes(entry.module) && !!entry.replay &&
              (entry.checkpoint.identity.revision !== entry.expected.revision || entry.checkpoint.identity.structuralHash !== entry.expected.structuralHash))}
            onClick={() => { setComparisonInitialId(undefined); setComparisonInitialProbeId(undefined); setCompositionOpen(true); }}>Open comparison</button>
          <div style={{ marginTop: 12 }}><strong>Saved Mesh analysis results</strong><p>Compare exact stored quality or curvature summaries. {comparableSavedMeshResults(project).length} eligible results.</p>
            <button type="button" data-testid="project-open-mesh-result-comparison" disabled={busy || comparableSavedMeshResults(project).length < 2}
              onClick={() => { setMeshTrendComparison(null); setSavedMeshComparison(null); setMeshResultComparisonOpen(true); }}>Compare saved results</button>{" "}
            <button type="button" data-testid="project-open-mesh-result-trend" disabled={busy || comparableSavedMeshResults(project).length < 1}
              onClick={() => setMeshResultTrendOpen(true)}>View saved result trend</button>
            {!!savedMeshReview.length && <ProjectSavedMeshComparisonReviewIndex rows={savedMeshReview} busy={busy}
              onOpenPair={id => { const pair = project.savedMeshComparisons?.find(item => item.id === id);
                if (!pair) return; setMeshTrendComparison(null); setSavedMeshComparison(pair); setMeshResultComparisonOpen(true); }}
              onOpenNote={id => openProjectNotes(id)}
              onExport={() => { try {
                const snapshot = createSavedMeshComparisonReviewSnapshot(project, comparisonResource);
                downloadStudyBlob(new Blob([savedMeshComparisonReviewHtml(snapshot)], { type: "text/html" }),
                  "math3d-saved-mesh-comparison-review.html");
                setMessage("Saved Mesh comparison review exported with checked statuses and available observations.");
              } catch (error) { setMessage(`Review export failed: ${(error as Error).message}`); } }} />}</div>
          {!!coordinateReview.length && <ProjectCoordinateObservationReviewIndex rows={coordinateReview} onOpen={id => {
            const note = project.notes?.find(item => item.identity.id === id);
            if (note) openNoteTarget(note);
          }} onExport={() => { try {
            const snapshot = createProjectCoordinateObservationReviewSnapshot(project, comparisonResource);
            downloadStudyBlob(new Blob([projectCoordinateObservationReviewHtml(snapshot)], { type: "text/html" }),
              "math3d-coordinate-observation-review.html");
            setMessage("Coordinate observation review exported with exact source statuses.");
          } catch (error) { setMessage(`Coordinate review export failed: ${(error as Error).message}`); } }} />}
        </section>}
        {fullDetails && <nav className="project-detail-tabs" aria-label="Project details sections">
          {(["overview", "documents", "relations", "results", "history"] as const).map(page => <button key={page} type="button" data-testid={`project-detail-tab-${page}`}
            aria-current={detailPage === page ? "page" : undefined} onClick={() => openDetailPage(page)}>{page[0].toUpperCase() + page.slice(1)}</button>)}
        </nav>}
        <div className="project-workspace-summary">
          <p className="project-workspace-eyebrow">{managed ? "EDITING SAVED COPY" : preview ? "SAVED COPY · PREVIEW" : "CURRENT WORKSPACE"}</p>
          <h3>{project?.metadata.title ?? "Untitled project"}</h3>
          <p className="project-workspace-counts">{project?.workspace.entries.length ?? 0} {project?.workspace.entries.length === 1 ? "document" : "documents"} · {project?.workbooks?.length ?? 0} {project?.workbooks?.length === 1 ? "workbook" : "workbooks"} · {project?.notes?.length ?? 0} {project?.notes?.length === 1 ? "note" : "notes"}</p>
          <p className="project-workspace-guidance">{managed ? "Edits apply to this saved copy. Save changes to keep them." : preview ? "This is a saved snapshot. Open it to work with its documents, or edit its saved details." : "Save keeps the current workspace and its documents in your library."}</p>
          {!!project?.metadata.description && <p className="project-workspace-description">{project.metadata.description}</p>}
          {project && <section className="project-scene-shortcuts" data-testid="project-scene-shortcuts" aria-label="Verified scene links">
            <div className="project-scene-shortcuts-heading"><strong>Verified scene links</strong><span>{(project.quantumScenes?.length ?? 0) + (project.scientificScenes?.length ?? 0)}</span></div>
            {!!(project.quantumScenes?.length || project.scientificScenes?.length) && <div className="project-scene-shortcuts-list">
              {project.quantumScenes?.slice(0, 3).map(item => <button type="button" key={item.sceneFingerprint}
                data-testid={`project-scene-shortcut-quantum-${item.sceneFingerprint}`} disabled={busy || !onOpenQuantumScene}
                onClick={() => { void openLinkedQuantumScene(item); }} title="Re-verify the saved .qscene source before viewing">
                <span className="project-scene-format">.qscene</span><span>{item.title}</span><span aria-hidden="true">↗</span></button>)}
              {project.scientificScenes?.slice(0, 3).map(item => <button type="button" key={item.sceneFingerprint}
                data-testid={`project-scene-shortcut-scientific-${item.sceneFingerprint}`} disabled={busy || !onOpenScientificScene}
                onClick={() => { void openLinkedScientificScene(item); }} title="Re-verify the saved .sscene source before viewing">
                <span className="project-scene-format">.sscene</span><span>{item.title}</span><span aria-hidden="true">↗</span></button>)}
            </div>}
            {!project.quantumScenes?.length && !project.scientificScenes?.length && <small>No scenes linked to this Project yet. Open a scene folder, then attach it in Contents.</small>}
            <div className="project-scene-import-actions">
              <button type="button" data-testid="project-import-qscene" disabled={!onImportQuantumScene} onClick={onImportQuantumScene}>Open .qscene folder <small>Theory Lab quantum</small></button>
              <button type="button" data-testid="project-import-sscene" disabled={!onImportScientificScene} onClick={onImportScientificScene}>Open .sscene folder <small>Scientific data</small></button>
            </div>
            <button type="button" data-testid="project-scene-manage" onClick={() => fullDetails ? openDetailPage("documents", contentsSection) : jumpTo(contentsSection)}>Manage links / attach in Contents</button>
            {quantumSceneMessage && <p role="status">.qscene: {quantumSceneMessage}</p>}
            {scientificSceneMessage && <p role="status">.sscene: {scientificSceneMessage}</p>}
          </section>}
          {!quick && detailView && project && <div className="project-dashboard-grid" data-testid="project-dashboard">
            <section className="project-dashboard-card project-dashboard-documents" aria-label="Project documents overview">
              <div className="project-dashboard-card-heading"><h4>Documents</h4><span>{dashboardDocuments.length}</span></div>
              <ul>{dashboardDocuments.map(document => {
                const incoming = project.workspace.relations.filter(relation => relation.target.type === "document" && relation.target.generation.documentId === document.id);
                const sourceNames = [...new Set(incoming.flatMap(relation => relation.sources.map(source => source.documentId)))].map(id => documentTitles.get(id) ?? "Unavailable source");
                const documentStatus = dashboardDependencies?.documents.find(item => item.id === document.id);
                const freshness = incoming.length && documentStatus ? incoming.length === 1
                  ? presentProjectRelationFreshness(project, incoming[0]!, documentStatus.freshness)
                  : presentProjectFreshness(documentStatus.freshness) : null;
                return <li key={document.id}>
                  <button type="button" data-testid={`project-dashboard-document-${document.id}`} disabled={preview || !canNavigateDocument?.(document.id, document.module)} onClick={() => viewBesideProject(document.id, document.module)}>
                    <span><strong>{document.title}</strong><small>{document.module === "graph2d" ? "Graph" : document.module[0]?.toUpperCase() + document.module.slice(1)} · {sourceNames.length ? `From ${sourceNames.join(", ")}` : "No recorded source"}</small></span>
                    {freshness && <span className="project-freshness-badge" data-tone={freshness.tone} data-testid={`project-document-freshness-${document.id}`} title={freshness.detail}>{freshness.label}</span>}
                    <span aria-hidden="true">›</span>
                  </button>
                </li>;
              })}</ul>
              {!dashboardDocuments.length && <p>No documents in this Project yet.</p>}
            </section>
            <aside className="project-dashboard-card project-dashboard-facts" aria-label="Project summary">
              <div className="project-dashboard-card-heading"><h4>Project summary</h4></div>
              <dl>
                <div><dt>Documents</dt><dd>{dashboardDocuments.length}</dd></div>
                <div><dt>Relationships</dt><dd>{project.workspace.relations.length}</dd></div>
                <div><dt>Saved results</dt><dd>{project.workspace.results.length}</dd></div>
                <div><dt>Workbooks</dt><dd>{project.workbooks?.length ?? 0}</dd></div>
              </dl>
              <p>Revision {project.identity.revision} · {preview ? "Saved preview" : savedProjectEntry ? "Saved in your library" : "Current workspace"}</p>
              {savedProjectEntry && <p>Saved {new Date(savedProjectEntry.savedAt).toLocaleString()}</p>}
              {dashboardDependencies && (dashboardDependencies.results.length > 0 || dashboardDependencies.artifacts.length > 0) && <div className="project-dashboard-outputs" aria-label="Saved output freshness">
                <h5>Saved outputs</h5>
                {dashboardDependencies.results.map(result => { const status = result.operation === VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE ?
                  typeof regionResultStatuses[result.id] === "object" ?
                    { tone: (["vector", "scalar", "complex"] as const).every(key =>
                        (regionResultStatuses[result.id] as CombinedRegionSourceStatus)[key] ===
                          "source-current") ? "current" : "unavailable",
                      label: "Per-field check", detail: "Open this result to see each field's source status." } :
                    { tone: "unavailable", label: "Checking sources", detail: "Region sources are being verified." } :
                  result.operation === VECTOR_FIELD3D_REGION_RESULT_TYPE
                  ? regionResultStatuses[result.id] === "source-current" ? { tone: "current", label: "Source verified", detail: "Saved region result and all pinned source bytes verified." }
                    : { tone: "unavailable", label: regionResultStatuses[result.id] === "missing" ? "Missing source" :
                      regionResultStatuses[result.id] === "changed" ? "Changed source" : "Checking sources", detail: "Region values are withheld." }
                  : presentProjectFreshness(result.freshness); return <div key={result.id}>
                  <span>{result.operation}</span><span className="project-freshness-badge" data-tone={status.tone} data-testid={`project-result-freshness-${result.id}`} title={status.detail}>{status.label}</span>
                </div>; })}
                {dashboardDependencies.artifacts.map(artifact => <div key={artifact.id}>
                  <span>{artifact.role} · {artifact.kind}</span><span className="project-freshness-badge" data-tone={artifact.available ? "current" : "unavailable"}
                    data-testid={`project-artifact-freshness-${artifact.id}`}>{artifact.available ? "Available" : "Unavailable"}</span>
                </div>)}
              </div>}
            </aside>
            <ProjectCursorInspector project={project} />
            <ProjectStudiesPanel project={project} documents={dashboardDocuments} resources={resourceSession.current}
              focusStudy={studyFocus}
              workbookBytes={projectWorkbookBytes}
              onOpenWorkbookBlock={busy ? undefined : (id, stageId, blockId) => {
                void openProjectWorkbook(id, true, stageId, blockId); }}
              editable={!preview && !managed && !busy}
              onCreate={(studyTitle, ids) => stageStudy(source => createProjectStudyFromDocuments(source,
                crypto.randomUUID(), studyTitle, ids), "Study created.")}
              onRename={(id, studyTitle) => stageStudy(source => renameProjectStudy(source, id, studyTitle), "Study renamed.")}
              onFork={(id, studyTitle) => stageStudy(source => forkProjectStudy(source, id,
                crypto.randomUUID(), studyTitle), "Study forked.")}
              onLink={id => stageStudy(source => addQualifiedStudyGraphCurveLink(source, id), "Graph–Curve parameter link added.")}
              onCreateQwz={id => { void stageQwzQuadStudy(id); }}
              onPinQwz={(id, sampleIndex) => stageStudy(source => pinProjectQwzSample(source, id, sampleIndex),
                "QWZ k selection pinned in Study.")}
              onUnpinQwz={id => stageStudy(source => unpinProjectQwzSample(source, id),
                "QWZ k selection removed from Study.")}
              onPinScientificSelection={(id, selectionId) => stageStudy(source =>
                pinProjectStudyScientificSelection(source, id, selectionId), "Scientific selection pinned in Study.")}
              onCapturePinnedNote={(studyId, memberId, selectionId) => {
                try {
                  const anchor = createProjectStudySelectionNoteAnchor(project, studyId, memberId, selectionId);
                  captureAnchoredNote(anchor, selectionId.startsWith("qwz:") ? "Pinned k observation" : "Scientific selection observation",
                    "Add your observation about this saved selection.");
                  openProjectNotes();
                } catch (error) { setNotesMessage(`Study Note capture failed: ${(error as Error).message}`); }
              }}
              onOpenNote={id => openProjectNotes(id)}
              onOpenQuantumSource={openLinkedQuantumScene}
              onOpenDocument={(id, module) => viewBesideProject(id, module)} />
          </div>}
          {!quick && detailView && project && <ProjectRelationshipMap project={project} titles={documentTitles}
            preview={preview} inspection={dashboardDependencies} canOpen={(id, module) => !!canNavigateDocument?.(id, module)} onOpen={viewBesideProject} />}
          <div className="project-management-area" aria-label="Project management">
            {fullDetails && <h4>Project management</h4>}
            <div className="project-workspace-primary-actions">
              {preview && !managed
                ? <button type="button" className="project-gallery-primary" data-testid="project-sidebar-open" disabled={busy || !project} onClick={() => { if (project) void openLibraryProject(project.identity.id); }}>Open this project</button>
                : <button type="button" className="project-gallery-primary" data-testid="project-save" disabled={busy || !project || !title.trim()} onClick={save}>{busy ? "Working…" : managed ? "Save changes" : "Save project"}</button>}
              <button type="button" data-testid="project-current" disabled={busy} onClick={refresh}>{preview || managed ? "Back to current workspace" : "Refresh workspace"}</button>
              {fullDetails && <>
                <button type="button" data-testid="project-restore-saved" disabled={busy || !!managed || !project || !savedProjectEntry} onClick={previewSavedOpen}>{preview ? "Open saved project" : "Review saved version"}</button>
                <button type="button" data-testid="project-gallery-layout-toggle" onClick={() => { setNotesOpen(false); setQuick(true); setViewerCompanion(false); }}>Compact panel</button>
              </>}
            </div>
          </div>
          {hasOpenProject && !preview && !managed && <div data-testid="project-overview" className="project-navigation-overview">
            <h4>Project overview</h4>
            <p>{project?.workspace.results.length ?? 0} saved results · {project?.workspace.relations.length ?? 0} relations</p>
            {fullDetails && projectNavigation && <div className="project-history-controls" aria-label="Project navigation history"><button data-testid="project-navigation-back" aria-label="Back" disabled={!projectNavigation.canBack} onClick={projectNavigation.back}>Back</button><button data-testid="project-navigation-forward" aria-label="Forward" disabled={!projectNavigation.canForward} onClick={projectNavigation.forward}>Forward</button></div>}
            {viewingDocumentId && <button type="button" data-testid="project-view-detail-middle" onClick={() => onViewProjectDetail?.()}>
              View Project details in middle
            </button>}
            {viewingDocumentId && <button type="button" data-testid="project-overview-continue" onClick={() => { setQuick(true); setViewerCompanion(true); setDetailView(true); }}>
              Continue with {documentTitles.get(viewingDocumentId) ?? "selected document"}
            </button>}
            <strong>Recent documents</strong>
            <div data-testid="project-recent-documents" className="project-navigation-links">
              {projectNavigation?.recent.filter(item => project?.workspace.entries.some(entry => entry.expected.id === item.id && entry.module === item.module)).map(item =>
                <button type="button" key={item.id} data-testid={`project-recent-${item.id}`}
                  disabled={!canNavigateDocument?.(item.id, item.module)} onClick={() => viewBesideProject(item.id, item.module)}>
                  {documentTitles.get(item.id) ?? item.module}{item.id === viewingDocumentId ? " · current" : ""}
                </button>)}
              {!projectNavigation?.recent.length && <small>No documents opened in this Project yet.</small>}
            </div>
            {viewingDocumentId && <div data-testid="project-related-documents" className="project-navigation-related">
              <strong>Related to {documentTitles.get(viewingDocumentId) ?? "selected document"}</strong>
              {(["sources", "derived"] as const).map(kind => <div key={kind}>
                <small>{kind === "sources" ? "Sources" : "Derived documents"}</small>
                <div className="project-navigation-links">{relatedSummary[kind].map(item => <button type="button" key={item.id}
                  data-testid={`project-related-${kind}-${item.id}`}
                  disabled={!canNavigateDocument?.(item.id, item.module)} onClick={() => viewBesideProject(item.id, item.module)}
                  title={item.historical ? `Recorded revision ${item.revision}; current document differs` : `Revision ${item.revision}`}>
                  {documentTitles.get(item.id) ?? item.module}{item.historical ? ` · captured r${item.revision}` : ""}
                </button>)}{!relatedSummary[kind].length && <small>None</small>}</div>
              </div>)}
              <div><small>Evidence</small><div className="project-navigation-links">
                {relatedSummary.evidence.map(item => <span key={item.id} title={item.id}>{item.operation} · r{item.revision}{item.historical ? " · historical" : " · current"}</span>)}
                {!relatedSummary.evidence.length && <small>None</small>}
              </div></div>
              <div><small>Notes</small><div className="project-navigation-links">
                {relatedSummary.notes.map(note => <button type="button" key={note.identity.id} onClick={() => openProjectNotes(note.identity.id)}>{note.title}</button>)}
                {!relatedSummary.notes.length && <small>None anchored to this document</small>}
              </div></div>
              <div><small>Used in Workbooks</small><div className="project-navigation-links" data-testid="project-related-workbooks">
                {workbookUsage.uses.map(item => <button type="button" key={`${item.workbookId}:${item.blockId}`}
                  data-testid={`project-used-workbook-${item.workbookId}-${item.blockId}`}
                  title={`${item.blockTitle} · ${item.status} reference`} onClick={() => { void openProjectWorkbook(item.workbookId, true, item.stageId, item.blockId); }}>
                  {item.workbookTitle} › {item.blockTitle} · {item.status}
                </button>)}
                {!workbookUsage.uses.length && <small>None</small>}
                {workbookUsage.unavailable > 0 && <small>{workbookUsage.unavailable} Workbook payload{workbookUsage.unavailable === 1 ? "" : "s"} unavailable for link inspection</small>}
              </div></div>
            </div>}
          </div>}
        </div>
        <nav className="project-workspace-nav" aria-label="Jump to project section">
          <button type="button" onClick={() => openDetailPage("settings", detailsSection)}>Project details</button>
          <button type="button" onClick={() => openDetailPage("documents", contentsSection)}>Contents</button>
          <button type="button" onClick={() => openDetailPage("transfer", transferSection)}>Import / export</button>
        </nav>
        <p data-testid="project-message" className="project-workspace-message" role="status">{message}</p>
        {fullDetails && <section className="project-detail-results project-workspace-section" data-testid="project-detail-results" aria-label="Project results and artifacts">
          <h3>Results and artifacts</h3>
          <p className="project-workspace-section-hint">Inspect recorded analyses, provenance and captured resources.</p>
          {project && <ProjectResultsBrowser key={project.identity.id} project={project} inspection={dashboardDependencies} titles={documentTitles}
            readResource={comparisonResource}
            regionResultStatuses={regionResultStatuses}
            workbookBytes={projectWorkbookBytes}
            onOpenWorkbookBlock={busy ? undefined : (id, stageId, blockId) => {
              void openProjectWorkbook(id, true, stageId, blockId); }}
            onOpenNote={preview || busy ? undefined : id => openProjectNotes(id)}
            onOpenStudy={id => { setStudyFocus(previous => ({ id, token: (previous?.token ?? 0) + 1 }));
              setQuick(false); setDetailView(true); openDetailPage("overview"); }}
            onCreateScientificReport={busy || preview || managed ? undefined :
              createSubrectangleWorkbook} onExportScientificReport={exportSubrectangleReport}
            canOpen={(id, module) => !preview && !!canNavigateDocument?.(id, module)} onOpen={viewBesideProject} focusResult={resultFocus} />}
        </section>}
        {fullDetails && <section className="project-detail-history project-workspace-section" data-testid="project-detail-history" aria-label="Project history">
          <h3>History</h3>
          {project && <ProjectActivityTimeline project={project} savedAt={savedProjectEntry?.savedAt} titles={documentTitles}
            canOpen={(id, module) => !preview && !!canNavigateDocument?.(id, module)} onOpen={viewBesideProject} />}
        </section>}
        <section id="project-details-section" ref={detailsSection} tabIndex={-1} className="project-workspace-section" data-testid="project-sidebar-details" aria-label="Project details">
          <h3>Project details</h3>
      <label style={{ display: "grid", gap: 4, margin: "10px 0" }}>Project name
        <input data-testid="project-title" value={title} maxLength={160} disabled={(preview && !managed) || !project} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, margin: "10px 0" }}>Description
        <textarea data-testid="project-description" value={description} maxLength={2000} rows={2} disabled={(preview && !managed) || !project} onChange={(event) => setDescription(event.target.value)} style={{ resize: "vertical", minWidth: 0 }} />
      </label>
      <label style={{ display: "grid", gap: 4, margin: "10px 0" }}>Tags (comma separated, up to 16)
        <input data-testid="project-tags" value={tags} disabled={(preview && !managed) || !project} onChange={(event) => setTags(event.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, margin: "10px 0" }}>Thumbnail (PNG/JPEG, up to 128 KiB)
        <input data-testid="project-thumbnail" type="file" accept="image/png,image/jpeg" disabled={(preview && !managed) || !project} onChange={(event) => { void chooseThumbnail(event.target.files?.[0]); event.target.value = ""; }} style={{ maxWidth: "100%" }} />
      </label>
      <label style={{ display: "flex", gap: 7, alignItems: "center" }}><input type="checkbox" data-testid="project-thumbnail-auto" style={{ width: "auto", minHeight: 0, flex: "0 0 auto", margin: 0 }} checked={automaticThumbnail} disabled={busy || !!managed || preview} onChange={event => setAutomaticThumbnail(event.target.checked)} />Automatic preview when saving the current workspace</label>
      <small>Uploaded previews stay in place. Saved-copy metadata edits keep that project's image.</small>
      <div><button type="button" data-testid="project-thumbnail-current-view" disabled={busy || preview || !!managed || !project} onClick={() => { setThumbnail(null); setReplaceThumbnail(true); setAutomaticThumbnail(true); setThumbnailMessage("Current view will replace the preview when you save this project."); }}>Use current view</button></div>
      {thumbnailMessage && <p role="status" data-testid="project-thumbnail-message">{thumbnailMessage}</p>}
          <div className="project-workspace-actions">
            <button type="button" data-testid="project-new" disabled={busy} onClick={newProject}>New from current workspace</button>
            <button type="button" data-testid="project-view-saved" disabled={busy} onClick={viewSaved}>Preview saved version</button>
            <button type="button" data-testid="project-manage" disabled={busy || !project || !!managed || !library.entries.some((entry) => entry.id === project.identity.id)} onClick={manageSaved}>Edit saved copy</button>
            {managed && <><button type="button" data-testid="project-undo" disabled={!managed.history().undoDepth} onClick={() => history("undo")}>Undo</button>
              <button type="button" data-testid="project-redo" disabled={!managed.history().redoDepth} onClick={() => history("redo")}>Redo</button></>}
          </div>
          <small>New from current workspace creates a separate project using your open documents.</small>
          {project && <small data-testid="project-content-revision">{preview ? "Saved preview" : "Current workspace"} · project revision {project.identity.revision}</small>}
        </section>
        <section id="project-content-section" ref={contentsSection} tabIndex={-1} className="project-workspace-section" data-testid="project-sidebar-contents" aria-label="Project contents">
          <h3>Contents</h3>
          <p className="project-workspace-section-hint">{preview ? "Open this project to edit its documents." : "Open a document or workbook to continue working. View with Project keeps the live viewer and Project side by side."}</p>
          <div className="project-workspace-children">
            <section data-testid="project-quantum-scenes" className="project-workspace-child-group" aria-label="Read-only quantum scenes">
              <div className="project-workspace-child-heading"><div><span>EXTERNAL VERIFIED SOURCE</span><h4>Quantum scenes ({project?.quantumScenes?.length ?? 0})</h4></div>
                <button type="button" data-testid="project-attach-quantum-scene" disabled={busy || preview || !!managed || !project || !verifiedQuantumScene || !onOpenQuantumScene || project.quantumScenes?.some(item => item.sceneFingerprint === verifiedQuantumScene.sceneFingerprint)}
                  onClick={() => { if (!project || !verifiedQuantumScene || !onOpenQuantumScene) return;
                    const expectedProjectId = project.identity.id, reference = verifiedQuantumScene;
                    setQuantumSceneMessage("Re-verifying source before attachment…");
                    void onOpenQuantumScene(reference).then(() => { setProject(current => current?.identity.id === expectedProjectId ? upsertMath3DProjectQuantumScene(current, reference) : current); setQuantumSceneMessage("Verified source staged. Save project to retain the link."); })
                      .catch(error => setQuantumSceneMessage(`Attachment refused: ${String((error as Error).message)}`));
                  }}>Attach open verified scene</button></div>
              {studyLaunch && <div data-testid="project-quantum-study-handoff" className="project-workspace-workbook">
                <strong>{studyLaunch.title}</strong><p>Lab declared two {studyLaunch.model} views from run <code>{studyLaunch.runId}</code>. Math3D will recheck both bundles and their exact result hash before staging either view.</p>
                <button type="button" data-testid="project-open-study-new" disabled={busy} onClick={() => void stageVerifiedStudy("new")}>Open in new Project</button>{" "}
                <button type="button" data-testid="project-attach-study-current" disabled={busy || !project || preview || !!managed} onClick={() => void stageVerifiedStudy("attach")}>Attach to current Project</button>{" "}
                <small>Lab requested {studyLaunch.mode === "new" ? "a new Project" : "the current Project"}; choose the intended target here.</small>
              </div>}
              {project?.workspace.quantumStudies?.map(study => <article key={study.id} data-testid="project-quantum-study" className="project-workspace-workbook">
                <strong>{study.title}</strong><small> · {study.layout} · linked selection: {study.link.selection}</small>
                <button type="button" onClick={() => setProject(current => { if (!current) return current;
                  const quantumStudies = current.workspace.quantumStudies?.map(item => item.id !== study.id ? item :
                    { ...item, layout: item.layout === "columns" ? "rows" as const : "columns" as const });
                  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({ ...current.workspace, quantumStudies }));
                })}>Use {study.layout === "columns" ? "rows" : "columns"}</button>
                <div style={{ display: "grid", gridTemplateColumns: study.layout === "columns" ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: 10, marginTop: 10 }}>
                  {study.panels.map(panel => {
                  const reference = project.quantumScenes?.find(item => item.sceneFingerprint === panel.sceneFingerprint);
                  const sceneDocument = project.workspace.entries.find(entry => entry.module === "quantum" &&
                    entry.checkpoint.format === "math3d.quantum-scene-document" &&
                    entry.checkpoint.source.sceneFingerprint === panel.sceneFingerprint)?.checkpoint as QuantumSceneDocument | undefined;
                  return <div key={panel.sceneFingerprint} style={{ padding: 10, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
                    {panel.role}: {reference?.title ?? "Missing source"} {panel.selectedObjectId ? `· ${panel.selectedObjectId}` : ""}
                    {reference && <button type="button" disabled={busy || !onOpenQuantumScene} onClick={() => void openLinkedQuantumScene(reference)}>Open panel</button>}
                    {sceneDocument && <select aria-label={`${panel.role} study selection`} value={panel.selectedObjectId ?? ""}
                      onChange={event => { const selectedObjectId = event.target.value || null;
                        setProject(current => { if (!current) return current;
                          const quantumStudies = current.workspace.quantumStudies?.map(item => item.id !== study.id ? item : {
                            ...item, panels: item.panels.map(candidate => candidate.sceneFingerprint === panel.sceneFingerprint ?
                              { ...candidate, selectedObjectId, sampleIndex: null } : candidate) });
                          return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({ ...current.workspace, quantumStudies }));
                        }); }}><option value="">No selection</option>{sceneDocument.source.objects.map(object =>
                          <option key={object.id} value={object.id}>{object.label}</option>)}</select>}
                    {study.source.model === "hofstadter" && reference && sceneDocument && <>
                      <input type="number" min="0" max="300000" step="1" aria-label={`${panel.role} sample index`}
                        placeholder="Sample index" value={studySampleDraft[panel.sceneFingerprint] ?? panel.sampleIndex ?? ""}
                        onChange={event => setStudySampleDraft(current => ({ ...current, [panel.sceneFingerprint]: event.target.value }))}
                        style={{ width: 105 }} />
                      <button type="button" disabled={busy || !window.quantumScenes?.projectStudySample}
                        onClick={() => { const other = study.panels.find(item => item.sceneFingerprint !== panel.sceneFingerprint);
                          const target = project.quantumScenes?.find(item => item.sceneFingerprint === other?.sceneFingerprint);
                          const targetDocument = project.workspace.entries.find(entry => entry.module === "quantum" &&
                            entry.checkpoint.format === "math3d.quantum-scene-document" &&
                            entry.checkpoint.source.sceneFingerprint === other?.sceneFingerprint)?.checkpoint as QuantumSceneDocument | undefined;
                          const sourceObjectId = panel.selectedObjectId ?? sceneDocument.source.objects[0]?.id;
                          const targetObjectId = other?.selectedObjectId ?? targetDocument?.source.objects[0]?.id;
                          const rawIndex = studySampleDraft[panel.sceneFingerprint] ?? panel.sampleIndex;
                          const index = rawIndex === "" || rawIndex === null ? NaN : Number(rawIndex);
                          if (!other || !target || !sourceObjectId || !targetObjectId ||
                              !Number.isSafeInteger(index) || index < 0) { setStudyProjection("Select a valid source sample and both scene objects."); return; }
                          setBusy(true); setStudyProjection("Checking exact shared momentum…");
                          void window.quantumScenes!.projectStudySample({ directory: reference.directory,
                            sceneFingerprint: reference.sceneFingerprint }, sourceObjectId, index,
                            { directory: target.directory, sceneFingerprint: target.sceneFingerprint }, targetObjectId)
                            .then(result => { setStudyProjection(`kᵧ ${result.value.toPrecision(6)} ${result.unit}: ${result.candidateCount} target samples · ${result.status}.`);
                              setProject(current => { if (!current) return current;
                                const quantumStudies = current.workspace.quantumStudies?.map(item => item.id !== study.id ? item : {
                                  ...item, panels: item.panels.map(candidate => candidate.sceneFingerprint === panel.sceneFingerprint ?
                                    { ...candidate, selectedObjectId: sourceObjectId, sampleIndex: index } :
                                    candidate.sceneFingerprint === other.sceneFingerprint && result.sampleIndex !== null ?
                                      { ...candidate, selectedObjectId: targetObjectId, sampleIndex: result.sampleIndex } : candidate) });
                                return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({ ...current.workspace, quantumStudies }));
                              });
                            }).catch(error => setStudyProjection(`Link refused: ${String(error)}`))
                            .finally(() => setBusy(false)); }}>Link kᵧ</button>
                    </>}
                  </div>;
                })}</div>
                {studyProjection && <small role="status">{studyProjection}</small>}
              </article>)}
              {!!project?.quantumScenes?.length && <div data-testid="project-quantum-comparison" className="project-workspace-workbook">
                <strong>Compare verified quantum scenes</strong>
                <div><select aria-label="Comparison A" value={comparisonA} onChange={event => setComparisonA(event.target.value)}>
                  <option value="">Select A</option>{project.quantumScenes.map(item => <option key={item.sceneFingerprint} value={item.sceneFingerprint}>{item.title}</option>)}
                </select><select aria-label="Comparison B" value={comparisonB} onChange={event => setComparisonB(event.target.value)}>
                  <option value="">Select B</option>{project.quantumScenes.map(item => <option key={item.sceneFingerprint} value={item.sceneFingerprint}>{item.title}</option>)}
                </select><select aria-label="Quantum comparison alignment" value={comparisonPolicy} onChange={event=>{setComparisonPolicy(event.target.value as "exact"|"linear-1d");setQuantumComparison(null);}}>
                  <option value="exact">Exact samples</option><option value="linear-1d">Linear interpolation on A's 1D path</option>
                </select><button type="button" disabled={busy || !comparisonA || !comparisonB || comparisonA === comparisonB}
                  onClick={() => { const a = project.quantumScenes?.find(item => item.sceneFingerprint === comparisonA);
                    const b = project.quantumScenes?.find(item => item.sceneFingerprint === comparisonB);
                    if (!a || !b) return;
                    setBusy(true); setQuantumComparison(null);
                    void window.quantumScenes!.compare({ directory: a.directory, sceneFingerprint: a.sceneFingerprint },
                      { directory: b.directory, sceneFingerprint: b.sceneFingerprint },comparisonPolicy)
                      .then(setQuantumComparison).catch(error => setQuantumSceneMessage(`Comparison refused: ${String(error)}`))
                      .finally(() => setBusy(false)); }}>Compare A/B</button></div>
                {quantumComparison && <div role="status">{quantumComparison.status === "compatible"
                  ? `${quantumComparison.quantity}: ${quantumComparison.samples} ${quantumComparison.alignment} samples, mean absolute ${quantumComparison.meanAbsolute}, RMS ${quantumComparison.rootMeanSquare}, maximum ${quantumComparison.maximumAbsolute} ${quantumComparison.unit}`
                  : `Incompatible: ${quantumComparison.reasons.join(" ")}`}
                  {!!quantumComparison.metadataDiffs.length && <p>Parameter differences: {quantumComparison.metadataDiffs.map(item => `${item.key}: ${item.a} → ${item.b}`).join("; ")}</p>}
                  {quantumComparison.convergence && <p>Bulk-gap change across grids {quantumComparison.convergence.gridA.join("×")} → {quantumComparison.convergence.gridB.join("×")}: {quantumComparison.convergence.absoluteChange}.</p>}
                  {quantumComparison.warnings.map(warning => <p key={warning}>{warning}</p>)}
                  <p>Eigenstate matching: unavailable without source eigenvectors and a validated overlap or gauge policy.</p>
                </div>}
              </div>}
              <div><button type="button" data-testid="project-export-quantum-pack" disabled={busy || preview || !!managed || !project?.quantumScenes?.length || !window.quantumScenes?.exportPortableProject}
                onClick={() => { void exportPortableQuantumProject(); }}>Export portable quantum pack</button>
                <button type="button" data-testid="project-open-quantum-pack" disabled={busy || !window.quantumScenes?.openPortableProject}
                  onClick={() => { void openPortableQuantumProject(); }}>Open portable quantum pack</button>
                <button type="button" data-testid="project-open-quantum-study" disabled={busy || !window.quantumScenes?.openStudyHandoff}
                  onClick={() => { void window.quantumScenes!.openStudyHandoff().then(result => {
                    if (result.ok) { setStudyLaunch(result); setQuantumSceneMessage("Study folder verified. Choose its Project target."); }
                    else if (!result.canceled) setQuantumSceneMessage(`Study handoff refused: ${result.error}`);
                  }).catch(error => setQuantumSceneMessage(`Study handoff refused: ${String(error)}`)); }}>Open Theory Lab study folder</button></div>
              <button type="button" data-testid="project-open-latest-lab-bus" disabled={busy || !onOpenQuantumScene || !window.quantumScenes?.openLatestFromLabBus}
                onClick={() => { setBusy(true); setQuantumSceneMessage("Resolving the latest completed Theory Lab run through the local bus…");
                  void window.quantumScenes!.openLatestFromLabBus().then(async result => {
                    if (!result.ok) { if (!result.canceled) throw new Error(result.error); return; }
                    const details = (result.document.extensions["quantum-scene/v2"] ?? result.document.extensions["quantum-scene/v1"]) as
                      { scene: { schema: "quantum-scene/v1" | "quantum-scene/v2" } };
                    await onOpenQuantumScene!({ format: details.scene.schema, title: result.document.title,
                      directory: result.directory, sceneFingerprint: result.reference.sceneFingerprint });
                    setQuantumSceneMessage("Latest completed Lab scene independently verified and opened.");
                  }).catch(error => setQuantumSceneMessage(`Local bus open refused: ${String(error)}`))
                    .finally(() => setBusy(false)); }}>Open latest completed Lab run</button>
              <p>External quantum-scene/v1 and v2 bundles stay read-only. Opening a link re-verifies its fingerprint and source files; Project JSON does not embed the arrays.</p>
              {!project?.quantumScenes?.length && <small>Use Open .qscene folder above, then attach the verified source here.</small>}
              {project?.quantumScenes?.map(item => <article key={item.sceneFingerprint} className="project-workspace-workbook">
                <strong>{item.title}</strong><small style={{ overflowWrap: "anywhere" }}> · SHA-256 {item.sceneFingerprint}</small>
                {project.workspace.entries.filter(entry => entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document" &&
                  entry.checkpoint.source.sceneFingerprint === item.sceneFingerprint).map(entry => entry.checkpoint.format === "math3d.quantum-scene-document" &&
                  entry.checkpoint.linkedViews?.length ? <small key="relation" data-testid={`project-quantum-linked-${item.sceneFingerprint}`}>
                    Linked views from the same verified run: {entry.checkpoint.linkedViews.length}</small> : null)}
                <button type="button" data-testid={`project-open-quantum-scene-${item.sceneFingerprint}`} disabled={busy || !onOpenQuantumScene}
                  onClick={() => { void openLinkedQuantumScene(item); }}>Verify and view scene</button>
                <button type="button" data-testid={`project-overlay-quantum-scene-${item.sceneFingerprint}`}
                  disabled={busy || !window.quantumScenes?.openReference || !project.workspace.entries.some(entry => entry.module === "mesh" || entry.module === "geometry")}
                  onClick={() => setQuantumOverlay(item)}>Overlay native document</button>
                {project.workspace.entries.filter(entry => entry.module === "quantum" &&
                  entry.checkpoint.format === "math3d.quantum-scene-document" &&
                  entry.checkpoint.source.sceneFingerprint === item.sceneFingerprint).map(entry => {
                    const document = entry.checkpoint as QuantumSceneDocument;
                    const templateId = (Object.entries(QUANTUM_STUDY_TEMPLATES) as [QuantumStudyTemplateId, typeof QUANTUM_STUDY_TEMPLATES[QuantumStudyTemplateId]][])
                      .find(([, template]) => template.model === document.source.provenance.model)?.[0];
                    return templateId ? <button type="button" key="template" data-testid={`quantum-study-template-${item.sceneFingerprint}`}
                      disabled={busy || preview || !!managed} onClick={() => stageQuantumStudyTemplate(document, templateId)}>
                      Build {QUANTUM_STUDY_TEMPLATES[templateId].label} Study</button> : null;
                  })}
                <div aria-label="Promote verified quantum scene to native Project documents" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {(["geometry", "curve", "graph2d", "mesh", "surface"] as const).map(target =>
                    <button type="button" key={target} data-testid={`quantum-promote-${target}-${item.sceneFingerprint}`}
                      disabled={busy || preview || !!managed} onClick={() => void promoteQuantumScene(item, target)}>
                      Promote {target === "graph2d" ? "Graph" : target[0].toUpperCase() + target.slice(1)} copy</button>)}
                </div>
                <button type="button" data-testid={`project-admit-quantum-scene-${item.sceneFingerprint}`}
                  disabled={busy || preview || !!managed || !onVerifyQuantumSceneDocument || project.workspace.entries.some((entry) => entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document" && entry.checkpoint.source.sceneFingerprint === item.sceneFingerprint)}
                  onClick={() => { void admitQuantumScene(item); }}>Add read-only Project document</button>
                <button type="button" data-testid={`project-relink-quantum-scene-${item.sceneFingerprint}`} disabled={busy || !!managed || !onRelinkQuantumScene}
                  onClick={() => { void relinkQuantumScene(item); }}>Relink source</button>
              </article>)}
              {quantumSceneMessage && <p role="status" data-testid="project-quantum-scene-message">{quantumSceneMessage}</p>}
            </section>
            <section data-testid="project-scientific-scenes" className="project-workspace-child-group" aria-label="Read-only scientific scenes">
              <div className="project-workspace-child-heading"><div><span>EXTERNAL VERIFIED SOURCE</span><h4>Scientific scenes ({project?.scientificScenes?.length ?? 0})</h4></div>
                <button type="button" data-testid="project-attach-scientific-scene"
                  disabled={busy || preview || !!managed || !project || !verifiedScientificScene || !onOpenScientificScene || project.scientificScenes?.some(item => item.sceneFingerprint === verifiedScientificScene.sceneFingerprint)}
                  onClick={() => { void attachScientificScene(); }}>Attach open verified scene</button></div>
              <p>Links retain only the location and manifest fingerprint. Opening re-verifies source bytes; no scientific arrays enter Project JSON. Missing or changed bundles remain unavailable until an exact copy is relinked.</p>
              {!project?.scientificScenes?.length && <small>Use Open .sscene folder above (or publish one from File), then attach the verified source here.</small>}
              {project?.scientificScenes?.map(item => <article key={item.sceneFingerprint} className="project-workspace-workbook">
                <strong>{item.title}</strong><small style={{ overflowWrap: "anywhere" }}> · SHA-256 {item.sceneFingerprint}</small>
                <button type="button" data-testid={`project-open-scientific-scene-${item.sceneFingerprint}`} disabled={busy || !onOpenScientificScene}
                  onClick={() => { void openLinkedScientificScene(item); }}>Verify and view scene</button>
                <button type="button" data-testid={`project-relink-scientific-scene-${item.sceneFingerprint}`}
                  disabled={busy || !!managed || !onRelinkScientificScene} onClick={() => { void relinkScientificScene(item); }}>Relink source</button>
              </article>)}
              {scientificSceneMessage && <p role="status" data-testid="project-scientific-scene-message">{scientificSceneMessage}</p>}
            </section>
            <section data-testid="project-workbooks" className="project-workspace-child-group" aria-label="Project Workbooks">
              <div className="project-workspace-child-heading"><div><span>01 · PROJECT CONTENT</span><h4>Workbooks ({project?.workbooks?.length ?? 0})</h4></div>
                <button type="button" data-testid="project-save-active-workbook" disabled={busy || preview || !!managed || !project || !captureActiveWorkbook?.()} onClick={() => { void saveActiveWorkbook(); }}>Add active Workbook</button></div>
              {!project?.workbooks?.length && <p className="project-workspace-child-empty">Open a Workbook in the app, then add it to this saved Project.</p>}
              {project?.workbooks?.map((item) => {
                const linkedNotes = project.notes?.filter(note => note.anchor?.kind === "workbook-block" && note.anchor.workbookId === item.id) ?? [];
                return <article key={item.id} className="project-workspace-workbook" data-testid={`project-workbook-${item.id}`}>
                  <div className="project-workspace-workbook-heading"><div><strong>{item.title}</strong><small>Workbook · revision {item.revision}</small></div>
                    <div className="project-workspace-workbook-actions"><button type="button" data-testid={`project-open-workbook-${item.id}`} disabled={busy || !onOpenWorkbook} onClick={() => { void openProjectWorkbook(item.id); }}>Open Workbook</button>
                      <button type="button" data-testid={`project-view-workbook-${item.id}`} disabled={busy || !onOpenWorkbook} onClick={() => { void openProjectWorkbook(item.id, true); }}>View with Project</button></div></div>
                  <div className="project-workspace-linked-notes"><span>Notes in this Workbook ({linkedNotes.length})</span>
                    {linkedNotes.length ? linkedNotes.map(note => <button type="button" key={note.identity.id} data-testid={`project-open-note-${note.identity.id}`} disabled={preview || busy} title={preview ? "Open this Project first to view its Notes" : undefined} onClick={() => openProjectNotes(note.identity.id)}>↳ {note.title}</button>) : <small>No linked Notes yet</small>}
                  </div>
                </article>;
              })}
            </section>
            <section className="project-workspace-child-group project-workspace-notes" aria-label="Project Notes">
              <div className="project-workspace-child-heading"><div><span>02 · PROJECT CONTENT</span><h4>Notes ({project?.notes?.length ?? 0})</h4></div>
                <button type="button" data-testid="project-new-note" disabled={preview || !!managed || busy || !project || !library.entries.some(entry => entry.id === project.identity.id)} onClick={() => openProjectNotes(undefined, true)}>New Note</button></div>
              <p>Notes belong to this Project. Workbook Notes also appear beneath their Workbook.</p>
              <button type="button" data-testid="project-all-notes" disabled={preview || !!managed || busy} onClick={() => openProjectNotes()}>Open all Notes</button>
              {project?.notes?.filter(note => {
                const anchor = note.anchor;
                return anchor?.kind !== "workbook-block" || !project.workbooks?.some(item => item.id === anchor.workbookId);
              }).map(note => <button type="button" key={note.identity.id} data-testid={`project-open-note-${note.identity.id}`} disabled={preview || busy} title={preview ? "Open this Project first to view its Notes" : undefined} onClick={() => openProjectNotes(note.identity.id)}>{note.title}</button>)}
              {!project?.notes?.length && <small>No Notes yet. Create one to record observations in this Project.</small>}
            </section>
          </div>
          {fullDetails && detailPage === "documents" && project && <ProjectResearchLinks project={project} titles={documentTitles}
            workbookBytes={projectWorkbookBytes} readResource={comparisonResource} canOpenDocument={(id, module) => !preview && !!canNavigateDocument?.(id, module)}
            onOpenDocument={viewBesideProject} onInspectResult={(id) => { setResultFocus(previous => ({ id, token: (previous?.token ?? 0) + 1 })); openDetailPage("results"); }}
            onOpenStudy={(id) => { setStudyFocus(previous => ({ id, token: (previous?.token ?? 0) + 1 })); setQuick(false); setDetailView(true); openDetailPage("overview"); }}
            onOpenWorkbookBlock={(id, stageId, blockId) => { void openProjectWorkbook(id, true, stageId, blockId); }}
            onOpenNote={(id) => openProjectNotes(id)} canOpenNote={!preview && !busy}
            onAddRippleResearch={!preview && !managed && library.entries.some(entry => entry.id === project.identity.id)
              ? () => { void addRippleResearchToSavedProject(); } : undefined} addRippleResearchBusy={busy} />}
          <div className="project-relation-inspection"><button type="button" data-testid="project-inspect-relations" disabled={!project} onClick={() => { setInspectedId(null); setInspectionOpen(true); }}>Inspect relations and availability</button>
      {dependencies && <ProjectDependenciesPanel inspection={dependencies} selectedId={inspectedId} titles={documentTitles} onClose={() => setInspectionOpen(false)} onLocate={(id) => setInspectedId(id)}
        refreshOptions={managed && project ? projectDependencyRefreshOptions(project) : undefined} onRefresh={managed && !busy ? refreshDependency : undefined}
        analysisRefreshOptions={managed && project ? projectAnalysisRefreshOptions(project) : undefined} onRecompute={managed && !busy ? recomputeAnalysis : undefined} />}</div>
      {explorer && !project?.workspace.entries.length && <p className="project-gallery-empty">No documents yet. Open a starter or create a document in the workspace.</p>}
      {!(viewerCompanion && quick) && explorer?.groups.filter(group => group.documents.length > 0).map((group) => <section key={group.module} data-testid={`project-group-${group.module}`} style={{ marginTop: 12 }}>
        <strong>{group.title} ({group.documents.length})</strong>
        <ul className="project-document-list">
          {group.documents.map((document) => <li key={document.id} style={{ background: inspectedId === document.id && inspectionOpen ? "#eff6ff" : undefined }}>
            <button type="button" data-testid={`project-open-${document.id}`} disabled={preview || document.archived || !onNavigateDocument || !canNavigateDocument?.(document.id, document.module)}
              title={document.archived ? "Archived document" : preview ? "Open saved project first" : !canNavigateDocument?.(document.id, document.module) ? "Document unavailable in the active workspace; inspect dependencies or open the saved project" : `Open ${document.title}`} onClick={() => navigate(document.id, document.module)}
              style={{ maxWidth: "100%", overflowWrap: "anywhere", textAlign: "left", opacity: preview || document.archived || !canNavigateDocument?.(document.id, document.module) ? 0.55 : 1 }}>{document.title}</button>
            <button type="button" data-testid={`project-view-${document.id}`} disabled={preview || document.archived || !onNavigateDocument || !canNavigateDocument?.(document.id, document.module)} onClick={() => viewBesideProject(document.id, document.module)}>View with Project</button>
            {project && <ProjectOpenInMenu documentId={document.id}
              actions={projectOpenInActions(project, document.id, { surfaceMesh: {
                available: analyses.get(document.id)?.route === "surface" || analyses.get(document.id)?.route === "surface-mesh",
                reason: analyses.get(document.id)?.reason ?? "The saved Surface sampler is unavailable on this host.",
              }, quantumGraph: { available: !!window.quantumScenes?.openReference,
                reason: "Verified Quantum scene opening is unavailable on this host." },
                meshGeometry: meshGeometryAvailability(document.id),
                fieldGraph: { available: !!onNavigateDocument,
                  reason: "The saved Graph profile is unavailable on this host.",
                  canOpen: id => !!canNavigateDocument?.(id, "graph2d") } })}
              canDerive={!busy && !preview && !managed && !!onRestoreWorkspace}
              unavailableReason={preview ? "Open the saved Project first." : managed ?
                "Open the Project workspace before deriving a companion." : !onRestoreWorkspace ?
                  "Project workspace restoration is unavailable on this host." : busy ? "Project is busy." : null}
              onChoose={openInDestination} returnLink={projectOpenInReturn(project, document.id)}
              canReturn={!preview && !!canNavigateDocument?.(projectOpenInReturn(project, document.id)?.sourceDocumentId ?? "",
                projectOpenInReturn(project, document.id)?.sourceModule ?? "graph2d")}
              onReturn={(sourceId, module) => viewBesideProject(sourceId, module)} />}
            {algebraReturns.has(document.id) && <ProjectAlgebraReturnButton
              action={algebraReturns.get(document.id)!}
              canReturn={!busy && !preview && !managed && !!onOpenAlgebra}
              unavailableReason={preview ? "Open the saved Project first." : managed ?
                "Open the Project workspace to return to CAS." : busy ? "Project is busy." :
                !onOpenAlgebra ? "CAS navigation is unavailable on this host." : null}
              onReturn={returnToAlgebraInCas} />}
            {contourSources.has(document.id) && (() => {
              const status = contourSources.get(document.id)!;
              return <div data-testid={`project-contour-source-${document.id}`}
                style={{ display: "grid", gap: 4, fontSize: 12 }}>
                <span><strong>Saved contour source:</strong> {status.status}
                  {status.reason ? ` · ${status.reason}` : " · exact saved component verified"}</span>
                <button type="button" data-testid={`project-contour-return-${document.id}`}
                  disabled={preview || !status.sourceDocumentId ||
                    !onRestoreWorkspace || !onNavigateDocument}
                  title={preview ? "Open the saved Project first." :
                    !status.sourceDocumentId ? status.reason ?? "Geometry source unavailable." :
                    !onRestoreWorkspace || !onNavigateDocument ?
                      "Project workspace navigation is unavailable on this host." :
                      status.reason ?? "Open the pinned sampled Geometry checkpoint"}
                  onClick={() => {
                    if (!project || !onRestoreWorkspace) return;
                    const entry = project.workspace.entries.find(item => item.expected.id === document.id);
                    if (entry?.checkpoint.format !== "math3d.curve-document") return;
                    try {
                      const sourceId = resolveProjectAlgebraLocusCurveSource(project, entry.checkpoint);
                      if (!canNavigateDocument?.(sourceId, "geometry"))
                        onRestoreWorkspace(project.workspace, resourceSession.current, project);
                      if (!canNavigateDocument?.(sourceId, "geometry"))
                        throw new TypeError("The saved Geometry source is unavailable in this workspace.");
                      viewBesideProject(sourceId, "geometry");
                    }
                    catch (error) { setMessage(`Contour source could not open: ${(error as Error).message}`); }
                  }}>Open source Geometry</button>
                <button type="button" data-testid={`project-contour-return-cas-${document.id}`}
                  disabled={preview || !!managed || !status.sourceDocumentId || !onOpenAlgebra}
                  title={status.reason ?? "Open the pinned algebra revision and saved contour evidence in CAS."}
                  onClick={() => returnContourToAlgebraInCas(document.id)}>
                  Return to algebra source in CAS</button>
              </div>;
            })()}
            {document.module === "vector3d" && <button type="button"
              data-testid={`project-open-field-explorer-${document.id}`}
              disabled={busy || document.archived || !onNavigateDocument || !onRestoreWorkspace}
              onClick={() => { if (preview && project) void openLibraryProject(project.identity.id, false, document.id);
                else navigate(document.id, document.module); }}>Open Field Explorer</button>}
            {preview && !document.archived && <small> · open project first</small>}
            <small> · revision {document.revision}{document.archived ? " · archived" : ""}</small>
            <button type="button" data-testid={`project-inspect-${document.id}`} onClick={() => { setInspectedId(document.id); setInspectionOpen(true); }}>Inspect dependencies</button>
            {(() => {
              const analysis = analyses.get(document.id);
              const reason = preview ? "Open the saved project first to enable analysis." : analysis?.reason ?? (!canNavigateDocument?.(document.id, document.module) ? "Document unavailable in the active workspace." : !onOpenAnalysis ? "Analysis navigation is unavailable on this host." : null);
              return <div data-testid={`project-analysis-${document.id}`} data-analysis-route={analysis?.route ?? "unavailable"} data-analysis-reason={reason ?? ""} style={{ fontSize: 12, margin: "4px 0 8px", overflowWrap: "anywhere" }}>
                <strong>Analysis: </strong>{analysis?.tools.join(" · ") || "Unavailable"}
                <button type="button" data-testid={`project-open-analysis-${document.id}`} disabled={busy || !!reason || !analysis?.route || !onOpenAnalysis} title={reason ?? analysis?.qualification}
                  onClick={() => {
                    if (!analysis?.route || reason || !project) return;
                    setAnalysisError(null);
                    try {
                      const resources = captureProjectResources(project, item => resourceSession.current?.bytes(item) ?? resourceReader?.(item) ?? null, true);
                      onOpenAnalysis?.(document.id, document.module, analysis.route, project.workspace, resources);
                      onOpenChange(false);
                    } catch (error) { setAnalysisError({ id: document.id, message: `Analysis could not open: ${(error as Error).message}` }); }
                  }}>Open Analysis</button>
                {analysisError?.id === document.id && <div role="alert">{analysisError.message}</div>}
                <div>{reason ?? analysis?.qualification}</div>
              </div>;
            })()}
            {managed && project && <ProjectDocumentActions key={`${document.id}:${document.title}:${document.archived}`} project={project} document={document} onAction={documentAction} />}
          </li>)}
        </ul>
      </section>)}
      {algebraLoci.length > 0 && <section data-testid="project-group-algebra" style={{ marginTop: 12 }}>
        <strong>Algebra loci</strong>
        <ul className="project-document-list">
          {algebraLoci.map(({ entry, record, target, actions, casAction, menuId }) => {
            return <li key={menuId}>
              <strong>{record.label}</strong><small> · {record.definition.kind} · revision {record.revision}
                {entry.archived ? " · archived" : ""}{record.revision !== entry.revisions.length ? " · historical" : ""}</small>
              <ProjectAlgebraOpenInMenu objectId={menuId}
                actions={actions}
                casAction={casAction}
                canPrepare={!busy && !preview && !managed && !!onOpenAlgebra &&
                  !!library.entries.some(item => item.id === project?.identity.id)}
                prepareUnavailableReason={preview ? "Open the saved Project first." : managed ?
                  "Open the Project workspace before preparing a locus." : busy ? "Project is busy." :
                  !onOpenAlgebra ? "CAS navigation is unavailable on this host." :
                  !library.entries.some(item => item.id === project?.identity.id) ?
                    "Save this Project before preparing a locus in CAS." : null}
                onPrepare={action => prepareAlgebraInCas(target, action)}
                canOpen={action => !busy && !preview && !managed && !!onNavigateDocument &&
                  action.enabled && !!action.documentId && !!canNavigateDocument?.(action.documentId, "geometry")}
                unavailableReason={preview ? "Open the saved Project first." : managed ?
                  "Open the Project workspace to view its saved locus." : busy ? "Project is busy." :
                  !onNavigateDocument ? "Geometry navigation is unavailable on this host." : null}
                onChoose={action => openSavedAlgebraDestination(target, action)} />
            </li>;
          })}
        </ul>
      </section>}
      {explorer && <section data-testid="project-group-analysis" style={{ marginTop: 12 }}>
        <strong>Analysis ({explorer.analysis.length})</strong>
        <ul style={{ paddingLeft: 20 }}>{explorer.analysis.map((result) => <li key={result.id}>
          {result.title} · {result.authority} · source revision {result.sourceRevision}
        </li>)}</ul>
        {!explorer.analysis.length && <small style={{ display: "block", marginTop: 4 }}>No saved results</small>}
      </section>}
        </section>
        <section id="project-transfer-section" ref={transferSection} tabIndex={-1} className="project-workspace-section" data-testid="project-sidebar-transfer" aria-label="Import and export">
          <h3>Import / export</h3>
          <p className="project-workspace-section-hint">Bring in a project or download a copy to use elsewhere.</p>
          <label className="project-workspace-file">Import a project or research narrative file
            <input type="file" data-testid="project-import-file" disabled={busy} accept="application/json,.json" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          <small>Choose a JSON file, then review its sources, citations and omissions before importing or opening it.</small>
          <div className="project-workspace-transfer-options">
            <button type="button" className="project-gallery-primary" data-testid="project-export-resources" disabled={!project || busy} onClick={() => { void exportFile(false, true); }}>Download with resources</button>
            <small>Includes available source data and workbooks. Best for moving a project to another device.</small>
            <button type="button" data-testid="project-export" disabled={!project || busy} onClick={() => exportFile()}>Download project JSON</button>
            <small>Project definitions and history. Resource files transfer separately.</small>
            <button type="button" data-testid="project-export-checkpoint" disabled={!project || busy} onClick={() => exportFile(true)}>Download checkpoint JSON</button>
            <small>Document snapshots for hosts that require checkpoints. Undo history is not transferred.</small>
          </div>
          <section aria-label="Example projects" className="project-workspace-examples">
            <strong>Included examples</strong>
            <button type="button" data-testid="project-import-samsung-examples" disabled={busy} onClick={() => { void importSamsungExamples(); }}>Add Samsung projects ({SAMSUNG_EXAMPLE_COUNT})</button>
            <small>Adds examples to your library and keeps existing versions. Your workspace stays open.</small>
            {exampleMessage && <p role="status" data-testid="project-example-import-message">{exampleMessage}</p>}
          </section>
        </section>
        </div>
      </aside></div>
      {incoming && <div className="project-gallery-preview-backdrop"><div className="project-gallery-preview-sheet">
        {incomingNarrative && <section data-testid="project-research-narrative-review" aria-label="Research narrative review">
          <h3>Verified research narrative</h3>
          <p>{incomingNarrative.evidence.blocks.length} saved blocks · {incomingNarrative.evidence.citations.length} citations · {incomingNarrative.evidence.notes.length} Notes · {incomingNarrative.evidence.omissions.length} omissions. Import creates a separate library Project with this package identity.</p>
          <strong>Citations</strong>
          <ul>{incomingNarrative.evidence.citations.map((item, index) => <li key={index}>{item.reference.kind} · {item.reference.targetId} · {item.status}: {item.reason}</li>)}</ul>
          <strong>Notes</strong>
          <ul>{incomingNarrative.evidence.notes.map(item => <li key={item.noteId}>{item.title} · {item.status}: {item.reason}</li>)}</ul>
          <strong>Omissions</strong>
          <ul>{incomingNarrative.evidence.omissions.map((item, index) => <li key={index}>{item.kind} · {item.targetId}: {item.reason}</li>)}</ul>
          {!incomingNarrative.evidence.omissions.length && <p>No evidence omitted.</p>}
        </section>}
        <ProjectCompatibilityPanel busy={busy} preview={incoming} canOpen={!!onRestoreWorkspace} onCancel={() => { importSequence.current++; setIncoming(null); setIncomingNarrative(null); setMessage("Import cancelled. Current workspace and library unchanged."); }} onImport={() => { void importPreview(false); }} onOpen={() => { void importPreview(true); }} /></div></div>}
      {quantumOverlay && project && <React.Suspense fallback={<p role="status">Opening quantum overlay…</p>}>
        <QuantumNativeOverlayView project={project} reference={quantumOverlay} readResource={comparisonResource}
          onClose={() => setQuantumOverlay(null)} onOpenQuantum={() => { setQuantumOverlay(null); void openLinkedQuantumScene(quantumOverlay); }}
          onOpenNative={(id, module) => { setQuantumOverlay(null); navigate(id, module); }} /></React.Suspense>}
      {compositionOpen && project && <React.Suspense fallback={<p role="status">Opening Project comparison…</p>}><ProjectCompositionView project={project} readResource={comparisonResource} initialCompositionId={comparisonInitialId} initialProbeNoteId={comparisonInitialProbeId} onClose={() => setCompositionOpen(false)}
        onSave={async (composition: ProjectComposition) => {
          const ok = await commitNotes(saved => {
            const statuses = inspectProjectCompositionAvailability(composition, saved.workspace);
            if (statuses.some(status => status !== "current" && status !== "retained-checkpoint" && status !== "retained-mesh" && status !== "retained-geometry" && status !== "retained-surface"))
              throw new Error("A comparison source generation is unavailable. Reopen the saved Project.");
            return upsertMath3DProjectComposition(saved, composition);
          }, `Saved composition “${composition.title}”.`);
          if (!ok) setMessage("Composition save failed. Save this Project first, then retry.");
          return ok;
        }} onDeclareCoordinateFrame={async (composition, slot, frame) => {
          if (busy || preview || managed || !onRestoreWorkspace) throw new Error("Open and save this Project before editing its source frame.");
          setBusy(true);
          try {
            const before = localStorage.getItem(PROJECT_STORAGE_KEY);
            if (!before) throw new Error("Save a named Project first.");
            const saved = parseMath3DProject(before);
            if (saved.identity.id !== project.identity.id ||
              !projectStateRef.current || serializeMath3DProject(projectStateRef.current) !== before ||
              !parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY)).entries.some(item => item.id === saved.identity.id))
              throw new Error("The open Project differs from the saved copy. Reopen it first.");
            const live = capture();
            const comparable = (workspace: MixedWorkspaceDocument) => canonicalJsonStringify({
              ...workspace, scientificScenes: workspace.scientificScenes ?? [],
            });
            if (comparable(live) !== comparable(saved.workspace))
              throw new Error("Save current document edits before declaring a frame.");
            const previousResources = await loadProjectResources(saved);
            const selectedEntry = saved.workspace.entries.find(item => item.expected.id === composition.members[slot].documentId);
            const { project: next, comparison: pinned } = selectedEntry?.module === "mesh" ?
              declareLegacyMeshCoordinateFrame(saved, composition, slot, frame, item => previousResources.bytes(item)) :
              selectedEntry?.module === "surface" ? declareLegacySurfaceCoordinateFrame(saved, composition, slot, frame) :
              declareLegacyGeometryCoordinateFrame(saved, composition, slot, frame);
            const resources = captureProjectResources(next, item => previousResources.bytes(item));
            if (projectStateRef.current?.identity.id !== saved.identity.id ||
              canonicalJsonStringify(capture()) !== canonicalJsonStringify(live))
              throw new Error("The Project changed while preparing the declaration. Retry.");
            let hostRestored = false;
            setLibrary(await commitProjectResources(next, resources, () => saveLibraryProject(localStorage, next, Date.now(), undefined,
              { expectedBytes: before, afterWrite: () => {
                hostRestored = true;
                onRestoreWorkspace(next.workspace, resources, next);
              } }), () => { if (hostRestored) onRestoreWorkspace(live, previousResources, saved); }));
            resourceSession.current = resources; resourceSessionId.current = next.identity.id;
            display(next, false); setNotesProject(next);
            return pinned.id;
          } finally { setBusy(false); }
        }} onSaveObservation={async (composition, title, body, probe) => {
          const ok = await commitNotes(saved => {
            if (saved.identity.id !== project.identity.id) throw new Error("The open Project changed. Reopen this comparison.");
            const note = createProjectComparisonNote(saved, composition, comparisonResource, title, body, Date.now(), crypto.randomUUID(), probe);
            return upsertMath3DProjectNote(saved, note);
          }, `Saved comparison observation “${title.trim()}”.`);
          return ok;
        }} /></React.Suspense>}
      {meshResultComparisonOpen && project && <React.Suspense fallback={<p role="status">Opening saved Mesh results…</p>}><ProjectSavedMeshResultComparisonView project={project} readResource={comparisonResource}
        trendSelection={meshTrendComparison} savedReference={savedMeshComparison}
        onSaveObservation={async (pair, title, body) => commitNotes(saved => {
          if (saved.identity.id !== project.identity.id) throw new Error("The Project changed. Reopen the comparison.");
          const exact = saved.savedMeshComparisons?.find(item => item.id === pair.id);
          if (!exact || structuralHash(exact) !== structuralHash(pair)) throw new Error("The saved comparison changed.");
          const note = createProjectSavedMeshComparisonNote(saved, exact, comparisonResource, title, body, Date.now(),
            `mesh-comparison-${exact.id}-${Date.now()}`);
          return upsertMath3DProjectNote(saved, note);
        }, `Saved Mesh comparison observation “${title.trim()}”.`)}
        onSavePinned={meshTrendComparison ? async (selection, title) => commitNotes(saved => {
          if (saved.identity.id !== selection.study.projectId) throw new Error("The Project changed. Reopen the trend.");
          const pairId = `mesh-${structuralHash([selection.a.resultId, selection.b.resultId, selection.study.metricPath]).slice(7, 39)}`;
          const reference = createSavedMeshPinnedComparison(saved, selection, comparisonResource, pairId, title);
          return upsertMath3DProjectSavedMeshComparison(saved, reference);
        }, `Saved pinned Mesh comparison “${title.trim()}”.`) : undefined}
        onReturnToTrend={meshTrendComparison ? () => { setMeshResultComparisonOpen(false); setMeshTrendComparison(null); } : undefined}
        onClose={() => { setMeshResultComparisonOpen(false); setMeshTrendComparison(null); setSavedMeshComparison(null); }} /></React.Suspense>}
      {meshResultTrendOpen && project && <React.Suspense fallback={<p role="status">Opening saved Mesh trend…</p>}><ProjectSavedMeshResultTrendView project={project} readResource={comparisonResource}
        comparisonOpen={meshResultComparisonOpen && !!meshTrendComparison}
        onClose={() => setMeshResultTrendOpen(false)}
        onCompare={selection => { if (selection.study.projectId !== project.identity.id) throw new TypeError("The Project changed. Reopen the saved trend.");
          setSavedMeshComparison(null); setMeshTrendComparison(selection); setMeshResultComparisonOpen(true); }}
        onOpenResult={target => {
          if (target.projectId !== project.identity.id) throw new TypeError("The Project changed. Reopen the saved trend.");
          setMeshResultTrendOpen(false); setQuick(false); setViewerCompanion(false); setDetailView(true);
          setResultFocus(previous => ({ id: target.resultId, token: (previous?.token ?? 0) + 1 }));
          openDetailPage("results");
        }} /></React.Suspense>}
    </ProjectGalleryFrame>}
  </div>;
};
