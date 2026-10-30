import React, { useState } from "react";
import { checkSageHealth } from "../../integrations/sage/sageClient";
import type { SageHealthResponse } from "../../integrations/sage/sageSchemas";

type Backend = "local" | "docker";
type Probe = { health?: SageHealthResponse; error?: string; checkedAt?: number };

const RUNTIMES: readonly { id: Backend; label: string; detail: string }[] = [
  { id: "local", label: "Local WSL", detail: "Bounded SageMath worker in WSL Ubuntu" },
  { id: "docker", label: "Docker", detail: "Separate SageMath container service" },
];

export default function SageRuntimeInspector() {
  const [probes, setProbes] = useState<Record<Backend, Probe>>({ local: {}, docker: {} });
  const [checking, setChecking] = useState<Backend | null>(null);

  const check = async (backend: Backend) => {
    setChecking(backend);
    try {
      const health = await checkSageHealth(backend);
      setProbes((current) => ({ ...current, [backend]: { health, checkedAt: Date.now() } }));
    } catch (error) {
      setProbes((current) => ({ ...current, [backend]: {
        error: error instanceof Error ? error.message : "SageMath health check failed.", checkedAt: Date.now(),
      } }));
    } finally {
      setChecking(null);
    }
  };

  return <section aria-label="SageMath runtimes" data-testid="sage-runtime-inspector" style={{ display: "grid", gap: 9 }}>
    <div>
      <strong style={{ fontSize: 14 }}>SageMath backends</strong>
      <div style={{ color: "#64748b", fontSize: 11 }}>Each health check runs only when requested. Status is recorded at check time.</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 9 }}>
      {RUNTIMES.map(({ id, label, detail }) => {
        const probe = probes[id];
        const status = probe.error ? "Unavailable" : probe.health ? probe.health.available ? "Available" : "Unavailable" : "Not checked";
        return <div key={id} data-testid={`sage-runtime-${id}`} style={{ border: "1px solid #dbe4f0", borderRadius: 8, padding: 11, background: "#fff", display: "grid", gap: 5, fontSize: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{label}</strong><span role="status" style={{ color: probe.error || probe.health?.available === false ? "#b42318" : probe.health?.available ? "#16803e" : "#64748b" }}>{status}</span></div>
          <div style={{ color: "#64748b" }}>{detail}</div>
          {probe.health && <>
            <div><strong>Engine:</strong> {probe.health.engine}</div>
            <div><strong>Reported status:</strong> {probe.health.status}</div>
            <div><strong>Operations:</strong> {probe.health.operations.length} declared</div>
          </>}
          {probe.error && <div role="alert" style={{ color: "#b42318", overflowWrap: "anywhere" }}>{probe.error}</div>}
          {probe.checkedAt && <div style={{ color: "#64748b" }}>Checked {new Date(probe.checkedAt).toLocaleString()}</div>}
          <button type="button" onClick={() => void check(id)} disabled={checking !== null} style={{ justifySelf: "start", fontSize: 11, padding: "4px 8px" }}>
            {checking === id ? "Checking…" : `Check ${label}`}
          </button>
        </div>;
      })}
    </div>
  </section>;
}
