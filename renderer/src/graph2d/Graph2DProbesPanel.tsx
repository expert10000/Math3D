import { useState } from "react";
import { graph2DPinnedProbeState, compareGraph2DProbes, GRAPH2D_MAX_PINNED_PROBES, type Graph2DDocument, type Graph2DProbeAction } from "@math3d/core";
export function Graph2DProbesPanel({ document, onAction, onLocate }: {
  document: Graph2DDocument; onAction: (action: Graph2DProbeAction) => void; onLocate: (id: string) => void;
}) {
  const [label, setLabel] = useState("Probe"), [labels, setLabels] = useState<Record<string, string>>({}), [error, setError] = useState("");
  const act = (action: Graph2DProbeAction) => { try { onAction(action); setError(""); } catch (e) { setError((e as Error).message); } };
  const probes = document.display.pinnedProbes ?? [];
  const canPin = document.source.objects.find(o => o.id === document.selection.probe?.objectId)?.kind === "explicit-cartesian";
  return <section className="graph2d-probes-panel" aria-label="Saved probes" data-testid="graph2d-probes">
    <h3>Saved probes ({probes.length}/{GRAPH2D_MAX_PINNED_PROBES})</h3>
    <label>New probe label<input maxLength={80} value={label} onChange={e => setLabel(e.target.value)} /></label>
    <button disabled={!canPin || probes.length >= GRAPH2D_MAX_PINNED_PROBES} onClick={() => act({ type: "pin", label })}>Pin current probe</button>
    <p>{compareGraph2DProbes(document)}</p>{error && <p role="alert">{error}</p>}
    {probes.map(p => { const state = graph2DPinnedProbeState(document, p); return <div key={p.id} className="graph2d-probe-card">
      <p>{p.label}: ({p.x.toPrecision(6)}, {p.y.toPrecision(6)}) · {state}{state === "invalid" ? " — outside domain, undefined or non-positive on log axes" : ""}</p>
      <label>Label for {p.label}<input maxLength={80} value={labels[p.id] ?? p.label} onChange={e => setLabels({ ...labels, [p.id]: e.target.value })} /></label>
      <button onClick={() => act({ type: "rename", id: p.id, label: labels[p.id] ?? p.label })}>Rename {p.label}</button>
      <button disabled={state === "stale" || state === "invalid"} onClick={() => onLocate(p.id)}>Locate {p.label}</button>
      <button aria-pressed={p.visible !== false} onClick={() => act({ type: "visibility", id: p.id })}>{p.visible === false ? "Show" : "Hide"} {p.label}</button>
      <button onClick={() => act({ type: "delete", id: p.id })}>Delete {p.label}</button>
    </div>; })}
  </section>;
}
