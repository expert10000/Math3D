import { useEffect, useState } from "react";
import type {
  CanonicalSurfaceDefinition,
  SurfaceAnalysisPayload,
  SurfaceCurvatureClass,
  SurfaceCurvatureFieldPayload,
  SurfaceLocalProbePayload,
  SurfaceCurveLayersPayload,
  SurfaceFeatureLayersPayload,
  SurfaceChartPayload,
  SurfaceDerivedMeshPayload,
} from "../surfaceAnalysis/contracts";
import type { DerivedSurfaceMeshRecord } from "../surfaceAnalysis/derivedSurfaceMesh";
import type { SurfaceAnalysisResult } from "../surfaceAnalysis/infrastructure";
import type { SurfaceAnalysisExecutionState } from "../surfaceAnalysis/scheduler";
import { SURFACE_ANALYSIS_PRESETS, type SurfaceAnalysisPresetLayer } from "../surfaceAnalysis/presets";
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

const SURFACE_PRESET_LAYER_LABELS: Readonly<Record<SurfaceAnalysisPresetLayer, string>> = {
  "curvature-field": "Curvature",
  "principal-directions": "Directions",
  "local-probe": "Probe",
  "tangent-frame": "Tangent frame",
  "principal-lines": "Principal lines",
  ridges: "Ridges",
  valleys: "Valleys",
  umbilics: "Umbilics",
  "parabolic-set": "Parabolic set",
  "chart-grid": "Chart grid",
  seams: "Seams",
  orientation: "Orientation",
};

