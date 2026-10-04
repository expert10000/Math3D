import React, { useEffect, useMemo, useRef, useState } from "react";
import { adoptMixedWorkspaceProject, buildProjectExplorer, createMath3DProject, parseMath3DProject,
  parseMixedWorkspaceDocument, updateMath3DProjectMetadata, replaceMath3DProjectWorkspace,
  deleteProjectDocument, duplicateProjectDocument, serializeMath3DProject, setProjectDocumentMetadata,
  instantiateMath3DProjectTemplate, type Math3DProjectTemplateId,
  type Math3DProject, type MixedWorkspaceDocument, type KernelWorkspaceModule } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { importLibraryProject, loadLibraryProject, MAX_PROJECT_THUMBNAIL_BYTES, orderProjectLibrary, parseProjectLibrary, PROJECT_LIBRARY_KEY,
  PROJECT_STORAGE_KEY, readProjectThumbnail, saveLibraryProject, updateLibraryActivity, type ProjectLibrary } from "../projects/projectLibrary";
import { ProjectCommandAdapter } from "../projects/projectCommandAdapter";
import { ProjectTemplatesPanel } from "./ProjectTemplatesPanel";
import { ProjectDocumentActions, type ProjectDocumentAction } from "./ProjectDocumentActions";
import { inspectProjectDependencies } from "../projects/projectDependencies";
import { projectDependencyRefreshOptions, refreshProjectDependency, projectAnalysisRefreshOptions, recomputeProjectAnalysis } from "../projects/projectDependencyRefresh";
import { ProjectDependenciesPanel } from "./ProjectDependenciesPanel";
import { exportProjectFile, exportProjectCheckpointFile, inspectProjectCompatibility, MAX_PROJECT_IMPORT_BYTES, mergeProjectLiveWorkspace, previewProjectImport, projectCheckpoint } from "../projects/projectTransfer";
import { ProjectCompatibilityPanel } from "./ProjectCompatibilityPanel";
import { captureProjectResources, exportProjectPackage, MAX_PROJECT_PACKAGE_BYTES, type ProjectResourceReader, type VerifiedProjectResources } from "../projects/projectResources";
import { commitProjectResources, loadProjectResources } from "../projects/projectResourceArchive";
import { canonicalJsonStringify } from "@math3d/core";
import { pointTableStore, installPortablePointTables } from "../graph2d/pointTableStore";

