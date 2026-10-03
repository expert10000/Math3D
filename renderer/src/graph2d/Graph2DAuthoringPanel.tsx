import { GRAPH2D_MAX_OBJECTS, validateGraph2DFunctionDraft, validateGraph2DParametricDraft,
  validateGraph2DPolarDraft, validateGraph2DImplicitDraft, validateGraph2DInequalityDraft,
  validateGraph2DPiecewiseDraft,
  previewGraph2DPointImport, graph2DPointDomain,
  type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DFunctionDraft,
  type Graph2DParametricDraft, type Graph2DPolarDraft, type Graph2DImplicitDraft,
  type Graph2DInequalityDraft, type Graph2DPointSeriesDraft, type Graph2DPiecewiseDraft } from "@math3d/core";
import { useState } from "react";
import { pointTableStore } from "./pointTableStore";

export type Graph2DLeftPalette = "classic" | "geometry";
type Props = { document: Graph2DDocument; onCommit?: (action: Graph2DAuthoringAction) => void;
  onSelect?: (objectId: string) => void; palette: Graph2DLeftPalette;
  onPaletteChange: (palette: Graph2DLeftPalette) => void };
const initialDraft = (): Graph2DFunctionDraft => ({ label: "f", expression: "x",
  domain: { min: -10, max: 10, includeMin: true, includeMax: true },
  style: { visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" } });
const initialParametricDraft = (): Graph2DParametricDraft => ({ label: "p", xExpression: "cos(t)",
  yExpression: "sin(t)", domain: { min: 0, max: 6.283185307179586, includeMin: true, includeMax: true },
  style: { visible: true, color: "#e11d48", lineWidth: 2, lineStyle: "solid" } });
const initialPolarDraft = (): Graph2DPolarDraft => ({ label: "r", rExpression: "2*cos(theta)",
  domain: { min: 0, max: 2 * Math.PI, includeMin: true, includeMax: true },
  style: { visible: true, color: "#7c3aed", lineWidth: 2, lineStyle: "solid" } });
const initialImplicitDraft = (): Graph2DImplicitDraft => ({ label: "contour", expression: "x^2+y^2-4",
  domain: { min: -10, max: 10, includeMin: true, includeMax: true },
  yDomain: { min: -10, max: 10, includeMin: true, includeMax: true },
  style: { visible: true, color: "#059669", lineWidth: 2, lineStyle: "solid" } });
const initialInequalityDraft = (): Graph2DInequalityDraft => ({ label: "region",
  clauses: [{ expression: "x^2+y^2-4", comparator: "<=" }], operator: "all",
  domain: { min: -10, max: 10, includeMin: true, includeMax: true },
  yDomain: { min: -10, max: 10, includeMin: true, includeMax: true },
  style: { visible: true, color: "#0d9488", lineWidth: 2, lineStyle: "solid" } });
type PointDraftState = { label: string; mode: "points" | "line";
  style: Graph2DPointSeriesDraft["style"]; text: string };
const initialPointDraft = (): PointDraftState => ({ label: "data", mode: "points",
  style: { visible: true, color: "#ea580c", lineWidth: 2, lineStyle: "solid" },
  text: "x,y\n0,0\n1,1\n2,4" });
const initialPiecewiseDraft = (): Graph2DPiecewiseDraft => ({ label: "piecewise",
  pieces: [
    { expression: "-x", domain: { min: -10, max: 0, includeMin: true, includeMax: false } },
    { expression: "x", domain: { min: 0, max: 10, includeMin: true, includeMax: true } },
  ], style: { visible: true, color: "#9333ea", lineWidth: 2, lineStyle: "solid" } });

export function Graph2DAuthoringPanel({ document, onCommit, onSelect, palette, onPaletteChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Graph2DFunctionDraft>(initialDraft);
  const [parametricDraft, setParametricDraft] = useState<Graph2DParametricDraft>(initialParametricDraft);
  const [polarDraft, setPolarDraft] = useState<Graph2DPolarDraft>(initialPolarDraft);
  const [implicitDraft, setImplicitDraft] = useState<Graph2DImplicitDraft>(initialImplicitDraft);
  const [inequalityDraft, setInequalityDraft] = useState<Graph2DInequalityDraft>(initialInequalityDraft);
  const [pointDraft, setPointDraft] = useState(initialPointDraft);
  const [piecewiseDraft, setPiecewiseDraft] = useState<Graph2DPiecewiseDraft>(initialPiecewiseDraft);
  const [mode, setMode] = useState<"explicit" | "parametric" | "polar" | "implicit" | "inequality" | "point-series" | "piecewise">("explicit");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const variables = ["x", ...document.source.variables.map((entry) => entry.name)];
  const pointPreview = mode === "point-series" ? previewGraph2DPointImport(pointDraft.text) : null;
  const errors = mode === "explicit" ? validateGraph2DFunctionDraft(draft, variables) :
    mode === "point-series" ? [...(pointPreview?.errors ?? []),
      ...(!pointDraft.label.trim() || pointDraft.label !== pointDraft.label.trim() || pointDraft.label.length > 160 ?
        ["Enter a label of 1–160 characters without surrounding spaces."] : [])] :
    mode === "piecewise" ? validateGraph2DPiecewiseDraft(piecewiseDraft, variables) :
    mode === "inequality" ? validateGraph2DInequalityDraft(inequalityDraft,
      ["x", "y", ...document.source.variables.map((entry) => entry.name)]) :
    mode === "implicit" ? validateGraph2DImplicitDraft(implicitDraft,
      ["x", "y", ...document.source.variables.map((entry) => entry.name)]) :
    mode === "parametric" ? validateGraph2DParametricDraft(parametricDraft,
      ["t", ...document.source.variables.map((entry) => entry.name)]) :
      validateGraph2DPolarDraft(polarDraft, ["theta", ...document.source.variables.map((entry) => entry.name)]);
  const commit = (action: Graph2DAuthoringAction) => {
    try { onCommit?.(action); setMessage(""); return true; }
    catch (error) { setMessage(String((error as Error).message ?? error)); return false; }
  };
  const beginCreate = () => { setMode("explicit"); setEditingId(null); setDraft(initialDraft()); setMessage(""); setOpen(true); };
  const beginCreateParametric = () => { setMode("parametric"); setEditingId(null);
    setParametricDraft(initialParametricDraft()); setMessage(""); setOpen(true); };
  const beginCreatePolar = () => { setMode("polar"); setEditingId(null);
    setPolarDraft(initialPolarDraft()); setMessage(""); setOpen(true); };
  const beginCreateImplicit = () => { setMode("implicit"); setEditingId(null);
    setImplicitDraft(initialImplicitDraft()); setMessage(""); setOpen(true); };
  const beginCreateInequality = () => { setMode("inequality"); setEditingId(null);
    setInequalityDraft(initialInequalityDraft()); setMessage(""); setOpen(true); };
  const beginCreatePointSeries = () => { setMode("point-series"); setEditingId(null);
    setPointDraft(initialPointDraft()); setMessage(""); setOpen(true); };
  const beginCreatePiecewise = () => { setMode("piecewise"); setEditingId(null);
    setPiecewiseDraft(initialPiecewiseDraft()); setMessage(""); setOpen(true); };
  const beginEdit = (id: string) => {
    const object = document.source.objects.find((entry) => entry.id === id);
    const style = document.display.objects.find((entry) => entry.objectId === id);
    if (!object || !style) return;
    setEditingId(id);
    if (object.kind === "explicit-cartesian") {
      setMode("explicit"); setDraft({ label: object.label, expression: object.expression.source, domain: object.domain,
        style: { visible: style.visible, color: style.color, lineWidth: style.lineWidth, lineStyle: style.lineStyle } });
    } else if (object.kind === "parametric") {
      setMode("parametric"); setParametricDraft({ label: object.label,
        xExpression: object.xExpression.source, yExpression: object.yExpression.source, domain: object.domain,
        style: { visible: style.visible, color: style.color, lineWidth: style.lineWidth, lineStyle: style.lineStyle } });
    } else if (object.kind === "polar") {
      setMode("polar"); setPolarDraft({ label: object.label, rExpression: object.rExpression.source,
        domain: object.domain,
        style: { visible: style.visible, color: style.color, lineWidth: style.lineWidth, lineStyle: style.lineStyle } });
    } else if (object.kind === "implicit") {
      setMode("implicit"); setImplicitDraft({ label: object.label, expression: object.expression.source,
        domain: object.domain, yDomain: object.yDomain,
        style: { visible: style.visible, color: style.color, lineWidth: style.lineWidth, lineStyle: style.lineStyle } });
    } else if (object.kind === "inequality") {
      setMode("inequality"); setInequalityDraft({ label: object.label,
        clauses: object.clauses.map((clause) => ({ expression: clause.source, comparator: clause.comparator })),
        operator: object.operator, domain: object.domain, yDomain: object.yDomain,
        style: { visible: style.visible, color: style.color, lineWidth: style.lineWidth, lineStyle: style.lineStyle } });
    } else if (object.kind === "point-series") {
      const rows = pointTableStore.resolve(object.table);
      setMode("point-series"); setPointDraft({ label: object.label, mode: object.mode,
        style: { visible: style.visible, color: style.color, lineWidth: style.lineWidth,
          lineStyle: style.lineStyle },
        text: rows ? `x,y\n${rows.map((row) => `${row.x},${row.y ?? ""}`).join("\n")}` : "" });
    } else {
      setMode("piecewise"); setPiecewiseDraft({ label: object.label,
        pieces: object.pieces.map((piece) => ({ expression: piece.expression.source, domain: piece.domain })),
        style: { visible: style.visible, color: style.color, lineWidth: style.lineWidth, lineStyle: style.lineStyle } });
    }
    setMessage(""); setOpen(true);
  };
  const save = () => {
    if (errors.length) return;
    if (mode === "point-series") {
      try {
        const rows = pointPreview!.rows;
        const table = pointTableStore.publish(rows);
        const pointSeries: Graph2DPointSeriesDraft = { label: pointDraft.label, mode: pointDraft.mode,
          table, domain: graph2DPointDomain(rows), style: pointDraft.style };
        const action: Graph2DAuthoringAction = editingId ?
          { type: "edit-point-series", objectId: editingId, draft: pointSeries } :
          { type: "create-point-series", draft: pointSeries };
        if (commit(action)) { setOpen(false); setEditingId(null); setPointDraft(initialPointDraft()); }
      } catch (error) { setMessage(String((error as Error).message ?? error)); }
      return;
    }
    const action: Graph2DAuthoringAction = mode === "explicit" ?
      editingId ? { type: "edit", objectId: editingId, draft } : { type: "create", draft } :
      mode === "piecewise" ? editingId ? { type: "edit-piecewise", objectId: editingId, draft: piecewiseDraft } :
        { type: "create-piecewise", draft: piecewiseDraft } :
      mode === "inequality" ? editingId ? { type: "edit-inequality", objectId: editingId, draft: inequalityDraft } :
        { type: "create-inequality", draft: inequalityDraft } :
      mode === "implicit" ? editingId ? { type: "edit-implicit", objectId: editingId, draft: implicitDraft } :
        { type: "create-implicit", draft: implicitDraft } :
      mode === "parametric" ? editingId ? { type: "edit-parametric", objectId: editingId, draft: parametricDraft } :
        { type: "create-parametric", draft: parametricDraft } :
        editingId ? { type: "edit-polar", objectId: editingId, draft: polarDraft } :
          { type: "create-polar", draft: polarDraft };
    if (commit(action)) {
      setOpen(false); setEditingId(null); setDraft(initialDraft()); setParametricDraft(initialParametricDraft());
      setPolarDraft(initialPolarDraft());
      setImplicitDraft(initialImplicitDraft());
      setInequalityDraft(initialInequalityDraft());
      setPointDraft(initialPointDraft());
      setPiecewiseDraft(initialPiecewiseDraft());
    }
  };
  return <div className="graph2d-authoring" data-palette={palette}>
    <div className="graph2d-left-palette" role="group" aria-label="Graph left panel palette">
      <span>Panel palette</span>
      {(["classic", "geometry"] as const).map((option) => (
        <button key={option} type="button" data-testid={`graph2d-left-palette-${option}`}
          aria-pressed={palette === option} onClick={() => onPaletteChange(option)}>
          {option === "classic" ? "Classic" : "Geometry"}
        </button>
      ))}
    </div>
    <div className="graph2d-authoring-header"><h2>Functions</h2>
      <button type="button" onClick={beginCreate} disabled={document.source.objects.length >= GRAPH2D_MAX_OBJECTS}>Add function</button>
      <button type="button" onClick={beginCreateParametric} disabled={document.source.objects.length >= GRAPH2D_MAX_OBJECTS}>Add parametric</button>
      <button type="button" onClick={beginCreatePolar} disabled={document.source.objects.length >= GRAPH2D_MAX_OBJECTS}>Add polar</button>
      <button type="button" onClick={beginCreateImplicit} disabled={document.source.objects.length >= GRAPH2D_MAX_OBJECTS}>Add implicit</button>
      <button type="button" onClick={beginCreateInequality} disabled={document.source.objects.length >= GRAPH2D_MAX_OBJECTS}>Add inequality</button>
      <button type="button" onClick={beginCreatePiecewise} disabled={document.source.objects.length >= GRAPH2D_MAX_OBJECTS}>Add piecewise</button>
      <button type="button" onClick={beginCreatePointSeries} disabled={document.source.objects.length >= GRAPH2D_MAX_OBJECTS}>Add data series</button></div>
    {document.source.objects.length ? <ol className="graph2d-function-list">
      {document.source.objects.map((object, index) => {
        const style = document.display.objects[index]!;
        return <li key={object.id} data-graph2d-id={object.id}>
          <div className="graph2d-function-summary"><span className="graph2d-function-swatch" style={{ background: style.color }} />
            <div><strong>{object.label}</strong><code>{object.kind === "explicit-cartesian" ?
              `y = ${object.expression.source}` : object.kind === "parametric" ?
                `x(t) = ${object.xExpression.source}; y(t) = ${object.yExpression.source}` :
                object.kind === "polar" ? `r(θ) = ${object.rExpression.source}` :
                  object.kind === "implicit" ? `F(x,y) = ${object.expression.source} = 0` :
                    object.kind === "inequality" ? object.clauses.map((clause) =>
                      `${clause.source} ${clause.comparator} 0`).join(object.operator === "all" ? " AND " : " OR ") :
                      object.kind === "point-series" ? `${object.table.rowCount} rows · ${object.mode} · missing y: gap` :
                        object.pieces.map((piece) => piece.expression.source).join("; ")}</code>
              {!style.visible && <small>Hidden</small>}</div></div>
          <div className="graph2d-function-actions">
            <button type="button" aria-label={"Select " + object.label} aria-pressed={document.selection.objectId === object.id}
              onClick={() => onSelect?.(object.id)}>Select</button>
            <button type="button" aria-label={"Edit " + object.label} onClick={() => beginEdit(object.id)}>Edit</button>
            <button type="button" aria-label={(style.visible ? "Hide " : "Show ") + object.label}
              onClick={() => commit({ type: "visibility", objectId: object.id })}>{style.visible ? "Hide" : "Show"}</button>
            <button type="button" aria-label={"Duplicate " + object.label} disabled={document.source.objects.length >= GRAPH2D_MAX_OBJECTS}
              onClick={() => commit({ type: "duplicate", objectId: object.id })}>Duplicate</button>
            <button type="button" aria-label={"Move " + object.label + " up"} disabled={index === 0}
              onClick={() => commit({ type: "reorder", objectId: object.id, toIndex: index - 1 })}>↑</button>
            <button type="button" aria-label={"Move " + object.label + " down"} disabled={index === document.source.objects.length - 1}
              onClick={() => commit({ type: "reorder", objectId: object.id, toIndex: index + 1 })}>↓</button>
            <button type="button" aria-label={"Delete " + object.label} onClick={() => commit({ type: "delete", objectId: object.id })}>Delete</button>
          </div>
        </li>;
      })}
    </ol> : <p className="graph2d-muted">No functions in this graph.</p>}
    {open && mode === "explicit" && <form className="graph2d-function-editor" aria-label={editingId ? "Edit function" : "New function"}
      onSubmit={(event) => { event.preventDefault(); save(); }}>
      <h3>{editingId ? "Edit function" : "New function"}</h3>
      <label>Name <input aria-label="Function name" value={draft.label} maxLength={160}
        onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
      <label>y = <input aria-label="Function expression" value={draft.expression} spellCheck={false}
        onChange={(event) => setDraft({ ...draft, expression: event.target.value })} /></label>
      <div className="graph2d-domain-row">
        <label>From <input aria-label="Domain minimum" type="number" value={draft.domain.min}
          onChange={(event) => setDraft({ ...draft, domain: { ...draft.domain, min: Number(event.target.value) } })} /></label>
        <label>To <input aria-label="Domain maximum" type="number" value={draft.domain.max}
          onChange={(event) => setDraft({ ...draft, domain: { ...draft.domain, max: Number(event.target.value) } })} /></label>
      </div>
      <div className="graph2d-domain-row">
        <label><input type="checkbox" checked={draft.domain.includeMin}
          onChange={(event) => setDraft({ ...draft, domain: { ...draft.domain, includeMin: event.target.checked } })} /> Include start</label>
        <label><input type="checkbox" checked={draft.domain.includeMax}
          onChange={(event) => setDraft({ ...draft, domain: { ...draft.domain, includeMax: event.target.checked } })} /> Include end</label>
      </div>
      <div className="graph2d-domain-row">
        <label>Color <input aria-label="Function color" type="color" value={draft.style.color}
          onChange={(event) => setDraft({ ...draft, style: { ...draft.style, color: event.target.value } })} /></label>
        <label>Width <input aria-label="Line width" type="number" min="0.5" max="12" step="0.5" value={draft.style.lineWidth}
          onChange={(event) => setDraft({ ...draft, style: { ...draft.style, lineWidth: Number(event.target.value) } })} /></label>
      </div>
      <label>Line <select aria-label="Line style" value={draft.style.lineStyle}
        onChange={(event) => setDraft({ ...draft, style: { ...draft.style, lineStyle: event.target.value as Graph2DFunctionDraft["style"]["lineStyle"] } })}>
        <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
      </select></label>
      <label><input type="checkbox" checked={draft.style.visible}
        onChange={(event) => setDraft({ ...draft, style: { ...draft.style, visible: event.target.checked } })} /> Visible</label>
      {errors.length > 0 && <p className="graph2d-draft-error" role="alert">{errors[0]}</p>}
      {message && <p className="graph2d-draft-error" role="alert">{message}</p>}
      <div className="graph2d-function-actions"><button type="submit" disabled={errors.length > 0}>Save function</button>
        <button type="button" onClick={() => { setOpen(false); setMessage(""); }}>Cancel</button></div>
    </form>}
    {open && mode === "parametric" && <form className="graph2d-function-editor"
      aria-label={editingId ? "Edit parametric" : "New parametric"}
      onSubmit={(event) => { event.preventDefault(); save(); }}>
      <h3>{editingId ? "Edit parametric" : "New parametric"}</h3>
      <label>Name <input aria-label="Parametric name" value={parametricDraft.label} maxLength={160}
        onChange={(event) => setParametricDraft({ ...parametricDraft, label: event.target.value })} /></label>
      <label>x(t) = <input aria-label="Parametric x expression" value={parametricDraft.xExpression} spellCheck={false}
        onChange={(event) => setParametricDraft({ ...parametricDraft, xExpression: event.target.value })} /></label>
      <label>y(t) = <input aria-label="Parametric y expression" value={parametricDraft.yExpression} spellCheck={false}
        onChange={(event) => setParametricDraft({ ...parametricDraft, yExpression: event.target.value })} /></label>
      <div className="graph2d-domain-row">
        <label>From t <input aria-label="Parameter minimum" type="number" value={parametricDraft.domain.min}
          onChange={(event) => setParametricDraft({ ...parametricDraft, domain: { ...parametricDraft.domain, min: Number(event.target.value) } })} /></label>
        <label>To t <input aria-label="Parameter maximum" type="number" value={parametricDraft.domain.max}
          onChange={(event) => setParametricDraft({ ...parametricDraft, domain: { ...parametricDraft.domain, max: Number(event.target.value) } })} /></label>
      </div>
      <div className="graph2d-domain-row">
        <label><input type="checkbox" checked={parametricDraft.domain.includeMin}
          onChange={(event) => setParametricDraft({ ...parametricDraft, domain: { ...parametricDraft.domain, includeMin: event.target.checked } })} /> Include start</label>
        <label><input type="checkbox" checked={parametricDraft.domain.includeMax}
          onChange={(event) => setParametricDraft({ ...parametricDraft, domain: { ...parametricDraft.domain, includeMax: event.target.checked } })} /> Include end</label>
      </div>
      <div className="graph2d-domain-row">
        <label>Color <input aria-label="Parametric color" type="color" value={parametricDraft.style.color}
          onChange={(event) => setParametricDraft({ ...parametricDraft, style: { ...parametricDraft.style, color: event.target.value } })} /></label>
        <label>Width <input aria-label="Parametric line width" type="number" min="0.5" max="12" step="0.5" value={parametricDraft.style.lineWidth}
          onChange={(event) => setParametricDraft({ ...parametricDraft, style: { ...parametricDraft.style, lineWidth: Number(event.target.value) } })} /></label>
      </div>
      <label>Line <select aria-label="Parametric line style" value={parametricDraft.style.lineStyle}
        onChange={(event) => setParametricDraft({ ...parametricDraft, style: { ...parametricDraft.style,
          lineStyle: event.target.value as Graph2DParametricDraft["style"]["lineStyle"] } })}>
        <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
      </select></label>
      <label><input type="checkbox" checked={parametricDraft.style.visible}
        onChange={(event) => setParametricDraft({ ...parametricDraft, style: { ...parametricDraft.style, visible: event.target.checked } })} /> Visible</label>
      {errors.length > 0 && <p className="graph2d-draft-error" role="alert">{errors[0]}</p>}
      {message && <p className="graph2d-draft-error" role="alert">{message}</p>}
      <div className="graph2d-function-actions"><button type="submit" disabled={errors.length > 0}>Save parametric</button>
        <button type="button" onClick={() => { setOpen(false); setMessage(""); }}>Cancel</button></div>
    </form>}
    {open && mode === "polar" && <form className="graph2d-function-editor"
      aria-label={editingId ? "Edit polar" : "New polar"}
      onSubmit={(event) => { event.preventDefault(); save(); }}>
      <h3>{editingId ? "Edit polar" : "New polar"}</h3>
      <label>Name <input aria-label="Polar name" value={polarDraft.label} maxLength={160}
        onChange={(event) => setPolarDraft({ ...polarDraft, label: event.target.value })} /></label>
      <label>r(θ) = <input aria-label="Polar radius expression" value={polarDraft.rExpression} spellCheck={false}
        onChange={(event) => setPolarDraft({ ...polarDraft, rExpression: event.target.value })} /></label>
      <div className="graph2d-domain-row">
        <label>From θ <input aria-label="Angle minimum" type="number" value={polarDraft.domain.min}
          onChange={(event) => setPolarDraft({ ...polarDraft, domain: { ...polarDraft.domain, min: Number(event.target.value) } })} /></label>
        <label>To θ <input aria-label="Angle maximum" type="number" value={polarDraft.domain.max}
          onChange={(event) => setPolarDraft({ ...polarDraft, domain: { ...polarDraft.domain, max: Number(event.target.value) } })} /></label>
      </div>
      <div className="graph2d-domain-row">
        <label><input type="checkbox" checked={polarDraft.domain.includeMin}
          onChange={(event) => setPolarDraft({ ...polarDraft, domain: { ...polarDraft.domain, includeMin: event.target.checked } })} /> Include start</label>
        <label><input type="checkbox" checked={polarDraft.domain.includeMax}
          onChange={(event) => setPolarDraft({ ...polarDraft, domain: { ...polarDraft.domain, includeMax: event.target.checked } })} /> Include end</label>
      </div>
      <div className="graph2d-domain-row">
        <label>Color <input aria-label="Polar color" type="color" value={polarDraft.style.color}
          onChange={(event) => setPolarDraft({ ...polarDraft, style: { ...polarDraft.style, color: event.target.value } })} /></label>
        <label>Width <input aria-label="Polar line width" type="number" min="0.5" max="12" step="0.5" value={polarDraft.style.lineWidth}
          onChange={(event) => setPolarDraft({ ...polarDraft, style: { ...polarDraft.style, lineWidth: Number(event.target.value) } })} /></label>
      </div>
      <label>Line <select aria-label="Polar line style" value={polarDraft.style.lineStyle}
        onChange={(event) => setPolarDraft({ ...polarDraft, style: { ...polarDraft.style,
          lineStyle: event.target.value as Graph2DPolarDraft["style"]["lineStyle"] } })}>
        <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
      </select></label>
      <label><input type="checkbox" checked={polarDraft.style.visible}
        onChange={(event) => setPolarDraft({ ...polarDraft, style: { ...polarDraft.style, visible: event.target.checked } })} /> Visible</label>
      {errors.length > 0 && <p className="graph2d-draft-error" role="alert">{errors[0]}</p>}
      {message && <p className="graph2d-draft-error" role="alert">{message}</p>}
      <div className="graph2d-function-actions"><button type="submit" disabled={errors.length > 0}>Save polar</button>
        <button type="button" onClick={() => { setOpen(false); setMessage(""); }}>Cancel</button></div>
    </form>}
    {open && mode === "implicit" && <form className="graph2d-function-editor"
      aria-label={editingId ? "Edit implicit" : "New implicit"}
      onSubmit={(event) => { event.preventDefault(); save(); }}>
      <h3>{editingId ? "Edit implicit contour" : "New implicit contour"}</h3>
      <label>Name <input aria-label="Implicit name" value={implicitDraft.label} maxLength={160}
        onChange={(event) => setImplicitDraft({ ...implicitDraft, label: event.target.value })} /></label>
      <label>F(x,y) = <input aria-label="Implicit expression" value={implicitDraft.expression} spellCheck={false}
        onChange={(event) => setImplicitDraft({ ...implicitDraft, expression: event.target.value })} /> = 0</label>
      <div className="graph2d-domain-row">
        <label>X from <input aria-label="Implicit x minimum" type="number" value={implicitDraft.domain.min}
          onChange={(event) => setImplicitDraft({ ...implicitDraft, domain: { ...implicitDraft.domain, min: Number(event.target.value) } })} /></label>
        <label>X to <input aria-label="Implicit x maximum" type="number" value={implicitDraft.domain.max}
          onChange={(event) => setImplicitDraft({ ...implicitDraft, domain: { ...implicitDraft.domain, max: Number(event.target.value) } })} /></label>
      </div>
      <div className="graph2d-domain-row">
        <label>Y from <input aria-label="Implicit y minimum" type="number" value={implicitDraft.yDomain.min}
          onChange={(event) => setImplicitDraft({ ...implicitDraft, yDomain: { ...implicitDraft.yDomain, min: Number(event.target.value) } })} /></label>
        <label>Y to <input aria-label="Implicit y maximum" type="number" value={implicitDraft.yDomain.max}
          onChange={(event) => setImplicitDraft({ ...implicitDraft, yDomain: { ...implicitDraft.yDomain, max: Number(event.target.value) } })} /></label>
      </div>
      <div className="graph2d-domain-row">
        <label>Color <input aria-label="Implicit color" type="color" value={implicitDraft.style.color}
          onChange={(event) => setImplicitDraft({ ...implicitDraft, style: { ...implicitDraft.style, color: event.target.value } })} /></label>
        <label>Width <input aria-label="Implicit line width" type="number" min="0.5" max="12" step="0.5"
          value={implicitDraft.style.lineWidth}
          onChange={(event) => setImplicitDraft({ ...implicitDraft, style: { ...implicitDraft.style, lineWidth: Number(event.target.value) } })} /></label>
      </div>
      <label>Line <select aria-label="Implicit line style" value={implicitDraft.style.lineStyle}
        onChange={(event) => setImplicitDraft({ ...implicitDraft, style: { ...implicitDraft.style,
          lineStyle: event.target.value as Graph2DImplicitDraft["style"]["lineStyle"] } })}>
        <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
      </select></label>
      <label><input type="checkbox" checked={implicitDraft.style.visible}
        onChange={(event) => setImplicitDraft({ ...implicitDraft, style: { ...implicitDraft.style, visible: event.target.checked } })} /> Visible</label>
      {errors.length > 0 && <p className="graph2d-draft-error" role="alert">{errors[0]}</p>}
      {message && <p className="graph2d-draft-error" role="alert">{message}</p>}
      <div className="graph2d-function-actions"><button type="submit" disabled={errors.length > 0}>Save implicit</button>
        <button type="button" onClick={() => { setOpen(false); setMessage(""); }}>Cancel</button></div>
    </form>}
    {open && mode === "inequality" && <form className="graph2d-function-editor"
      aria-label={editingId ? "Edit inequality" : "New inequality"}
      onSubmit={(event) => { event.preventDefault(); save(); }}>
      <h3>{editingId ? "Edit filled region" : "New filled region"}</h3>
      <label>Name <input aria-label="Inequality name" value={inequalityDraft.label} maxLength={160}
        onChange={(event) => setInequalityDraft({ ...inequalityDraft, label: event.target.value })} /></label>
      {inequalityDraft.clauses.map((clause, index) => <div className="graph2d-domain-row" key={index}>
        <label>F{index + 1}(x,y) <input aria-label={`Region expression ${index + 1}`} value={clause.expression}
          spellCheck={false} onChange={(event) => setInequalityDraft({ ...inequalityDraft,
            clauses: inequalityDraft.clauses.map((item, at) => at === index ? { ...item, expression: event.target.value } : item) })} /></label>
        <label>Comparison <select aria-label={`Region comparison ${index + 1}`} value={clause.comparator}
          onChange={(event) => setInequalityDraft({ ...inequalityDraft,
            clauses: inequalityDraft.clauses.map((item, at) => at === index ? { ...item,
              comparator: event.target.value as Graph2DInequalityDraft["clauses"][number]["comparator"] } : item) })}>
          <option value="<">&lt; 0</option><option value="<=">≤ 0</option>
          <option value=">">&gt; 0</option><option value=">=">≥ 0</option>
        </select></label>
        {inequalityDraft.clauses.length > 1 && <button type="button" aria-label={`Remove condition ${index + 1}`}
          onClick={() => setInequalityDraft({ ...inequalityDraft,
            clauses: inequalityDraft.clauses.filter((_, at) => at !== index) })}>Remove</button>}
      </div>)}
      <div className="graph2d-domain-row">
        <button type="button" disabled={inequalityDraft.clauses.length >= 8}
          onClick={() => setInequalityDraft({ ...inequalityDraft,
            clauses: [...inequalityDraft.clauses, { expression: "y", comparator: ">=" }] })}>Add condition</button>
        <label>Combine <select aria-label="Region combine" value={inequalityDraft.operator}
          onChange={(event) => setInequalityDraft({ ...inequalityDraft,
            operator: event.target.value as Graph2DInequalityDraft["operator"] })}>
          <option value="all">AND</option><option value="any">OR</option>
        </select></label>
      </div>
      <div className="graph2d-domain-row">
        <label>X from <input aria-label="Region x minimum" type="number" value={inequalityDraft.domain.min}
          onChange={(event) => setInequalityDraft({ ...inequalityDraft,
            domain: { ...inequalityDraft.domain, min: Number(event.target.value) } })} /></label>
        <label>X to <input aria-label="Region x maximum" type="number" value={inequalityDraft.domain.max}
          onChange={(event) => setInequalityDraft({ ...inequalityDraft,
            domain: { ...inequalityDraft.domain, max: Number(event.target.value) } })} /></label>
      </div>
      <div className="graph2d-domain-row">
        <label>Y from <input aria-label="Region y minimum" type="number" value={inequalityDraft.yDomain.min}
          onChange={(event) => setInequalityDraft({ ...inequalityDraft,
            yDomain: { ...inequalityDraft.yDomain, min: Number(event.target.value) } })} /></label>
        <label>Y to <input aria-label="Region y maximum" type="number" value={inequalityDraft.yDomain.max}
          onChange={(event) => setInequalityDraft({ ...inequalityDraft,
            yDomain: { ...inequalityDraft.yDomain, max: Number(event.target.value) } })} /></label>
      </div>
      <label>Color <input aria-label="Region color" type="color" value={inequalityDraft.style.color}
        onChange={(event) => setInequalityDraft({ ...inequalityDraft,
          style: { ...inequalityDraft.style, color: event.target.value } })} /></label>
      {errors.length > 0 && <p className="graph2d-draft-error" role="alert">{errors[0]}</p>}
      {message && <p className="graph2d-draft-error" role="alert">{message}</p>}
      <div className="graph2d-function-actions"><button type="submit" disabled={errors.length > 0}>Save inequality</button>
        <button type="button" onClick={() => { setOpen(false); setMessage(""); }}>Cancel</button></div>
    </form>}
    {open && mode === "piecewise" && <form className="graph2d-function-editor"
      aria-label={editingId ? "Edit piecewise function" : "New piecewise function"}
      onSubmit={(event) => { event.preventDefault(); save(); }}>
      <h3>{editingId ? "Edit piecewise function" : "New piecewise function"}</h3>
      <label>Name <input aria-label="Piecewise name" value={piecewiseDraft.label} maxLength={160}
        onChange={(event) => setPiecewiseDraft({ ...piecewiseDraft, label: event.target.value })} /></label>
      {piecewiseDraft.pieces.map((piece, index) => <fieldset key={index}>
        <legend>Piece {index + 1}</legend>
        <label>y = <input aria-label={`Piece ${index + 1} expression`} value={piece.expression} spellCheck={false}
          onChange={(event) => setPiecewiseDraft({ ...piecewiseDraft, pieces: piecewiseDraft.pieces.map((entry, at) =>
            at === index ? { ...entry, expression: event.target.value } : entry) })} /></label>
        <div className="graph2d-domain-row">
          <label>From <input aria-label={`Piece ${index + 1} minimum`} type="number" value={piece.domain.min}
            onChange={(event) => setPiecewiseDraft({ ...piecewiseDraft, pieces: piecewiseDraft.pieces.map((entry, at) =>
              at === index ? { ...entry, domain: { ...entry.domain, min: Number(event.target.value) } } : entry) })} /></label>
          <label>To <input aria-label={`Piece ${index + 1} maximum`} type="number" value={piece.domain.max}
            onChange={(event) => setPiecewiseDraft({ ...piecewiseDraft, pieces: piecewiseDraft.pieces.map((entry, at) =>
              at === index ? { ...entry, domain: { ...entry.domain, max: Number(event.target.value) } } : entry) })} /></label>
        </div>
        <div className="graph2d-domain-row">
          <label><input type="checkbox" checked={piece.domain.includeMin}
            onChange={(event) => setPiecewiseDraft({ ...piecewiseDraft, pieces: piecewiseDraft.pieces.map((entry, at) =>
              at === index ? { ...entry, domain: { ...entry.domain, includeMin: event.target.checked } } : entry) })} /> Include start</label>
          <label><input type="checkbox" checked={piece.domain.includeMax}
            onChange={(event) => setPiecewiseDraft({ ...piecewiseDraft, pieces: piecewiseDraft.pieces.map((entry, at) =>
              at === index ? { ...entry, domain: { ...entry.domain, includeMax: event.target.checked } } : entry) })} /> Include end</label>
          <button type="button" disabled={piecewiseDraft.pieces.length === 1}
            onClick={() => setPiecewiseDraft({ ...piecewiseDraft,
              pieces: piecewiseDraft.pieces.filter((_, at) => at !== index) })}>Remove piece {index + 1}</button>
        </div>
      </fieldset>)}
      <button type="button" disabled={piecewiseDraft.pieces.length >= 16}
        onClick={() => { const previous = piecewiseDraft.pieces.at(-1)!;
          setPiecewiseDraft({ ...piecewiseDraft, pieces: [...piecewiseDraft.pieces,
            { expression: "x", domain: { min: previous.domain.max, max: previous.domain.max + 1,
              includeMin: !previous.domain.includeMax, includeMax: true } }] }); }}>Add piece</button>
      <label>Color <input aria-label="Piecewise color" type="color" value={piecewiseDraft.style.color}
        onChange={(event) => setPiecewiseDraft({ ...piecewiseDraft,
          style: { ...piecewiseDraft.style, color: event.target.value } })} /></label>
      {errors.length > 0 && <p className="graph2d-draft-error" role="alert">{errors[0]}</p>}
      {message && <p className="graph2d-draft-error" role="alert">{message}</p>}
      <div className="graph2d-function-actions"><button type="submit" disabled={errors.length > 0}>Save piecewise</button>
        <button type="button" onClick={() => { setOpen(false); setMessage(""); }}>Cancel</button></div>
    </form>}
    {open && mode === "point-series" && <form className="graph2d-function-editor"
      aria-label={editingId ? "Edit data series" : "New data series"}
      onSubmit={(event) => { event.preventDefault(); save(); }}>
      <h3>{editingId ? "Edit data series" : "New data series"}</h3>
      <label>Name <input aria-label="Data series name" value={pointDraft.label} maxLength={160}
        onChange={(event) => setPointDraft({ ...pointDraft, label: event.target.value })} /></label>
      <label>CSV or TSV (x,y) <textarea aria-label="Data series import" value={pointDraft.text}
        onChange={(event) => setPointDraft({ ...pointDraft, text: event.target.value })} rows={7} spellCheck={false} /></label>
      <div className="graph2d-domain-row">
        <label>Plot <select aria-label="Data series mode" value={pointDraft.mode}
          onChange={(event) => setPointDraft({ ...pointDraft, mode: event.target.value as "points" | "line" })}>
          <option value="points">Points</option><option value="line">Connected line</option>
        </select></label>
        <label>Color <input aria-label="Data series color" type="color" value={pointDraft.style.color}
          onChange={(event) => setPointDraft({ ...pointDraft, style: { ...pointDraft.style, color: event.target.value } })} /></label>
      </div>
      <div data-testid="graph2d-import-preview" aria-label="Import preview">
        <strong>{pointPreview?.rows.length ?? 0} rows · {pointPreview?.missingCount ?? 0} missing y (gaps)</strong>
        {pointPreview && pointPreview.rows.length > 0 && <table><thead><tr><th>Row</th><th>x</th><th>y</th></tr></thead>
          <tbody>{pointPreview.rows.slice(0, 5).map((row) => <tr key={row.id}><td>{row.id}</td>
            <td>{row.x}</td><td>{row.y ?? "gap"}</td></tr>)}</tbody></table>}
      </div>
      {errors.length > 0 && <p className="graph2d-draft-error" role="alert">{errors[0]}</p>}
      {message && <p className="graph2d-draft-error" role="alert">{message}</p>}
      <div className="graph2d-function-actions"><button type="submit" disabled={errors.length > 0}>Save data series</button>
        <button type="button" onClick={() => { setOpen(false); setMessage(""); }}>Cancel</button></div>
    </form>}
  </div>;
}
