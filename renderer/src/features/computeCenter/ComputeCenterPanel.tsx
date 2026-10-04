import React, { useCallback, useEffect, useSyncExternalStore, useState } from "react";
import { cgalHealth } from "../../services/cgalMeshClient";
import { getMeshBackendCapabilities } from "../../services/meshBackend";
import { getPythonWorkerDiagnostics, type PythonWorkerDiagnosticsSnapshot } from "../../services/pythonWorkerDiagnosticsClient";
import type { ScientificBackendCapabilitySnapshot } from "@math3d/kernel";
import { discoverScientificBackends, getComputeJobs, subscribeComputeJobs, type ComputeJobRecord } from "./scientificJobTelemetry";

type MemorySnapshot = Awaited<ReturnType<NonNullable<Window["appDiagnostics"]>["getRendererMemory"]>>;
type Health = { ok: boolean; error?: string };

const card: React.CSSProperties = { border: "1px solid #dbe4f0", borderRadius: 10, background: "#f8fbff", padding: 14 };
const button: React.CSSProperties = { border: "1px solid #bfd2ed", borderRadius: 7, background: "#fff", padding: "5px 10px", color: "#183b70", cursor: "pointer" };
const labelFor = (job: ComputeJobRecord) => ({
  "curve.analyze": "Curve analysis",
  "volume.contour": "Volume isosurface",
  "mesh.analyze.differential": "Mesh curvature field",
} as Record<string, string>)[job.operationType] ?? job.operationType;
const statusColor = (ok: boolean | null) => ok === null ? "#64748b" : ok ? "#16803e" : "#a2530b";
const formatBytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;