export { PROJECT_STORAGE_KEY } from "../projects/projectLibrary";
const ProjectThumbnail: React.FC<{ src: string | null }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 4 }} /> :
    <span data-testid="project-thumbnail-fallback" style={{ width: 64, minHeight: 48, display: "grid", placeItems: "center", background: "#e2e8f0", borderRadius: 4, fontSize: 11, textAlign: "center" }}>No thumbnail</span>;
};
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capture: () => MixedWorkspaceDocument;
  canNavigateDocument?: (id: string, module: KernelWorkspaceModule) => boolean;
  onNavigateDocument?: (id: string, module: KernelWorkspaceModule) => void;
  artifactAvailable?: (id: string, hash?: string | null) => boolean;
  resourceReader?: ProjectResourceReader;
  onRestoreWorkspace?: (workspace: MixedWorkspaceDocument, resources?: VerifiedProjectResources) => void;
};
export const ProjectWorkspacePanel: React.FC<Props> = ({ open, onOpenChange, capture, canNavigateDocument, onNavigateDocument, artifactAvailable, onRestoreWorkspace, resourceReader }) => {

  const resourceSession = useRef<VerifiedProjectResources | undefined>(undefined);
  const resourceSessionId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [project, setProject] = useState<Math3DProject | null>(null);
  const [title, setTitle] = useState("Untitled project");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [thumbnail, setThumbnail] = useState<{ id: string; data: string } | null>(null);
  const [library, setLibrary] = useState<ProjectLibrary>(parseProjectLibrary(null));
  const [libraryMessage, setLibraryMessage] = useState("");
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
  const documentTitles = new Map(explorer?.groups.flatMap((group) => group.documents.map((document) => [document.id, document.title] as const)) ?? []);

  const display = (next: Math3DProject, savedPreview: boolean, keepManagement = false) => {
    const resolved = verifyMixedWorkspaceReplay(next.workspace);
    const tree = buildProjectExplorer(next, resolved);
    setProject(next); setTitle(next.metadata.title); setDescription(next.metadata.description ?? ""); setTags((next.metadata.tags ?? []).join(", "));
    if (!keepManagement) setThumbnail(null); setExplorer(tree); setPreview(savedPreview);
    if (!keepManagement) { setManaged(null); setManagedBytes(undefined); }
    if (!keepManagement) { setInspectionOpen(false); setInspectedId(null); }
    if (!keepManagement) { setIncoming(null); importSequence.current++; }
  };
  const refreshLibrary = () => {
    try { setLibrary(parseProjectLibrary(localStorage.getItem(PROJECT_LIBRARY_KEY))); setLibraryMessage(""); }
    catch (error) { setLibrary(parseProjectLibrary(null)); setLibraryMessage(`Library unavailable: ${(error as Error).message}`); }
  };
  const liveProject = () => {
    let base = preview ? null : project;
    // Read the saved name/identity once; workspace content always comes from the
    // live capture. Invalid saved bytes must not be silently replaced.
    if (!base) {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
      if (raw) base = parseMath3DProject(raw);
    }
    const workspace = capture();
    verifyMixedWorkspaceReplay(workspace);
    return base ? replaceMath3DProjectWorkspace(base, mergeProjectLiveWorkspace(base.workspace, workspace)) :
      createMath3DProject(workspace, { stableKey: crypto.randomUUID(), title: title.trim() || "Untitled project" });
  };
  const refresh = () => {
    refreshLibrary();
    try { display(liveProject(), false); setMessage("Current workspace documents."); }
    catch (error) { setMessage(`Project unavailable: ${(error as Error).message}`); }
  };
  useEffect(() => { if (open) refresh(); }, [open]);
  const collectResources = (next: Math3DProject, extra = resourceSession.current, allowMissing = false) => captureProjectResources(next, (item) => {
    const live = resourceReader?.(item); if (live) return live;
    if (item.kind === "graph-point-table") { const rows = pointTableStore.resolve(item.reference as import("@math3d/core").Graph2DPointTableReference); if (rows) return new TextEncoder().encode(canonicalJsonStringify(rows)); }
    return extra?.bytes(item) ?? null;
  }, allowMissing);
  const save = async () => {
    if (busy) return; setBusy(true);
    try {
      let next = updateMath3DProjectMetadata(managed?.project() ?? liveProject(), { ...(managed?.project() ?? project)?.metadata,
        title: title.trim(), description, tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))] });
      if (managed && serializeMath3DProject(next) !== serializeMath3DProject(managed.project())) next = managed.commit(next);
      const tree = buildProjectExplorer(next, verifyMixedWorkspaceReplay(next.workspace));
      const previousResources = managed ? await loadProjectResources(loadLibraryProject(localStorage, next.identity.id)) : resourceSessionId.current === next.identity.id ? resourceSession.current : project ? await loadProjectResources(project) : undefined;
      const resources = collectResources(next, previousResources, !!managed);
      setLibrary(await commitProjectResources(next, resources, () => saveLibraryProject(localStorage, next, Date.now(), thumbnail?.id === next.identity.id ? thumbnail.data : undefined,
        managed ? { activate: false, expectedBytes: managedBytes } : {})));
      resourceSession.current = resources; resourceSessionId.current = next.identity.id;
      if (managed) setManagedBytes(serializeMath3DProject(next));
      setProject(next); setTags((next.metadata.tags ?? []).join(", ")); setTitle(next.metadata.title); setThumbnail(null); setExplorer(tree); setPreview(!!managed); setLibraryMessage("");
      setMessage(`Saved “${next.metadata.title}” with ${next.workspace.entries.length} documents.`);
    } catch (error) { setMessage(`Project save failed: ${(error as Error).message}`); }
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
  const importPreview = async (openWorkspace: boolean) => {
    if (!incoming || busy) return;
    setBusy(true);
    const previousResources = resourceSession.current;
    let previous: MixedWorkspaceDocument | null = null, rollbackTables: (() => void) | undefined;
    try {
      const prepared = inspectProjectCompatibility(incoming.project, transferOptions(incoming.resources));
      if (openWorkspace && (!onRestoreWorkspace || !prepared.canOpenWorkspace)) throw new Error("This project is preview-only on this host.");
      previous = openWorkspace ? capture() : null;
      const backupProject = previous ? adoptMixedWorkspaceProject(previous, "Before project open") : null;
      const backup = backupProject ? serializeMath3DProject(backupProject) : undefined;
      const backupResources = backupProject ? collectResources(backupProject, previousResources, true) : null;
      // Preview-only JSON may deliberately lack resources. Preserve that explicit state.
      const resources = incoming.resources ?? await loadProjectResources(prepared.project);
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
    } catch (error) { setMessage(`Project import failed: ${(error as Error).message}`); }
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
    {open && <aside id="project-explorer-panel" data-testid="project-explorer-panel" aria-label="Project explorer"
      style={{ position: "absolute", right: 0, top: 0, width: 420, boxSizing: "border-box", maxWidth: "calc(100vw - 28px)", maxHeight: "min(70vh, 650px)", overflow: "auto", padding: 14,
        background: "#fff", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: 10, boxShadow: "0 10px 30px #0f172a30" }}>
      <div data-testid="project-explorer-header" style={{ position: "sticky", top: -14, zIndex: 1, background: "#fff", padding: "10px 0", borderBottom: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Projects</strong><button type="button" aria-label="Close project explorer" onClick={() => onOpenChange(false)}>Close</button>
      </div>
      <p data-testid="project-view-mode" role="status" style={{ padding: 8, background: "#eff6ff", borderRadius: 6 }}>{managed ? "Managing saved project" : preview ? "Saved project preview" : "Current workspace"} · {project?.metadata.title ?? "Untitled project"}</p>
      <button type="button" data-testid="project-restore-saved" disabled={busy || !!managed || !project || !library.entries.some((entry) => entry.id === project.identity.id)} onClick={previewSavedOpen}>Open saved project</button>
      {preview && !managed && <p data-testid="project-open-guidance" style={{ marginBottom: 0 }}>Open saved project, then choose Open project in the compatibility preview to enable document buttons.</p>}
      </div>
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
      {incoming && <div ref={compatibilityRef}><ProjectCompatibilityPanel busy={busy} preview={incoming} canOpen={!!onRestoreWorkspace && !busy} onCancel={() => { importSequence.current++; setIncoming(null); setMessage("Import cancelled. Current workspace and library unchanged."); }} onImport={() => { void importPreview(false); }} onOpen={() => { void importPreview(true); }} /></div>}
      <ProjectTemplatesPanel onPreview={previewTemplate} />
      {project && <small data-testid="project-content-revision">{preview ? "Saved preview" : "Current workspace"} · project revision {project.identity.revision}</small>}
      <section data-testid="project-library" style={{ marginTop: 14 }}>
        <strong>Saved projects · favorites first, then recent</strong>
        <label style={{ display: "grid", marginTop: 6 }}>Find by name or tag<input data-testid="project-library-search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {libraryMessage && <p role="status" data-testid="project-library-message">{libraryMessage}</p>}
        {!library.entries.length && !libraryMessage && <p>No saved projects yet.</p>}
        {orderProjectLibrary(library).filter((entry) => `${entry.title} ${entry.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())).map((entry) => {
          const src = readProjectThumbnail(localStorage, entry);
          return <article key={entry.id} data-testid={`project-library-${entry.id}`} style={{ display: "flex", gap: 8, marginTop: 10, padding: 6, border: "1px solid #e2e8f0", borderRadius: 6 }}>
            <ProjectThumbnail key={src ?? "missing"} src={src} />
            <div style={{ minWidth: 0, flex: 1, overflowWrap: "anywhere" }}>
              <button type="button" data-testid={`project-preview-${entry.id}`} onClick={() => viewLibraryProject(entry.id)} style={{ textAlign: "left", maxWidth: "100%", overflowWrap: "anywhere" }}>{entry.title}</button>
              <button type="button" aria-label={`Favorite ${entry.title}`} aria-pressed={entry.favorite} onClick={() => favorite(entry.id, !entry.favorite)} style={{ marginLeft: 4 }}>{entry.favorite ? "★" : "☆"}</button>
              <small style={{ display: "block" }}>{entry.tags.join(" · ")}</small>
              <small style={{ display: "block" }}>Saved {new Date(entry.savedAt).toLocaleString()}{entry.viewedAt > 0 ? ` · Viewed ${new Date(entry.viewedAt).toLocaleString()}` : ""}</small>
            </div>
          </article>;
        })}
      </section>
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
    </aside>}
  </div>;
};
