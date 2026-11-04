import { useEffect, useMemo, useRef, useState } from "react";
import { graph2DParameterStudyOrigin, graph2DParameterStudyRows,
  graph2DParameterStudyStatus, nextGraph2DParameterStudyId,
  type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DParameterStudy,
  type Graph2DSelection } from "@math3d/core";
import { createGraph2DParameterStudyJob,
  type Graph2DParameterStudyJobHandle } from "@math3d/kernel";
import { pointTableStore } from "./pointTableStore";

type Draft = { label: string; parameterName: string; min: string; max: string;
  samples: string; x: string };
const defaultDraft = (document: Graph2DDocument): Draft => {
  const parameter = document.source.variables.find(item => item.control);
  return { label: "Parameter study", parameterName: parameter?.name ?? "",
    min: String(parameter?.control?.min ?? (parameter?.value ?? 0) - 1),
    max: String(parameter?.control?.max ?? (parameter?.value ?? 0) + 1),
    samples: "17", x: "0" };
};
const toDraft = (study: Graph2DParameterStudy): Draft => ({ label: study.label,
  parameterName: study.parameterName, min: String(study.range.min),
  max: String(study.range.max), samples: String(study.range.samples),
  x: String(study.measurement.x) });
const fromDraft = (document: Graph2DDocument, id: string, sourceObjectId: string,
  draft: Draft): Graph2DParameterStudy => {
  const min = Number(draft.min), max = Number(draft.max), samples = Number(draft.samples),
    x = Number(draft.x);
  if (!draft.label.trim() || !draft.parameterName || !draft.min.trim() || !draft.max.trim() ||
      !draft.samples.trim() || !draft.x.trim() || !Number.isFinite(min) || !Number.isFinite(max) ||
      min >= max || !Number.isSafeInteger(samples) || samples < 2 || samples > 256 ||
      !Number.isFinite(x)) throw new TypeError("Enter a label, increasing bounds, 2–256 samples, and finite x.");
  const parameter = document.source.variables.find(item => item.name === draft.parameterName);
  if (!parameter?.control || !document.source.objects.some(item => item.id === sourceObjectId &&
      item.kind === "explicit-cartesian")) throw new TypeError("Select an explicit function and saved parameter.");
  if (min < parameter.control.min || max > parameter.control.max)
    throw new RangeError("Study bounds exceed the parameter control.");
  return { id, label: draft.label.trim(), sourceObjectId, parameterName: draft.parameterName,
    range: { min, max, samples }, measurement: { kind: "point-value", x } };
};

