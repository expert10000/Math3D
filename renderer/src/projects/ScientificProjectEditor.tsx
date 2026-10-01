import React, { useEffect, useState } from "react";
import { COMPLEX_COMMAND_TYPES, type CanonicalJsonValue } from "@math3d/core";
import type { ComplexAnalysisCommandAdapter } from "../math/complexCommandAdapter";
import type { ComplexPreviewMapSpec } from "../math/complexPreviewArtifacts";
import { complexEditorSeed } from "./nativeScientificRestore";

/** Source controls for a restored native Complex document, alongside Function Explorer. */
export const ScientificProjectEditor = ({ adapter, spec, onChange, onRestore }: {
  adapter: ComplexAnalysisCommandAdapter; spec: ComplexPreviewMapSpec;
  onChange: (patch: Partial<ComplexPreviewMapSpec>) => void; onRestore: () => void;
}) => {
  const document = adapter.document();
  const [branch, setBranch] = useState(() => JSON.stringify(document.branchPolicy, null, 2));
  const [contours, setContours] = useState(() => JSON.stringify(document.contours, null, 2));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setBranch(JSON.stringify(document.branchPolicy, null, 2)); setContours(JSON.stringify(document.contours, null, 2)); setError(null); }, [adapter, document.identity.revision]);
  const commit = (field: "branch" | "contours") => {
    try {
      const value = JSON.parse(field === "branch" ? branch : contours) as CanonicalJsonValue;
      // Preflight the host adapter before accepting a branch outside its supported range.
      if (field === "branch") complexEditorSeed({ ...document, branchPolicy: value as unknown as typeof document.branchPolicy });
      adapter.commit(field === "branch" ? COMPLEX_COMMAND_TYPES.setBranchPolicy : COMPLEX_COMMAND_TYPES.setContours, value);
      setError(null); onRestore();
    } catch (failure) { setError(String((failure as Error).message ?? failure)); }
  };
  const controlStyle: React.CSSProperties = { font: "inherit", padding: "4px 8px" };
  const sourceStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontFamily: "Consolas, monospace", fontSize: 12 };
  return <div data-testid="project-scientific-editor" style={{ padding: "6px 14px", display: "grid", gap: 6, fontFamily: "system-ui, sans-serif", fontSize: 12, lineHeight: 1.4, background: "#f8fafc", borderBottom: "1px solid #cbd5e1" }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <span style={{ overflowWrap: "anywhere" }}>Saved Complex · {document.identity.id} · revision {document.identity.revision}</span>
    <label>f(z) <input data-testid="project-complex-function" value={spec.fExpr} onChange={(event) => onChange({ inputMode: "fz", fExpr: event.target.value })} /></label>
    <div style={{ display: "flex", gap: 6 }}>
    <button type="button" style={controlStyle} data-testid="project-scientific-undo" disabled={!adapter.history().undoDepth} onClick={() => { adapter.undo(); onRestore(); }}>Undo document</button>
    <button type="button" style={controlStyle} data-testid="project-scientific-redo" disabled={!adapter.history().redoDepth} onClick={() => { adapter.redo(); onRestore(); }}>Redo document</button>
    </div>
    <span>Projects → Save project keeps these edits.</span>
    </div>
    <details>
      <summary>Branch and contours ({document.contours.length})</summary>
      <div style={{ display: "grid", gap: 6, width: "min(520px, 85vw)", maxHeight: 180, overflow: "auto", marginTop: 6 }}>
        <label>Branch policy <textarea data-testid="project-complex-branch" rows={5} value={branch} onChange={(event) => setBranch(event.target.value)} style={sourceStyle} /></label>
        <button type="button" style={controlStyle} data-testid="project-complex-branch-apply" onClick={() => commit("branch")}>Apply branch policy</button>
        <label>Saved contours <textarea data-testid="project-complex-contours" rows={5} value={contours} onChange={(event) => setContours(event.target.value)} style={sourceStyle} /></label>
        <button type="button" style={controlStyle} data-testid="project-complex-contours-apply" onClick={() => commit("contours")}>Apply contours</button>
        <span>All contours remain in the document. Function Explorer displays the first contour; analysis uses the selected path.</span>
      </div>
    </details>
    {error && <span role="alert">{error}</span>}
  </div>;
};
