import { useState } from "react";
import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload } from "../surfaceAnalysis/contracts";
import type { SurfaceAnalysisResult } from "../surfaceAnalysis/infrastructure";
import { SurfaceAnalysisContractCard } from "./SurfaceAnalysisContractCard";

export type SurfaceComputationId =
  | "differential-geometry"
  | "curvature-field"
  | "surface-probe"
  | "surface-curves"
  | "surface-features"
  | "chart-diagnostics";

export const SURFACE_COMPUTATION_CHOICES: ReadonlyArray<{
  id: SurfaceComputationId;
  label: string;
  description: string;
}> = [
  { id: "differential-geometry", label: "Differential geometry", description: "Derivatives, metric, forms and shape operator" },
  { id: "curvature-field", label: "Curvature", description: "K, H, k1, k2 and principal directions" },
  { id: "surface-probe", label: "Local probe", description: "Inspect one represented Surface point" },
  { id: "surface-curves", label: "Surface curves", description: "Geodesics and principal curvature lines" },
  { id: "surface-features", label: "Features", description: "Ridges, valleys, umbilics and singularities" },
  { id: "chart-diagnostics", label: "Charts", description: "Metric determinant, orientation and distortion" },
];

export function SurfaceAnalysisComputationPanel({
  definition,
  selected,
  onSelect,
  configurationOpen,
  onOpenConfiguration,
  derivedMesh,
  onOpenDerivedMesh,
}: {
  definition: CanonicalSurfaceDefinition;
  selected: SurfaceComputationId;
  onSelect: (id: SurfaceComputationId) => void;
  configurationOpen: boolean;
  onOpenConfiguration: () => void;
  derivedMesh: { available: boolean; label: string; vertexCount: number; faceCount: number };
  onOpenDerivedMesh: () => void;
}) {
  return (
    <section data-testid="surface-analysis-computation-panel" style={{ display: "grid", gap: 9 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>Compute</div>
        <div style={{ marginTop: 2, fontSize: 10.5, color: "#64748b" }}>
          Target: {definition.identity.label} · revision {definition.identity.surfaceRevision}
        </div>
      </div>
      <div role="group" aria-label="Surface analysis computations" style={{ display: "grid", gap: 4 }}>
        {SURFACE_COMPUTATION_CHOICES.map((choice) => {
          const active = selected === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              data-testid={`surface-computation-${choice.id}`}
              aria-pressed={active}
              onClick={() => onSelect(choice.id)}
              style={{
                display: "grid",
                gap: 1,
                padding: "6px 8px",
                border: `1px solid ${active ? "#60a5fa" : "#dbe4f0"}`,
                borderRadius: 7,
                background: active ? "#eaf3ff" : "#fff",
                color: "#0f172a",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <strong style={{ fontSize: 10.5 }}>{choice.label}</strong>
              <span style={{ fontSize: 9.5, color: "#64748b" }}>{choice.description}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        data-testid="surface-analysis-open-configuration"
        aria-controls="surface-analysis-legacy-tools"
        aria-expanded={configurationOpen}
        onClick={onOpenConfiguration}
      >
        Configure selected computation
      </button>
      <section
        data-testid="surface-derived-mesh-bridge"
        style={{ border: "1px solid #c7d7ee", borderRadius: 8, background: "#f8fbff", padding: 8, display: "grid", gap: 5 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <strong style={{ fontSize: 10.5 }}>Derived SurfaceMesh</strong>
          <span style={{ color: derivedMesh.available ? "#15803d" : "#64748b", fontSize: 9.5, fontWeight: 800 }}>
            {derivedMesh.available ? "available" : "not generated"}
          </span>
        </div>
        <div style={{ color: "#475467", fontSize: 9.5 }}>
          {derivedMesh.label} · {derivedMesh.vertexCount.toLocaleString()} V / {derivedMesh.faceCount.toLocaleString()} F
        </div>
        <button type="button" onClick={onOpenDerivedMesh}>
          {derivedMesh.available ? "Open Mesh Analysis" : "Configure derived mesh"}
        </button>
      </section>
    </section>
  );
}

type InspectorTab = "result" | "probe" | "provenance" | "history";

export function SurfaceAnalysisInspectorPanel({
  definition,
  result,
  historyCount,
  savedResultCount,
  probeRows,
}: {
  definition: CanonicalSurfaceDefinition;
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload> | null;
  historyCount: number;
  savedResultCount: number;
  probeRows: ReadonlyArray<{ label: string; value: string }>;
}) {
  const [tab, setTab] = useState<InspectorTab>("result");
  const payloadKind = result?.payload?.data.kind ?? "none";
  const warnings = result?.payload?.warnings ?? definition.warnings;
  return (
    <section data-testid="surface-analysis-inspector" style={{ display: "grid", gap: 8, marginBottom: 10 }}>
      <SurfaceAnalysisContractCard definition={definition} result={result} historyCount={historyCount} />
      <div role="tablist" aria-label="Surface analysis Inspector" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {(["result", "probe", "provenance", "history"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`surface-analysis-tab-${id}`}
            aria-controls="surface-analysis-tabpanel"
            aria-selected={tab === id}
            data-testid={`surface-analysis-inspector-${id}`}
            onClick={() => setTab(id)}
            style={{ borderColor: tab === id ? "#60a5fa" : "#dbe4f0", background: tab === id ? "#eaf3ff" : "#fff" }}
          >
            {id[0].toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>
      <div
        id="surface-analysis-tabpanel"
        role="tabpanel"
        aria-labelledby={`surface-analysis-tab-${tab}`}
        style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", padding: 8, fontSize: 10.5 }}
      >
        {tab === "result" && (
          <div style={{ display: "grid", gap: 4 }}>
            <div><strong>State:</strong> {result?.state ?? "queued"}</div>
            <div><strong>Result:</strong> {result?.kind ?? "surface-definition"} · {payloadKind}</div>
            <div><strong>Method:</strong> {result?.payload?.method ?? "source-defined"}</div>
            <div><strong>Backend:</strong> {result?.backend ?? "pending"}</div>
            <div><strong>Saved:</strong> {savedResultCount ? `${savedResultCount} result reference${savedResultCount === 1 ? "" : "s"}` : "not saved"}</div>
            {result?.computeTimeMs != null && <div><strong>Compute time:</strong> {result.computeTimeMs.toFixed(1)} ms</div>}
            {!!warnings.length && <div style={{ color: "#9a3412" }}>{warnings.join(" · ")}</div>}
          </div>
        )}
        {tab === "probe" && (
          probeRows.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "4px 8px" }}>
              {probeRows.map((row) => (
                <div key={row.label} style={{ display: "contents" }}><strong>{row.label}</strong><span>{row.value}</span></div>
              ))}
            </div>
          ) : <div style={{ color: "#64748b" }}>Enable Probe and click the Surface to inspect local values.</div>
        )}
        {tab === "provenance" && (
          <div style={{ display: "grid", gap: 4 }}>
            <div><strong>Surface:</strong> {definition.identity.surfaceId}@{definition.identity.surfaceRevision}</div>
            <div><strong>Representation:</strong> {definition.representation}</div>
            <div><strong>Orientation:</strong> {definition.orientation.convention} ({definition.orientation.sign > 0 ? "+" : "−"})</div>
            <div><strong>Units:</strong> {definition.units.length}; angles {definition.units.angle}</div>
            <div><strong>Dependencies:</strong> {result?.dependencies.length ?? 0}</div>
          </div>
        )}
        {tab === "history" && (
          <div style={{ display: "grid", gap: 4 }}>
            <div><strong>{historyCount}</strong> revision-safe computation {historyCount === 1 ? "record" : "records"} in shared history.</div>
            <div><strong>{savedResultCount}</strong> saved result {savedResultCount === 1 ? "reference" : "references"} in the Surface workspace.</div>
          </div>
        )}
      </div>
    </section>
  );
}
