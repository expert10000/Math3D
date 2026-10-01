import React, { useMemo, useRef, useState } from "react";
import { adoptMixedWorkspaceProject, buildProjectExplorer, createMath3DProject, parseMath3DProject,
  parseMixedWorkspaceDocument, updateMath3DProjectMetadata, replaceMath3DProjectWorkspace,
  deleteProjectDocument, duplicateProjectDocument, serializeMath3DProject, setProjectDocumentMetadata,
  type Math3DProject, type MixedWorkspaceDocument, type KernelWorkspaceModule } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { importLibraryProject, loadLibraryProject, MAX_PROJECT_THUMBNAIL_BYTES, orderProjectLibrary, parseProjectLibrary, PROJECT_LIBRARY_KEY,
  PROJECT_STORAGE_KEY, readProjectThumbnail, saveLibraryProject, updateLibraryActivity, type ProjectLibrary } from "../projects/projectLibrary";
import { ProjectCommandAdapter } from "../projects/projectCommandAdapter";
import { ProjectDocumentActions, type ProjectDocumentAction } from "./ProjectDocumentActions";
import { inspectProjectDependencies } from "../projects/projectDependencies";
import { ProjectDependenciesPanel } from "./ProjectDependenciesPanel";
import { exportProjectFile, inspectProjectCompatibility, MAX_PROJECT_IMPORT_BYTES, mergeProjectLiveWorkspace, previewProjectImport, projectCheckpoint } from "../projects/projectTransfer";
import { ProjectCompatibilityPanel } from "./ProjectCompatibilityPanel";
import { pointTableStore } from "../graph2d/pointTableStore";

