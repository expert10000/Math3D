import React, { useState } from "react";
import { adoptMixedWorkspaceProject, buildProjectExplorer, createMath3DProject, parseMath3DProject,
  parseMixedWorkspaceDocument, updateMath3DProjectMetadata, replaceMath3DProjectWorkspace,
  type Math3DProject, type MixedWorkspaceDocument, type KernelWorkspaceModule } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { loadLibraryProject, MAX_PROJECT_THUMBNAIL_BYTES, orderProjectLibrary, parseProjectLibrary, PROJECT_LIBRARY_KEY,
  PROJECT_STORAGE_KEY, readProjectThumbnail, saveLibraryProject, updateLibraryActivity, type ProjectLibrary } from "../projects/projectLibrary";

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
};
export const ProjectWorkspacePanel: React.FC<Props> = ({ capture, canNavigateDocument, onNavigateDocument }) => {
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
  const [message, setMessage] = useState("");
  const [explorer, setExplorer] = useState<ReturnType<typeof buildProjectExplorer> | null>(null);

  const display = (next: Math3DProject, savedPreview: boolean) => {
    const resolved = verifyMixedWorkspaceReplay(next.workspace);
    const tree = buildProjectExplorer(next, resolved);
    setProject(next); setTitle(next.metadata.title); setDescription(next.metadata.description ?? ""); setTags((next.metadata.tags ?? []).join(", "));
    setThumbnail(null); setExplorer(tree); setPreview(savedPreview);
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
    return base ? replaceMath3DProjectWorkspace(base, workspace) :
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
      const next = updateMath3DProjectMetadata(liveProject(), { title: title.trim(), description, tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))] });
      const tree = buildProjectExplorer(next, verifyMixedWorkspaceReplay(next.workspace));
      setLibrary(saveLibraryProject(localStorage, next, Date.now(), thumbnail?.id === next.identity.id ? thumbnail.data : undefined));
      setProject(next); setTags((next.metadata.tags ?? []).join(", ")); setTitle(next.metadata.title); setThumbnail(null); setExplorer(tree); setPreview(false); setLibraryMessage("");
      setMessage(`Saved “${next.metadata.title}” with ${next.workspace.entries.length} documents.`);
    } catch (error) { setMessage(`Project save failed: ${(error as Error).message}`); }
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
        <input data-testid="project-title" value={title} maxLength={160} disabled={preview || !project} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, margin: "10px 0" }}>Description
        <textarea data-testid="project-description" value={description} maxLength={2000} rows={2} disabled={preview || !project} onChange={(event) => setDescription(event.target.value)} style={{ resize: "vertical", minWidth: 0 }} />
      </label>
      <label style={{ display: "grid", gap: 4, margin: "10px 0" }}>Tags (comma separated, up to 16)
        <input data-testid="project-tags" value={tags} disabled={preview || !project} onChange={(event) => setTags(event.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, margin: "10px 0" }}>Thumbnail (PNG/JPEG, up to 128 KiB)
        <input data-testid="project-thumbnail" type="file" accept="image/png,image/jpeg" disabled={preview || !project} onChange={(event) => { void chooseThumbnail(event.target.files?.[0]); event.target.value = ""; }} style={{ maxWidth: "100%" }} />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="button" data-testid="project-current" onClick={refresh}>Current workspace</button>
        <button type="button" data-testid="project-save" disabled={preview || !project || !title.trim()} onClick={save}>Save project</button>
        <button type="button" data-testid="project-view-saved" onClick={viewSaved}>View saved project</button>
        <button type="button" data-testid="project-new" onClick={newProject}>New project</button>
      </div>
      <p data-testid="project-message" role="status">{message}</p>
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
      {explorer?.groups.map((group) => <section key={group.module} data-testid={`project-group-${group.module}`} style={{ marginTop: 12 }}>
        <strong>{group.title} ({group.documents.length})</strong>
        {group.documents.length ? <ul style={{ margin: "5px 0", paddingLeft: 20 }}>
          {group.documents.map((document) => <li key={document.id} style={{ marginBottom: 5 }}>
            <button type="button" data-testid={`project-open-${document.id}`} disabled={preview || !onNavigateDocument || !canNavigateDocument?.(document.id, document.module)}
              title={document.id} onClick={() => navigate(document.id, document.module)} style={{ maxWidth: "100%", overflowWrap: "anywhere", textAlign: "left" }}>{document.title}</button>
            <small> · revision {document.revision}</small>
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
