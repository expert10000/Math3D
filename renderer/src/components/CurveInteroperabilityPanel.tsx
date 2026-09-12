import React, { useMemo, useState } from "react";
import { sampleUniform, type AnyCurve } from "@math3d/core";
import type { CanonicalCurveDefinition } from "../curveAnalysis/contracts";
import {
  createCurveToSurfaceRequest,
  detachCurveExchange,
  mapCurveLocationToSource,
  markCurveExchangeStale,
  openEvaluatorCurveInCurves,
  openSampledCurvesInCurves,
  type CanonicalCurveExchange,
  type CurveInteroperabilitySource,
  type SurfaceConstructionKind,
} from "../curveAnalysis/curveInteroperability";

const SOURCE_OPTIONS: ReadonlyArray<{ module: CurveInteroperabilitySource["module"]; kind: CurveInteroperabilitySource["kind"]; label: string }> = [
  { module: "geometry", kind: "analytic-curve", label: "Geometry analytic curve" },
  { module: "geometry", kind: "section", label: "Geometry section" },
  { module: "geometry", kind: "intersection", label: "Geometry intersection" },
  { module: "geometry", kind: "construction-path", label: "Geometry construction path" },
  { module: "geometry", kind: "boundary", label: "Geometry boundary" },
  { module: "geometry", kind: "edge-selection", label: "Geometry edge/path selection" },
  { module: "surfaces", kind: "boundary", label: "Surface boundary" },
  { module: "surfaces", kind: "iso-u", label: "Surface iso-u" },
  { module: "surfaces", kind: "iso-v", label: "Surface iso-v" },
  { module: "surfaces", kind: "geodesic", label: "Surface geodesic" },
  { module: "surfaces", kind: "section", label: "Surface section" },
  { module: "surfaces", kind: "principal-k1", label: "Surface principal curve" },
  { module: "surfaces", kind: "feature", label: "Surface feature curve" },
  { module: "surfaces", kind: "surface-intersection", label: "Surface/Surface intersection" },
];
const SURFACE_REQUESTS: SurfaceConstructionKind[] = ["extrusion", "revolution", "sweep", "ruled-surface", "loft", "tube-surface"];

export type CurveInteroperabilityPanelProps = {
  curve: AnyCurve | null;
  definition: CanonicalCurveDefinition;
  normalizedParameter: number;
  onOpenSource?: () => void;
  onOpenDerivative?: () => void;
};

