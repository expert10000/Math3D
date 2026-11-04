import { useEffect, useRef, useState } from "react";
import { reviewProjectDerivedField, serializeMath3DProject,
  type DerivedScalarIsosurface, type Math3DProject,
  type VectorField3DDocument } from "@math3d/core";

export function VectorField3DDerivedIsosurfacePanel({ document, project, onPromote }: {
  document: VectorField3DDocument; project?: Math3DProject | null;
  onPromote?: (surface: DerivedScalarIsosurface) => void }) {
  const [derivedId, setDerivedId] = useState("");
  const [level, setLevel] = useState(1);
  const [triangleBudget, setTriangleBudget] = useState(10_000);
  const [timeBudgetMs, setTimeBudgetMs] = useState(3000);
  const [surface, setSurface] = useState<DerivedScalarIsosurface | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const fields = project?.workspace.derivedFields?.filter(item =>
    item.output.kind === "scalar" && item.output.axes.length === 3 &&
    reviewProjectDerivedField(project, item.identity.id,
      source => source.source.field.kind === "expressions").status === "current") ?? [];
  useEffect(() => { workerRef.current?.terminate(); workerRef.current = null;
    setBusy(false); setSurface(null); }, [document.identity.structuralHash, project?.identity.structuralHash]);
  useEffect(() => () => { workerRef.current?.terminate(); }, []);
  const extract = () => { try {
    if (!project || !fields.some(item => item.identity.id === derivedId))
      throw new TypeError("Choose a current saved 3D scalar derived field.");
    if (!Number.isFinite(level) || !Number.isSafeInteger(triangleBudget) ||
        !Number.isSafeInteger(timeBudgetMs)) throw new RangeError("Invalid extraction budget.");
    workerRef.current?.terminate(); setSurface(null); setMessage(""); setBusy(true);
    const worker = new Worker(new URL("./derivedIsosurfaceWorker.ts", import.meta.url),
      { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{ ok: true; surface: DerivedScalarIsosurface } |
      { ok: false; error: string }>) => {
      if (workerRef.current !== worker) return;
      workerRef.current = null; worker.terminate(); setBusy(false);
      if (event.data.ok) { setSurface(event.data.surface);
        setMessage(`${event.data.surface.triangleCount} triangles; ${
          event.data.surface.complete ? "complete" : event.data.surface.limitReason}; ${
          event.data.surface.elapsedMs.toFixed(1)} ms.`); }
      else setMessage(event.data.error);
    };
    worker.onerror = event => { if (workerRef.current !== worker) return;
      workerRef.current = null; worker.terminate(); setBusy(false);
      setMessage(event.message || "Derived isosurface worker failed."); };
    worker.postMessage({ projectJson: serializeMath3DProject(project), derivedId,
      clipBounds: document.workspace?.clipBounds ?? document.source.axes.map(axis =>
        [axis.min, axis.max]), level, triangleBudget, timeBudgetMs });
  } catch (cause) { setBusy(false); setMessage(String((cause as Error).message ?? cause)); } };
  return <section aria-label="Derived scalar isosurfaces" data-testid="gf14-derived-isosurface">
    <h5>Derived scalar isosurface</h5>
    <label>Scalar recipe <select value={derivedId} onChange={event => {
      setDerivedId(event.target.value); setSurface(null); }}>
      <option value="">Choose a saved 3D scalar</option>
      {fields.map(item => <option key={item.identity.id} value={item.identity.id}>
        {item.metadata.title} ({item.output.unit})</option>)}
    </select></label>
    <label>Level <input type="number" value={level} onChange={event =>
      setLevel(Number(event.target.value))} /></label>
    <label>Triangle budget <input type="number" min={1} max={100000}
      value={triangleBudget} onChange={event =>
        setTriangleBudget(Number(event.target.value))} /></label>
    <label>Time budget (ms) <input type="number" min={1} max={30000}
      value={timeBudgetMs} onChange={event => setTimeBudgetMs(Number(event.target.value))} /></label>
    <button type="button" disabled={!project || !derivedId || busy} onClick={extract}>
      Extract derived scalar</button>
    {busy && <button type="button" onClick={() => { workerRef.current?.terminate();
      workerRef.current = null; setBusy(false); setMessage("Extraction cancelled."); }}>
      Cancel extraction</button>}
    {surface && <button type="button" disabled={!onPromote || !surface.triangleCount}
      onClick={() => { try { onPromote?.(surface); setMessage("Source-linked Mesh saved in Project."); }
        catch (cause) { setMessage(String((cause as Error).message ?? cause)); } }}>
      Promote derived scalar to Mesh</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
