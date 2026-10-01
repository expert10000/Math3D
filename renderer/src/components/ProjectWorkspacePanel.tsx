import React, { useState } from "react";
import { adoptMixedWorkspaceProject, buildProjectExplorer, createMath3DProject, parseMath3DProject,
  parseMixedWorkspaceDocument, renameMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject, type MixedWorkspaceDocument, type KernelWorkspaceModule } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

export const PROJECT_STORAGE_KEY = "math3d.project.v1";
type Props = {
  capture: () => MixedWorkspaceDocument;
  canNavigateDocument?: (id: string, module: KernelWorkspaceModule) => boolean;
  onNavigateDocument?: (id: string, module: KernelWorkspaceModule) => void;
};
export const ProjectWorkspacePanel: React.FC<Props> = ({ capture, canNavigateDocument, onNavigateDocument }) => {
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<Math3DProject | null>(null);
  const [title, setTitle] = useState("Untitled project");
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [explorer, setExplorer] = useState<ReturnType<typeof buildProjectExplorer> | null>(null);

  const display = (next: Math3DProject, savedPreview: boolean) => {
    const resolved = verifyMixedWorkspaceReplay(next.workspace);
    const tree = buildProjectExplorer(next, resolved);
    setProject(next); setTitle(next.metadata.title); setExplorer(tree); setPreview(savedPreview);
  };
  const liveProject = () => {
    let base = project;
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
    try { display(liveProject(), false); setMessage("Current workspace documents."); }
    catch (error) { setMessage(`Project unavailable: ${(error as Error).message}`); }
  };
  const toggle = () => { if (!open) refresh(); setOpen(!open); };
  const save = () => {
    try {
      const next = renameMath3DProject(liveProject(), title);
      const tree = buildProjectExplorer(next, verifyMixedWorkspaceReplay(next.workspace));
      const bytes = serializeMath3DProject(next);
      localStorage.setItem(PROJECT_STORAGE_KEY, bytes);
      setProject(next); setExplorer(tree); setPreview(false);
      setMessage(`Saved “${next.metadata.title}” with ${next.workspace.entries.length} documents.`);
    } catch (error) { setMessage(`Project save failed: ${(error as Error).message}`); }
  };
  const viewSaved = () => {
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY), legacy = raw ? null : localStorage.getItem("math3d.mixed-workspace.v1");
      if (!raw && !legacy) { setMessage("No saved project is available."); return; }
      const next = raw ? parseMath3DProject(raw) : adoptMixedWorkspaceProject(parseMixedWorkspaceDocument(legacy!));
      display(next, true);
      setMessage(legacy ? "Legacy workspace preview." : "Saved preview. Choose Current workspace to continue editing.");
    } catch (error) { setMessage(`Saved project unavailable: ${(error as Error).message}`); }
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="button" data-testid="project-current" onClick={refresh}>Current workspace</button>
        <button type="button" data-testid="project-save" disabled={preview || !project || !title.trim()} onClick={save}>Save project</button>
        <button type="button" data-testid="project-view-saved" onClick={viewSaved}>View saved project</button>
      </div>
      <p data-testid="project-message" role="status">{message}</p>
      {project && <small data-testid="project-content-revision">{preview ? "Saved preview" : "Current workspace"} · project revision {project.identity.revision}</small>}
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