export function Graph2DParameterStudyPanel({ document, onAuthoringCommit, onSelectionCommit }: {
  document: Graph2DDocument; onAuthoringCommit?: (action: Graph2DAuthoringAction) => void;
  onSelectionCommit?: (selection: Graph2DSelection) => void }) {
  const documentRef = useRef(document);
  documentRef.current = document;
  const job = useMemo(() => createGraph2DParameterStudyJob({ document: () => documentRef.current }),
    [document.identity.id]);
  useEffect(() => () => job.dispose(), [job]);
  const handle = useRef<Graph2DParameterStudyJobHandle | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(() => defaultDraft(document));
  const [editingId, setEditingId] = useState<string | null>(null);
  const selected = document.source.objects.find(item => item.id === document.selection.objectId);
  const create = () => { try {
    if (selected?.kind !== "explicit-cartesian" || !onAuthoringCommit)
      throw new TypeError("Select an explicit function in the Graph editor.");
    const study = fromDraft(document, nextGraph2DParameterStudyId(document), selected.id, draft);
    onAuthoringCommit({ type: "create-parameter-study", study });
    setError(""); setEditingId(null);
  } catch (cause) { setError(String((cause as Error).message ?? cause)); } };
  const update = (study: Graph2DParameterStudy) => { try {
    if (!onAuthoringCommit) throw new TypeError("Graph editing is unavailable.");
    onAuthoringCommit({ type: "update-parameter-study",
      study: fromDraft(document, study.id, study.sourceObjectId, draft) });
    setError(""); setEditingId(null);
  } catch (cause) { setError(String((cause as Error).message ?? cause)); } };
  const run = async (study: Graph2DParameterStudy) => {
    if (!onAuthoringCommit || busyId) return;
    try {
      setError(""); setProgress(""); setBusyId(study.id);
      const submitted = job.submit(study.id, { onProgress: (done, total) =>
        setProgress(`${done}/${total} measurements`) });
      handle.current = submitted;
      const outcome = await submitted.promise;
      if (outcome.publication !== "published" || !outcome.result)
        throw new Error(`Study values withheld: ${outcome.publication}.`);
      const current = documentRef.current, result = outcome.result;
      const origin = graph2DParameterStudyOrigin(current, result);
      const rows = graph2DParameterStudyRows(result), table = pointTableStore.publish(rows);
      const existing = current.source.objects.find(item => item.kind === "point-series" &&
        item.parameterStudyOrigin?.studyId === study.id);
      const parameter = current.source.variables.find(item => item.name === study.parameterName);
      const label = `${study.label} · ${study.parameterName}${parameter?.control?.unit ? ` (${parameter.control.unit})` : ""}`;
      const domain = { min: study.range.min, max: study.range.max, includeMin: true, includeMax: true };
      if (existing?.kind === "point-series") {
        const display = current.display.objects.find(item => item.objectId === existing.id)!;
        onAuthoringCommit({ type: "edit-point-series", objectId: existing.id,
          draft: { label, table, mode: "line", domain, parameterStudyOrigin: origin,
            style: { color: display.color, lineWidth: display.lineWidth,
              lineStyle: display.lineStyle, visible: display.visible } } });
      } else onAuthoringCommit({ type: "create-point-series", draft: { label, table,
        mode: "line", domain, parameterStudyOrigin: origin,
        style: { color: "#7c3aed", lineWidth: 2, lineStyle: "solid", visible: true } } });
    } catch (cause) { setError(String((cause as Error).message ?? cause)); }
    finally { handle.current = null; setBusyId(null); setProgress(""); }
  };
  const studies = document.source.parameterStudies ?? [];
  return <section aria-label="Parameter studies" data-testid="gf09-parameter-studies">
    <h3>Parameter studies ({studies.length})</h3>
    <p>Measure a function at fixed x while a saved parameter varies. Results are numerical.</p>
    {studies.map(study => {
      const row = document.source.objects.find(item => item.kind === "point-series" &&
        item.parameterStudyOrigin?.studyId === study.id);
      const status = row?.kind === "point-series" && row.parameterStudyOrigin ?
        graph2DParameterStudyStatus(document, row.parameterStudyOrigin, pointTableStore.resolve(row.table)) : null;
      return <div key={study.id} data-testid="gf09-study" data-study-id={study.id}>
        <strong>{study.label}</strong> · {study.parameterName} [{study.range.min}, {study.range.max}]
        {" "}· {study.range.samples} samples · y at x = {study.measurement.x}
        <p role="status">{status ? status.status === "current" ? "Series current" :
          `Values withheld: ${status.reason?.replaceAll("-", " ")}` : "Not measured"}</p>
        <button type="button" disabled={!!busyId || !onAuthoringCommit}
          onClick={() => void run(study)}>Run study</button>
        {busyId === study.id && <button type="button" onClick={() => handle.current?.cancel()}>Cancel study</button>}
        {row && <button type="button" onClick={() => onSelectionCommit?.({ objectId: row.id, probe: null })}>
          Open series in Graphs</button>}
        <button type="button" onClick={() => { setEditingId(study.id); setDraft(toDraft(study)); setError(""); }}>
          Edit measurement</button>
        <button type="button" disabled={!onAuthoringCommit} onClick={() => onAuthoringCommit?.({
          type: "delete-parameter-study", studyId: study.id })}>Delete study</button>
      </div>;
    })}
    {selected?.kind === "explicit-cartesian" && !document.source.variables.some(item => item.control) &&
      <p>Configure a Graph parameter in the Parameters panel to create a study.</p>}
    {(!editingId || !studies.some(item => item.id === editingId)) && selected?.kind === "explicit-cartesian" &&
      document.source.variables.some(item => item.control) && <button type="button" onClick={() => {
        setEditingId("new"); setDraft(defaultDraft(document)); setError(""); }}>New parameter study</button>}
    {editingId && <form onSubmit={event => { event.preventDefault(); const current = studies.find(item => item.id === editingId);
      if (current) update(current); else create(); }}>
      <label>Study label <input value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} /></label>
      <label>Parameter <select value={draft.parameterName}
        onChange={event => setDraft({ ...draft, parameterName: event.target.value })}>
        {document.source.variables.filter(item => item.control).map(item =>
          <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
      <label>From value <input type="number" step="any" value={draft.min}
        onChange={event => setDraft({ ...draft, min: event.target.value })} /></label>
      <label>To value <input type="number" step="any" value={draft.max}
        onChange={event => setDraft({ ...draft, max: event.target.value })} /></label>
      <label>Samples <input type="number" min="2" max="256" step="1" value={draft.samples}
        onChange={event => setDraft({ ...draft, samples: event.target.value })} /></label>
      <label>Measure y at x <input type="number" step="any" value={draft.x}
        onChange={event => setDraft({ ...draft, x: event.target.value })} /></label>
      <button type="submit">{editingId === "new" ? "Save study" : "Update study"}</button>
      <button type="button" onClick={() => setEditingId(null)}>Cancel edit</button>
    </form>}
    {busyId && <p role="status">{progress || "Starting bounded study…"}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
