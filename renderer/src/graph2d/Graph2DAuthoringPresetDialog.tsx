import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { graph2DAuthoringPresets, type Graph2DAuthoringPresetMode } from "./graph2dAuthoringPresets";

const modeNames: Record<Graph2DAuthoringPresetMode, string> = {
  explicit: "Function", parametric: "Parametric", polar: "Polar", implicit: "Implicit contour",
  "slope-field": "Slope field", "phase-portrait": "Phase portrait", "time-ode": "Time-dependent ODE",
  inequality: "Inequality", piecewise: "Piecewise", "point-series": "Data series",
};

type Props = { mode: Graph2DAuthoringPresetMode; selectedId: string;
  onApply: (id: string) => void; onClose: () => void };

function previewLines(draft: ReturnType<(typeof graph2DAuthoringPresets)[Graph2DAuthoringPresetMode][number]["draft"]>) {
  if ("xExpression" in draft) return [`x(t) = ${draft.xExpression}`, `y(t) = ${draft.yExpression}`];
  if ("rExpression" in draft) return [`r(θ) = ${draft.rExpression}`];
  if ("xDerivative" in draft) return [`x′ = ${draft.xDerivative}`, `y′ = ${draft.yDerivative}`];
  if ("clauses" in draft) return draft.clauses.map(clause => `${clause.expression} ${clause.comparator} 0`);
  if ("pieces" in draft) return draft.pieces.map(piece =>
    `${piece.expression}   (${piece.domain.min} … ${piece.domain.max})`);
  if ("text" in draft) return draft.text.split(/\r?\n/).slice(0, 5);
  if ("expression" in draft) return [draft.expression];
  return [];
}

export function Graph2DAuthoringPresetDialog({ mode, selectedId, onApply, onClose }: Props) {
  const presets = graph2DAuthoringPresets[mode];
  const [query, setQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState(selectedId || presets[0]?.id || "");
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { searchRef.current?.focus(); }, []);
  const filtered = presets.filter(preset => {
    const draft = preset.draft();
    return `${preset.title} ${preset.detail} ${draft.label} ${previewLines(draft).join(" ")}`
      .toLowerCase().includes(query.trim().toLowerCase());
  });
  const highlighted = filtered.find(preset => preset.id === highlightedId) ?? filtered[0];
  const draft = highlighted?.draft();
  const close = () => onClose();
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? []);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return createPortal(<div className="graph2d-preset-overlay" onMouseDown={event => {
    if (event.target === event.currentTarget) close();
  }}>
    <div ref={dialogRef} className="graph2d-preset-dialog" role="dialog" aria-modal="true"
      aria-label={`${modeNames[mode]} presets`} onKeyDown={handleKeyDown}>
      <header><div><h2>{modeNames[mode]} presets</h2>
        <p>Choose a starting example. You can edit every field before saving.</p></div>
        <button type="button" aria-label="Close presets" onClick={close}>×</button></header>
      <label className="graph2d-preset-search">Find a preset
        <input ref={searchRef} type="search" value={query} placeholder="Search by name or formula"
          onChange={event => setQuery(event.target.value)} /></label>
      <div className="graph2d-preset-dialog-body">
        <div className="graph2d-preset-results" aria-label="Preset results">
          {filtered.length ? filtered.map(preset => {
            const example = preset.draft();
            return <button type="button" key={preset.id} className="graph2d-preset-card"
              aria-pressed={highlighted?.id === preset.id} onClick={() => setHighlightedId(preset.id)}
              onDoubleClick={() => onApply(preset.id)}>
              <span className="graph2d-preset-card-title"><i style={{ backgroundColor: example.style.color }} />{preset.title}</span>
              <small>{preset.detail}</small>
            </button>;
          }) : <p className="graph2d-preset-empty">No presets match “{query}”.</p>}
        </div>
        <section className="graph2d-preset-detail" aria-label="Selected preset preview">
          {highlighted && draft ? <><h3>{highlighted.title}</h3><p>{highlighted.detail}</p>
            <span className="graph2d-preset-detail-label">Preview of fields</span>
            <strong>{draft.label}</strong>
            <pre>{previewLines(draft).join("\n")}</pre>
            {"domain" in draft && <small>Domain: {draft.domain.min} to {draft.domain.max}</small>}
            {"yDomain" in draft && <small>Y: {draft.yDomain.min} to {draft.yDomain.max}</small>}
            <small>Color <i className="graph2d-preset-swatch" style={{ backgroundColor: draft.style.color }} /> {draft.style.color}</small>
            <small>This preset fills the editor. Review the graph before creating it.</small>
          </> : <p>Select a preset to preview its fields.</p>}
        </section>
      </div>
      <footer><span>{filtered.length} of {presets.length} presets</span>
        <button type="button" onClick={close}>Cancel</button>
        <button type="button" disabled={!highlighted} onClick={() => highlighted && onApply(highlighted.id)}>Use preset</button>
      </footer>
    </div>
  </div>, document.body);
}
