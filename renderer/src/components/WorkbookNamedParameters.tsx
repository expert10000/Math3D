import React, { useState } from "react";
import { bindWorkbookNamedParameter, normalizeWorkbookNamedParameters, updateWorkbookNamedParameter,
  type Workbook, type WorkbookNamedParameter, type WorkbookParamDef } from "@math3d/workbook";

export const WorkbookNamedParameters = ({ workbook, catalog, readOnly, onChange, affected, onRunAffected }: {
  workbook: Workbook; catalog: WorkbookParamDef[]; readOnly: boolean; onChange: (workbook: Workbook) => void;
  affected: (parameterId: string) => readonly string[]; onRunAffected: (parameterId: string) => Promise<void>;
}) => {
  const [id, setId] = useState(""), [error, setError] = useState(""), [target, setTarget] = useState(""), [running, setRunning] = useState(false);
  const [draft, setDraft] = useState({ label: "Sampling", unit: "unitless", min: "17", max: "65", step: "1", value: "33" });
  const parameters = workbook.namedParameters ?? [], parameter = parameters.find(item => item.id === id);
  const blocks = workbook.stages.flatMap(stage => stage.blocks), plan = parameter ? affected(parameter.id) : [];
  const targets = blocks.filter(block => ["compute", "visualize"].includes(block.type)).flatMap(block => [...new Map([...catalog, ...block.params?.defs ?? []].filter(def => def.kind === "number").map(def => [def.id, def])).values()]
    .map(def => ({ value: JSON.stringify([block.id, def.id]), label: `${block.title} / ${def.label}`, blockId: block.id, def })));
  const attempt = (action: () => void) => { try { action(); setError(""); } catch (failure) { setError((failure as Error).message); } };
  return <details data-testid="workbook-named-parameters" style={{ border: "1px solid #bfdbfe", padding: 8, borderRadius: 8, minWidth: 0 }}><summary>Named parameters ({parameters.length})</summary>
    <fieldset disabled={readOnly || running} style={{ minWidth: 0, border: 0, padding: 0 }}>
      <label>Parameter<select aria-label="Named parameter" value={id} onChange={event => {
        setId(event.target.value); const item = parameters.find(item => item.id === event.target.value);
        if (item) setDraft({ label: item.label, unit: item.unit, min: String(item.min), max: String(item.max), step: String(item.step), value: String(item.value) });
      }} style={{ width: "100%" }}><option value="">Create new parameter</option>{parameters.map(item => <option key={item.id} value={item.id}>{item.label} · {item.value} {item.unit}</option>)}</select></label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 5, margin: "7px 0" }}>{(["label", "unit", "min", "max", "step", "value"] as const).map(key => <label key={key}>{key}<input aria-label={`Named parameter ${key}`} value={draft[key]} maxLength={key === "label" ? 160 : 80} onChange={event => setDraft({ ...draft, [key]: event.target.value })} style={{ width: "100%", boxSizing: "border-box" }}/></label>)}</div>
      <button type="button" onClick={() => attempt(() => {
        const value: WorkbookNamedParameter = { schemaVersion: 1, id: parameter?.id ?? crypto.randomUUID(), label: draft.label.trim(), unit: draft.unit.trim(), min: Number(draft.min), max: Number(draft.max), step: Number(draft.step), value: Number(draft.value) };
        if ([draft.min, draft.max, draft.step, draft.value].some(item => !item.trim())) throw new TypeError("Enter finite bounds, step and value.");
        normalizeWorkbookNamedParameters([value]);
        const next = parameter ? updateWorkbookNamedParameter(workbook, parameter.id, { label: value.label, unit: value.unit, min: value.min, max: value.max, step: value.step, value: value.value }) : { ...workbook, namedParameters: normalizeWorkbookNamedParameters([...parameters, value]) };
        onChange(next); setId(value.id);
      })}>{parameter ? "Apply parameter" : "Add named parameter"}</button>
      {parameter && <button type="button" onClick={() => { onChange({ ...workbook, namedParameters: parameters.filter(item => item.id !== parameter.id) }); setId(""); }}>Remove named parameter</button>}
      {parameter && <><p style={{ overflowWrap: "anywhere" }}>ID: {parameter.id} · {parameter.unit} · [{parameter.min}, {parameter.max}] · step {parameter.step}</p>
        <select aria-label="Named parameter consumer" value={target} onChange={event => setTarget(event.target.value)} style={{ width: "100%" }}><option value="">Choose an operation or view input</option>{targets.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <button type="button" disabled={!target} onClick={() => attempt(() => { const choice = targets.find(item => item.value === target); if (!choice) return; onChange(bindWorkbookNamedParameter(workbook, parameter.id, choice.blockId, choice.def, crypto.randomUUID())); })}>Bind parameter</button>
        <p data-testid="workbook-parameter-plan">Affected blocks: {plan.length ? plan.map(id => blocks.find(block => block.id === id)?.title ?? id).join(" → ") : "none"}. Runs existing operations or applies bound view parameters; unresolved sources stay blocked.</p>
        <button type="button" data-testid="workbook-run-affected" disabled={!plan.length} onClick={async () => { setRunning(true); try { await onRunAffected(parameter.id); setError(""); } catch (cause) { setError((cause as Error).message); } finally { setRunning(false); } }}>Run affected</button>
      </>}
    </fieldset>
    {error && <p role="alert">{error}</p>}<small>Values update explicit consumers. Computation starts only when you run it. Removing a source leaves its bindings unavailable.</small>
  </details>;
};
