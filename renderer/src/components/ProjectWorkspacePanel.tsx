import React, { useEffect, useMemo, useRef, useState } from "react";
import { adoptMixedWorkspaceProject, buildProjectExplorer, createMath3DProject, parseMath3DProject,
  parseMixedWorkspaceDocument, updateMath3DProjectMetadata, replaceMath3DProjectWorkspace,
  deleteProjectDocument, duplicateProjectDocument, serializeMath3DProject, setProjectDocumentMetadata,
  instantiateMath3DProjectTemplate, type Math3DProjectTemplateId,
  upsertMath3DProjectWorkbook, upsertMath3DProjectNote, updateProjectNote,
  type ProjectNote,
  type Math3DProject, type MixedWorkspaceDocument, type KernelWorkspaceModule } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { importLibraryProject, loadLibraryProject, MAX_PROJECT_THUMBNAIL_BYTES, orderProjectLibrary, parseProjectLibrary, PROJECT_LIBRARY_KEY,
  PROJECT_STORAGE_KEY, readProjectThumbnail, isAutomaticProjectThumbnail, saveLibraryProject, updateLibraryActivity, type ProjectLibrary } from "../projects/projectLibrary";
import { ProjectCommandAdapter } from "../projects/projectCommandAdapter";
import { ProjectGalleryFrame } from "./ProjectGalleryFrame";
import { ProjectTemplatesPanel } from "./ProjectTemplatesPanel";
import { ProjectDocumentActions, type ProjectDocumentAction } from "./ProjectDocumentActions";
import { inspectProjectDependencies } from "../projects/projectDependencies";
import { projectDependencyRefreshOptions, refreshProjectDependency, projectAnalysisRefreshOptions, recomputeProjectAnalysis } from "../projects/projectDependencyRefresh";
import { ProjectDependenciesPanel } from "./ProjectDependenciesPanel";
import { exportProjectFile, exportProjectCheckpointFile, inspectProjectCompatibility, MAX_PROJECT_IMPORT_BYTES, mergeProjectLiveWorkspace, previewProjectImport, projectCheckpoint } from "../projects/projectTransfer";
import { ProjectCompatibilityPanel } from "./ProjectCompatibilityPanel";
import { captureProjectResources, exportProjectPackage, MAX_PROJECT_PACKAGE_BYTES, type ProjectResourceReader, type VerifiedProjectResources } from "../projects/projectResources";
import { commitProjectResources, loadProjectResources } from "../projects/projectResourceArchive";
import { canonicalJsonStringify, structuralHash, type ProjectNoteAnchor, type StableDocumentId } from "@math3d/core";
import { pointTableStore, installPortablePointTables } from "../graph2d/pointTableStore";
import { prepareProjectExampleCollection, importProjectExamples, SAMSUNG_EXAMPLE_COUNT } from "../projects/projectExampleCollection";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";
import { addWorkbookDependency, createNoteDependencySource, type Workbook, type WorkbookStageId } from "@math3d/workbook";
import { ProjectNotesPanel } from "./ProjectNotesPanel";
import { bindProjectNoteDrafts, createProjectNoteDraft, type NoteCaptureKind, type ProjectNoteDraft } from "../projects/projectNoteDrafts";
import { createProjectNoteSelectionAnchor, type NoteSelectionDescriptor } from "../projects/projectNoteTargets";
import { projectAnalysisAvailability, type ProjectAnalysisRoute } from "../projects/projectAnalysisAvailability";

