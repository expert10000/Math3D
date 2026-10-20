import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { parseGraph2DExpression, sampleGraph2DImplicit } from "@math3d/core";
import { graph2DAuthoringPresets, graph2DImplicitCategories, type Graph2DAuthoringPresetMode,
  type Graph2DImplicitPreset } from "./graph2dAuthoringPresets";

const modeNames: Record<Graph2DAuthoringPresetMode, string> = {
  explicit: "Function", parametric: "Parametric", polar: "Polar", implicit: "Implicit contour",
  "slope-field": "Slope field", "phase-portrait": "Phase portrait", "time-ode": "Time-dependent ODE",
  inequality: "Inequality", piecewise: "Piecewise", "point-series": "Data series",
};

type Props = { mode: Graph2DAuthoringPresetMode; selectedId: string;
  onApply: (id: string) => void; onClose: () => void };
type AnyPreset = (typeof graph2DAuthoringPresets)[Graph2DAuthoringPresetMode][number];
const isImplicitPreset = (preset: AnyPreset): preset is Graph2DImplicitPreset => "category" in preset;

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

function ImplicitContourThumbnail({ preset }: { preset: Graph2DImplicitPreset }) {
  const preview = useMemo(() => {
    const draft = preset.draft();
    const parsed = parseGraph2DExpression(draft.expression, ["x", "y"]);
    if (!parsed.ok) return null;
    const width = 300, height = 210;
    const viewport = { xMin: draft.domain.min, xMax: draft.domain.max,
      yMin: draft.yDomain.min, yMax: draft.yDomain.max, aspect: "free" as const };
    const artifact = sampleGraph2DImplicit({ object: { id: "preset-preview", kind: "implicit", label: draft.label,
      expression: { source: draft.expression, variable: "xy", ast: parsed.ast },
      domain: draft.domain, yDomain: draft.yDomain }, viewport, width, height,
      policy: { maxSamples: 2400, maxDepth: 8, tolerancePx: 1.5 }, deadlineMs: Date.now() + 160 });
    const px = (x: number) => (x - viewport.xMin) / (viewport.xMax - viewport.xMin) * width;
    const py = (y: number) => height - (y - viewport.yMin) / (viewport.yMax - viewport.yMin) * height;
    const path = artifact.segments.map(segment => segment.points.map((point, index) =>
      `${index ? "L" : "M"}${px(point.x).toFixed(2)},${py(point.y).toFixed(2)}`).join(" ")).join(" ");
    return { path, count: artifact.segments.length, incomplete: !artifact.converged,
      xAxis: viewport.yMin <= 0 && viewport.yMax >= 0 ? py(0) : null,
      yAxis: viewport.xMin <= 0 && viewport.xMax >= 0 ? px(0) : null, color: draft.style.color };
  }, [preset]);
  return <figure className="graph2d-implicit-preset-figure">
    <svg viewBox="0 0 300 210" role="img" aria-label={`${preset.title} sampled contour preview`}>
      <rect width="300" height="210" />
      {preview?.xAxis !== null && preview?.xAxis !== undefined &&
        <line x1="0" x2="300" y1={preview.xAxis} y2={preview.xAxis} />}
      {preview?.yAxis !== null && preview?.yAxis !== undefined &&
        <line x1={preview.yAxis} x2={preview.yAxis} y1="0" y2="210" />}
      {preview?.path && <path d={preview.path} stroke={preview.color} />}
    </svg>
    <figcaption>{preview ? `${preview.count} sampled paths${preview.incomplete ? " · needs closer inspection" : ""}` :
      "Preview unavailable"}</figcaption>
  </figure>;
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
    const metadata = isImplicitPreset(preset) ? `${preset.category} ${preset.properties} ${preset.expected}` : "";
    return `${preset.title} ${preset.detail} ${draft.label} ${previewLines(draft).join(" ")} ${metadata}`
      .toLowerCase().includes(query.trim().toLowerCase());
  });
  const groups = mode === "implicit" ? graph2DImplicitCategories.map(category => ({
    title: category, entries: filtered.filter(preset => isImplicitPreset(preset) && preset.category === category),
  })).filter(group => group.entries.length) : [{ title: "", entries: filtered }];
  const highlighted = filtered.find(preset => preset.id === highlightedId) ?? filtered[0];
  const draft = highlighted?.draft();
  const implicitHighlighted = highlighted && isImplicitPreset(highlighted) ? highlighted : null;
  const implicitDraft = implicitHighlighted?.draft();
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
          {filtered.length ? groups.map(group => <section key={group.title} className="graph2d-preset-group">
            {group.title && <h3>{group.title} <small>{group.entries.length}</small></h3>}
            {group.entries.map(preset => {
            const example = preset.draft();
            return <button type="button" key={preset.id} className="graph2d-preset-card"
              aria-pressed={highlighted?.id === preset.id} onClick={() => setHighlightedId(preset.id)}
              onDoubleClick={() => onApply(preset.id)}>
              <span className="graph2d-preset-card-title"><i style={{ backgroundColor: example.style.color }} />{preset.title}</span>
              <small>{preset.detail}</small>
            </button>;
          })}</section>) : <p className="graph2d-preset-empty">No presets match “{query}”.</p>}
        </div>
        <section className="graph2d-preset-detail" aria-label="Selected preset preview">
          {highlighted && draft ? <><h3>{highlighted.title}</h3><p>{highlighted.detail}</p>
            {implicitHighlighted && implicitDraft && <><small className="graph2d-preset-category">{implicitHighlighted.category}</small>
              <ImplicitContourThumbnail preset={implicitHighlighted} />
              <dl className="graph2d-implicit-preset-facts">
                <dt>Equation</dt><dd><code>{implicitHighlighted.equation}</code></dd>
                <dt>Properties</dt><dd>{implicitHighlighted.properties}</dd>
                <dt>Expected contour</dt><dd>{implicitHighlighted.expected}</dd>
                {implicitHighlighted.expectedComponents !== undefined && <><dt>Expected components</dt>
                  <dd>{implicitHighlighted.expectedComponents} in the default viewport</dd></>}
                <dt>Default viewport</dt><dd>x: {implicitDraft.domain.min} to {implicitDraft.domain.max}; y: {implicitDraft.yDomain.min} to {implicitDraft.yDomain.max}</dd>
              </dl></>}
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
