import React, { useEffect, useRef, useState } from "react";
import type { CanonicalCurveDefinition } from "../curveAnalysis/contracts";
import { CURVE_OUTPUT_LIMITS, CURVE_PERFORMANCE_BUDGETS, type CurveComputationArtifact, type CurveWorkerOperation, type CurveWorkerProgress, type CurveWorkerRequest, type CurveWorkloadClass } from "../curveAnalysis/curveComputation";
import { createBrowserCurveWorkerCoordinator, type CurveWorkerHandle } from "../curveAnalysis/curveWorkerCoordinator";

export type CurveWorkerPanelProps = { definition: CanonicalCurveDefinition; points: readonly { x: number; y: number; z: number }[] };
const OPERATIONS: CurveWorkerOperation[] = ["sampling", "differential-field", "diagnostics", "intersections", "spline-fit", "derived-operation"];
const WORKLOADS: CurveWorkloadClass[] = ["1k", "10k", "100k", "high-curvature", "many-control-points"];

export const CurveWorkerPanel: React.FC<CurveWorkerPanelProps> = ({ definition, points }) => {
  const identityRef = useRef({ curveId: definition.identity.curveId, curveRevision: definition.identity.curveRevision }); identityRef.current = { curveId: definition.identity.curveId, curveRevision: definition.identity.curveRevision };
  const coordinatorRef = useRef<ReturnType<typeof createBrowserCurveWorkerCoordinator> | null>(null);
  if (!coordinatorRef.current) coordinatorRef.current = createBrowserCurveWorkerCoordinator((curveId) => curveId === identityRef.current.curveId ? identityRef.current.curveRevision : -1);
  const [operation, setOperation] = useState<CurveWorkerOperation>("sampling"); const [workload, setWorkload] = useState<CurveWorkloadClass>("10k");
  const [artifact, setArtifact] = useState<CurveComputationArtifact | null>(null); const [progress, setProgress] = useState<CurveWorkerProgress | null>(null); const [previewSeen, setPreviewSeen] = useState(false); const [active, setActive] = useState<CurveWorkerHandle | null>(null); const [lastRequest, setLastRequest] = useState<CurveWorkerRequest | null>(null);
  useEffect(() => () => coordinatorRef.current?.dispose(), []);
  const runHandle = (handle: CurveWorkerHandle) => { setActive(handle); setArtifact(null); void handle.promise.then((value) => { setArtifact(value); setActive(null); }); };
  const run = () => {
    const positions = new Float64Array(points.length * 3); points.forEach((point, index) => positions.set([point.x, point.y, point.z], index * 3)); const budget = CURVE_PERFORMANCE_BUDGETS[workload];
    const targetCount = operation === "sampling" ? budget.maximumSamples : Math.min(points.length, budget.maximumSamples);
    const request = coordinatorRef.current!.createRequest({ definition, operation, positions, targetCount, workload, consumers: ["viewport", "plots", "probes", "diagnostics", "derived", "curve-mesh"], parameters: operation === "spline-fit" ? { controlPoints: Math.min(points.length, budget.maximumControlPoints) } : operation === "derived-operation" ? { operation: "offset", offset: 0.1 } : undefined });
    setLastRequest(request); setProgress(null); setPreviewSeen(false);
    runHandle(coordinatorRef.current!.submit(request, { onProgress: (value) => { setProgress(value); if (value.previewLabel === "coarse-preview") setPreviewSeen(true); } }));
  };
  const retry = () => { if (!lastRequest) return; setProgress(null); runHandle(coordinatorRef.current!.retry(lastRequest, { onProgress: setProgress })); };
  return <div data-testid="curve-worker-panel" style={{ marginTop: 8, borderTop: "1px solid #d6deea", paddingTop: 7, display: "grid", gap: 6 }}>
    <strong>Worker execution and dependency cache</strong>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}><label>Operation<select data-testid="curve-worker-operation" value={operation} onChange={(event) => setOperation(event.target.value as CurveWorkerOperation)} style={{ width: "100%" }}>{OPERATIONS.map((value) => <option key={value}>{value}</option>)}</select></label><label>Budget<select data-testid="curve-worker-workload" value={workload} onChange={(event) => setWorkload(event.target.value as CurveWorkloadClass)} style={{ width: "100%" }}>{WORKLOADS.map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <div>Budget: ≤ {CURVE_PERFORMANCE_BUDGETS[workload].maximumSamples.toLocaleString()} samples · timeout {CURVE_PERFORMANCE_BUDGETS[workload].timeoutMs / 1000}s · transfer ≤ {CURVE_PERFORMANCE_BUDGETS[workload].maximumTransferBytes.toLocaleString()} bytes</div>
    <div style={{ display: "flex", gap: 4 }}><button data-testid="curve-worker-run" type="button" disabled={!!active || points.length < 2} onClick={run}>Run / reuse</button><button data-testid="curve-worker-cancel" type="button" disabled={!active} onClick={() => active?.cancel()}>Cancel</button><button data-testid="curve-worker-retry" type="button" disabled={!!active || !lastRequest || !artifact?.failure?.retryable} onClick={retry}>Retry</button></div>
    <div data-testid="curve-worker-lifecycle" style={{ border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff", padding: 6, display: "grid", gap: 2 }}>
      <strong>{active ? "running" : artifact?.state ?? "idle"}</strong>
      <span>{active?.requestId ?? artifact?.artifactId ?? "No request"}</span>
      {progress && <span>Progress {Math.round(progress.fraction * 100)}% · {progress.phase}</span>}
      {previewSeen && <span>Progressive result: coarse-preview (cannot replace full result)</span>}
      {artifact && <span>{artifact.output.length.toLocaleString()} values · {artifact.runtimeMs.toFixed(2)} ms · consumers {artifact.consumers.length}</span>}
      {artifact?.failure && <span style={{ color: "#9a3412" }}>{artifact.failure.code}: {artifact.failure.message} {artifact.failure.detail}</span>}
    </div>
    <div data-testid="curve-worker-cache">Cache: {coordinatorRef.current.cache.size} artifacts · {coordinatorRef.current.cache.byteLength.toLocaleString()} / {CURVE_OUTPUT_LIMITS.cacheBytes.toLocaleString()} bytes · render {CURVE_OUTPUT_LIMITS.renderPoints} · plots {CURVE_OUTPUT_LIMITS.plotPoints} · glyphs {CURVE_OUTPUT_LIMITS.frameGlyphs}</div>
  </div>;
};
