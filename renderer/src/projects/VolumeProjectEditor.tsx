import { useEffect, useState } from "react";
import type { VolumeDocumentSource } from "@math3d/core";
import type { VolumeDocumentAdapter } from "../volume/volumeDocumentAdapter";
import { volumeEditorSeed, volumeSourceFromEditor } from "./nativeVolumeRestore";

/** Explicit source commits keep rendering, inspection and navigation from rewriting recipes. */
export const VolumeProjectEditor = ({ adapter, onRestore }: { adapter: VolumeDocumentAdapter; onRestore: () => void }) => {
  const document = adapter.document(), seed = volumeEditorSeed(document);
  const [expression, setExpression] = useState(seed.expression);
  const [parameters, setParameters] = useState(JSON.stringify(seed.parameters, null, 2));
  const [spatial, setSpatial] = useState(JSON.stringify(seed.spatial, null, 2));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setExpression(seed.expression); setParameters(JSON.stringify(seed.parameters, null, 2));
    setSpatial(JSON.stringify(seed.spatial, null, 2)); setError(null);
  }, [adapter, document.identity.revision]);
  const apply = () => {
    try {
      const source = volumeSourceFromEditor(document, { expression, parameters: JSON.parse(parameters), spatial: JSON.parse(spatial) as VolumeDocumentSource["spatial"] });
      adapter.commitSource(source); setError(null); onRestore();
    } catch (failure) { setError((failure as Error).message); }
  };
  const style = { font: "inherit", padding: "4px 8px" };
  const textStyle = { width: "100%", boxSizing: "border-box" as const, fontFamily: "monospace", fontSize: 12 };
  return <div data-testid="project-volume-editor" style={{ padding: "6px 14px", display: "grid", gap: 6, font: "12px/1.4 system-ui", background: "#f8fafc", borderBottom: "1px solid #cbd5e1" }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <span style={{ overflowWrap: "anywhere" }}>{document.metadata.title} · revision {document.identity.revision}</span>
      <label>F(x,y,z) <input data-testid="project-volume-expression" value={expression} onChange={(event) => setExpression(event.target.value)} /></label>
      <button type="button" style={style} data-testid="project-volume-apply" onClick={apply}>Apply source</button>
      <button type="button" style={style} data-testid="project-volume-undo" disabled={!adapter.history().undoDepth} onClick={() => { adapter.undo(); onRestore(); }}>Undo document</button>
      <button type="button" style={style} data-testid="project-volume-redo" disabled={!adapter.history().redoDepth} onClick={() => { adapter.redo(); onRestore(); }}>Redo document</button>
    </div>
    <details>
      <summary>Parameters and grid · {seed.spatial.dimensions.join(" × ")} · {seed.spatial.centering}</summary>
      <div style={{ width: "min(520px, 85vw)", maxHeight: 180, overflow: "auto", display: "grid", gap: 6 }}>
        <label>Recipe parameters <textarea data-testid="project-volume-parameters" rows={3} value={parameters} onChange={(event) => setParameters(event.target.value)} style={textStyle} /></label>
        <label>Grid and units <textarea data-testid="project-volume-spatial" rows={6} value={spatial} onChange={(event) => setSpatial(event.target.value)} style={textStyle} /></label>
        <span>Apply source commits the complete recipe and grid. Projects → Save project keeps edits and history. Sampling uses the saved origin, spacing and centering.</span>
      </div>
    </details>
    {error && <span role="alert">{error}</span>}
  </div>;
};
