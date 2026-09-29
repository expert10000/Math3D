import { useState } from "react";
import { graph2DScaleFields, graph2DViewportFromScaleFields, GRAPH2D_SCALE_GUIDANCE, type Graph2DDocument, type Graph2DViewport } from "@math3d/core";
export function Graph2DScalePanel({ document, onCommit, onClose }: { document: Graph2DDocument; onCommit: (v: Graph2DViewport) => void; onClose: () => void }) {
  const [fields, setFields] = useState(() => graph2DScaleFields(document.display.viewport)), [error, setError] = useState("");
  return <aside className="graph2d-parameters-panel" aria-label="Axis scales" data-testid="graph2d-scales"
    onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
    <header><h2>Axis scales</h2><button onClick={onClose}>Close scales</button></header><p>{GRAPH2D_SCALE_GUIDANCE}</p>
    <form onSubmit={e => { e.preventDefault(); try { onCommit(graph2DViewportFromScaleFields(document, fields)); setError(""); } catch (caught) { setError((caught as Error).message); } }}>
      {(["xScale", "yScale"] as const).map(key => <label key={key}>{key === "xScale" ? "X scale" : "Y scale"}<select aria-label={key === "xScale" ? "X scale" : "Y scale"} value={fields[key]} onChange={e => setFields({ ...fields, [key]: e.target.value as "linear" | "log10" })}>
        <option value="linear">Linear</option><option value="log10">Logarithmic (base 10)</option></select></label>)}
      <label>Axis aspect<select aria-label="Axis aspect" value={fields.aspect} onChange={e => setFields({ ...fields, aspect: e.target.value as "free" | "equal" })}><option value="free">Free</option><option value="equal">Equal world units</option></select></label>
      {(["xMin", "xMax", "yMin", "yMax"] as const).map(key => <label key={key}>Axis {key}<input value={fields[key]} onChange={e => setFields({ ...fields, [key]: e.target.value })} /></label>)}
      <button>Apply scales and bounds</button>
    </form>{error && <p role="alert">{error}</p>}
  </aside>;
}
