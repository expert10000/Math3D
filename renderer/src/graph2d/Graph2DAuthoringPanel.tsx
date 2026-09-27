import { GRAPH2D_MAX_OBJECTS, validateGraph2DFunctionDraft, validateGraph2DParametricDraft,
  type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DFunctionDraft,
  type Graph2DParametricDraft } from "@math3d/core";
import { useState } from "react";

type Props = { document: Graph2DDocument; onCommit?: (action: Graph2DAuthoringAction) => void;
  onSelect?: (objectId: string) => void };
const initialDraft = (): Graph2DFunctionDraft => ({ label: "f", expression: "x",
  domain: { min: -10, max: 10, includeMin: true, includeMax: true },
  style: { visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" } });
const initialParametricDraft = (): Graph2DParametricDraft => ({ label: "p", xExpression: "cos(t)",
  yExpression: "sin(t)", domain: { min: 0, max: 6.283185307179586, includeMin: true, includeMax: true },
  style: { visible: true, color: "#e11d48", lineWidth: 2, lineStyle: "solid" } });

export function Graph2DAuthoringPanel({ document, onCommit, onSelect }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Graph2DFunctionDraft>(initialDraft);
  const [parametricDraft, setParametricDraft] = useState<Graph2DParametricDraft>(initialParametricDraft);
  const [mode, setMode] = useState<"explicit" | "parametric">("explicit");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const variables = ["x", ...document.source.variables.map((entry) => entry.name)];
  const errors = mode === "explicit" ? validateGraph2DFunctionDraft(draft, variables) :
    validateGraph2DParametricDraft(parametricDraft, ["t", ...document.source.variables.map((entry) => entry.name)]);
  const commit = (action: Graph2DAuthoringAction) => {
    try { onCommit?.(action); setMessage(""); return true; }
    catch (error) { setMessage(String((error as Error).message ?? error)); return false; }
  };
  const beginCreate = () => { setMode("explicit"); setEditingId(null); setDraft(initialDraft()); setMessage(""); setOpen(true); };
  const beginCreateParametric = () => { setMode("parametric"); setEditingId(null);
    setParametricDraft(initialParametricDraft()); setMessage(""); setOpen(true); };
  const beginEdit = (id: string) => {
    const object = document.source.objects.find((entry) => entry.id === id);
    const style = document.display.objects.find((entry) => entry.objectId === id);
    if (!object || !style) return;
    setEditingId(id);
    if (object.kind === "explicit-cartesian") {
      setMode("explicit"); setDraft({ label: object.label, expression: object.expression.source, domain: object.domain,
        style: { visible: style.visible, color: style.color, lineWidth: style.lineWidth, lineStyle: style.lineStyle } });
    } else {
      setMode("parametric"); setParametricDraft({ label: object.label,
        xExpression: object.xExpression.source, yExpression: object.yExpression.source, domain: object.domain,
        style: { visible: style.visible, color: style.color, lineWidth: style.lineWidth, lineStyle: style.lineStyle } });
    }
    setMessage(""); setOpen(true);
  };
  const save = () => {
    if (errors.length) return;
    const action: Graph2DAuthoringAction = mode === "explicit" ?
      editingId ? { type: "edit", objectId: editingId, draft } : { type: "create", draft } :
      editingId ? { type: "edit-parametric", objectId: editingId, draft: parametricDraft } :
        { type: "create-parametric", draft: parametricDraft };
    if (commit(action)) {
      setOpen(false); setEditingId(null); setDraft(initialDraft()); setParametricDraft(initialParametricDraft());
    }
  };
  return <div className="graph2d-authoring">
    <div className="graph2d-authoring-header"><h2>Functions</h2>
      <button type="button" onClick={beginCreate} disabled={document.source.objects.length >= GRAPH2D_MAX_OBJECTS}>Add function</button>
      <button type="button" onClick={beginCreateParametric} disabled={document.source.objects.length >= GRAPH2D_MAX_OBJECTS}>Add parametric</button></div>
    {document.source.objects.length ? <ol className="graph2d-function-list">
      {document.source.objects.map((object, index) => {
        const style = document.display.objects[index]!;
        return <li key={object.id} data-graph2d-id={object.id}>
          <div className="graph2d-function-summary"><span className="graph2d-function-swatch" style={{ background: style.color }} />
            <div><strong>{object.label}</strong><code>{object.kind === "explicit-cartesian" ?
              `y = ${object.expression.source}` : `x(t) = ${object.xExpression.source}; y(t) = ${object.yExpression.source}`}</code>
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
  </div>;
}
