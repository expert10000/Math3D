import React, { useState } from "react";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { subdivideWithRetainedMeshCheckpoint, transformWithRetainedMeshSnapshot } from "./retainedMeshGeneration";

export const MeshProjectEditor: React.FC<{ adapter: MeshDocumentAdapter; onRestore: () => void }> = ({ adapter, onRestore }) => {
  const [translation, setTranslation] = useState(["0", "0", "0"]), [scale, setScale] = useState("1");
  const [selection, setSelection] = useState(JSON.stringify(adapter.selection()));
  const [error, setError] = useState("");
  const [comparisonStatus, setComparisonStatus] = useState("");
  const run = (action: () => void) => {
    try { action(); setSelection(JSON.stringify(adapter.selection())); setError(""); onRestore(); }
    catch (failure) { setError((failure as Error).message); }
  };
  return <div data-testid="project-mesh-editor" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "6px 14px", overflowWrap: "anywhere" }}>
    <span>Saved Mesh · {adapter.document().metadata.label} · revision {adapter.document().identity.revision}</span>
    {translation.map((value, index) => <label key={index}>{["dx", "dy", "dz"][index]} <input data-testid={`project-mesh-translate-${index}`} type="number" value={value} onChange={(event) => setTranslation((values) => values.map((entry, axis) => axis === index ? event.target.value : entry))} style={{ width: 65 }} /></label>)}
    <label>Scale <input data-testid="project-mesh-scale" type="number" value={scale} onChange={(event) => setScale(event.target.value)} style={{ width: 65 }} /></label>
    <button type="button" data-testid="project-mesh-apply" onClick={() => run(() => {
      const offsets = translation.map(Number), factor = Number(scale);
      if (translation.some((value) => !value.trim()) || !scale.trim() || !offsets.every(Number.isFinite) || !Number.isFinite(factor) || factor <= 0) throw new TypeError("Enter finite translation values and a positive scale.");
      const mesh = adapter.mesh(), positions = mesh.positions.map((value, index) => value * factor + offsets[index % 3]!);
      if (!positions.every(Number.isFinite)) throw new TypeError("Transform exceeds the mesh coordinate range.");
      adapter.replaceMesh({ ...mesh, positions }, "object-edit", { translation: offsets, scale: factor });
    })}>Apply transform</button>
    <button type="button" data-testid="project-mesh-retain-subdivide" onClick={() => run(() => {
      const { before, after } = subdivideWithRetainedMeshCheckpoint(adapter);
      setComparisonStatus(`Retained Mesh r${before.identity.revision} (${before.identity.structuralHash}) and current r${after.identity.revision} (${after.identity.structuralHash}). Open Projects → Compare saved documents and choose two generations of this Mesh. Save the composition and Project to keep the sidecars.`);
    })}>Retain before and subdivide once</button>
    <button type="button" data-testid="project-mesh-retain-transform" onClick={() => run(() => {
      const offsets = translation.map(Number);
      if (translation.some(value => !value.trim()) || !scale.trim()) throw new TypeError("Enter finite translation values and a positive scale.");
      const { before, after } = transformWithRetainedMeshSnapshot(adapter,
        offsets as [number, number, number], Number(scale));
      setComparisonStatus(`Retained Mesh r${before.identity.revision} (${before.identity.structuralHash}) and current r${after.identity.revision} (${after.identity.structuralHash}). Open Projects → Compare saved documents and choose two generations of this Mesh.`);
    })}>Retain before and apply transform</button>
    <button type="button" data-testid="project-mesh-undo" disabled={!adapter.history().undoDepth} onClick={() => run(() => { adapter.undo(); })}>Undo</button>
    <button type="button" data-testid="project-mesh-redo" disabled={!adapter.history().redoDepth} onClick={() => run(() => { adapter.redo(); })}>Redo</button>
    <details style={{ maxWidth: "100%" }}><summary>Saved selection</summary>
      <label>Entity IDs <input data-testid="project-mesh-selection" value={selection} onChange={(event) => setSelection(event.target.value)} style={{ maxWidth: "100%" }} /></label>
      <button type="button" data-testid="project-mesh-select" onClick={() => run(() => { const ids: unknown = JSON.parse(selection); if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new TypeError("Selection must be an array of entity IDs."); adapter.commitSelection(ids); })}>Apply selection</button>
    </details>
    {error && <span role="alert" data-testid="project-mesh-error">{error}</span>}
    {comparisonStatus && <small role="status" data-testid="project-mesh-retained-status">{comparisonStatus}</small>}
      <small>Retain before a supported edit to make that exact revision selectable in Projects → Compare saved documents. At most eight generations can be retained. Projects → Save project keeps their checked sidecars.</small>
  </div>;
};
