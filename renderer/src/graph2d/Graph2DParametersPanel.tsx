import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createGraph2DAnimationPlan, graph2DAnimationFrame, Graph2DAnimationPlayer, graph2DParameterDraftFromFields, graph2DParameterFields,
  graph2DParameterNumber, getGraph2DInteractivePresetGuidance, graph2DPublicationTableAllowance, quantizeGraph2DParameterValue, type Graph2DDocument, type Graph2DParameterAction,
  type Graph2DAnimationPlan, type Graph2DParameterFields, type Graph2DPublicationArtifact } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";

export function Graph2DParametersPanel({ document, onPreview, onCommit, settled, samplingError, onClose, compact = false, onExpand }: {
  document: Graph2DDocument; onPreview: (values: Record<string, number> | null) => void;
  onCommit: (action: Graph2DParameterAction) => void; settled: boolean; samplingError?: string; onClose: () => void;
  compact?: boolean; onExpand?: () => void;
}) {
  const [edit, setEdit] = useState<{ name?: string; fields: Graph2DParameterFields } | null>(null);
  const [preview, setPreview] = useState<{ name: string; text: string; value?: number } | null>(null);
  const configured = document.source.variables.filter(p => p.control);
  const guidance = getGraph2DInteractivePresetGuidance(document);
  const recommendedAnimation = () => ({ parameter: guidance?.animation.parameter ?? configured[0]?.name ?? "",
    from: String(guidance?.animation.from ?? configured[0]?.control?.min ?? -5), to: String(guidance?.animation.to ?? configured[0]?.control?.max ?? 5),
    frames: String(guidance?.animation.frames ?? 21), fps: String(guidance?.animation.fps ?? 10) });
  const [animation, setAnimation] = useState(recommendedAnimation);
  const [index, setIndex] = useState<number | null>(null), [running, setRunning] = useState(false), [message, setMessage] = useState("");
  const [outputs, setOutputs] = useState<readonly Graph2DPublicationArtifact[]>([]), [exporting, setExporting] = useState(false);
  const player = useRef(new Graph2DAnimationPlayer(setTimeout, handle => clearTimeout(handle as ReturnType<typeof setTimeout>)));
  const worker = useRef<Worker | null>(null), deadline = useRef<ReturnType<typeof setTimeout> | null>(null), generation = useRef(0);
  const stop = () => { player.current.stop(); setRunning(false); };
  const cancelExport = () => { generation.current++; worker.current?.terminate(); worker.current = null; if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setExporting(false); };
  useLayoutEffect(() => { const visibility = () => { if (globalThis.document.hidden) { stop(); cancelExport(); setPreview(null); setIndex(null); onPreview(null); } };
    globalThis.document.addEventListener("visibilitychange", visibility);
    return () => { player.current.stop(); generation.current++; worker.current?.terminate(); if (deadline.current) clearTimeout(deadline.current); globalThis.document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => { if (running && index !== null) { if (samplingError) { stop(); setMessage(samplingError); } else if (settled) player.current.settled(index); } }, [index, settled, running, samplingError]);
  useEffect(() => { stop(); cancelExport(); setOutputs([]); }, [animation]);
  const safely = (action: () => void) => { setMessage(""); try { action(); } catch (error) { stop(); cancelExport(); setMessage((error as Error).message); } };
  const scrub = (name: string, text: string, slider = false) => {
    stop(); setIndex(null); setPreview({ name, text });
    safely(() => { const p = configured.find(p => p.name === name)!;
      const raw = graph2DParameterNumber(text), value = slider ? quantizeGraph2DParameterValue(p.control!, raw) : raw;
      onPreview({ [name]: value }); setPreview({ name, text: slider ? String(value) : text, value }); });
  };
  const plan = (): Graph2DAnimationPlan => createGraph2DAnimationPlan(document, { parameter: animation.parameter,
    from: graph2DParameterNumber(animation.from), to: graph2DParameterNumber(animation.to), frames: graph2DParameterNumber(animation.frames), fps: graph2DParameterNumber(animation.fps) });
  const play = () => safely(() => { const recipe = plan(); setRunning(true); player.current.start(recipe, i => {
    const frame = graph2DAnimationFrame(document, recipe, i); setIndex(i); setPreview({ name: recipe.parameter, text: String(frame.value), value: frame.value }); onPreview({ [recipe.parameter]: frame.value });
  }, () => setRunning(false)); });
  const exportFrames = () => safely(() => {
    const recipe = plan(); stop(); cancelExport(); setOutputs([]); setExporting(true); const token = ++generation.current;
    const task = new Worker(new URL("./graph2dAnimationWorker.ts", import.meta.url), { type: "module" }); worker.current = task;
    const finish = () => { task.terminate(); worker.current = null; if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setExporting(false); };
    task.onmessage = event => { if (generation.current !== token) return;
      if (event.data.error) { finish(); setMessage(event.data.error); }
      else if (event.data.outputs) { finish(); setOutputs(event.data.outputs); setMessage("Frame report and manifest ready. Local files, no upload."); }
      else setMessage(`Exporting frame ${event.data.progress} / ${recipe.frames}…`);
    };
    task.onerror = event => { event.preventDefault(); if (generation.current === token) { finish(); setMessage(event.message || "Animation export worker failed."); } };
    task.onmessageerror = () => { if (generation.current === token) { finish(); setMessage("Animation export response could not be read."); } };
    deadline.current = setTimeout(() => { if (generation.current === token) { finish(); setMessage("Frame export exceeded 45 seconds. Reduce frames or visible objects."); } }, 45000);
    task.postMessage({ plan: recipe, publication: { document, size: { width: 640, height: 480 }, pointTables: Object.fromEntries(document.source.objects.flatMap(o =>
      o.kind === "point-series" && o.table.rowCount <= graph2DPublicationTableAllowance(document) && document.display.objects.some(s => s.objectId === o.id && s.visible)
        ? [[o.table.id, pointTableStore.resolve(o.table)]] : [])) } });
  });
  const download = (artifact: Graph2DPublicationArtifact) => { const url = URL.createObjectURL(new Blob([artifact.bytes.slice().buffer as ArrayBuffer], { type: artifact.mimeType }));
    const a = globalThis.document.createElement("a"); a.href = url; a.download = artifact.fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  if (compact) return <aside className="graph2d-parameter-cards" aria-label="On-graph parameter cards" data-testid="graph2d-parameter-cards"
    onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
    <header><strong>Parameter preview</strong><button onClick={onClose}>Hide parameter cards</button></header>
    {!configured.length && <p>Configure a parameter to add a slider.</p>}
    {configured.map(p => <label key={p.name}>{p.name} = {preview?.name === p.name ? preview.text : p.value} {p.control!.unit}
      <input aria-label={`${p.name} card slider`} type="range" min={p.control!.min} max={p.control!.max} step={p.control!.step}
        disabled={running || exporting} value={preview?.name === p.name && preview.value !== undefined ? preview.value : p.value}
        onChange={e => scrub(p.name, e.target.value, true)} /></label>)}
    <div><button disabled={!configured.length || running || exporting} onClick={play}>Play animation</button><button disabled={!running} onClick={stop}>Stop animation</button>
      <button disabled={running || exporting || preview?.value === undefined} onClick={() => safely(() => { if (preview?.value !== undefined) onCommit({ type: "parameter-value", name: preview.name, value: preview.value }); })}>Apply preview value</button>
      <button onClick={() => { stop(); setPreview(null); setIndex(null); onPreview(null); }}>Cancel preview</button>
      <button onClick={() => { stop(); setPreview(null); setIndex(null); onPreview(null); setAnimation(recommendedAnimation()); }}>Reset preview</button>
      <button onClick={onExpand}>Configure parameters</button></div>
    <p role="status">{message || (index === null ? "Preview is not saved. Apply commits one value." : `Frame ${index + 1} / ${animation.frames}`)}</p>
  </aside>;
  return <aside className="graph2d-parameters-panel" aria-label="Graph parameters" data-testid="graph2d-parameters"
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <header><h2>Parameters</h2><button data-testid="graph2d-parameters-close" onClick={onClose}>Close parameters</button></header>
    <p>Sliders and animation are previews. Apply commits one value; Cancel restores the saved source. Units are labels, not conversions.</p>
    {guidance && <section aria-label="Interactive recipe guidance"><strong>Matches {guidance.title}</strong><p>{guidance.description}</p>
      <small>Suggestions are matched to the current recipe, not stored origin. Editing its expressions, domains or controls removes these hints.</small></section>}
    {!configured.length && <p>Configure an existing named variable or add a parameter, then use its name in a function (for example a*x).</p>}
    {document.source.variables.map(p => <section key={p.name} aria-label={`Parameter ${p.name}`}>
      <strong>{p.name} = {p.value} {p.control?.unit}</strong>
      {guidance?.parameters.filter(hint => hint.name === p.name).map(hint => <div key={hint.name}><p>{hint.hint} Default {hint.defaultValue}.</p>
        <button disabled={running || exporting} onClick={() => scrub(p.name, String(hint.defaultValue))}>Preview default {p.name}</button></div>)}
      {p.control && <><label>{p.name} slider<input type="range" min={p.control.min} max={p.control.max} step="any" disabled={running || exporting}
        value={preview?.name === p.name && preview.value !== undefined ? preview.value : p.value}
        aria-valuetext={`${preview?.name === p.name && preview.value !== undefined ? preview.value : p.value} ${p.control.unit}`}
        onKeyDown={e => { const value = preview?.name === p.name && preview.value !== undefined ? preview.value : p.value;
          const next = e.key === "Home" ? p.control!.min : e.key === "End" ? p.control!.max : ["ArrowRight", "ArrowUp"].includes(e.key) ? value + p.control!.step :
            ["ArrowLeft", "ArrowDown"].includes(e.key) ? value - p.control!.step : null;
          if (next !== null) { e.preventDefault(); scrub(p.name, String(next), true); } }}
        onChange={e => scrub(p.name, e.target.value, true)} /></label>
        <label>{p.name} preview value<input value={preview?.name === p.name ? preview.text : String(p.value)} disabled={running || exporting}
          onChange={e => scrub(p.name, e.target.value)} /></label>
        <small>Range {p.control.min}…{p.control.max}; step {p.control.step}</small></>}
      <button disabled={running || exporting} onClick={() => setEdit({ name: p.name, fields: graph2DParameterFields(p) })}>Configure {p.name}</button>
      <button disabled={running || exporting} onClick={() => safely(() => onCommit({ type: "parameter-delete", name: p.name }))}>Delete {p.name}</button>
    </section>)}
    <button disabled={document.source.variables.length >= 16 || running || exporting} onClick={() => setEdit({ fields: graph2DParameterFields() })}>Add parameter</button>
    {edit && <form onSubmit={e => { e.preventDefault(); safely(() => { const draft = graph2DParameterDraftFromFields(edit.fields);
      onCommit(edit.name ? { type: "parameter-configure", name: edit.name, draft } : { type: "parameter-create", draft }); }); }}>
      {(Object.keys(edit.fields) as (keyof Graph2DParameterFields)[]).map(key => <label key={key}>Parameter {key}<input value={edit.fields[key]} maxLength={key === "name" ? 32 : 64}
        disabled={key === "name" && !!edit.name} onChange={e => setEdit({ ...edit, fields: { ...edit.fields, [key]: e.target.value } })} /></label>)}
      <button>Save parameter</button><button type="button" onClick={() => setEdit(null)}>Cancel configuration</button>
    </form>}
    <section aria-label="Deterministic animation"><h3>Deterministic animation</h3>
      {guidance && <button disabled={exporting} onClick={() => { stop(); setPreview(null); setIndex(null); onPreview(null); setAnimation(recommendedAnimation()); }}>Reset recommended animation</button>}
      <label>Animated parameter<select value={animation.parameter} disabled={exporting} onChange={e => { const p = configured.find(p => p.name === e.target.value)!;
        setAnimation({ ...animation, parameter: p.name, from: String(p.control!.min), to: String(p.control!.max) }); }}>
        {!configured.length && <option value="">Configure a parameter first</option>}{configured.map(p => <option key={p.name}>{p.name}</option>)}</select></label>
      {(["from", "to", "frames", "fps"] as const).map(key => <label key={key}>Animation {key}<input value={animation[key]} disabled={exporting}
        onChange={e => setAnimation({ ...animation, [key]: e.target.value })} /></label>)}
      <button onClick={play} disabled={!configured.length || running || exporting}>Play animation</button><button onClick={stop} disabled={!running}>Stop animation</button>
      <p role="status">{index === null ? "No active frame" : `Frame ${index + 1} / ${animation.frames}`} · nominal fps, slower sampling waits; no skipped mathematical frames.</p>
      <button onClick={exportFrames} disabled={!configured.length || exporting}>Prepare frame export</button>
      {exporting && <button onClick={() => { cancelExport(); setMessage("Frame export cancelled."); }}>Cancel frame export</button>}
      {outputs.map(o => <button key={o.format} onClick={() => download(o)}>{o.format === "html" ? "Download frame report" : "Download frame manifest"}</button>)}
      <p>640 × 480 SVG frame report and CSV manifest, not MP4/GIF. No analysis is recomputed.</p>
    </section>
    <div className="graph2d-parameter-preview-actions"><button disabled={running || exporting || preview?.value === undefined} onClick={() => safely(() => { if (preview?.value !== undefined) onCommit({ type: "parameter-value", name: preview.name, value: preview.value }); })}>Apply preview value</button>
      <button onClick={() => { stop(); setPreview(null); setIndex(null); onPreview(null); }}>Cancel preview</button></div>
    {message && <p role="status">{message}</p>}
  </aside>;
}
