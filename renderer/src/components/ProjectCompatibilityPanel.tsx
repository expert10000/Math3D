import React, { useState } from "react";
import type { PlatformCapabilitySnapshot } from "@math3d/core";
import type { ProjectCompatibility } from "../projects/projectTransfer";
import type { ProjectMigrationPlan } from "../projects/projectMigrationPlan";
import { probeRendererPlatformCapabilities } from "../kernel/rendererPlatformCapabilities";
import { resolveProjectJourneys } from "../projects/projectJourneyCapabilities";

export const projectImportControls = (preview: ProjectCompatibility,
  host: PlatformCapabilitySnapshot, canRestore: boolean, busy: boolean) => {
  const journeys = resolveProjectJourneys(host, preview);
  return {
    canSave: journeys.projectSave.mode === "open" && !busy,
    canOpen: journeys.projectSave.mode === "open" && journeys.project.mode === "open" && canRestore && !busy,
    reason: journeys.projectSave.mode !== "open" ? journeys.projectSave.reason :
      !canRestore ? "This host cannot restore a Project workspace." :
        journeys.project.mode !== "open" ? journeys.project.reason : null,
  };
};
export const ProjectCompatibilityPanel: React.FC<{ preview: ProjectCompatibility & { inputKind: string; migration?: ProjectMigrationPlan }; onCancel: () => void; onImport: () => void; onOpen: () => void; onDownloadOriginal?: () => void; canOpen: boolean; openLimit?: string | null; busy?: boolean }> =
  ({ preview, onCancel, onImport, onOpen, onDownloadOriginal, canOpen, openLimit, busy = false }) => {
    const [host] = useState(probeRendererPlatformCapabilities);
    const controls = projectImportControls(preview, host, canOpen, busy);
    return <section data-testid="project-import-preview" style={{ marginTop: 12, padding: 8, border: "1px solid #64748b", borderRadius: 6, overflowWrap: "anywhere" }}>
    <strong>{preview.inputKind === "Independent starter project" ? "Starter project ready" : "Import preview"}: {preview.project.metadata.title}</strong>
    <p>{preview.inputKind} · project revision {preview.project.identity.revision}. Nothing has been opened or saved yet. Open project saves it and switches the workspace; saving to the library keeps the current workspace open.</p>
    {preview.migration && <div data-testid="project-migration-review" role="region" aria-label="Migration review">
      <strong>Migration review</strong>
      <p>Original {preview.migration.source.format} version {preview.migration.source.version} · {preview.migration.source.byteLength.toLocaleString()} bytes · SHA-256 {preview.migration.source.sha256}. The original file remains unchanged.</p>
      <p>Target named Project: {preview.project.identity.id}. {preview.migration.requiresCopy ? "A new Project identity is reserved for this import." : "The saved Project identity is preserved."}</p>
      <ul>{preview.migration.steps.map(step => <li key={step.code}>{step.description}</li>)}</ul>
      {onDownloadOriginal && <button type="button" data-testid="project-migration-download-original" onClick={onDownloadOriginal}>Download exact original bytes</button>}
    </div>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "8px 0 12px" }}>
      <button type="button" data-testid="project-import-open" disabled={!controls.canOpen} onClick={onOpen}>Open project</button>
      <button type="button" data-testid="project-import-save" disabled={!controls.canSave} onClick={onImport}>Save to library</button>
      <button type="button" data-testid="project-import-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
    {(controls.reason || openLimit) && <p role="status" data-testid="project-import-limit" style={{ color: "#9a3412" }}>{host.facilities.persistentStorage.available ? openLimit || controls.reason : controls.reason}</p>}
    <strong>Document compatibility</strong>
    {preview.documents.map((document) => <div key={document.id}>{document.module} · revision {document.revision} · replay verified · {document.readOnly ? "read-only document; external source re-verified before open" : document.editable ? "editor supported" : "preview only"}</div>)}
    <strong style={{ display: "block", marginTop: 8 }}>Required Graph capabilities</strong>
    <div>{preview.requiredCapabilities.join(", ") || "None"}</div>
    <strong style={{ display: "block", marginTop: 8 }}>Recorded result engines</strong>
    {preview.engines.length ? preview.engines.map((engine) => <div key={`${engine.name}:${engine.version}`}>{engine.name} {engine.version} · execution/version availability unverified; historical results are retained</div>) : <div>No recorded engine requirement.</div>}
    <strong style={{ display: "block", marginTop: 8 }}>External sidecars ({preview.sidecars.length})</strong>
    {preview.sidecars.map((resource) => <div key={`${resource.kind}:${resource.id}`}>{resource.kind} · {resource.requiredForSource ? "source input" : resource.kind === "volume-payload" ? "optional procedural cache" : "analysis record"} · {resource.available ? "available on this computer" : "missing or unverified"}<small style={{ display: "block" }}>{resource.id} · {resource.checksum ?? "No checksum"}</small></div>)}
    {!preview.sidecars.length && <div>No external source/result sidecars referenced.</div>}
    {!!preview.project.workspace.entries.filter((entry) => entry.module === "quantum").length &&
      <p>Quantum scene documents retain external `.qscene` paths and fingerprints. The complete bundles are not embedded in Project exports; opening re-verifies each source, and a missing or changed source prevents activation.</p>}
    <p>Project JSON includes resource references. Export with resources transfers verified Math3D source bytes and undo/redo buffers, not external quantum scenes; optional analysis caches and thumbnails remain local.</p>
    {preview.reasons.map((reason, index) => <div key={index}>{reason}</div>)}
  </section>;
  };
