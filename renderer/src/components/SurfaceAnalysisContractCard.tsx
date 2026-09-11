import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload } from "../surfaceAnalysis/contracts";
import type { SurfaceAnalysisResult } from "../surfaceAnalysis/infrastructure";

export function SurfaceAnalysisContractCard({
  definition,
  result,
  historyCount,
}: {
  definition: CanonicalSurfaceDefinition;
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload> | null;
  historyCount: number;
}) {
  const state = result?.state ?? "queued";
  const method = result?.payload?.method ?? "source-defined";
  const stateColor = state === "ready" ? "#15803d" : state === "error" || state === "cancelled" ? "#b42318" : "#9a3412";
  return (
    <section
      data-testid="surface-analysis-contract"
      style={{
        border: "1px solid #bfdbfe",
        borderRadius: 9,
        background: "#f8fbff",
        padding: "8px 9px",
        marginBottom: 9,
        display: "grid",
        gap: 5,
        fontSize: 10.5,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong style={{ color: "#1d4ed8" }}>Canonical Surface</strong>
        <span data-testid="surface-analysis-contract-state" style={{ color: stateColor, fontWeight: 800 }}>{state}</span>
      </div>
      <div style={{ fontWeight: 800, color: "#0f172a" }}>{definition.identity.label}</div>
      <div data-testid="surface-analysis-contract-identity" style={{ color: "#475467" }}>
        {definition.representation} · revision {definition.identity.surfaceRevision} · {definition.identity.surfaceId}
      </div>
      <div style={{ color: "#475467" }}>
        Method: <strong>{method}</strong> · units: {definition.units.length} · orientation: {definition.orientation.convention}
      </div>
      <div style={{ color: "#64748b" }}>
        Shared result history: {historyCount} · dependencies: {result?.dependencies.length ?? 0}
      </div>
      {!!definition.warnings.length && (
        <div style={{ color: "#9a3412" }}>{definition.warnings.join(" · ")}</div>
      )}
    </section>
  );
}