export function SurfaceAnalysisComputationPanel({
  definition,
  selected,
  onSelect,
  configurationOpen,
  onOpenConfiguration,
  derivedMesh,
  derivedMeshLifecycle,
  onOpenDerivedMesh,
  surfaceSourceHandoff,
  curvatureState,
  curvatureExecution,
  onComputeCurvature,
  onCancelCurvature,
  probeState,
  onProbeCurrentSample,
  curveLayerState,
  featureLayerState,
  onCollectCurveLayers,
  onCollectFeatureLayers,
  chartState,
  onComputeChart,
  activePresetId,
  presetStatus,
  onApplyPreset,
}: {
  definition: CanonicalSurfaceDefinition;
  selected: SurfaceComputationId;
  onSelect: (id: SurfaceComputationId) => void;
  configurationOpen: boolean;
  onOpenConfiguration: () => void;
  derivedMesh: { available: boolean; label: string; vertexCount: number; faceCount: number };
  derivedMeshLifecycle?: {
    selected: { id: string; label: string; state: string; sourceRevision: number; meshRevision: number; method: string; backend: string; backendVersion: string | null; variant: string; correspondence: string; mappedVertexCount: number; watertight: boolean | null; boundaryEdgeCount: number | null; staleReason?: string; historyCount: number } | null;
    records: ReadonlyArray<{ id: string; label: string; state: string }>;
    status: string;
    backendAvailability: "ready" | "checking" | "unavailable" | "browser-limited";
    backendAvailabilityMessage: string;
    onSelect: (id: string) => void;
    onRegenerate: () => void;
    onShowLive: () => void;
    onBake: () => void;
    onDetach: () => void;
    onDelete: () => void;
    onOpenSource: () => void;
    onInspect: () => void;
    onMapSourceToMesh: () => void;
    onMapMeshToSource: () => void;
    onRemesh: () => void;
    onRobustMesh: () => void;
  };
  onOpenDerivedMesh: () => void;
  surfaceSourceHandoff?: {
    label: string;
    sourceRevision: number;
    meshState: string;
    meshRevision: number;
    units: string;
    comparisonTarget: string;
    mappedSelectionCount: number;
    onReturn: () => void;
  } | null;
  curvatureState?: "unavailable" | "ready" | "computed";
  curvatureExecution?: "idle" | SurfaceAnalysisExecutionState;
  onComputeCurvature?: () => void;
  onCancelCurvature?: () => void;
  probeState?: "unavailable" | "ready" | "active";
  onProbeCurrentSample?: () => void;
  curveLayerState?: "ready" | "collected";
  featureLayerState?: "ready" | "collected";
  onCollectCurveLayers?: () => void;
  onCollectFeatureLayers?: () => void;
  chartState?: "unavailable" | "ready" | "computed";
  onComputeChart?: () => void;
  activePresetId?: string | null;
  presetStatus?: string;
  onApplyPreset?: (id: string) => void | Promise<void>;
}) {
  return (
    <section data-testid="surface-analysis-computation-panel" style={{ display: "grid", gap: 9 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>Compute</div>
        <div style={{ marginTop: 2, fontSize: 10.5, color: "#64748b" }}>
          Target: {definition.identity.label} · revision {definition.identity.surfaceRevision}
        </div>
      </div>
      <section data-testid="surface-analysis-presets" style={{ border: "1px solid #c7d7ee", borderRadius: 8, background: "#f8fbff", padding: 8, display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <strong style={{ fontSize: 10.5 }}>Layer presets</strong>
          <span style={{ color: "#64748b", fontSize: 9 }}>Current Surface</span>
        </div>
        <div style={{ color: "#64748b", fontSize: 9.5 }}>Build a useful analysis stack without replacing the Surface definition.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 5 }}>
          {SURFACE_ANALYSIS_PRESETS.map((preset) => {
            const active = preset.id === activePresetId;
            return <button
              key={preset.id}
              type="button"
              data-testid={`surface-analysis-preset-${preset.id}`}
              aria-pressed={active}
              onClick={() => void onApplyPreset?.(preset.id)}
              disabled={!onApplyPreset}
              title={preset.description}
              style={{ border: `1px solid ${active ? "#60a5fa" : "#dbe4f0"}`, borderRadius: 7, background: active ? "#eaf3ff" : "#fff", padding: "6px 7px", display: "grid", gap: 4, textAlign: "left", color: "#0f172a" }}
            >
              <strong style={{ fontSize: 10 }}>{preset.label}</strong>
              <span style={{ color: "#64748b", fontSize: 8.75, lineHeight: 1.25 }}>{preset.description}</span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {preset.layers.map((layer) => <span key={`${preset.id}-${layer}`} style={{ borderRadius: 999, background: active ? "#dbeafe" : "#eef2f7", padding: "1px 4px", color: "#475467", fontSize: 8 }}>{SURFACE_PRESET_LAYER_LABELS[layer]}</span>)}
              </span>
            </button>;
          })}
        </div>
        {presetStatus && <div data-testid="surface-analysis-preset-status" role="status" style={{ color: "#475467", fontSize: 9.5 }}>{presetStatus}</div>}
      </section>
      {surfaceSourceHandoff && (
        <section data-testid="surface-mesh-source-handoff" style={{ border: "1px solid #86b7fe", borderRadius: 8, background: "#eff6ff", padding: 8, display: "grid", gap: 5 }}>
          <strong style={{ fontSize: 10.5 }}>Surface source</strong>
          <span style={{ color: "#475467", fontSize: 9.5 }}>{surfaceSourceHandoff.label} · source revision {surfaceSourceHandoff.sourceRevision}</span>
          <span style={{ color: "#475467", fontSize: 9.5 }}>{surfaceSourceHandoff.meshState} · mesh revision {surfaceSourceHandoff.meshRevision} · {surfaceSourceHandoff.units} · {surfaceSourceHandoff.mappedSelectionCount} mapped selection</span>
          <span style={{ color: "#475467", fontSize: 9.5 }}>Comparison target: {surfaceSourceHandoff.comparisonTarget}</span>
          <button type="button" data-testid="surface-mesh-return-source" onClick={surfaceSourceHandoff.onReturn}>Open Surface Source</button>
        </section>
      )}
      {selected === "curvature-field" && (
        <section data-testid="surface-curvature-compute" style={{ border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", padding: 8, display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 10.5 }}>Canonical Curvature result</strong>
          <span style={{ color: "#475467", fontSize: 9.5 }}>Publishes K, H, k1, k2, shape index, curvedness, principal directions, masks, regions, statistics and provenance together.</span>
          <span data-testid="surface-curvature-execution-state" style={{ color: curvatureExecution === "failed" ? "#b42318" : "#475467", fontSize: 9.5 }}>Execution: {curvatureExecution ?? "idle"}</span>
          <div style={{ display: "grid", gridTemplateColumns: curvatureExecution === "running" || curvatureExecution === "progressive" || curvatureExecution === "queued" ? "1fr 1fr" : "1fr", gap: 4 }}>
            <button type="button" data-testid="surface-curvature-compute-button" disabled={curvatureState === "unavailable" || curvatureExecution === "running" || curvatureExecution === "progressive" || curvatureExecution === "queued"} onClick={onComputeCurvature}>
              {curvatureExecution === "failed" || curvatureExecution === "cancelled" ? "Retry Curvature" : curvatureState === "computed" ? "Recompute Curvature" : curvatureState === "unavailable" ? "Curvature source unavailable" : "Compute Curvature"}
            </button>
            {(curvatureExecution === "running" || curvatureExecution === "progressive" || curvatureExecution === "queued") && <button type="button" data-testid="surface-curvature-cancel-button" onClick={onCancelCurvature}>Cancel</button>}
          </div>
        </section>
      )}
      {selected === "surface-probe" && (
        <section data-testid="surface-probe-compute" style={{ border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", padding: 8, display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 10.5 }}>Local differential-geometry probe</strong>
          <span style={{ color: "#475467", fontSize: 9.5 }}>Click a valid Surface point, or start from the current represented sample.</span>
          <button type="button" data-testid="surface-probe-current-sample" disabled={probeState === "unavailable"} onClick={onProbeCurrentSample}>
            {probeState === "active" ? "Probe current sample again" : probeState === "unavailable" ? "Probe source unavailable" : "Probe current sample"}
          </button>
        </section>
      )}
      {(selected === "surface-curves" || selected === "surface-features") && (
        <section data-testid="surface-result-layer-compute" style={{ border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", padding: 8, display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 10.5 }}>{selected === "surface-curves" ? "Persistent Surface Curves" : "Persistent Surface Features"}</strong>
          <span style={{ color: "#475467", fontSize: 9.5 }}>Collect current computed geometry into revision-safe result layers with independent visibility and lifecycle.</span>
          <button type="button" data-testid={selected === "surface-curves" ? "surface-collect-curve-layers" : "surface-collect-feature-layers"} onClick={selected === "surface-curves" ? onCollectCurveLayers : onCollectFeatureLayers}>
            {(selected === "surface-curves" ? curveLayerState : featureLayerState) === "collected" ? "Recompute current layers" : "Collect current layers"}
          </button>
        </section>
      )}
      {selected === "chart-diagnostics" && (
        <section data-testid="surface-chart-compute" style={{ border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", padding: 8, display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 10.5 }}>Canonical Chart diagnostics</strong>
          <span style={{ color: "#475467", fontSize: 9.5 }}>Publishes domain bounds, seams, Jacobian rank, orientation, metric determinant, area/angle distortion and linked regions.</span>
          <button type="button" data-testid="surface-chart-compute-button" disabled={chartState === "unavailable"} onClick={onComputeChart}>
            {chartState === "computed" ? "Recompute Chart diagnostics" : chartState === "unavailable" ? "Global chart unavailable" : "Compute Chart diagnostics"}
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
      {!surfaceSourceHandoff && <section
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
        {derivedMeshLifecycle?.records.length ? <label style={{ fontSize: 9.5 }}>Record <select data-testid="surface-derived-mesh-record" value={derivedMeshLifecycle.selected?.id ?? ""} onChange={(event) => derivedMeshLifecycle.onSelect(event.target.value)}>{derivedMeshLifecycle.records.map((record) => <option key={record.id} value={record.id}>{record.label} · {record.state}</option>)}</select></label> : null}
        {derivedMeshLifecycle?.selected && <div data-testid="surface-derived-mesh-provenance" style={{ display: "grid", gap: 2, fontSize: 9.5, color: "#475467" }}>
          <span><strong>{derivedMeshLifecycle.selected.state}</strong> · mesh revision {derivedMeshLifecycle.selected.meshRevision} · source revision {derivedMeshLifecycle.selected.sourceRevision}</span>
          <span>{derivedMeshLifecycle.selected.variant} · {derivedMeshLifecycle.selected.method} · {derivedMeshLifecycle.selected.backend}{derivedMeshLifecycle.selected.backendVersion ? ` v${derivedMeshLifecycle.selected.backendVersion}` : ""}</span>
          <span>Watertight: {derivedMeshLifecycle.selected.watertight == null ? "unknown" : derivedMeshLifecycle.selected.watertight ? "yes" : "no"} · boundary edges: {derivedMeshLifecycle.selected.boundaryEdgeCount?.toLocaleString() ?? "unknown"}</span>
          <span>Mapping: {derivedMeshLifecycle.selected.correspondence} · {derivedMeshLifecycle.selected.mappedVertexCount.toLocaleString()} vertices · {derivedMeshLifecycle.selected.historyCount} history entries</span>
          {derivedMeshLifecycle.selected.staleReason && <span style={{ color: "#9a3412" }}>{derivedMeshLifecycle.selected.staleReason}</span>}
        </div>}
        {derivedMeshLifecycle && <>
          <div data-testid="surface-derived-mesh-primary-actions" role="group" aria-label="Surface Mesh workflows" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
            <button type="button" data-testid="surface-derived-mesh-live" disabled={!derivedMesh.available} onClick={derivedMeshLifecycle.onShowLive}>Mesh (live)</button>
            <button type="button" data-testid="surface-derived-mesh-bake" disabled={!derivedMeshLifecycle.selected} onClick={derivedMeshLifecycle.onBake}>Bake to Mesh</button>
            <button type="button" data-testid="surface-derived-mesh-open-analysis" disabled={!derivedMeshLifecycle.selected} onClick={onOpenDerivedMesh}>Open in Mesh Analysis</button>
          </div>
          <div style={{ color: "#64748b", fontSize: 9.5 }}>Mesh follows the current Surface. Bake creates an independently editable snapshot. Open sends the selected live or saved mesh to Mesh Analysis.</div>
          <div data-testid="surface-derived-mesh-backend-actions" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4 }}>
            <button type="button" data-testid="surface-derived-mesh-remesh" disabled={!derivedMeshLifecycle.selected || derivedMeshLifecycle.backendAvailability !== "ready"} onClick={derivedMeshLifecycle.onRemesh}>Remesh</button>
            <button type="button" data-testid="surface-derived-mesh-robust" disabled={!derivedMeshLifecycle.selected || derivedMeshLifecycle.backendAvailability !== "ready"} onClick={derivedMeshLifecycle.onRobustMesh}>Robust Mesh</button>
          </div>
          <div data-testid="surface-derived-mesh-backend-status" style={{ color: derivedMeshLifecycle.backendAvailability === "ready" ? "#166534" : "#9a3412", fontSize: 9.5 }}>CGAL backend: {derivedMeshLifecycle.backendAvailability} · {derivedMeshLifecycle.backendAvailabilityMessage} Advanced parameters, logs, validation, and fallback choices stay in Mesh Analysis.</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button type="button" data-testid="surface-derived-mesh-regenerate" disabled={!derivedMesh.available} onClick={derivedMeshLifecycle.onRegenerate}>{derivedMeshLifecycle.selected ? "Regenerate" : "Register live mesh"}</button>
            <button type="button" disabled={!derivedMeshLifecycle.selected} onClick={derivedMeshLifecycle.onDetach}>Detach</button>
            <button type="button" disabled={!derivedMeshLifecycle.selected} onClick={derivedMeshLifecycle.onDelete}>Delete</button>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button type="button" disabled={!derivedMeshLifecycle.selected} onClick={derivedMeshLifecycle.onOpenSource}>Open Surface source</button>
            <button type="button" data-testid="surface-derived-mesh-inspect" disabled={!derivedMeshLifecycle.selected} onClick={derivedMeshLifecycle.onInspect}>Inspect provenance</button>
            <button type="button" disabled={!derivedMeshLifecycle.selected} onClick={derivedMeshLifecycle.onMapSourceToMesh}>Map source selection</button>
            <button type="button" disabled={!derivedMeshLifecycle.selected} onClick={derivedMeshLifecycle.onMapMeshToSource}>Map mesh selection</button>
          </div>
          <div style={{ color: "#64748b", fontSize: 9.5 }}>{derivedMeshLifecycle.status}</div>
        </>}
        {!derivedMeshLifecycle && <button type="button" onClick={onOpenDerivedMesh}>{derivedMesh.available ? "Open in Mesh Analysis" : "Configure derived mesh"}</button>}
      </section>}
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
  preferredTab,
  historyCount,
  savedResultCount,
  probeRows,
  curvatureActions,
  probeActions,
  layerActions,
  chartActions,
  derivedMeshInspection,
}: {
  definition: CanonicalSurfaceDefinition;
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload> | null;
  preferredTab?: "result" | "probe";
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
  probeActions?: {
    probe: SurfaceLocalProbePayload;
    angleDeg: number;
    evidenceVisible: boolean;
    compareLabel: string;
    pinned: readonly SurfaceLocalProbePayload[];
    onChangeAngle: (angle: number) => void;
    onToggleEvidence: () => void;
    onPin: () => void;
    onCompare: () => void;
    onCopy: () => void;
    onExport: () => void;
    onReplay: (probe: SurfaceLocalProbePayload) => void;
  };
  layerActions?: {
    payload: SurfaceCurveLayersPayload | SurfaceFeatureLayersPayload;
    compareLabel: string;
    onAction: (layerId: string, action: "toggle" | "select" | "frame" | "save" | "compare" | "export" | "recompute" | "remove") => void;
  };
  chartActions?: {
    chart: SurfaceChartPayload;
    focusedIndex: number | null;
    onSelectIndex: (index: number) => void;
    onSelectRegion: (region: "degenerate" | "nearDegenerate" | "orientationFlip") => void;
    onToggleOverlay: (kind: "boundary" | "seam" | "orientation-flip" | "degenerate") => void;
    onSave: () => void;
    onExport: () => void;
    onRecompute: () => void;
  };
  derivedMeshInspection?: { record: DerivedSurfaceMeshRecord; payload: SurfaceDerivedMeshPayload | null };
}) {
  const [tab, setTab] = useState<InspectorTab>("result");
  const payloadKind = result?.payload?.data.kind ?? "none";
  const warnings = result?.payload?.warnings ?? definition.warnings;
  const curvature = result?.payload?.data.kind === "curvature" ? result.payload.data : null;
  useEffect(() => {
    if (result?.payload?.data.kind === "local-probe") setTab("probe");
  }, [result?.payload?.data.kind, result?.resultVersion]);
  useEffect(() => {
    if (preferredTab) setTab(preferredTab);
  }, [preferredTab]);
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
            {layerActions && <SurfaceResultLayersInspector {...layerActions} />}
            {chartActions && <SurfaceChartDiagnosticsInspector {...chartActions} />}
            {derivedMeshInspection && <SurfaceDerivedMeshInspector {...derivedMeshInspection} />}
            {!!warnings.length && <div style={{ color: "#9a3412" }}>{warnings.join(" · ")}</div>}
          </div>
        )}
        {tab === "probe" && probeActions ? (
          <SurfaceLocalProbeInspector {...probeActions} />
        ) : tab === "probe" && (
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

function SurfaceDerivedMeshInspector({ record, payload }: NonNullable<Parameters<typeof SurfaceAnalysisInspectorPanel>[0]["derivedMeshInspection"]>) {
  const identity = record.identity;
  return <section data-testid="surface-derived-mesh-inspector" style={{ display: "grid", gap: 5, marginTop: 6, paddingTop: 7, borderTop: "1px solid #e2e8f0" }}>
    <strong>{record.label}</strong>
    <div><strong>State:</strong> {identity.state} · mesh {identity.meshId}@{identity.meshRevision}</div>
    <div><strong>Source:</strong> {identity.source.surfaceId}@{identity.source.surfaceRevision} · {identity.sourceRepresentation}</div>
    <div><strong>Tessellation:</strong> {identity.tessellation.method} · {JSON.stringify(identity.tessellation.settings)}</div>
    <div><strong>Backend:</strong> {identity.backend.id}{identity.backend.version ? ` ${identity.backend.version}` : ""}</div>
    <div><strong>Created:</strong> {new Date(identity.createdAt).toISOString()}</div>
    <div><strong>Geometry:</strong> {record.vertexCount.toLocaleString()} vertices · {record.faceCount.toLocaleString()} faces</div>
    <div><strong>Correspondence:</strong> {record.correspondence.kind} · {record.correspondence.state} · {record.correspondence.mappedVertexCount.toLocaleString()}/{record.correspondence.vertexCount.toLocaleString()} mapped · confidence {record.correspondence.meanConfidence?.toPrecision(4) ?? "undefined"}</div>
    <div style={{ color: "#64748b" }}>{record.correspondence.explanation}</div>
    {identity.staleReason && <div style={{ color: "#9a3412" }}><strong>Stale:</strong> {identity.staleReason}</div>}
    <details open><summary>Regeneration history ({record.history.length})</summary>{record.history.map((entry) => <div key={entry.id}>{entry.action} · mesh r{entry.meshRevision} · source r{entry.sourceRevision} · {entry.detail}</div>)}</details>
    {payload && <div>Live payload correspondence: {payload.correspondence.kind} · {payload.correspondence.state} · {payload.correspondence.mappedVertexCount.toLocaleString()} mapped vertices.</div>}
  </section>;
}

function SurfaceChartDiagnosticsInspector({ chart, focusedIndex, onSelectIndex, onSelectRegion, onToggleOverlay, onSave, onExport, onRecompute }: NonNullable<Parameters<typeof SurfaceAnalysisInspectorPanel>[0]["chartActions"]>) {
  const width = 220; const height = 130;
  const uSpan = Math.max(1e-12, chart.domain.u.max - chart.domain.u.min);
  const vSpan = Math.max(1e-12, chart.domain.v.max - chart.domain.v.min);
  const sampleStride = Math.max(1, Math.ceil(chart.sampleCount / 300));
  const samples = Array.from({ length: chart.sampleCount }, (_, index) => index).filter((index) => index % sampleStride === 0);
  const formatStats = (key: keyof SurfaceChartPayload["statistics"]) => {
    const value = chart.statistics[key];
    return value ? `${value.min.toPrecision(4)} … ${value.max.toPrecision(4)} · mean ${value.mean.toPrecision(4)}` : "undefined";
  };
  return (
    <section data-testid="surface-chart-result" style={{ display: "grid", gap: 6, marginTop: 6, paddingTop: 7, borderTop: "1px solid #e2e8f0" }}>
      <strong>Chart diagnostics · {chart.sampleCount.toLocaleString()} samples</strong>
      <div>Domain: {chart.domain.u.label ?? "u"} [{chart.domain.u.min.toPrecision(4)}, {chart.domain.u.max.toPrecision(4)}] · {chart.domain.v.label ?? "v"} [{chart.domain.v.min.toPrecision(4)}, {chart.domain.v.max.toPrecision(4)}]</div>
      <div>Periodic seams: {chart.domain.periodicSeams.length ? chart.domain.periodicSeams.join(", ") : "none"} · atlas contract v{chart.atlas.version}</div>
      <div data-testid="surface-chart-metric-statistics"><strong>det(g):</strong> {formatStats("metricDeterminant")}<br/><strong>√det(g):</strong> {formatStats("areaScale")}<br/><strong>Area distortion:</strong> {formatStats("areaDistortion")}<br/><strong>Angle distortion:</strong> {formatStats("angleDistortion")}</div>
      <div style={{ color: "#64748b" }}>Reference: {chart.references.area}; {chart.references.angle}.</div>
      <svg data-testid="surface-chart-domain-view" role="img" aria-label="Parameter-domain diagnostic view" viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: width, border: "1px solid #dbe4f0", borderRadius: 6, background: "#f8fbff" }}>
        <rect x="4" y="4" width={width - 8} height={height - 8} fill="none" stroke="#94a3b8" />
        {samples.map((index) => {
          const u = chart.parameterCoordinates[index * 2]; const v = chart.parameterCoordinates[index * 2 + 1];
          const x = 4 + (width - 8) * (u - chart.domain.u.min) / uSpan;
          const y = height - 4 - (height - 8) * (v - chart.domain.v.min) / vSpan;
          const fill = chart.degeneracyMask[index] ? "#dc2626" : chart.orientationFlipMask[index] ? "#f59e0b" : chart.nearDegeneracyMask[index] ? "#a855f7" : "#2563eb";
          return <circle key={index} data-sample-index={index} cx={x} cy={y} r={focusedIndex === index ? 3.4 : 1.8} fill={fill} onClick={() => onSelectIndex(index)} style={{ cursor: "pointer" }} />;
        })}
      </svg>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button type="button" disabled={!chart.regions.degenerate.length} onClick={() => onSelectRegion("degenerate")}>Degenerate {chart.regions.degenerate.length}</button>
        <button type="button" disabled={!chart.regions.nearDegenerate.length} onClick={() => onSelectRegion("nearDegenerate")}>Near-degenerate {chart.regions.nearDegenerate.length}</button>
        <button type="button" disabled={!chart.regions.orientationFlip.length} onClick={() => onSelectRegion("orientationFlip")}>Orientation flips {chart.regions.orientationFlip.length}</button>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {chart.overlays.map((overlay) => <button key={overlay.kind} type="button" aria-pressed={overlay.visible} onClick={() => onToggleOverlay(overlay.kind)}>{overlay.visible ? "Hide" : "Show"} {overlay.label}</button>)}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}><button type="button" onClick={onSave}>Save</button><button type="button" onClick={onExport}>Export JSON</button><button type="button" onClick={onRecompute}>Recompute</button></div>
    </section>
  );
}

function SurfaceResultLayersInspector({ payload, compareLabel, onAction }: NonNullable<Parameters<typeof SurfaceAnalysisInspectorPanel>[0]["layerActions"]>) {
  return (
    <section data-testid="surface-result-layers" style={{ display: "grid", gap: 6, marginTop: 6, paddingTop: 7, borderTop: "1px solid #e2e8f0" }}>
      <strong>{payload.kind === "curve-layers" ? "Surface Curves" : "Surface Features"} · {payload.layers.length} layers</strong>
      {payload.layers.map((layer) => {
        const statistics = layer.statistics;
        const statisticsLabel = "totalLength" in statistics
          ? `${statistics.curveCount} curves · ${statistics.pointCount} points · length ${statistics.totalLength.toPrecision(4)}`
          : `${statistics.pointCount} points · ${statistics.curveCount} curves · confidence ${statistics.meanConfidence?.toPrecision(3) ?? "undefined"}`;
        return <article key={layer.layerId} data-testid={`surface-result-layer-${layer.layerKind}`} style={{ border: `1px solid ${layer.selected ? "#60a5fa" : "#dbe4f0"}`, borderRadius: 7, padding: 6, display: "grid", gap: 4 }}>
          <div><strong>{layer.label}</strong> · {layer.state} · {layer.method} · revision {layer.identity.surfaceRevision}</div>
          <div style={{ color: "#475467" }}>{statisticsLabel}</div>
          <div style={{ color: "#64748b" }}>Seed: {layer.selectionSource.kind}{layer.selectionSource.references.length ? ` (${layer.selectionSource.references.join(", ")})` : ""} · boundary: {layer.policy.boundaryBehavior}</div>
          {!!layer.warnings.length && <div style={{ color: "#9a3412" }}>{layer.warnings.join(" · ")}</div>}
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            <button type="button" onClick={() => onAction(layer.layerId, "toggle")}>{layer.visible ? "Hide" : "Show"}</button>
            <button type="button" disabled={layer.state !== "ready"} onClick={() => onAction(layer.layerId, "select")}>Select</button>
            <button type="button" disabled={layer.state !== "ready"} onClick={() => onAction(layer.layerId, "frame")}>Frame</button>
            <button type="button" onClick={() => onAction(layer.layerId, "save")}>Save</button>
            <button type="button" onClick={() => onAction(layer.layerId, "compare")}>Compare</button>
            <button type="button" onClick={() => onAction(layer.layerId, "export")}>Export</button>
            <button type="button" onClick={() => onAction(layer.layerId, "recompute")}>Recompute</button>
            <button type="button" onClick={() => onAction(layer.layerId, "remove")}>Remove</button>
          </div>
        </article>;
      })}
      <div style={{ color: "#64748b" }}>{compareLabel}</div>
    </section>
  );
}

const fmtProbe = (value: number | null, digits = 5) => value == null || !Number.isFinite(value) ? "undefined" : value.toPrecision(digits);
const fmtProbeVec = (value: readonly number[] | null) => value ? `(${value.map((entry) => fmtProbe(entry, 4)).join(", ")})` : "undefined";

function SurfaceLocalProbeInspector({
  probe,
  angleDeg,
  evidenceVisible,
  compareLabel,
  pinned,
  onChangeAngle,
  onToggleEvidence,
  onPin,
  onCompare,
  onCopy,
  onExport,
  onReplay,
}: NonNullable<Parameters<typeof SurfaceAnalysisInspectorPanel>[0]["probeActions"]>) {
  const I = probe.firstFundamentalForm;
  const II = probe.secondFundamentalForm;
  const [d1, d2] = probe.principalDirections ?? [null, null];
  const missing = Object.entries(probe.missing);
  return (
    <div data-testid="surface-local-probe-result" style={{ display: "grid", gap: 7 }}>
      <div><strong>{probe.probeId}</strong> · {probe.classification} · {probe.valid ? "valid" : "invalid"}</div>
      <div><strong>Position:</strong> {fmtProbeVec(probe.position)}</div>
      <div><strong>Domain:</strong> {probe.domainCoordinate.kind === "uv" ? `(u,v) = (${fmtProbe(probe.domainCoordinate.u)}, ${fmtProbe(probe.domainCoordinate.v)})` : probe.domainCoordinate.kind === "xy" ? `(x,y) = (${fmtProbe(probe.domainCoordinate.x)}, ${fmtProbe(probe.domainCoordinate.y)})` : probe.domainCoordinate.kind === "mesh" ? `mesh vertex ${probe.domainCoordinate.vertexIndex ?? "undefined"}, face ${probe.domainCoordinate.faceIndex ?? "undefined"}` : "world coordinate"}</div>
      <div><strong>Normal:</strong> {fmtProbeVec(probe.normal)}</div>
      <div><strong>Tangent basis:</strong> {probe.tangentBasis ? `${fmtProbeVec(probe.tangentBasis[0])}; ${fmtProbeVec(probe.tangentBasis[1])}` : "undefined"}</div>
      <div><strong>I = (E,F,G):</strong> {fmtProbeVec(I)}</div>
      <div><strong>II = (L,M,N):</strong> {fmtProbeVec(II)}</div>
      <div><strong>K / H:</strong> {fmtProbe(probe.gaussianCurvature)} / {fmtProbe(probe.meanCurvature)}</div>
      <div><strong>k1 / k2:</strong> {probe.principalCurvatures ? `${fmtProbe(probe.principalCurvatures[0])} / ${fmtProbe(probe.principalCurvatures[1])}` : "undefined"}</div>
      <div><strong>d1 / d2:</strong> {fmtProbeVec(d1)} / {fmtProbeVec(d2)}</div>
      <div><strong>Shape index / curvedness:</strong> {fmtProbe(probe.shapeIndex)} / {fmtProbe(probe.curvedness)}</div>
      <label>Normal-curvature angle θ = {Math.round(angleDeg)}°
        <input data-testid="surface-probe-angle" type="range" min={0} max={180} step={1} value={angleDeg} onChange={(event) => onChangeAngle(Number(event.target.value))} />
      </label>
      <div data-testid="surface-probe-normal-curvature"><strong>Euler:</strong> {probe.normalCurvature.formula} = {fmtProbe(probe.normalCurvature.value)}</div>
      <div><strong>Direction:</strong> {fmtProbeVec(probe.normalCurvature.direction)}</div>
      <button type="button" aria-pressed={evidenceVisible} onClick={onToggleEvidence}>{evidenceVisible ? "Hide probe evidence" : "Show probe evidence"}</button>
      <div style={{ color: "#475467" }}>Evidence: tangent plane {probe.evidence.tangentPlane ? "ready" : "undefined"}; normal {probe.evidence.normal ? "ready" : "undefined"}; principal axes {probe.evidence.principalAxes ? "ready" : "undefined"}; normal section {probe.evidence.normalSection ? "ready" : "undefined"}; osculating circle {probe.evidence.osculatingCircle ? "ready" : "undefined"}.</div>
      {!!missing.length && <details><summary>Undefined quantities ({missing.length})</summary>{missing.map(([key, reason]) => <div key={key}><strong>{key}:</strong> {reason}</div>)}</details>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        <button type="button" onClick={onPin}>Pin probe</button><button type="button" onClick={onCompare}>Compare</button><button type="button" onClick={onCopy}>Copy</button><button type="button" onClick={onExport}>Export JSON</button>
      </div>
      <div style={{ color: "#64748b" }}>{compareLabel}</div>
      {!!pinned.length && <details open><summary>Pinned probes ({pinned.length})</summary>{pinned.map((entry) => <button key={entry.probeId} type="button" onClick={() => onReplay(entry)}>Replay {entry.probeId}</button>)}</details>}
    </div>
  );
}
