import { useState } from "react";
import type {
  CanonicalSurfaceDefinition,
  SurfaceAnalysisPayload,
  SurfaceCurvatureClass,
  SurfaceCurvatureFieldPayload,
} from "../surfaceAnalysis/contracts";
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
  curvatureState,
  onComputeCurvature,
}: {
  definition: CanonicalSurfaceDefinition;
  selected: SurfaceComputationId;
  onSelect: (id: SurfaceComputationId) => void;
  configurationOpen: boolean;
  onOpenConfiguration: () => void;
  derivedMesh: { available: boolean; label: string; vertexCount: number; faceCount: number };
  onOpenDerivedMesh: () => void;
  curvatureState?: "unavailable" | "ready" | "computed";
  onComputeCurvature?: () => void;
}) {
  return (
    <section data-testid="surface-analysis-computation-panel" style={{ display: "grid", gap: 9 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>Compute</div>
        <div style={{ marginTop: 2, fontSize: 10.5, color: "#64748b" }}>
          Target: {definition.identity.label} · revision {definition.identity.surfaceRevision}
        </div>
      </div>
      {selected === "curvature-field" && (
        <section data-testid="surface-curvature-compute" style={{ border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", padding: 8, display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 10.5 }}>Canonical Curvature result</strong>
          <span style={{ color: "#475467", fontSize: 9.5 }}>Publishes K, H, k1, k2, shape index, curvedness, principal directions, masks, regions, statistics and provenance together.</span>
          <button type="button" data-testid="surface-curvature-compute-button" disabled={curvatureState === "unavailable"} onClick={onComputeCurvature}>
            {curvatureState === "computed" ? "Recompute Curvature" : curvatureState === "unavailable" ? "Curvature source unavailable" : "Compute Curvature"}
          </button>
        </section>
      )}
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

export type SurfaceCurvatureScalar = "K" | "H" | "k1" | "k2" | "shapeIndex" | "curvedness";

export function SurfaceCurvatureDisplayControls({
  field,
  scalar,
  palette,
  rangeMode,
  visible,
  directionsVisible,
  onSelectScalar,
  onSelectPalette,
  onSelectRangeMode,
  onToggleVisible,
  onToggleDirections,
}: {
  field: SurfaceCurvatureFieldPayload;
  scalar: SurfaceCurvatureScalar;
  palette: string;
  rangeMode: "automatic" | "percentile" | "symmetric";
  visible: boolean;
  directionsVisible: boolean;
  onSelectScalar: (scalar: SurfaceCurvatureScalar) => void;
  onSelectPalette: (palette: string) => void;
  onSelectRangeMode: (mode: "automatic" | "percentile" | "symmetric") => void;
  onToggleVisible: () => void;
  onToggleDirections: () => void;
}) {
  const stats = field.statistics[scalar];
  return (
    <section data-testid="surface-curvature-display-controls" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, padding: "5px 8px", borderBottom: "1px solid #dbe4f0", background: "#f8fbff", fontSize: 10 }}>
      <strong>Curvature</strong>
      <label>Field <select aria-label="Curvature scalar field" value={scalar} onChange={(event) => onSelectScalar(event.target.value as SurfaceCurvatureScalar)}>
        <option value="K">K</option><option value="H">H</option><option value="k1">k1</option><option value="k2">k2</option><option value="shapeIndex">Shape index</option><option value="curvedness">Curvedness</option>
      </select></label>
      <label>Palette <select aria-label="Curvature palette" value={palette} onChange={(event) => onSelectPalette(event.target.value)}>
        <option value="blueRed">Blue / red</option><option value="rainbow">Rainbow</option><option value="grayscale">Grayscale</option><option value="redYellow">Red / yellow</option>
      </select></label>
      <label>Range <select aria-label="Curvature range" value={rangeMode} onChange={(event) => onSelectRangeMode(event.target.value as "automatic" | "percentile" | "symmetric")}>
        <option value="automatic">Auto</option><option value="percentile">5–95%</option><option value="symmetric">Symmetric</option>
      </select></label>
      <button type="button" aria-pressed={visible} onClick={onToggleVisible}>{visible ? "Hide field" : "Show field"}</button>
      <button type="button" aria-pressed={directionsVisible} onClick={onToggleDirections}>{directionsVisible ? "Hide directions" : "Show directions"}</button>
      <span style={{ color: "#64748b" }}>{stats ? `${stats.min.toPrecision(3)} … ${stats.max.toPrecision(3)} · ${stats.count.toLocaleString()} valid` : "no valid values"}</span>
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
  curvatureActions,
}: {
  definition: CanonicalSurfaceDefinition;
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload> | null;
  historyCount: number;
  savedResultCount: number;
  probeRows: ReadonlyArray<{ label: string; value: string }>;
  curvatureActions?: {
    selectedField: SurfaceCurvatureScalar;
    visible: boolean;
    compareLabel: string;
    onSelectRegion: (classification: SurfaceCurvatureClass) => void;
    onSave: () => void;
    onCompare: () => void;
    onExport: () => void;
    onToggleVisible: () => void;
    onRecompute: () => void;
  };
}) {
  const [tab, setTab] = useState<InspectorTab>("result");
  const payloadKind = result?.payload?.data.kind ?? "none";
  const warnings = result?.payload?.warnings ?? definition.warnings;
  const curvature = result?.payload?.data.kind === "curvature" ? result.payload.data : null;
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
            {curvature && (
              <section data-testid="surface-curvature-result" style={{ display: "grid", gap: 6, marginTop: 5, paddingTop: 7, borderTop: "1px solid #e2e8f0" }}>
                <div><strong>Valid domain:</strong> {curvature.validDomainCount.toLocaleString()} / {curvature.sampleCount.toLocaleString()}</div>
                <div><strong>Units:</strong> K {curvature.units.K}; H/k1/k2 {curvature.units.H}; shape index {curvature.units.shapeIndex}</div>
                {curvatureActions && curvature.statistics[curvatureActions.selectedField] && (() => {
                  const stats = curvature.statistics[curvatureActions.selectedField]!;
                  return <div data-testid="surface-curvature-statistics"><strong>{curvatureActions.selectedField}:</strong> min {stats.min.toPrecision(4)} · max {stats.max.toPrecision(4)} · mean {stats.mean.toPrecision(4)} · RMS {stats.rms.toPrecision(4)} · p05/p95 {stats.p05.toPrecision(4)} / {stats.p95.toPrecision(4)} · extrema #{stats.minIndex}/#{stats.maxIndex}</div>;
                })()}
                {curvatureActions && curvature.statistics[curvatureActions.selectedField] && (
                  <div aria-label={`${curvatureActions.selectedField} histogram`} style={{ height: 28, display: "flex", alignItems: "end", gap: 1 }}>
                    {curvature.statistics[curvatureActions.selectedField]!.histogram.map((bin, index, bins) => {
                      const peak = Math.max(1, ...bins.map((entry) => entry.count));
                      return <span key={`${bin.min}-${index}`} title={`${bin.min.toPrecision(3)}…${bin.max.toPrecision(3)}: ${bin.count}`} style={{ flex: 1, minWidth: 2, height: `${Math.max(2, 100 * bin.count / peak)}%`, background: "#60a5fa" }} />;
                    })}
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {curvature.regions.filter((region) => region.classification !== "invalid").map((region) => (
                    <button key={region.classification} type="button" disabled={!region.indices.length} onClick={() => curvatureActions?.onSelectRegion(region.classification)}>
                      {region.classification} {region.indices.length.toLocaleString()}
                    </button>
                  ))}
                </div>
                {curvatureActions && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <button type="button" onClick={curvatureActions.onSave}>Save</button>
                  <button type="button" onClick={curvatureActions.onCompare}>Compare</button>
                  <button type="button" onClick={curvatureActions.onExport}>Export JSON</button>
                  <button type="button" onClick={curvatureActions.onToggleVisible}>{curvatureActions.visible ? "Hide" : "Show"}</button>
                  <button type="button" onClick={curvatureActions.onRecompute}>Recompute</button>
                  <span style={{ color: "#64748b", alignSelf: "center" }}>{curvatureActions.compareLabel}</span>
                </div>}
              </section>
            )}
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