export const CurveInteroperabilityPanel: React.FC<CurveInteroperabilityPanelProps> = ({ curve, definition, normalizedParameter, onOpenSource, onOpenDerivative }) => {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [exchange, setExchange] = useState<CanonicalCurveExchange | null>(null);
  const [surfaceKind, setSurfaceKind] = useState<SurfaceConstructionKind>("extrusion");
  const [status, setStatus] = useState("Choose a source workflow.");
  const option = SOURCE_OPTIONS[sourceIndex];
  const selection = useMemo(() => exchange ? mapCurveLocationToSource(exchange, exchange.runtimeCurve.domain.tMin + normalizedParameter * (exchange.runtimeCurve.domain.tMax - exchange.runtimeCurve.domain.tMin)) : null, [exchange, normalizedParameter]);

  const open = () => {
    if (!curve) return;
    const source: CurveInteroperabilitySource = {
      module: option.module, kind: option.kind, objectId: `${option.module}:${definition.identity.curveId}`,
      revision: definition.identity.curveRevision, label: option.label,
      hostSurface: option.module === "surfaces" ? { surfaceId: "active-surface", revision: definition.identity.curveRevision } : undefined,
      units: { position: definition.units.position, parameter: definition.units.parameter },
      generation: { tolerance: definition.sampling.tolerance ?? 1e-3, branch: 0 },
    };
    const exact = option.kind === "analytic-curve";
    const next = exact
      ? openEvaluatorCurveInCurves({ source, curve, exact: true }).branches[0]
      : (() => {
          const rows = sampleUniform(curve, Math.max(24, definition.sampling.minimumSamples ?? 64));
          const chart = option.module === "surfaces" ? [rows.map((_, index) => [index / Math.max(1, rows.length - 1), 0.5] as const)] : undefined;
          return openSampledCurvesInCurves({ source, branches: [rows.map((row) => row.point)], parameterBranches: chart, closed: definition.domain.closed, tolerance: definition.sampling.tolerance ?? 1e-3 }).branches[0];
        })();
    setExchange(next); setStatus(`Opened ${option.label} as ${next.fidelity}.`);
  };

  const routeSurface = () => {
    if (!exchange) return;
    try {
      const inputs = surfaceKind === "loft" || surfaceKind === "ruled-surface" ? [exchange, exchange] : [exchange];
      const request = createCurveToSurfaceRequest(surfaceKind, inputs, { tolerance: definition.sampling.tolerance ?? 1e-3 });
      setStatus(`Surface request ready: ${request.kind} · ${request.inputs.length} Curve input${request.inputs.length === 1 ? "" : "s"} · ${request.warnings.length} warning${request.warnings.length === 1 ? "" : "s"}.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };

  return <div data-testid="curve-interoperability" style={{ display: "grid", gap: 7, fontSize: 11, borderTop: "1px solid #d6deea", paddingTop: 8 }}>
    <strong>Geometry / Surface round trip</strong>
    <label>Receive from<select data-testid="curve-interop-source-kind" value={sourceIndex} onChange={(event) => setSourceIndex(Number(event.target.value))} style={{ width: "100%", marginTop: 3 }}>{SOURCE_OPTIONS.map((entry, index) => <option key={`${entry.module}-${entry.kind}-${index}`} value={index}>{entry.label}</option>)}</select></label>
    <button data-testid="curve-interop-open" type="button" onClick={open} disabled={!curve}>Open in Curves</button>
    {exchange && <div data-testid="curve-interop-exchange" style={{ border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff", padding: 6, display: "grid", gap: 2 }}>
      <strong>{exchange.fidelity} · {exchange.state}</strong><span>{exchange.source.module} / {exchange.source.kind} / revision {exchange.source.revision}</span><span>branch {exchange.source.branchId} · {exchange.correspondence.kind}</span><span>{exchange.approximationTolerance == null ? "Evaluator preserved" : `Approximation tolerance ${exchange.approximationTolerance}`}</span>
    </div>}
    {selection && <div data-testid="curve-interop-selection">Selection: {selection.state} · {selection.chart ? `chart (${selection.chart[0].toFixed(3)}, ${selection.chart[1].toFixed(3)})` : `source parameter ${selection.sourceParameter?.toFixed(3) ?? "n/a"}`}</div>}
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}><button type="button" onClick={onOpenSource}>Open source</button><button type="button" onClick={onOpenDerivative} disabled={!exchange?.navigation.derivative}>Open derivative</button><button data-testid="curve-interop-stale" type="button" disabled={!exchange} onClick={() => exchange && setExchange(markCurveExchangeStale(exchange, exchange.source.revision + 1))}>Simulate source revision</button><button type="button" disabled={!exchange} onClick={() => exchange && setExchange(detachCurveExchange(exchange))}>Detach</button></div>
    <div style={{ display: "flex", gap: 4 }}><select data-testid="curve-to-surface-kind" value={surfaceKind} onChange={(event) => setSurfaceKind(event.target.value as SurfaceConstructionKind)}>{SURFACE_REQUESTS.map((kind) => <option key={kind}>{kind}</option>)}</select><button data-testid="curve-to-surface-request" type="button" disabled={!exchange} onClick={routeSurface}>Send to Surface</button></div>
    <div data-testid="curve-interop-status" style={{ color: status.includes("Stale") || status.includes("requires") ? "#9a3412" : "#334155" }}>{status}</div>
  </div>;
};
