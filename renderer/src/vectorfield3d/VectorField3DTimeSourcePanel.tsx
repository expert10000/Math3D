import { useRef, useState } from "react";
import { createTemporalFieldSourceDocument, projectTemporalFieldSourceStatus,
  sampleTemporalFieldProbe, sampleTemporalFieldSlice, computeTemporalPathline,
  projectTemporalPathlineStatus, type CurveDocument,
  type Math3DProject, type TemporalFieldSourceDocument, type VerifiedTemporalTransfers,
  type VectorField3DDocument } from "@math3d/core";
import { loadVerifiedVectorFieldTransfer } from "./loadVerifiedVectorFieldTransfer";

export function VectorField3DTimeSourcePanel({ document, project, onSave, onSavePathline }: {
  document: VectorField3DDocument; project: Math3DProject | null | undefined;
  onSave?: (temporal: TemporalFieldSourceDocument, transfers?: VerifiedTemporalTransfers) => void;
  onSavePathline?: (curve: CurveDocument, transfers?: VerifiedTemporalTransfers) => void;
}) {
  const [secondId, setSecondId] = useState("");
  const [laterTime, setLaterTime] = useState(1);
  const [interpolation, setInterpolation] = useState<"none" | "linear">("none");
  const [sampleTime, setSampleTime] = useState(0.5);
  const [sampleId, setSampleId] = useState("");
  const [sampleMessage, setSampleMessage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pathlineBusy, setPathlineBusy] = useState(false);
  const [pathlineProgress, setPathlineProgress] = useState("");
  const cancelPathline = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const candidates = project?.workspace.entries.filter(item => item.module === "vector3d" &&
    item.expected.id !== document.identity.id) ?? [];
  const saved = project?.workspace.timeSources?.filter(item => item.source.frames.some(frame =>
    frame.documentId === document.identity.id)) ?? [];
  const pathlines = project?.workspace.entries.filter(item => item.module === "curve" &&
    item.checkpoint.format === "math3d.curve-document" &&
    item.checkpoint.source.definition.familyId === "vector3d.temporal-pathline" &&
    saved.some(source => source.identity.id ===
      (item.checkpoint as CurveDocument).source.definition.sourceIds?.[0])) ?? [];
  const loadTransfers = async (ids: readonly string[]): Promise<VerifiedTemporalTransfers> => {
    const transfers = new Map();
    for (const id of ids) {
      const frame = project?.workspace.entries.find(item => item.module === "vector3d" &&
        item.expected.id === id)?.checkpoint;
      if (frame?.format !== "math3d.vector-field3d-document")
        throw new TypeError("A saved temporal frame is missing.");
      if (frame.source.field.kind === "scientific-bundle")
        transfers.set(id, await loadVerifiedVectorFieldTransfer(frame));
    }
    return transfers;
  };
  const save = async () => {
    setError(""); setMessage("");
    try {
      if (!project || !onSave) throw new TypeError("Open a saved Project first.");
      const first = project.workspace.entries.find(item => item.module === "vector3d" &&
        item.expected.id === document.identity.id);
      if (!first || first.expected.revision !== document.identity.revision ||
          first.expected.structuralHash !== document.identity.structuralHash)
        throw new TypeError("Save the current vector source in the Project first.");
      const transfers = await loadTransfers([document.identity.id, secondId]);
      const temporal = createTemporalFieldSourceDocument(project, [
        { time: 0, documentId: document.identity.id },
        { time: laterTime, documentId: secondId }],
      { stableKey: { first: document.identity.id, second: secondId, time: laterTime,
          interpolation },
        title: `${document.metadata.title} · two times`, timeUnit: document.source.timeUnit,
        interpolation, transfers });
      onSave(temporal, transfers);
      setMessage(`Saved ${interpolation} time source ${temporal.identity.id}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const runPathline = async () => {
    setError(""); setMessage(""); setPathlineProgress("");
    cancelPathline.current = false;
    setPathlineBusy(true);
    try {
      if (!project || !sampleId || !onSavePathline)
        throw new TypeError("Choose a saved temporal source in a Project.");
      const temporal = saved.find(item => item.identity.id === sampleId)!;
      const transfers = await loadTransfers(temporal.source.frames.map(frame => frame.documentId));
      const firstTime = temporal.source.frames[0]!.time;
      const lastTime = temporal.source.frames.at(-1)!.time;
      const seed = document.source.axes.map(axis => (axis.min + axis.max) / 2) as
        [number, number, number];
      const curve = await computeTemporalPathline(project, temporal,
        { seed, startTime: firstTime, endTime: lastTime,
          maxSteps: 64, method: "fixed-rk4" },
        { transfers, shouldCancel: () => cancelPathline.current,
          currentProject: () => projectRef.current ?? project,
          onProgress: (completed, total) => setPathlineProgress(`${completed}/${total} steps`),
          verifyBeforePublish: async () => loadTransfers(temporal.source.frames.map(frame =>
            frame.documentId)) });
      onSavePathline(curve, transfers);
      setMessage(`Saved physical pathline ${curve.metadata.title}; ` +
        `${curve.source.definition.settings?.stopReason} after ` +
        `${curve.source.definition.settings?.acceptedSteps} steps.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPathlineBusy(false); }
  };
  return <section aria-label="Temporal source contract" data-testid="gf22-time-source">
    <h5>Temporal source contract</h5>
    <p>Pin two saved Cartesian snapshots at physical times. Scientific frames are verified
      against their source bytes before sampling. Linear interpolation applies inside the common domain.</p>
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
    <button type="button" disabled={!secondId || !onSave} onClick={() => void save()}>Save temporal source</button>
    {saved.length > 0 && <><label>Saved source <select data-testid="gf25-saved-time-source-select"
      value={sampleId} onChange={event =>
      setSampleId(event.target.value)}><option value="">Choose time source</option>
      {saved.map(item => <option key={item.identity.id} value={item.identity.id}>
        {item.metadata.title} · {item.source.timeAxis.interpolation}</option>)}</select></label>
      <label>Sample time <input type="number" step="any" value={sampleTime}
        onChange={event => setSampleTime(Number(event.target.value))} /></label>
      <button type="button" disabled={!sampleId} onClick={() => void (async () => {
        setError(""); setSampleMessage("");
        try {
          const item = saved.find(source => source.identity.id === sampleId)!;
          const transfers = await loadTransfers(item.source.frames.map(frame => frame.documentId));
          const point = document.source.axes.map(axis => (axis.min + axis.max) / 2) as
            [number, number, number];
          const probe = sampleTemporalFieldProbe(project!, item, sampleTime, point, transfers);
          const slice = sampleTemporalFieldSlice(project!, item, sampleTime, 2, point[2], 9, transfers);
          setSampleMessage(`Probe |v| = ${probe.magnitude} ${probe.componentUnit}; ` +
            `z-slice ${slice.shape.join(" × ")} verified samples at ` +
            `${sampleTime} ${probe.timeUnit}.`);
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      })()}>Sample temporal probe and slice</button>
      <button type="button" data-testid="gf28-run-pathline"
        disabled={!sampleId || !onSavePathline || pathlineBusy}
        onClick={() => void runPathline()}>Run and save pathline</button>
      {pathlineBusy && <button type="button" onClick={() => { cancelPathline.current = true; }}>
        Cancel pathline</button>}
      {pathlineProgress && <p role="status">Pathline {pathlineProgress}</p>}
      {sampleMessage && <p role="status" data-testid="gf25-sample-result">{sampleMessage}</p>}</>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {saved.length > 0 && <details><summary>Saved temporal sources ({saved.length})</summary>
      <ul>{saved.map(item => {
        const status = projectTemporalFieldSourceStatus(project!, item);
        return <li key={item.identity.id}>{item.metadata.title}: {item.source.frames.length} frames,
          {" "}{item.source.timeAxis.unit}, {status.status === "current" ? "current" :
            `withheld (${status.reason})`}</li>;
      })}</ul></details>}
    {pathlines.length > 0 && <details><summary>Saved pathlines ({pathlines.length})</summary>
      <ul>{pathlines.map(item => {
        const curve = item.checkpoint as CurveDocument;
        const status = projectTemporalPathlineStatus(project!, curve);
        return <li key={curve.identity.id}>{curve.metadata.title}: {status.status}
          {status.reason ? ` (${status.reason})` : ""}; {curve.source.definition.pointCount} points,
          stop {String(curve.source.definition.settings?.stopReason)}</li>;
      })}</ul></details>}
  </section>;
}
