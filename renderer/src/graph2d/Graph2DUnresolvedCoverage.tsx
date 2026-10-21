import type { Graph2DUnresolvedInterval } from "@math3d/core";

const labels: Record<Graph2DUnresolvedInterval["reason"], string> = {
  undefined: "Undefined source or derivative sample",
  "refinement-limit": "Adaptive refinement limit",
  "residual-check": "Bracket failed residual or continuity check",
  "derivative-check": "Derivative classification not confirmed",
  "work-limit": "Work or candidate limit; coverage unknown",
  coincident: "Coincident functions; isolated intersections undefined",
  multiple: "Several unresolved reasons; displayed as a conservative span",
};

export function Graph2DUnresolvedCoverage({ intervals }: {
  intervals: readonly Graph2DUnresolvedInterval[];
}) {
  if (!intervals.length) return null;
  return <details className="graph2d-unresolved-coverage" data-testid="graph2d-unresolved-coverage"
    open={intervals.length <= 8}>
    <summary>Unresolved x-intervals ({intervals.length})</summary>
    <ol>{intervals.map((item, index) => <li key={`${item.min}:${item.max}:${item.reason}:${index}`}>
      x ∈ [{item.min.toPrecision(7)}, {item.max.toPrecision(7)}] · {labels[item.reason]}
    </li>)}</ol>
    <small>Shading marks where this bounded scan could not classify coverage; it does not prove that other intervals contain every solution.</small>
  </details>;
}
