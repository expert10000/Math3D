import { useEffect, useId, useRef, useState } from "react";
import { createGraph2DCaptureRecipe, graph2DPublicationTableAllowance, GRAPH2D_PUBLICATION_FORMATS, structuralHash,
  type Graph2DDocument, type Graph2DPublication, type Graph2DPublicationArtifact, type Graph2DPublicationTable,
  type Graph2DPublicationFormat } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";
import "./graph2dExport.css";

type ExportResult = { metadata: Graph2DPublication["metadata"]; snapshotId: Graph2DPublication["snapshotId"];
  outputs: { format: Graph2DPublicationFormat; artifact?: Graph2DPublicationArtifact; error?: string }[] };

export function Graph2DExportDialog({ document, analyses, analysisNotes, onClose }: {
  document: Graph2DDocument; analyses: readonly Graph2DPublicationTable[]; analysisNotes: readonly string[]; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null), closeRef = useRef<HTMLButtonElement>(null), titleId = useId();
  const [resolution, setResolution] = useState("1024x768"), [units, setUnits] = useState({ x: "", y: "" });
  const [attribution, setAttribution] = useState("Math3D Graph publication");
  const [retry, setRetry] = useState(0), [state, setState] = useState<{ key: string; result?: ExportResult; error?: string }>({ key: "" });
  const inputKey = structuralHash({ document, analyses, analysisNotes, resolution, units, retry }), latestKey = useRef(inputKey);
  latestKey.current = inputKey;
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); closeRef.current?.focus(); return () => dialog.close(); }, []);
  useEffect(() => {
    let stopped = false, finished = false, worker: Worker | null = null, deadline: ReturnType<typeof setTimeout> | undefined;
    setState({ key: inputKey });
    const timer = setTimeout(() => {
      try {
        worker = new Worker(new URL("./graph2dPublicationWorker.ts", import.meta.url), { type: "module" });
        const finish = (next: { result?: ExportResult; error?: string }) => {
          if (finished) return; finished = true;
          worker?.terminate(); clearTimeout(deadline);
          if (!stopped && latestKey.current === inputKey) setState({ key: inputKey, ...next });
        };
        deadline = setTimeout(() => finish({ error: "Export exceeded its worker deadline. Try 640 × 480 or fewer visible objects." }), 8000);
        worker.onmessage = event => finish(event.data.error ? { error: event.data.error } : { result: event.data });
        worker.onerror = event => { event.preventDefault(); finish({ error: event.message || "Export worker failed." }); };
        worker.onmessageerror = () => finish({ error: "Export worker response could not be read." });
        const [width, height] = resolution.split("x").map(Number), allowance = graph2DPublicationTableAllowance(document);
        const pointTables = Object.fromEntries(document.source.objects.flatMap(object => object.kind === "point-series" &&
          object.table.rowCount <= allowance && document.display.objects.some(s => s.objectId === object.id && s.visible)
          ? [[object.table.id, pointTableStore.resolve(object.table)]] : []));
        worker.postMessage({ request: { document, size: { width, height }, units, pointTables, analyses, analysisNotes } });
      } catch (error) { worker?.terminate(); clearTimeout(deadline); if (!stopped && latestKey.current === inputKey) setState({ key: inputKey, error: (error as Error).message }); }
    }, 250);
    return () => { stopped = true; clearTimeout(timer); clearTimeout(deadline); worker?.terminate(); };
  }, [inputKey]);
  // Source/view/settings replacements invalidate results synchronously, even before effect cleanup.
  const current = state.key === inputKey ? state : null, result = current?.result;
  const download = (artifact: Graph2DPublicationArtifact) => {
    const url = URL.createObjectURL(new Blob([artifact.bytes.slice().buffer as ArrayBuffer], { type: artifact.mimeType }));
    const anchor = globalThis.document.createElement("a"); anchor.href = url; anchor.download = artifact.fileName;
    globalThis.document.body.append(anchor); anchor.click(); anchor.remove();
    // Allow the browser/Electron download to consume the URL; retain no application reference.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadRecipe = () => {
    if (!result) return;
    const theme = globalThis.document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const recipe = createGraph2DCaptureRecipe(document, result, theme, attribution,
      { width: globalThis.innerWidth, height: globalThis.innerHeight });
    const url = URL.createObjectURL(new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }));
    const anchor = globalThis.document.createElement("a"); anchor.href = url;
    anchor.download = `${document.metadata.title.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 64) || "Graph"}.capture.json`;
    globalThis.document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <dialog ref={ref} className="graph2d-export-dialog" aria-labelledby={titleId} data-testid="graph2d-export"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id={titleId}>Graph publication export</h2><button ref={closeRef} onClick={onClose} aria-label="Close graph export">Close</button></header>
    <p>Local files from the committed viewport. No upload. Static exports are not editable Graph projects.</p>
    <div className="graph2d-export-settings"><label>Image size<select value={resolution} onChange={event => setResolution(event.target.value)}>
      <option value="640x480">640 × 480</option><option value="1024x768">1024 × 768</option><option value="1600x750">1600 × 750</option>
    </select></label>{(["x", "y"] as const).map(axis => <label key={axis}>{axis.toUpperCase()} unit label<input maxLength={64} value={units[axis]}
      placeholder="Unspecified" onChange={event => setUnits(previous => ({ ...previous, [axis]: event.target.value }))} /></label>)}</div>
    <p>Unit labels do not infer units or convert data. The requested image aspect may expand an equal-aspect viewport.</p>
    <label>Capture attribution <input maxLength={256} value={attribution} onChange={event => setAttribution(event.target.value)} /></label>
    {current?.error ? <p role="alert">{current.error} <button onClick={() => setRetry(value => value + 1)}>Retry export</button></p> :
      <p role="status">{result ? `Ready · ${result.metadata.objects.length} visible objects · ${result.metadata.analyses.length} current analysis tables` : "Preparing bounded export…"}</p>}
    <div className="graph2d-export-actions">{GRAPH2D_PUBLICATION_FORMATS.map(format => {
      const output = result?.outputs.find(item => item.format === format);
      return <div key={format}><button disabled={!output?.artifact} onClick={() => output?.artifact && download(output.artifact)}>
        {format === "html" ? "Export HTML report" : `Export ${format.toUpperCase()}`}</button>{output?.error && <p role="alert">{output.error}</p>}</div>;
    })}</div>
    <button type="button" disabled={!result} onClick={downloadRecipe}>Export capture recipe JSON</button>
    <p>The recipe records the committed source, viewport, effective publication size, theme, attribution and limits. External table rows and results are not embedded.</p>
    {result && <><p>Snapshot: <code>{result.snapshotId}</code> · tolerance: {result.metadata.sampling.tolerancePx} px</p>
      <ul>{result.metadata.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      <details><summary>Source and diagnostics</summary><pre>{JSON.stringify(result.metadata, null, 2)}</pre></details></>}
  </dialog>;
}