export default function ComputeCenterPanel({ onClose, onManageEngines }: { onClose: () => void; onManageEngines: () => void }) {
  const jobs = useSyncExternalStore(subscribeComputeJobs, getComputeJobs, getComputeJobs);
  const [python, setPython] = useState<PythonWorkerDiagnosticsSnapshot | null>(null);
  const [cgal, setCgal] = useState<Health | null>(null);
  const [engines, setEngines] = useState<ComputeEngineSnapshot | null>(null);
  const [memory, setMemory] = useState<MemorySnapshot | null>(null);
  const [brokerBackends, setBrokerBackends] = useState<readonly ScientificBackendCapabilitySnapshot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capabilities = getMeshBackendCapabilities();
  const vtkBridge = capabilities.vtkPreviewImplicit || capabilities.vtkMeshCleanNormals || capabilities.vtkMeshDecimate || capabilities.vtkMeshSmooth || capabilities.vtkMeshBoolean;

  const refreshLive = useCallback(async () => {
    const [pythonResult, memoryResult] = await Promise.allSettled([
      getPythonWorkerDiagnostics(),
      window.appDiagnostics?.getRendererMemory() ?? Promise.resolve(null),
    ]);
    if (pythonResult.status === "fulfilled") setPython(pythonResult.value);
    if (memoryResult.status === "fulfilled") setMemory(memoryResult.value);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const [healthResult, engineResult, brokerResult] = await Promise.allSettled([
      cgalHealth(),
      window.computeEngines?.getStatus() ?? Promise.resolve(null),
      discoverScientificBackends(),
    ]);
    setCgal(healthResult.status === "fulfilled" ? healthResult.value : { ok: false, error: "Health check failed" });
    if (engineResult.status === "fulfilled") setEngines(engineResult.value);
    if (brokerResult.status === "fulfilled") setBrokerBackends(brokerResult.value);
    setError(engineResult.status === "rejected" ? "Compute engine status could not be read." : null);
    await refreshLive();
    setRefreshing(false);
  }, [refreshLive]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refreshLive(); }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh, refreshLive]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sage = engines?.engines.find((engine) => engine.id === "sage");
  const entries: Array<{ name: string; ok: boolean | null; detail: string }> = [
    { name: "JavaScript", ok: true, detail: "Local renderer" },
    { name: "Web Worker", ok: typeof Worker !== "undefined", detail: typeof Worker !== "undefined" ? "Browser worker available" : "Unavailable" },
    { name: "Python", ok: python ? python.available : null, detail: python?.statusMessage ?? "Checking…" },
    { name: "VTK", ok: !vtkBridge ? false : python ? python.available : null, detail: !vtkBridge ? "Bridge unavailable" : python?.available ? "Bridge and Python worker ready" : "Waiting for Python worker" },
    { name: "CGAL", ok: cgal?.ok ?? null, detail: cgal ? cgal.ok ? "Health check passed" : cgal.error ?? "Unavailable" : "Checking…" },
    { name: "Sage", ok: sage ? sage.healthy : null, detail: sage ? sage.statusText : "Checking…" },
  ];
  const activeBrokerJobs = jobs.filter((job) => job.status === "routing" || job.status === "running").length;

  return <div data-testid="compute-center-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 2650, background: "rgba(15, 23, 42, 0.4)", display: "grid", placeItems: "center", padding: 12 }}>
    <div role="dialog" aria-modal="true" aria-labelledby="compute-center-title" data-testid="compute-center" style={{ width: "min(900px, 96vw)", maxHeight: "90vh", overflow: "auto", border: "1px solid #cbd5e1", borderRadius: 12, background: "white", boxShadow: "0 18px 42px rgba(15, 23, 42, 0.24)", padding: 18, display: "grid", gap: 14 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
        <div><h2 id="compute-center-title" style={{ margin: 0, color: "#183b70", fontSize: 19 }}>Compute Center</h2><div style={{ color: "#64748b", fontSize: 12 }}>Local backends, scientific broker jobs, and live resources</div></div>
        <div style={{ display: "flex", gap: 8 }}><button type="button" style={button} onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button><button type="button" style={button} autoFocus onClick={onClose}>Close</button></div>
      </header>
      {error && <div role="status" style={{ color: "#b42318" }}>{error}</div>}
      <section style={card} aria-label="Local backends"><h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Local</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        {entries.map((entry) => <div key={entry.name} style={{ display: "flex", gap: 8, alignItems: "start", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px" }}><span aria-label={entry.ok === null ? "Checking" : entry.ok ? "Available" : "Unavailable"} style={{ color: statusColor(entry.ok), fontWeight: 800 }}>{entry.ok === null ? "○" : entry.ok ? "✓" : "○"}</span><div><strong style={{ fontSize: 12 }}>{entry.name}</strong><div style={{ fontSize: 11, color: "#64748b", overflowWrap: "anywhere" }}>{entry.detail}</div></div></div>)}
      </div><div style={{ color: "#64748b", fontSize: 11, marginTop: 10 }}>Broker routes discovered from active scientific job adapters</div>
      {brokerBackends.length ? <div data-testid="compute-center-broker-backends" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>{brokerBackends.map((backend) => <span key={backend.backendId} title={backend.operations.map((operation) => operation.operationType).join(", ")} style={{ background: "white", border: "1px solid #dbe4f0", borderRadius: 6, padding: "4px 7px", fontSize: 11 }}>{backend.availability === "available" ? "✓" : "○"} {backend.backendId} · {backend.transport}</span>)}</div> : <div style={{ color: "#64748b", fontSize: 11 }}>No broker adapters active yet.</div>}
      <button type="button" style={{ ...button, marginTop: 10 }} onClick={onManageEngines}>Manage engines</button></section>
      <section style={card} aria-label="Broker jobs"><h3 style={{ margin: "0 0 4px", fontSize: 14 }}>Jobs</h3><div style={{ color: "#64748b", fontSize: 11, marginBottom: 10 }}>Scientific broker history in this app session: Curve, Volume, and Mesh differential jobs.</div>
        {jobs.length === 0 ? <div data-testid="compute-center-empty-jobs" style={{ color: "#64748b", fontSize: 12 }}>No broker jobs have run in this session.</div> : <div style={{ display: "grid", gap: 6 }}>{jobs.map((job) => <div key={job.jobId} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) auto auto", gap: 10, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 7, background: "white", padding: "8px 10px", fontSize: 12 }}><div><strong>{labelFor(job)}</strong><div title={job.jobId} style={{ color: "#64748b", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.backendId ?? job.phase ?? job.jobId}</div></div><span style={{ textTransform: "capitalize", color: job.status === "failed" ? "#b42318" : job.status === "complete" ? "#16803e" : "#1d4ed8" }}>{job.status}</span><span>{job.progress === null ? "—" : `${Math.round(job.progress * 100)}%`}</span>{job.failure && <div style={{ gridColumn: "1 / -1", color: "#b42318", fontSize: 11 }}>{job.failure}</div>}</div>)}</div>}
      </section>
      <section style={card} aria-label="Resources"><h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Resources</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, fontSize: 12 }}>
        <div><strong>Renderer CPU</strong><div data-testid="compute-center-cpu">{memory?.ok && memory.cpuPercent !== undefined ? `${memory.cpuPercent.toFixed(1)}%` : "Unavailable"}</div></div>
        <div><strong>Renderer memory</strong><div data-testid="compute-center-memory">{memory?.ok && memory.workingSetBytes !== undefined ? formatBytes(memory.workingSetBytes) : "Unavailable"}</div></div>
        <div><strong>Broker jobs active</strong><div>{activeBrokerJobs}</div></div>
        <div><strong>Python worker admission</strong><div data-testid="compute-center-python-admission">{python?.admission ? `${python.admission.active} active · ${python.admission.queued} queued` : "Unavailable"}</div></div>
      </div></section>
    </div>
  </div>;
}
