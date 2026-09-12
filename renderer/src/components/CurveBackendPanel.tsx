import React, { useMemo, useState } from "react";
import type { CanonicalCurveDefinition } from "../curveAnalysis/contracts";
import { CURVE_ENGINE_CAPABILITIES, defaultCurveEngineRegistry, type CurveEngineExecution, type CurveEngineId, type CurveEnginePoint, type CurveEngineOperation } from "../curveAnalysis/curveEngines";

export type CurveBackendPanelProps = { definition: CanonicalCurveDefinition; points: readonly CurveEnginePoint[] };

export const CurveBackendPanel: React.FC<CurveBackendPanelProps> = ({ definition, points }) => {
  const availability = useMemo(() => defaultCurveEngineRegistry.listAvailability(), []);
  const [execution, setExecution] = useState<CurveEngineExecution | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (backend: CurveEngineId, operation: CurveEngineOperation) => {
    setBusy(true);
    try {
      setExecution(await defaultCurveEngineRegistry.execute({ requestId: `curve-engine-ui:${Date.now()}`, operation, definition, points, tolerance: definition.sampling.tolerance ?? 1e-3, preferredEngine: backend, explicitBackendComparison: true, parameters: operation === "resample" ? { sampleCount: Math.max(8, points.length) } : undefined }));
    } finally { setBusy(false); }
  };
  return <div data-testid="curve-backend-panel" style={{ display: "grid", gap: 7 }}>
    <div><strong>Capability-based Curve engines</strong></div>
    <div data-testid="curve-backend-availability" style={{ display: "grid", gap: 4 }}>
      {availability.map((entry) => <div key={entry.engine} style={{ border: "1px solid #d6deea", borderRadius: 5, padding: 5 }}><strong>{entry.engine}</strong> · {entry.available ? "available" : "optional / unavailable"} · {entry.version}<div style={{ color: "#64748b" }}>{entry.detail}</div></div>)}
    </div>
    <div data-testid="curve-backend-authority">Exact and analytic operations: <strong>Math3D Curve Core authoritative</strong></div>
    <div>Capabilities: {CURVE_ENGINE_CAPABILITIES.length} registered · fallback is selected by operation.</div>
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}><button data-testid="curve-backend-vtk-compare" type="button" disabled={busy || points.length < 2} onClick={() => void run("vtk", "resample")}>Compare VTK resampling</button><button data-testid="curve-backend-cgal-compare" type="button" disabled={busy || points.length < 2} onClick={() => void run("cgal", "polyline-simplify")}>Compare CGAL simplification</button></div>
    {execution && <div data-testid="curve-backend-execution" style={{ border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff", padding: 6, display: "grid", gap: 2 }}>
      <strong>{execution.state} · {execution.backend} {execution.backendVersion}</strong>
      <span>{execution.operation} · {execution.inputCount} → {execution.outputCount} · {execution.runtimeMs.toFixed(2)} ms</span>
      <span>validation {execution.validation.finite ? "finite" : "invalid"} · mapping {execution.validation.sourceMapping} · parity {execution.validation.parityWithinTolerance == null ? "not comparable" : execution.validation.parityWithinTolerance ? "within tolerance" : "differs"}</span>
      <span>Curve {execution.provenance.curveId} r{execution.provenance.curveRevision} · dependency {execution.provenance.dependencyFingerprint}</span>
      {execution.fallback.used && <span>Fallback: {execution.fallback.reason}</span>}
      {execution.warnings.map((warning, index) => <span key={`curve-engine-warning-${index}`} style={{ color: "#9a3412" }}>{warning}</span>)}
    </div>}
    <div style={{ color: "#64748b" }}>Advanced engine parameters remain in Services or Mesh Analysis.</div>
  </div>;
};
