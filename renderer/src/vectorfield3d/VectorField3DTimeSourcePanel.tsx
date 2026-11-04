import { useState } from "react";
import { createTemporalFieldSourceDocument, projectTemporalFieldSourceStatus,
  sampleTemporalFieldProbe, sampleTemporalFieldSlice,
  type Math3DProject, type TemporalFieldSourceDocument,
  type VectorField3DDocument } from "@math3d/core";

export function VectorField3DTimeSourcePanel({ document, project, onSave }: {
  document: VectorField3DDocument; project: Math3DProject | null | undefined;
  onSave?: (temporal: TemporalFieldSourceDocument) => void;
}) {
  const [secondId, setSecondId] = useState("");
  const [laterTime, setLaterTime] = useState(1);
  const [interpolation, setInterpolation] = useState<"none" | "linear">("none");
  const [sampleTime, setSampleTime] = useState(0.5);
  const [sampleId, setSampleId] = useState("");
  const [sampleMessage, setSampleMessage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const candidates = project?.workspace.entries.filter(item => item.module === "vector3d" &&
    item.expected.id !== document.identity.id) ?? [];
  const saved = project?.workspace.timeSources?.filter(item => item.source.frames.some(frame =>
    frame.documentId === document.identity.id)) ?? [];
  const save = () => {
    setError(""); setMessage("");
    try {
      if (!project || !onSave) throw new TypeError("Open a saved Project first.");
      const first = project.workspace.entries.find(item => item.module === "vector3d" &&
        item.expected.id === document.identity.id);
      if (!first || first.expected.revision !== document.identity.revision ||
          first.expected.structuralHash !== document.identity.structuralHash)
        throw new TypeError("Save the current vector source in the Project first.");
      const temporal = createTemporalFieldSourceDocument(project, [
        { time: 0, documentId: document.identity.id },
        { time: laterTime, documentId: secondId }],
      { stableKey: { first: document.identity.id, second: secondId, time: laterTime,
          interpolation },
        title: `${document.metadata.title} · two times`, timeUnit: document.source.timeUnit,
        interpolation });
      onSave(temporal);
      setMessage(`Saved ${interpolation} time source ${temporal.identity.id}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section aria-label="Temporal source contract" data-testid="gf22-time-source">
    <h5>Temporal source contract</h5>
    <p>Pin two saved analytic Cartesian snapshots at physical times. Linear interpolation
      applies to vector values inside the common domain; pathlines and streaklines remain unavailable.</p>
    <label>Later frame <select value={secondId} onChange={event => setSecondId(event.target.value)}>
      <option value="">Choose saved source</option>
      {candidates.map(item => <option key={item.expected.id} value={item.expected.id}>
        {(item.checkpoint as VectorField3DDocument).metadata.title} · revision {item.expected.revision}</option>)}
    </select></label>
    <label>Later time ({document.source.timeUnit}) <input type="number" min="0.000001" max="1000000000"
      step="any" value={laterTime} onChange={event => setLaterTime(Number(event.target.value))} /></label>
    <label>Time interpolation <select value={interpolation} onChange={event =>
      setInterpolation(event.target.value as "none" | "linear")}>
      <option value="none">Exact frames only</option><option value="linear">Linear between frames</option>
    </select></label>
    <button type="button" disabled={!secondId || !onSave} onClick={save}>Save temporal source</button>
    {saved.length > 0 && <><label>Saved source <select data-testid="gf25-saved-time-source-select"
      value={sampleId} onChange={event =>
      setSampleId(event.target.value)}><option value="">Choose time source</option>
      {saved.map(item => <option key={item.identity.id} value={item.identity.id}>
        {item.metadata.title} · {item.source.timeAxis.interpolation}</option>)}</select></label>
      <label>Sample time <input type="number" step="any" value={sampleTime}
        onChange={event => setSampleTime(Number(event.target.value))} /></label>
      <button type="button" disabled={!sampleId} onClick={() => {
        setError(""); setSampleMessage("");
        try {
          const item = saved.find(source => source.identity.id === sampleId)!;
          const point = document.source.axes.map(axis => (axis.min + axis.max) / 2) as
            [number, number, number];
          const probe = sampleTemporalFieldProbe(project!, item, sampleTime, point);
          const slice = sampleTemporalFieldSlice(project!, item, sampleTime, 2, point[2], 9);
          setSampleMessage(`Probe |v| = ${probe.magnitude} ${probe.componentUnit}; ` +
            `z-slice ${slice.shape.join(" × ")} verified analytic samples at ` +
            `${sampleTime} ${probe.timeUnit}.`);
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      }}>Sample temporal probe and slice</button>
      {sampleMessage && <p role="status" data-testid="gf25-sample-result">{sampleMessage}</p>}</>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {saved.length > 0 && <details><summary>Saved temporal sources ({saved.length})</summary>
      <ul>{saved.map(item => {
        const status = projectTemporalFieldSourceStatus(project!, item);
        return <li key={item.identity.id}>{item.metadata.title}: {item.source.frames.length} frames,
          {" "}{item.source.timeAxis.unit}, {status.status === "current" ? "current" :
            `withheld (${status.reason})`}</li>;
      })}</ul></details>}
  </section>;
}
