import React from "react";
import type { ProjectCompatibility } from "../projects/projectTransfer";

export const ProjectCompatibilityPanel: React.FC<{ preview: ProjectCompatibility & { inputKind: string }; onCancel: () => void; onImport: () => void; onOpen: () => void; canOpen: boolean; busy?: boolean }> =
  ({ preview, onCancel, onImport, onOpen, canOpen, busy = false }) => <section data-testid="project-import-preview" style={{ marginTop: 12, padding: 8, border: "1px solid #64748b", borderRadius: 6, overflowWrap: "anywhere" }}>
    <strong>{preview.inputKind === "Independent starter project" ? "Starter project ready" : "Import preview"}: {preview.project.metadata.title}</strong>
    <p>{preview.inputKind} · project revision {preview.project.identity.revision}. Nothing has been opened or saved yet. Open project saves it and switches the workspace; saving to the library keeps the current workspace open.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "8px 0 12px" }}>
      <button type="button" data-testid="project-import-open" disabled={!canOpen || !preview.canOpenWorkspace} onClick={onOpen}>Open project</button>
      <button type="button" data-testid="project-import-save" disabled={busy} onClick={onImport}>Save to library</button>
      <button type="button" data-testid="project-import-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
    <strong>Document compatibility</strong>
    {preview.documents.map((document) => <div key={document.id}>{document.module} · revision {document.revision} · replay verified · {document.editable ? "editor supported" : "preview only"}</div>)}
    <strong style={{ display: "block", marginTop: 8 }}>Required Graph capabilities</strong>
    <div>{preview.requiredCapabilities.join(", ") || "None"}</div>
    <strong style={{ display: "block", marginTop: 8 }}>Recorded result engines</strong>
    {preview.engines.length ? preview.engines.map((engine) => <div key={`${engine.name}:${engine.version}`}>{engine.name} {engine.version} · execution/version availability unverified; historical results are retained</div>) : <div>No recorded engine requirement.</div>}
    <strong style={{ display: "block", marginTop: 8 }}>External sidecars ({preview.sidecars.length})</strong>
    {preview.sidecars.map((resource) => <div key={`${resource.kind}:${resource.id}`}>{resource.kind} · {resource.requiredForSource ? "source input" : resource.kind === "volume-payload" ? "optional procedural cache" : "analysis record"} · {resource.available ? "available on this computer" : "missing or unverified"}<small style={{ display: "block" }}>{resource.id} · {resource.checksum ?? "No checksum"}</small></div>)}
    {!preview.sidecars.length && <div>No external source/result sidecars referenced.</div>}
    <p>Project JSON includes resource references. Export with resources transfers verified source bytes and undo/redo buffers; optional analysis caches and thumbnails remain local.</p>
    {preview.reasons.map((reason, index) => <div key={index}>{reason}</div>)}
  </section>;
