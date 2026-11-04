import { useState } from "react";
import { createTemporalFieldSourceDocument, projectTemporalFieldSourceStatus,
  type Math3DProject, type TemporalFieldSourceDocument,
  type VectorField3DDocument } from "@math3d/core";

export function VectorField3DTimeSourcePanel({ document, project, onSave }: {
  document: VectorField3DDocument; project: Math3DProject | null | undefined;
  onSave?: (temporal: TemporalFieldSourceDocument) => void;
}) {
  const [secondId, setSecondId] = useState("");
  const [laterTime, setLaterTime] = useState(1);
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
      { stableKey: { first: document.identity.id, second: secondId, time: laterTime },
        title: `${document.metadata.title} · two times`, timeUnit: document.source.timeUnit });
      onSave(temporal);
      setMessage(`Saved discrete time source ${temporal.identity.id}; no values exist between frames.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section aria-label="Temporal source contract" data-testid="gf22-time-source">
    <h5>Temporal source contract</h5>
    <p>Pin two saved Cartesian vector snapshots at physical times. Sampling is discrete;
      interpolation, pathlines and streaklines are unavailable until their numerical gates.</p>
    <label>Later frame <select value={secondId} onChange={event => setSecondId(event.target.value)}>
      <option value="">Choose saved source</option>
      {candidates.map(item => <option key={item.expected.id} value={item.expected.id}>
        {(item.checkpoint as VectorField3DDocument).metadata.title} · revision {item.expected.revision}</option>)}
    </select></label>
    <label>Later time ({document.source.timeUnit}) <input type="number" min="0.000001" max="1000000000"
      step="any" value={laterTime} onChange={event => setLaterTime(Number(event.target.value))} /></label>
    <button type="button" disabled={!secondId || !onSave} onClick={save}>Save temporal source</button>
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
