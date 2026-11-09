import React, { useRef, useState } from "react";
import { quantumInspectorEvidence, type QuantumInspectorEvidence,
  type QuantumInspectorSourceStatus } from "./quantumInspectorEvidence";
import "./quantumSceneInspector.css";

export const QUANTUM_INSPECTOR_TABS = ["View", "Data", "Science", "Provenance"] as const;
export type QuantumInspectorTab = typeof QUANTUM_INSPECTOR_TABS[number];
export function nextQuantumInspectorTab(current: QuantumInspectorTab, key: string): QuantumInspectorTab {
  const index = QUANTUM_INSPECTOR_TABS.indexOf(current);
  if (key === "Home") return QUANTUM_INSPECTOR_TABS[0];
  if (key === "End") return QUANTUM_INSPECTOR_TABS.at(-1)!;
  if (key === "ArrowRight") return QUANTUM_INSPECTOR_TABS[(index + 1) % QUANTUM_INSPECTOR_TABS.length];
  if (key === "ArrowLeft") return QUANTUM_INSPECTOR_TABS[(index + QUANTUM_INSPECTOR_TABS.length - 1) % QUANTUM_INSPECTOR_TABS.length];
  return current;
}

export type QuantumInspectorSummaryData = {
  view: string; mapped: number; deferred: number; stream?: string;
  datasets: readonly { id: string; count: number; components: number; unit: string }[];
  invariants: readonly { id: string; label: string; value: number | null; status: string; method?: string }[];
  limitations: readonly string[];
  provenance: { schema: string; model: string; runId: string; resultSha256: string; fingerprint: string;
    engine: string; engineVersion: string; kind?: "geometry-fixture" | "numerical-result" };
};

export function QuantumInspectorSummary({ data, sourceStatus, onInspectSource, onExportEvidence,
  evidenceStatus, onExportSupport, supportStatus }: {
  data: QuantumInspectorSummaryData; sourceStatus: QuantumInspectorSourceStatus;
  onInspectSource?: () => void | Promise<unknown>;
  onExportEvidence?: (evidence: QuantumInspectorEvidence) => void | Promise<void>;
  evidenceStatus?: string;
  onExportSupport: () => void | Promise<void>; supportStatus?: string }) {
  const [active, setActive] = useState<QuantumInspectorTab>("View");
  const [shown, setShown] = useState(16);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const evidence = quantumInspectorEvidence({ status: sourceStatus, fingerprint: data.provenance.fingerprint,
    runId: data.provenance.runId, resultSha256: data.provenance.resultSha256,
    schema: data.provenance.schema, model: data.provenance.model, engine: data.provenance.engine,
    engineVersion: data.provenance.engineVersion, kind: data.provenance.kind,
    datasets: data.datasets, invariants: data.invariants, limitations: data.limitations });
  const activate = (tab: QuantumInspectorTab) => {
    if (tab !== "View") void onInspectSource?.();
    setActive(tab);
  };
  const current = evidence.status === "current";
  return <section className="quantum-inspector-summary" aria-label="Quantum inspector" data-testid="quantum-inspector-summary"
    data-qualification={evidence.status}>
    <p role="status" data-testid="quantum-inspector-qualification"><strong>Source: {evidence.status}</strong> · {evidence.reason}</p>
    <p><strong>Recorded claim:</strong> {evidence.claim}</p>
    <p><strong>Independent check:</strong> {evidence.checkScope}</p>
    <div role="tablist" aria-label="Quantum inspector sections" className="quantum-inspector-tabs">
      {QUANTUM_INSPECTOR_TABS.map((tab, index) => <button key={tab} type="button" role="tab" id={`quantum-inspector-tab-${tab.toLowerCase()}`}
        aria-controls="quantum-inspector-panel" aria-selected={active === tab} tabIndex={active === tab ? 0 : -1}
        ref={element => { refs.current[index] = element; }} onClick={() => activate(tab)}
        onKeyDown={event => { const next = nextQuantumInspectorTab(active, event.key);
          if (next !== active) { event.preventDefault(); activate(next); refs.current[QUANTUM_INSPECTOR_TABS.indexOf(next)]?.focus(); } }}>
        {tab}</button>)}
    </div>
    <div role="tabpanel" id="quantum-inspector-panel" aria-labelledby={`quantum-inspector-tab-${active.toLowerCase()}`} tabIndex={0}>
      {active === "View" && <><h3>Verified view</h3><p>{data.view}{current ? ` · ${data.mapped} rendered objects · ${data.deferred} deferred objects.` : " · object counts withheld pending source verification."}</p>
        {data.stream && <p role="status">{data.stream}</p>}<p>Geometry is a bounded preview; exact samples are read from the source bundle when inspected.</p></>}
      {active === "Data" && <><h3>Datasets{current ? ` (${evidence.datasets.length})` : ""}</h3>
        {!current ? <p role="status">Dataset values withheld: {evidence.reason}</p> : evidence.datasets.length ?
          <ul>{evidence.datasets.slice(0, shown).map(item => <li key={item.id}>
          <code>{item.id}</code> · {item.count} × {item.components} · {item.unit}</li>)}</ul> : <p>No numeric datasets supplied.</p>}
        {current && shown < evidence.datasets.length && <button type="button" onClick={() => setShown(count => Math.min(evidence.datasets.length, count + 16))}>
          Show next datasets ({evidence.datasets.length - shown} remaining)</button>}</>}
      {active === "Science" && <><h3>Producer science</h3>
        {!current ? <p role="status">Invariant values withheld: {evidence.reason}</p> : evidence.invariants.length ?
          <ul>{evidence.invariants.map(item => <li key={item.id}>
          {item.label}: {item.value ?? "undefined"} · producer status {item.status}{item.method ? ` · ${item.method}` : ""}</li>)}</ul> :
          <p>No invariant was supplied by this scene.</p>}
        {current && data.limitations.length ? <details><summary>Interpretation limits ({data.limitations.length})</summary>
          <ul>{data.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null}</>}
      {active === "Provenance" && <><h3>Exact source</h3><dl>
        <dt>Scene</dt><dd>{data.provenance.schema}</dd><dt>Model</dt><dd>{data.provenance.model}</dd>
        <dt>Engine</dt><dd>{data.provenance.engine} {data.provenance.engineVersion}</dd>
        <dt>Run ID</dt><dd><code>{data.provenance.runId}</code></dd>
        <dt>Result SHA-256</dt><dd><code>{data.provenance.resultSha256}</code></dd>
        <dt>Scene fingerprint</dt><dd><code>{data.provenance.fingerprint}</code></dd></dl>
        {onExportEvidence && <button type="button" disabled={!current}
          onClick={() => void onExportEvidence(evidence)}>Download Inspector evidence JSON</button>}
        {evidenceStatus && <p role={evidenceStatus.startsWith("Evidence export refused") ? "alert" : "status"}>
          {evidenceStatus}</p>}
        <button type="button" onClick={() => void onExportSupport()}>Download redacted support bundle</button>
        {supportStatus && <p role={supportStatus.startsWith("Support export refused") ? "alert" : "status"}>{supportStatus}</p>}</>}
    </div>
  </section>;
}