export { PROJECT_STORAGE_KEY } from "../projects/projectLibrary";
const ProjectThumbnail: React.FC<{ src: string | null }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 4 }} /> :
    <span data-testid="project-thumbnail-fallback" style={{ width: 64, minHeight: 48, display: "grid", placeItems: "center", background: "#e2e8f0", borderRadius: 4, fontSize: 11, textAlign: "center" }}>No thumbnail</span>;
};
type Props = {
  capture: () => MixedWorkspaceDocument;
  canNavigateDocument?: (id: string, module: KernelWorkspaceModule) => boolean;
  onNavigateDocument?: (id: string, module: KernelWorkspaceModule) => void;
  artifactAvailable?: (id: string, hash?: string | null) => boolean;
  onRestoreWorkspace?: (workspace: MixedWorkspaceDocument) => void;
};
export const ProjectWorkspacePanel: React.FC<Props> = ({ capture, canNavigateDocument, onNavigateDocument, artifactAvailable, onRestoreWorkspace }) => {
  const [open, setOpen] = useState(false);
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
  const toggle = () => { if (!open) refresh(); setOpen(!open); };
  const save = () => {
    try {
      let next = updateMath3DProjectMetadata(managed?.project() ?? liveProject(), { ...(managed?.project() ?? project)?.metadata,
        title: title.trim(), description, tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))] });
      if (managed && serializeMath3DProject(next) !== serializeMath3DProject(managed.project())) next = managed.commit(next);
      const tree = buildProjectExplorer(next, verifyMixedWorkspaceReplay(next.workspace));
      setLibrary(saveLibraryProject(localStorage, next, Date.now(), thumbnail?.id === next.identity.id ? thumbnail.data : undefined,
        managed ? { activate: false, expectedBytes: managedBytes } : {}));
      if (managed) setManagedBytes(serializeMath3DProject(next));
      setProject(next); setTags((next.metadata.tags ?? []).join(", ")); setTitle(next.metadata.title); setThumbnail(null); setExplorer(tree); setPreview(!!managed); setLibraryMessage("");
      setMessage(`Saved “${next.metadata.title}” with ${next.workspace.entries.length} documents.`);
    } catch (error) { setMessage(`Project save failed: ${(error as Error).message}`); }
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
  const transferOptions = () => ({ artifactAvailable, tableAvailable: (reference: Parameters<typeof pointTableStore.resolve>[0]) => pointTableStore.resolve(reference) !== null });
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const sequence = ++importSequence.current;
    setIncoming(null);
    try {
      if (file.size > MAX_PROJECT_IMPORT_BYTES) throw new Error("Project import exceeds its size limit.");
      const prepared = previewProjectImport(await file.text(), transferOptions());
      if (sequence !== importSequence.current) return;
      setIncoming(prepared); setMessage("Project validated. Review compatibility before importing or opening.");
    } catch (error) { if (sequence === importSequence.current) setMessage(`Project import rejected: ${(error as Error).message}`); }
  };
  const importPreview = (openWorkspace: boolean) => {
    if (!incoming) return;
    try {
      // Recheck sidecars/host support immediately before the explicit action.
      const prepared = inspectProjectCompatibility(incoming.project, transferOptions());
      if (openWorkspace && (!onRestoreWorkspace || !prepared.canOpenWorkspace)) throw new Error("This project is preview-only on this host.");
      const previous = openWorkspace ? projectCheckpoint(capture()) : null;
      const backup = previous ? serializeMath3DProject(adoptMixedWorkspaceProject(previous, "Before project open")) : undefined;
      setLibrary(importLibraryProject(localStorage, prepared.project, Date.now(), { activate: openWorkspace, backup,
        ...(openWorkspace && previous && onRestoreWorkspace ? { afterWrite: () => {
          try { onRestoreWorkspace(prepared.checkpoint); }
          catch (error) { onRestoreWorkspace(previous); throw error; }
        } } : {}) }));
      display(prepared.project, !openWorkspace);
      if (openWorkspace) {
        const graph = prepared.documents.find((document) => document.module === "graph2d")!; onNavigateDocument?.(graph.id, "graph2d");
      }
      setMessage(openWorkspace ? "Opened supported Graph workspace. Previous workspace saved locally; historical analysis and external refs are retained." : "Imported into the library as a verified saved preview. The current workspace is unchanged.");
    } catch (error) { setMessage(`Project import failed: ${(error as Error).message}`); }
  };
  const exportFile = () => {
    if (!project) return;
    try {
      let next = managed?.project() ?? (preview ? project : liveProject());
      if (!preview || managed) next = updateMath3DProjectMetadata(next, { ...next.metadata, title: title.trim(), description, tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))] });
      const bytes = exportProjectFile(next);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/json" })), link = document.createElement("a");
      link.href = url; link.download = `${next.metadata.title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "Project"}.math3d.project.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("Exported verified project JSON with original identities and replay. Sidecar bytes and thumbnails transfer separately.");
    } catch (error) { setMessage(`Project export failed: ${(error as Error).message}`); }
  };
  const navigate = (id: string, module: KernelWorkspaceModule) => {
    if (!preview && canNavigateDocument?.(id, module)) { onNavigateDocument?.(id, module); setOpen(false); }
  };
  return <div style={{ position: "fixed", right: 14, bottom: 54, zIndex: 2501, fontSize: 13 }}>
    <button type="button" data-testid="projects-toggle" aria-expanded={open} aria-controls="project-explorer-panel" onClick={toggle}
      style={{ border: "1px solid #64748b", borderRadius: 8, background: "#f8fafc", color: "#0f172a", padding: "7px 10px", fontWeight: 700 }}>Projects</button>
    {open && <aside id="project-explorer-panel" data-testid="project-explorer-panel" aria-label="Project explorer"
      style={{ position: "absolute", right: 0, bottom: 42, width: 380, boxSizing: "border-box", maxWidth: "calc(100vw - 28px)", maxHeight: "min(70vh, 650px)", overflow: "auto", padding: 14,
        background: "#fff", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: 10, boxShadow: "0 10px 30px #0f172a30" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Project</strong><button type="button" aria-label="Close project explorer" onClick={() => setOpen(false)}>Close</button>
      </div>
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
        <button type="button" data-testid="project-save" disabled={(preview && !managed) || !project || !title.trim()} onClick={save}>{managed ? "Save changes" : "Save project"}</button>
        <button type="button" data-testid="project-view-saved" onClick={viewSaved}>View saved project</button>
        <button type="button" data-testid="project-new" onClick={newProject}>New project</button>
        <button type="button" data-testid="project-manage" disabled={!project || !!managed || !library.entries.some((entry) => entry.id === project.identity.id)} onClick={manageSaved}>Manage saved project</button>
        <button type="button" data-testid="project-inspect-relations" disabled={!project} onClick={() => { setInspectedId(null); setInspectionOpen(true); }}>Relations and availability</button>
        <button type="button" data-testid="project-export" disabled={!project} onClick={exportFile}>Export project</button>
        {managed && <><button type="button" data-testid="project-undo" disabled={!managed.history().undoDepth} onClick={() => history("undo")}>Undo</button>
          <button type="button" data-testid="project-redo" disabled={!managed.history().redoDepth} onClick={() => history("redo")}>Redo</button></>}
      </div>
      <label style={{ display: "grid", gap: 4, marginTop: 10 }}>Preview project import
        <input type="file" data-testid="project-import-file" accept="application/json,.json" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} style={{ maxWidth: "100%" }} />
      </label>
      <p data-testid="project-message" role="status">{message}</p>
      {incoming && <ProjectCompatibilityPanel preview={incoming} canOpen={!!onRestoreWorkspace} onCancel={() => { importSequence.current++; setIncoming(null); setMessage("Import cancelled. Current workspace and library unchanged."); }} onImport={() => importPreview(false)} onOpen={() => importPreview(true)} />}
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
      {dependencies && <ProjectDependenciesPanel inspection={dependencies} selectedId={inspectedId} titles={documentTitles} onClose={() => setInspectionOpen(false)} onLocate={(id) => setInspectedId(id)} />}
      {explorer?.groups.map((group) => <section key={group.module} data-testid={`project-group-${group.module}`} style={{ marginTop: 12 }}>
        <strong>{group.title} ({group.documents.length})</strong>
        {group.documents.length ? <ul style={{ margin: "5px 0", paddingLeft: 20 }}>
          {group.documents.map((document) => <li key={document.id} style={{ marginBottom: 5, background: inspectedId === document.id && inspectionOpen ? "#eff6ff" : undefined }}>
            <button type="button" data-testid={`project-open-${document.id}`} disabled={preview || document.archived || !onNavigateDocument || !canNavigateDocument?.(document.id, document.module)}
              title={document.id} onClick={() => navigate(document.id, document.module)} style={{ maxWidth: "100%", overflowWrap: "anywhere", textAlign: "left" }}>{document.title}</button>
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
