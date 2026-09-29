import { useEffect, useRef, useState } from "react";
import { graph2DGridFields, graph2DAxesFromGridFields, type Graph2DDocument, type Graph2DGridFields } from "@math3d/core";
export function Graph2DGridPanel({ document, onCommit, onClose }: { document: Graph2DDocument;
  onCommit: (axes: Graph2DDocument["display"]["axes"]) => void; onClose: () => void }) {
  const [fields, setFields] = useState(() => graph2DGridFields(document)), [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null), polar = document.display.axes.gridMode === "polar";
  useEffect(() => { panel.current?.querySelector<HTMLInputElement>("input")?.focus(); }, []);
  const update = <K extends keyof Graph2DGridFields>(key: K, value: Graph2DGridFields[K]) => setFields(f => ({ ...f, [key]: value }));
  return <aside ref={panel} className="graph2d-parameters-panel graph2d-grid-panel" aria-label="Grid settings" data-testid="graph2d-grid-settings"
    onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
    <header><h2>Grid settings</h2><button onClick={onClose}>Close grid settings</button></header>
    <p>Display only: formulas, authored ranges and analysis stay unchanged.</p>
    <form onSubmit={e => { e.preventDefault(); try { onCommit(graph2DAxesFromGridFields(document, fields)); setError(""); } catch (caught) { setError((caught as Error).message); } }}>
      {([["grid", "Show grid"], ["x", "Show X axis"], ["y", "Show Y axis"], ["labels", "Show numbers"], ["minor", "Show minor subdivisions"]] as const).map(([key, label]) =>
        <label key={key}><input type="checkbox" checked={fields[key]} onChange={e => update(key, e.target.checked)} />{label}</label>)}
      <label>Grid density<select aria-label="Grid density" value={fields.density} onChange={e => update("density", e.target.value as Graph2DGridFields["density"])}>
        <option value="sparse">Sparse</option><option value="normal">Normal</option><option value="dense">Dense</option></select></label>
      <label>Grid contrast<select aria-label="Grid contrast" value={fields.contrast} onChange={e => update("contrast", e.target.value as Graph2DGridFields["contrast"])}>
        <option value="subtle">Subtle</option><option value="normal">Normal</option><option value="strong">Strong</option></select></label>
      {(["x", "y"] as const).map(axis => <label key={axis}>{axis.toUpperCase()} spacing ({document.display.viewport[`${axis}Scale`] === "log10" ? "integer decades" : "world units"})
        <input aria-label={`${axis.toUpperCase()} grid spacing`} disabled={polar} placeholder="Auto" value={fields[`${axis}Step`]} onChange={e => update(`${axis}Step`, e.target.value)} /></label>)}
      <p>Blank spacing means Auto. Density controls Auto spacing. Log spacing is integer decades (1–100). Polar grids use Auto rings and rays. Dense or unresolved lines are omitted with a notice.</p>
      <button>Apply grid settings</button>
    </form>{error && <p role="alert">{error}</p>}
  </aside>;
}