export { PROJECT_STORAGE_KEY } from "../projects/projectLibrary";
const ProjectThumbnail: React.FC<{ src: string | null; modules: string[] }> = ({ src, modules }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return src && !failed ? <img src={src} alt="Project thumbnail" onError={() => setFailed(true)} /> :
    <div data-testid="project-thumbnail-fallback" className="project-gallery-fallback"><strong aria-hidden="true">{modules.includes("Surface") ? "σ(u,v)" : modules.includes("Graph") ? "f(x)" : "M³"}</strong><span>{modules.join(" · ") || "Project"}</span><small>No saved thumbnail</small></div>;
};
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCurrentProjectChange?: (project: Math3DProject) => void;
  captureActiveWorkbook?: () => Workbook | null;
  onOpenWorkbook?: (workbook: Workbook, stageId?: WorkbookStageId, blockId?: string) => void;
  noteRequest?: { id: string; token: number } | null;
  captureNoteSelection?: () => NoteSelectionDescriptor | null;
  captureProjectThumbnail?: () => Promise<string>;
  capture: () => MixedWorkspaceDocument;
  canNavigateDocument?: (id: string, module: KernelWorkspaceModule) => boolean;
  onNavigateDocument?: (id: string, module: KernelWorkspaceModule) => void;
  onOpenAnalysis?: (id: string, module: KernelWorkspaceModule, route: ProjectAnalysisRoute, workspace: MixedWorkspaceDocument, resources?: VerifiedProjectResources) => void;
  artifactAvailable?: (id: string, hash?: string | null) => boolean;
  resourceReader?: ProjectResourceReader;
  onRestoreWorkspace?: (workspace: MixedWorkspaceDocument, resources?: VerifiedProjectResources) => void;
};
export const ProjectWorkspacePanel: React.FC<Props> = ({ open, onOpenChange, onCurrentProjectChange, captureActiveWorkbook, onOpenWorkbook, noteRequest, captureNoteSelection, captureProjectThumbnail, capture, canNavigateDocument, onNavigateDocument, onOpenAnalysis, artifactAvailable, onRestoreWorkspace, resourceReader }) => {

  const resourceSession = useRef<VerifiedProjectResources | undefined>(undefined);
  const resourceSessionId = useRef<string | null>(null);
  const [quick, setQuick] = useState(false), [collection, setCollection] = useState("All projects");
  useEffect(() => { if (!open) setQuick(false); }, [open]);
  const [busy, setBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState<{ id: string; message: string } | null>(null);
  const [project, setProject] = useState<Math3DProject | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
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
  const [libraryMessage, setLibraryMessage] = useState("");
  const [exampleMessage, setExampleMessage] = useState("");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(false);
  const [managed, setManaged] = useState<ProjectCommandAdapter | null>(null);
  const [managedBytes, setManagedBytes] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  const [explorer, setExplorer] = useState<ReturnType<typeof buildProjectExplorer> | null>(null);
  const [inspectionOpen, setInspectionOpen] = useState(false), [inspectedId, setInspectedId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<ReturnType<typeof previewProjectImport> | null>(null);
  const importSequence = useRef(0);
  const compatibilityRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (incoming) compatibilityRef.current?.scrollIntoView({ block: "nearest" }); }, [incoming]);
  const dependencies = useMemo(() => project && inspectionOpen ? inspectProjectDependencies(project, artifactAvailable) : null, [project, artifactAvailable, inspectionOpen]);
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

  const summaries = useMemo(() => new Map(library.entries.map(entry => {
    try {
      const saved = loadLibraryProject(localStorage, entry.id);
      return [entry.id, { description: saved.metadata.description ?? "", documents: saved.workspace.entries.length, results: saved.workspace.results.length,
        modules: [...new Set(saved.workspace.entries.map(item => ({ graph2d: "Graph", surface: "Surface", curve: "Curve", mesh: "Mesh", volume: "Volume", geometry: "Geometry", topology: "Topology", complex: "Complex" }[item.module] ?? item.module)))] }];
    } catch { return [entry.id, { description: "Saved payload unavailable. Preview reports the recovery details.", documents: 0, results: 0, modules: [] as string[] }]; }
  })), [library]);
  const filteredProjects = orderProjectLibrary(library).filter(entry => (collection !== "Favorites" || entry.favorite) && `${entry.title} ${entry.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const display = (next: Math3DProject, savedPreview: boolean, keepManagement = false) => {
    const resolved = verifyMixedWorkspaceReplay(next.workspace);
    const tree = buildProjectExplorer(next, resolved);
    setProject(next); setTitle(next.metadata.title); setDescription(next.metadata.description ?? ""); setTags((next.metadata.tags ?? []).join(", "));
    if (!keepManagement) { setThumbnail(null); setReplaceThumbnail(false); setThumbnailMessage(""); } setExplorer(tree); setPreview(savedPreview);
    if (!keepManagement) { setManaged(null); setManagedBytes(undefined); }
    if (!keepManagement) { setInspectionOpen(false); setInspectedId(null); }
    if (!keepManagement) { setIncoming(null); importSequence.current++; }
    if (!savedPreview) onCurrentProjectChange?.(next);
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
    return base ? replaceMath3DProjectWorkspace(base, mergeProjectLiveWorkspace(base.workspace, workspace)) :
      createMath3DProject(workspace, { stableKey: crypto.randomUUID(), title: title.trim() || "Untitled project" });
  };
  const refresh = () => {
    setAnalysisError(null);
    refreshLibrary();
    try { display(liveProject(), false); setMessage("Current workspace documents."); }
    catch (error) { setMessage(`Project unavailable: ${(error as Error).message}`); }
  };
  useEffect(() => { if (open) { setNotesOpen(false); refresh(); } }, [open]);
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
    if (anchor.kind === "workbook-block") {
      const target = noteWorkbooks.find((item) => item.workbook.id === anchor.workbookId);
      const stage = target?.workbook.stages.find((item) => item.blocks.some((block) => block.id === anchor.blockId));
      if (target && stage) { onOpenWorkbook?.(target.workbook, stage.id, anchor.blockId); setNotesOpen(false); }
      else setNotesMessage("Workbook block is unavailable in this Project.");
      return;
    }
    const entry = notesWorkspace?.entries.find((item) => item.expected.id === anchor.source.documentId);
    if (entry && canNavigateDocument?.(entry.expected.id, entry.module)) {
      onNavigateDocument?.(entry.expected.id, entry.module); setNotesOpen(false);
    } else setNotesMessage("Source document is unavailable to open.");
  };
  const collectResources = (next: Math3DProject, extra = resourceSession.current, allowMissing = false, workbook?: { id: string; bytes: Uint8Array }) => captureProjectResources(next, (item) => {
    if (item.kind === "workbook-payload" && item.id === workbook?.id) return workbook.bytes;
    const live = resourceReader?.(item); if (live) return live;
    if (item.kind === "graph-point-table") { const rows = pointTableStore.resolve(item.reference as import("@math3d/core").Graph2DPointTableReference); if (rows) return new TextEncoder().encode(canonicalJsonStringify(rows)); }
    return extra?.bytes(item) ?? null;
  }, allowMissing);
  const save = async () => {
    if (busy) return; setBusy(true);
    try {
      const capturedWorkspace = managed ? undefined : capture();
      let next = updateMath3DProjectMetadata(managed?.project() ?? liveProject(capturedWorkspace), { ...(managed?.project() ?? project)?.metadata,
        title: title.trim(), description, tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))] });
      if (!managed && noteDrafts.length) next = bindProjectNoteDrafts(next, noteDrafts);
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
      if (!managed) onCurrentProjectChange?.(next);
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
      const base = liveProject();
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
  const openProjectWorkbook = async (id: string) => {
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
      onOpenWorkbook?.(workbook);
      setMessage(`Opened “${workbook.title}” from this Project.`);
      onOpenChange(false);
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
    try {
      if (file.size > MAX_PROJECT_PACKAGE_BYTES) throw new Error("Project import exceeds its size limit.");
      const prepared = previewProjectImport(await file.text(), transferOptions());
      if (sequence !== importSequence.current) return;
      setIncoming(prepared); setMessage("Project validated. Review compatibility before importing or opening.");
    } catch (error) { if (sequence === importSequence.current) setMessage(`Project import rejected: ${(error as Error).message}`); }
  };
  const importSamsungExamples = async () => {
    if (busy) return; setBusy(true); setExampleMessage("Validating Samsung project collection…");
    try {
      const { default: raw } = await import("../projects/examples/samsung-projects.json?raw");
      const examples = prepareProjectExampleCollection(raw);
      const progress = await importProjectExamples(localStorage, examples, example => commitProjectResources(example.project, example.resources,
        () => importLibraryProject(localStorage, example.project, Date.now(), { activate: false })),
        progress => setExampleMessage(`Imported ${progress.imported}; kept ${progress.kept} existing; ${progress.remaining} remaining…`));
      refreshLibrary(); setQuery("");
      setExampleMessage(progress.error ? `Import stopped: ${progress.error}. Imported ${progress.imported}; kept ${progress.kept} existing; ${progress.remaining} remaining. Retry to continue.` :
        `Imported ${progress.imported} Samsung projects; kept ${progress.kept} existing versions.${progress.previewOnly ? ` ${progress.previewOnly} imported project is available as a compatibility preview.` : ""} Choose Open on a saved project below.`);
    } catch (failure) { setExampleMessage(`Samsung collection import failed: ${(failure as Error).message}`); }
    finally { setBusy(false); }
  };
  const importPreview = async (openWorkspace: boolean, candidate = incoming) => {
    if (!candidate || busy) return false;
    setBusy(true);
    const previousResources = resourceSession.current;
    let previous: MixedWorkspaceDocument | null = null, rollbackTables: (() => void) | undefined;
    try {
      const prepared = inspectProjectCompatibility(candidate.project, transferOptions(candidate.resources));
      if (openWorkspace && (!onRestoreWorkspace || !prepared.canOpenWorkspace)) throw new Error("This project is preview-only on this host.");
      previous = openWorkspace ? capture() : null;
      const backupProject = previous ? adoptMixedWorkspaceProject(previous, "Before project open") : null;
      const backup = backupProject ? serializeMath3DProject(backupProject) : undefined;
      const backupResources = backupProject ? collectResources(backupProject, previousResources, true) : null;
      // Preview-only JSON may deliberately lack resources. Preserve that explicit state.
      const resources = candidate.resources ?? await loadProjectResources(prepared.project);
      const rollback = () => { rollbackTables?.(); if (previous && onRestoreWorkspace) onRestoreWorkspace(previous, previousResources); };
      setLibrary(await commitProjectResources(prepared.project, resources, () => importLibraryProject(localStorage, prepared.project, Date.now(), { activate: openWorkspace, backup,
        ...(openWorkspace && previous && onRestoreWorkspace ? { afterWrite: () => {
          rollbackTables = installPortablePointTables(resources.sidecars().filter((item) => item.kind === "graph-point-table").map((item) => ({ id: item.id, content: new TextDecoder().decode(resources.bytes(item)!) })));
          onRestoreWorkspace(prepared.project.workspace, resources);
        } } : {}) }), rollback, backupProject && backupResources ? { project: backupProject, resources: backupResources } : undefined));
      resourceSession.current = resources; resourceSessionId.current = prepared.project.identity.id;
      display(prepared.project, !openWorkspace);
      if (openWorkspace) {
        const first = prepared.documents.find((document) => document.module === "graph2d") ?? prepared.documents[0]!; onNavigateDocument?.(first.id, first.module);
      }
      setMessage(openWorkspace ? "Opened supported project workspace. Previous workspace saved locally; historical analysis and external refs are retained." : "Imported into the library as a verified saved preview. The current workspace is unchanged.");
      return true;
    } catch (error) { setMessage(`Project import failed: ${(error as Error).message}`); return false; }
    finally { setBusy(false); }
  };
  const openLibraryProject = async (id: string) => {
    if (busy) return;
    const sequence = ++importSequence.current;
    setBusy(true);
    try {
      const next = loadLibraryProject(localStorage, id), resources = await loadProjectResources(next);
      if (sequence !== importSequence.current) return;
      const prepared = { ...inspectProjectCompatibility(next, transferOptions(resources)), resources, inputKind: "Saved project" };
      recordView(id);
      if (!onRestoreWorkspace || !prepared.canOpenWorkspace) {
        display(next, true); setIncoming(prepared);
        setMessage("This saved project has preview support. Review its compatibility details below.");
        return;
      }
      if (await importPreview(true, prepared)) onOpenChange(false);
    } catch (error) { setMessage(`Saved project unavailable: ${(error as Error).message}`); }
    finally { setBusy(false); }
  };
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
  const previewTemplate = (id: Math3DProjectTemplateId) => {
    importSequence.current++;
    try {
      const next = instantiateMath3DProjectTemplate(id, crypto.randomUUID());
      setIncoming({ ...inspectProjectCompatibility(next, transferOptions()), resources: undefined, inputKind: "Independent starter project" });
      setMessage("Starter preview ready. Current work is unchanged until you choose to open it.");
    } catch (error) { setIncoming(null); setMessage(`Starter unavailable: ${(error as Error).message}`); }
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
  return <div style={{ position: "fixed", right: 14, top: 90, zIndex: 2501, fontSize: 13 }}>
    <button type="button" data-testid="notes-toggle" aria-label="Open Notes" aria-expanded={notesOpen} onClick={() => {
      if (notesOpen) { setNotesOpen(false); return; }
      onOpenChange(false); refreshNotes(); setNotesOpen(true);
    }} style={{ position: "fixed", right: 14, bottom: 60, zIndex: 2502, border: "1px solid #64748b", borderRadius: 8, padding: "7px 10px", background: "#f8fafc", color: "#0f172a", fontWeight: 700 }}>Notes{noteDrafts.length ? ` (${noteDrafts.length})` : ""}</button>
    {notesOpen && <ProjectNotesPanel project={notesProject} workspace={notesWorkspace} drafts={noteDrafts} busy={busy} message={notesMessage} focusNoteId={noteRequest?.id}
      selectionAvailable={Boolean(captureNoteSelection?.())} workbooks={noteWorkbooks}
      onClose={() => setNotesOpen(false)} onOpenProjects={() => { setNotesOpen(false); onOpenChange(true); }} onRefresh={refreshNotes}
      onCapture={captureNote} onCaptureResult={captureResultNote} onCaptureWorkbookBlock={captureWorkbookBlockNote} onOpenTarget={openNoteTarget}
      onUpdateDraft={(id, patch) => setNoteDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft))}
      onDiscardDraft={(id) => setNoteDrafts((current) => current.filter((draft) => draft.id !== id))}
      onSaveDrafts={saveNoteDrafts} onSaveNote={saveEditedNote} onSendToWorkbook={sendNoteToWorkbook} />}
    <button type="button" data-testid="projects-quick-toggle" aria-label="Open quick Projects" onClick={() => { setQuick(true); onOpenChange(true); }} style={{ position:"fixed",right:14,bottom:100,zIndex:2502,padding:"7px 10px",border:"1px solid #64748b",borderRadius:8,background:"#f8fafc",color:"#0f172a",fontSize:11 }}>Quick projects</button>
    {open && <ProjectGalleryFrame quick={quick} onClose={() => onOpenChange(false)}>
      <header data-testid="project-explorer-header" className="project-gallery-header">
        <div className="project-gallery-heading"><div><p>MATH3D · PROJECTS</p><h2>{quick ? "Quick Projects" : "Projects Gallery"}</h2></div><div style={{ display:"flex",gap:8 }}><button data-testid="project-gallery-layout-toggle" onClick={() => setQuick(value => !value)}>{quick ? "Full gallery" : "Quick panel"}</button><button type="button" aria-label="Close project explorer" onClick={() => onOpenChange(false)}>Close</button></div></div>
      <p data-testid="project-view-mode" role="status" style={{ padding: 8, background: "#eff6ff", borderRadius: 6 }}>{managed ? "Managing saved project" : preview ? "Saved project preview" : "Current workspace"} · {project?.metadata.title ?? "Untitled project"}</p>
      <button type="button" data-testid="project-restore-saved" disabled={busy || !!managed || !project || !library.entries.some((entry) => entry.id === project.identity.id)} onClick={previewSavedOpen}>Open saved project</button>
      {preview && !managed && <p data-testid="project-open-guidance" style={{ marginBottom: 0 }}>Open saved project, then choose Open project in the compatibility preview to enable document buttons.</p>}
      </header>
      <div className="project-gallery-layout">
<section data-testid="project-library" className="project-gallery-library">
        <h3>Your saved projects ({library.entries.length})</h3><p>Favorites first, then recent. Open a project or preview its documents and compatibility.</p>
        <label>Find by name or tag<input data-testid="project-library-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your projects" /></label>
        <div className="project-gallery-filters" aria-label="Project collection">{["All projects", "Favorites"].map(value => <button key={value} aria-pressed={collection === value} onClick={() => setCollection(value)}>{value}</button>)}</div>
        {libraryMessage && <p role="status" data-testid="project-library-message">{libraryMessage}</p>}
        {!library.entries.length && !libraryMessage && <p>No saved projects yet. Save the current workspace or import the included Samsung collection.</p>}
        {!!library.entries.length && !filteredProjects.length && <p>No projects match this search or collection.</p>}
        <div className="project-gallery-grid" data-testid="project-gallery-grid">{filteredProjects.map(entry => {
          const src = readProjectThumbnail(localStorage, entry), summary = summaries.get(entry.id)!;
          return <article className="project-gallery-card" key={entry.id} data-testid={`project-library-${entry.id}`}>
            <ProjectThumbnail key={src ?? "missing"} src={src} modules={summary.modules} />
            <div className="project-gallery-card-content"><h4>{entry.title}</h4><p>{summary.description || `${summary.documents} document(s) · ${summary.results} saved result(s)`}</p>
              <span className="project-gallery-card-tags">{entry.tags.join(" · ")}</span>
              <div className="project-gallery-card-actions"><button type="button" data-testid={`project-open-saved-${entry.id}`} aria-label={`Open ${entry.title}`} disabled={busy} onClick={() => { void openLibraryProject(entry.id); }}>Open</button>
              <button type="button" data-testid={`project-preview-${entry.id}`} disabled={busy} aria-label={`Preview ${entry.title}`} onClick={() => { viewLibraryProject(entry.id); }}>Preview</button>
              <button type="button" aria-label={`Favorite ${entry.title}`} aria-pressed={entry.favorite} onClick={() => favorite(entry.id, !entry.favorite)}>{entry.favorite ? "★" : "☆"}</button></div>
              <small className="project-gallery-card-time">Saved {new Date(entry.savedAt).toLocaleString()}{entry.viewedAt > 0 ? ` · Viewed ${new Date(entry.viewedAt).toLocaleString()}` : ""}</small>
            </div>
          </article>;
        })}</div>
      </section>

      <div className="project-gallery-workspace"><h3>Workspace and documents</h3>
      <section aria-label="Example projects" style={{ marginTop: 10 }}>
        <button type="button" data-testid="project-import-samsung-examples" disabled={busy} onClick={() => { void importSamsungExamples(); }}>Import Samsung projects ({SAMSUNG_EXAMPLE_COUNT})</button>
        <small style={{ display: "block", marginTop: 4 }}>Included with the app. Existing versions are kept. Your current workspace stays open; unsupported documents remain compatibility previews.</small>
        {exampleMessage && <p role="status" data-testid="project-example-import-message">{exampleMessage}</p>}
      </section>
      {preview && !managed && <p>Previewing a saved project. Current workspace returns to your active editors; Manage saved project edits this saved copy.</p>}
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="button" data-testid="project-current" onClick={refresh}>Current workspace</button>
        <button type="button" data-testid="project-save" disabled={busy || (preview && !managed) || !project || !title.trim()} onClick={save}>{managed ? "Save changes" : "Save project"}</button>
        <button type="button" data-testid="project-view-saved" onClick={viewSaved}>View saved project</button>
        <button type="button" data-testid="project-new" onClick={newProject}>New project</button>
        <button type="button" data-testid="project-manage" disabled={!project || !!managed || !library.entries.some((entry) => entry.id === project.identity.id)} onClick={manageSaved}>Manage saved project</button>
        <button type="button" data-testid="project-inspect-relations" disabled={!project} onClick={() => { setInspectedId(null); setInspectionOpen(true); }}>Relations and availability</button>
        <button type="button" data-testid="project-export" disabled={!project} onClick={() => exportFile()}>Export project</button>
        <button type="button" data-testid="project-export-resources" disabled={!project || busy} onClick={() => { void exportFile(false, true); }}>Export with resources</button>
        <button type="button" data-testid="project-export-checkpoint" disabled={!project} title="Resolve replay into validated snapshots for hosts that require checkpoints. Mobile editing supports one Graph with Curve/Surface companions." onClick={() => exportFile(true)}>Export checkpoint JSON</button>
        {managed && <><button type="button" data-testid="project-undo" disabled={!managed.history().undoDepth} onClick={() => history("undo")}>Undo</button>
          <button type="button" data-testid="project-redo" disabled={!managed.history().redoDepth} onClick={() => history("redo")}>Redo</button></>}
      </div>
      <label style={{ display: "grid", gap: 4, marginTop: 10 }}>Preview project import
        <input type="file" data-testid="project-import-file" disabled={busy} accept="application/json,.json" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} style={{ maxWidth: "100%" }} />
      </label>
      <p data-testid="project-message" role="status">{message}</p>
      <section data-testid="project-workbooks" style={{ marginTop: 12 }}>
        <strong>Workbooks ({project?.workbooks?.length ?? 0})</strong>
        <div style={{ marginTop: 6 }}><button type="button" data-testid="project-save-active-workbook" disabled={busy || preview || !!managed || !project || !captureActiveWorkbook?.()} onClick={() => { void saveActiveWorkbook(); }}>Save active Workbook to Project</button></div>
        {!project?.workbooks?.length && <small style={{ display: "block", marginTop: 5 }}>Save a named Project, then add the active Workbook here.</small>}
        {project?.workbooks?.map((item) => <div key={item.id} style={{ marginTop: 5 }}>
          <button type="button" data-testid={`project-open-workbook-${item.id}`} disabled={busy || !onOpenWorkbook} onClick={() => { void openProjectWorkbook(item.id); }}>Open {item.title}</button>
          <small> · revision {item.revision}</small>
        </div>)}
      </section>
      {incoming && <div ref={compatibilityRef}><ProjectCompatibilityPanel busy={busy} preview={incoming} canOpen={!!onRestoreWorkspace && !busy} onCancel={() => { importSequence.current++; setIncoming(null); setMessage("Import cancelled. Current workspace and library unchanged."); }} onImport={() => { void importPreview(false); }} onOpen={() => { void importPreview(true); }} /></div>}
      <ProjectTemplatesPanel onPreview={previewTemplate} />
      {project && <small data-testid="project-content-revision">{preview ? "Saved preview" : "Current workspace"} · project revision {project.identity.revision}</small>}
      {dependencies && <ProjectDependenciesPanel inspection={dependencies} selectedId={inspectedId} titles={documentTitles} onClose={() => setInspectionOpen(false)} onLocate={(id) => setInspectedId(id)}
        refreshOptions={managed && project ? projectDependencyRefreshOptions(project) : undefined} onRefresh={managed && !busy ? refreshDependency : undefined}
        analysisRefreshOptions={managed && project ? projectAnalysisRefreshOptions(project) : undefined} onRecompute={managed && !busy ? recomputeAnalysis : undefined} />}
      {explorer?.groups.map((group) => <section key={group.module} data-testid={`project-group-${group.module}`} style={{ marginTop: 12 }}>
        <strong>{group.title} ({group.documents.length})</strong>
        {group.documents.length ? <ul style={{ margin: "5px 0", paddingLeft: 20 }}>
          {group.documents.map((document) => <li key={document.id} style={{ marginBottom: 5, background: inspectedId === document.id && inspectionOpen ? "#eff6ff" : undefined }}>
            <button type="button" data-testid={`project-open-${document.id}`} disabled={preview || document.archived || !onNavigateDocument || !canNavigateDocument?.(document.id, document.module)}
              title={document.archived ? "Archived document" : preview ? "Open saved project first" : !canNavigateDocument?.(document.id, document.module) ? "Document unavailable in the active workspace; inspect dependencies or open the saved project" : `Open ${document.title}`} onClick={() => navigate(document.id, document.module)}
              style={{ maxWidth: "100%", overflowWrap: "anywhere", textAlign: "left", opacity: preview || document.archived || !canNavigateDocument?.(document.id, document.module) ? 0.55 : 1 }}>{document.title}</button>
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
        </ul> : <small style={{ display: "block", marginTop: 4 }}>No documents</small>}
      </section>)}
      {explorer && <section data-testid="project-group-analysis" style={{ marginTop: 12 }}>
        <strong>Analysis ({explorer.analysis.length})</strong>
        <ul style={{ paddingLeft: 20 }}>{explorer.analysis.map((result) => <li key={result.id}>
          {result.title} · {result.authority} · source revision {result.sourceRevision}
        </li>)}</ul>
        {!explorer.analysis.length && <small style={{ display: "block", marginTop: 4 }}>No saved results</small>}
      </section>}
      </div></div>
    </ProjectGalleryFrame>}
  </div>;
};
