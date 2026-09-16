import React, { useMemo, useState } from "react";
import type { VolumeDocument } from "@math3d/core";

import type { VolumeDataset } from "../scene/datasets";
import type { VolumeSliceHover, VolumeSliceReport } from "../scene/volume/sliceVolume";
import {
  describeVolumeDefinition,
  describeVolumeSource,
  isPinnedVolumeProbeStale,
  VOLUME_TRANSFER_PRESETS,
  volumeGridIndexToWorld,
  type PinnedVolumeProbe,
  type VolumeComputeDiagnostics,
  type VolumeDerivedResult,
  type VolumeObject,
  type VolumeOrientationConvention,
  type VolumeProbeComparison,
  type VolumeProbeReading,
  type VolumeSdfMetadata,
  type VolumeSdfOperation,
  type VolumeSdfSignDiagnostics,
  type VolumeDirectRenderStatus,
  type VolumeAnalysisSummary,
  type VolumeLabelDefinition,
  type VolumeLabelStatistics,
  type VolumeAlignmentPolicy,
  type VolumeComparisonSummary,
  type VolumeComparisonView,
  type VolumeRenderMode,
  type VolumeRenderQuality,
  type VolumeTextureSampling,
  type VolumeTransferFunction,
} from "../volume";

type VolumeInspectorTab = "volume" | "field" | "sampling" | "slice" | "rendering" | "sdf" | "analysis" | "segmentation" | "io" | "compare" | "derived" | "diagnostics" | "history";

export type VolumeInspectorPanelProps = {
  dataset: VolumeDataset;
  volumeObject: VolumeObject;
  kernelDocument?: VolumeDocument;
  valueRange: { min: number; max: number };
  viewMode: "slices" | "3d";
  crosshair: [number, number, number] | null;
  crosshairIndex: [number, number, number];
  crosshairSample: (VolumeProbeReading & { value: number; gradMag: number }) | null;
  paneIndices: Record<"x" | "y" | "z", number>;
  navigationLinked: boolean;
  voxelSnap: boolean;
  coarseStep: number;
  orientationConvention: VolumeOrientationConvention;
  navigationAnnouncement: string;
  probeName: string;
  pinnedProbes: readonly PinnedVolumeProbe[];
  probeCompareIds: readonly string[];
  probeComparison: VolumeProbeComparison | null;
  sliceReport: VolumeSliceReport | null;
  sliceHover: VolumeSliceHover | null;
  contourEnabled: boolean;
  contourCount: number;
  showIsosurface: boolean;
  isoValue: number;
  distanceBusy: boolean;
  distanceError: string | null;
  sdfMetadata: VolumeSdfMetadata | null;
  sdfDiagnostics: VolumeSdfSignDiagnostics | null;
  sdfOperation: VolumeSdfOperation;
  sdfAmount: number;
  sdfSmoothness: number;
  sdfPreviewActive: boolean;
  sdfStatus: string;
  renderMode: VolumeRenderMode;
  transferPresetId: string;
  transferFunction: VolumeTransferFunction;
  renderQuality: VolumeRenderQuality;
  textureSampling: VolumeTextureSampling;
  gradientOpacity: number;
  gradientShading: boolean;
  renderWindow: [number, number];
  directRenderStatus: VolumeDirectRenderStatus | null;
  definitionError: string | null;
  computeDiagnostics: VolumeComputeDiagnostics;
  derivedResults: readonly VolumeDerivedResult[];
  extractionEvidence?: readonly { derivedResultId: string; status: "current" | "stale" | "snapshot" | "unavailable"; relationId: string; artifactId: string }[];
  derivedBusy: boolean;
  analysisSummary: VolumeAnalysisSummary | null;
  analysisBusy: boolean;
  analysisThreshold: number;
  analysisHistoryCount: number;
  onRunAnalysis: () => void;
  onChangeAnalysisThreshold: (value: number) => void;
  onExportAnalysis: () => void;
  segmentationThreshold: number;
  segmentationLabels: readonly VolumeLabelDefinition[];
  segmentationStats: readonly VolumeLabelStatistics[];
  segmentationHasPreview: boolean;
  segmentationHistory: { undoDepth: number; redoDepth: number; ownedBytes: number };
  onChangeSegmentationThreshold: (value: number) => void;
  onPreviewSegmentation: () => void;
  onApplySegmentation: () => void;
  onCancelSegmentation: () => void;
  onUndoSegmentation: () => void;
  onRedoSegmentation: () => void;
  onUpdateSegmentationLabel: (id: number, patch: Partial<Omit<VolumeLabelDefinition, "id">>) => void;
  ioStatus: string;
  onImportScientificVolume: () => void;
  onExportScientificVolume: (format: "raw" | "npy" | "vti") => void;
  comparisonAlignment: VolumeAlignmentPolicy;
  comparisonView: VolumeComparisonView;
  comparisonThreshold: number;
  comparisonBaselineLabel: string | null;
  comparisonSummary: VolumeComparisonSummary | null;
  comparisonError: string | null;
  comparisonHistoryCount: number;
  comparisonSync: { camera: boolean; slices: boolean; crosshair: boolean; window: boolean };
  persistenceStatus: string;
  workspaceHistory: { undoDepth: number; redoDepth: number };
  onSaveWorkspace: () => void;
  onRestoreWorkspace: () => void;
  onUndoWorkspace: () => void;
  onRedoWorkspace: () => void;
  onCaptureComparisonBaseline: () => void;
  onClearComparisonBaseline: () => void;
  onRunComparison: () => void;
  onChangeComparisonAlignment: (policy: VolumeAlignmentPolicy) => void;
  onChangeComparisonView: (view: VolumeComparisonView) => void;
  onChangeComparisonThreshold: (threshold: number) => void;
  onChangeComparisonSync: (key: "camera" | "slices" | "crosshair" | "window", enabled: boolean) => void;
  onApplyDerivedResult: () => void;
  onCancelDerivedResult: () => void;
  onRegenerateDerivedResult: (id: string) => void;
  onBakeDerivedResult: (id: string) => void;
  onDetachDerivedResult: (id: string) => void;
  onSendDerivedResultToMesh: (id: string) => void;
  onSendDerivedResultToGeometry: (id: string) => void;
  onOpenDerivedResultInMeshAnalysis: (id: string) => void;
  onDeleteDerivedResult: (id: string) => void;
  onChangeSdfOperation: (operation: VolumeSdfOperation) => void;
  onChangeSdfAmount: (amount: number) => void;
  onChangeSdfSmoothness: (smoothness: number) => void;
  onPreviewSdfOperation: () => void;
  onApplySdfOperation: () => void;
  onCancelSdfPreview: () => void;
  onChangeRenderMode: (mode: VolumeRenderMode) => void;
  onChangeTransferPreset: (id: string) => void;
  onChangeTransferFunction: (transfer: VolumeTransferFunction) => void;
  onChangeRenderQuality: (quality: VolumeRenderQuality) => void;
  onChangeTextureSampling: (sampling: VolumeTextureSampling) => void;
  onChangeGradientOpacity: (opacity: number) => void;
  onChangeGradientShading: (enabled: boolean) => void;
  onChangeRenderWindow: (window: [number, number]) => void;
  onChangeNavigationLinked: (linked: boolean) => void;
  onChangeVoxelSnap: (enabled: boolean) => void;
  onChangeCoarseStep: (step: number) => void;
  onChangeOrientationConvention: (convention: VolumeOrientationConvention) => void;
  onResetCrosshair: () => void;
  onChangeProbeName: (name: string) => void;
  onPinProbe: () => void;
  onReplayProbe: (probe: PinnedVolumeProbe) => void;
  onCopyProbe: (probe?: PinnedVolumeProbe) => void;
  onRemoveProbe: (id: string) => void;
  onToggleProbeCompare: (id: string) => void;
  onExportProbes: () => void;
};

const tabs: ReadonlyArray<{ id: VolumeInspectorTab; label: string }> = [
  { id: "volume", label: "Volume Details" },
  { id: "field", label: "Field" },
  { id: "sampling", label: "Sampling" },
  { id: "slice", label: "Slice" },
  { id: "rendering", label: "Rendering" },
  { id: "sdf", label: "SDF" },
  { id: "analysis", label: "Analysis" },
  { id: "segmentation", label: "Masks & Labels" },
  { id: "io", label: "Import / Export" },
  { id: "compare", label: "Compare" },
  { id: "derived", label: "Derived Surfaces" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "history", label: "History" },
];

const cardStyle: React.CSSProperties = {
  border: "1px solid #d8e2ef",
  borderRadius: 10,
  background: "#f8fbff",
  padding: 10,
  display: "grid",
  gap: 7,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 11,
};

const formatNumber = (value: number, digits = 4): string =>
  Number.isFinite(value) ? Number(value.toFixed(digits)).toLocaleString() : "n/a";

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={rowStyle}>
    <span style={{ color: "#475569" }}>{label}</span>
    <strong style={{ textAlign: "right", overflowWrap: "anywhere" }}>{value}</strong>
  </div>
);

export const VolumeInspectorPanel: React.FC<VolumeInspectorPanelProps> = ({
  dataset,
  volumeObject,
  kernelDocument,
  valueRange,
  viewMode,
  crosshair,
  crosshairIndex,
  crosshairSample,
  paneIndices,
  navigationLinked,
  voxelSnap,
  coarseStep,
  orientationConvention,
  navigationAnnouncement,
  probeName,
  pinnedProbes,
  probeCompareIds,
  probeComparison,
  sliceReport,
  sliceHover,
  contourEnabled,
  contourCount,
  showIsosurface,
  isoValue,
  distanceBusy,
  distanceError,
  sdfMetadata,
  sdfDiagnostics,
  sdfOperation,
  sdfAmount,
  sdfSmoothness,
  sdfPreviewActive,
  sdfStatus,
  renderMode,
  transferPresetId,
  transferFunction,
  renderQuality,
  textureSampling,
  gradientOpacity,
  gradientShading,
  renderWindow,
  directRenderStatus,
  definitionError,
  computeDiagnostics,
  derivedResults,
  extractionEvidence,
  derivedBusy,
  analysisSummary,
  analysisBusy,
  analysisThreshold,
  analysisHistoryCount,
  onRunAnalysis,
  onChangeAnalysisThreshold,
  onExportAnalysis,
  segmentationThreshold,
  segmentationLabels,
  segmentationStats,
  segmentationHasPreview,
  segmentationHistory,
  onChangeSegmentationThreshold,
  onPreviewSegmentation,
  onApplySegmentation,
  onCancelSegmentation,
  onUndoSegmentation,
  onRedoSegmentation,
  onUpdateSegmentationLabel,
  ioStatus,
  onImportScientificVolume,
  onExportScientificVolume,
  comparisonAlignment,
  comparisonView,
  comparisonThreshold,
  comparisonBaselineLabel,
  comparisonSummary,
  comparisonError,
  comparisonHistoryCount,
  comparisonSync,
  persistenceStatus,
  workspaceHistory,
  onSaveWorkspace,
  onRestoreWorkspace,
  onUndoWorkspace,
  onRedoWorkspace,
  onCaptureComparisonBaseline,
  onClearComparisonBaseline,
  onRunComparison,
  onChangeComparisonAlignment,
  onChangeComparisonView,
  onChangeComparisonThreshold,
  onChangeComparisonSync,
  onApplyDerivedResult,
  onCancelDerivedResult,
  onRegenerateDerivedResult,
  onBakeDerivedResult,
  onDetachDerivedResult,
  onSendDerivedResultToMesh,
  onSendDerivedResultToGeometry,
  onOpenDerivedResultInMeshAnalysis,
  onDeleteDerivedResult,
  onChangeSdfOperation,
  onChangeSdfAmount,
  onChangeSdfSmoothness,
  onPreviewSdfOperation,
  onApplySdfOperation,
  onCancelSdfPreview,
  onChangeRenderMode,
  onChangeTransferPreset,
  onChangeTransferFunction,
  onChangeRenderQuality,
  onChangeTextureSampling,
  onChangeGradientOpacity,
  onChangeGradientShading,
  onChangeRenderWindow,
  onChangeNavigationLinked,
  onChangeVoxelSnap,
  onChangeCoarseStep,
  onChangeOrientationConvention,
  onResetCrosshair,
  onChangeProbeName,
  onPinProbe,
  onReplayProbe,
  onCopyProbe,
  onRemoveProbe,
  onToggleProbeCompare,
  onExportProbes,
}) => {
  const [activeTab, setActiveTab] = useState<VolumeInspectorTab>("volume");
  const grid = dataset.grid;
  const { spatial } = volumeObject;
  const spacing = spatial.spacing;
  const origin = spatial.origin;
  const domainBounds = useMemo(() => {
    const corners: [number, number, number][] = [];
    for (const i of [0, Math.max(0, grid.dims[0] - 1)]) {
      for (const j of [0, Math.max(0, grid.dims[1] - 1)]) {
        for (const k of [0, Math.max(0, grid.dims[2] - 1)]) corners.push(volumeGridIndexToWorld(grid, [i, j, k]));
      }
    }
    return {
      min: [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis]))),
      max: [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis]))),
    };
  }, [grid]);
  const sampleCount = spatial.sampleCount;
  const label = volumeObject.identity.label;
  const formula = describeVolumeDefinition(volumeObject.source);
  const representationLabel = volumeObject.representation === "analytic-scalar-field"
    ? "Analytic scalar field"
    : volumeObject.representation === "custom-scalar-field"
      ? "Custom scalar field"
      : volumeObject.representation === "dense-scalar-grid"
        ? "Dense scalar grid"
        : volumeObject.representation === "dense-vector-grid"
          ? "Dense vector grid"
          : "Distance field";
  const finiteCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < grid.scalars.length; i += 1) if (Number.isFinite(grid.scalars[i])) count += 1;
    return count;
  }, [grid.scalars]);
  const gridValid =
    grid.dims.every((value) => Number.isInteger(value) && value > 0) &&
    grid.scalars.length >= sampleCount &&
    finiteCount > 0;

  return (
    <section data-testid="volume-inspector" aria-label="Volume Inspector" style={{ display: "grid", gap: 10 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#1e3a5f" }}>VOLUME INSPECTOR</div>
        <div data-testid="volume-inspector-selection" style={{ marginTop: 5, fontSize: 11, color: "#475569" }}>
          Selected: <strong>{label}</strong> · volume grid
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }} aria-label="Volume inspector sections">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`volume-inspector-tab-${tab.id}`}
              aria-pressed={active}
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: `1px solid ${active ? "#4b8fe2" : "#d4dde9"}`,
                borderRadius: 999,
                background: active ? "#eaf3ff" : "#ffffff",
                color: active ? "#164e8b" : "#334155",
                padding: "4px 8px",
                fontSize: 10,
                fontWeight: 750,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "volume" && (
        <div style={cardStyle} data-testid="volume-details-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Volume Details</div>
          <DetailRow label="Identity" value={label} />
          {kernelDocument && <div data-testid="volume-kernel-document"><DetailRow label="Kernel document" value={`${kernelDocument.identity.id} · revision ${kernelDocument.identity.revision}`} /></div>}
          <DetailRow label="Representation" value={representationLabel} />
          <DetailRow label="Source" value={describeVolumeSource(volumeObject.source)} />
          <DetailRow label="Dimensions" value={spatial.dimensions.join(" × ")} />
          <DetailRow label="Domain min" value={`(${domainBounds.min.map((value) => formatNumber(value, 3)).join(", ")})`} />
          <DetailRow label="Domain max" value={`(${domainBounds.max.map((value) => formatNumber(value, 3)).join(", ")})`} />
          <DetailRow label="Samples" value={sampleCount.toLocaleString()} />
          <DetailRow label="Scalar type" value={spatial.scalarType} />
          <DetailRow label="Spacing" value={`(${spacing.map((value) => formatNumber(value, 3)).join(", ")})`} />
          <DetailRow label="Value range" value={`${formatNumber(valueRange.min)} … ${formatNumber(valueRange.max)}`} />
          <DetailRow label="Units" value={`${spatial.positionUnits} / ${spatial.valueUnits}`} />
          <DetailRow label="Payload" value={formatBytes(spatial.byteSize)} />
          <DetailRow
            label="Revision"
            value={`Volume ${volumeObject.identity.volumeRevision} · definition ${volumeObject.identity.definitionRevision} · grid ${volumeObject.identity.sampledGridRevision}`}
          />
          <DetailRow label="Current iso" value={formatNumber(isoValue)} />
          <DetailRow label="View" value={viewMode === "slices" ? "Orthogonal slices" : "3D volume"} />
        </div>
      )}

      {activeTab === "field" && (
        <div style={cardStyle} data-testid="volume-field-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Scalar Field</div>
          <div style={{ fontFamily: "monospace", fontSize: 10, overflowWrap: "anywhere", color: "#334155" }}>{formula}</div>
          <DetailRow label="Minimum" value={formatNumber(valueRange.min)} />
          <DetailRow label="Maximum" value={formatNumber(valueRange.max)} />
          <DetailRow label="Finite samples" value={`${finiteCount.toLocaleString()} / ${sampleCount.toLocaleString()}`} />
          <DetailRow label="Gradient sampling" value="Available" />
        </div>
      )}

      {activeTab === "sampling" && (
        <div style={cardStyle} data-testid="volume-sampling-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Sampling Grid</div>
          <DetailRow label="Origin" value={`(${origin.map((value) => formatNumber(value, 3)).join(", ")})`} />
          <DetailRow label="Spacing" value={`(${spacing.map((value) => formatNumber(value, 3)).join(", ")})`} />
          <DetailRow label="Storage" value={`${spatial.scalarType}, x-fastest, ${spatial.componentLayout}`} />
          <DetailRow label="Centering" value={spatial.centering} />
          <DetailRow label="Direction" value={spatial.direction.join(" ")} />
          <DetailRow label="Handle" value={volumeObject.storage.handle} />
          <DetailRow label="Validity" value={gridValid ? "Ready" : "Invalid grid"} />
        </div>
      )}

      {activeTab === "slice" && (
        <div style={cardStyle} data-testid="volume-slice-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Synchronized Slice Probe</div>
          <DetailRow label="Voxel" value={`(${crosshairIndex.join(", ")})`} />
          <DetailRow
            label="Continuous index"
            value={crosshairSample ? `(${crosshairSample.continuousIndex.map((value) => formatNumber(value, 3)).join(", ")})` : "n/a"}
          />
          <DetailRow label="World" value={crosshair ? `(${crosshair.map((value) => formatNumber(value, 3)).join(", ")})` : "n/a"} />
          <DetailRow label="Components" value={crosshairSample ? `(${crosshairSample.components.map((value) => formatNumber(value)).join(", ")})` : "n/a"} />
          <DetailRow label="|∇F|" value={crosshairSample ? formatNumber(crosshairSample.gradMag) : "n/a"} />
          <DetailRow
            label="Gradient"
            value={crosshairSample ? `(${crosshairSample.gradient.map((value) => formatNumber(value)).join(", ")}) · ${crosshairSample.gradientMethod}` : "n/a"}
          />
          <DetailRow label="Domain" value={crosshairSample?.insideDomain ? "Inside" : "Outside"} />
          <DetailRow label="Slice coordinates" value={crosshair ? `X ${formatNumber(crosshair[0], 3)} · Y ${formatNumber(crosshair[1], 3)} · Z ${formatNumber(crosshair[2], 3)}` : "n/a"} />
          <DetailRow label="Pane slices" value={`X ${paneIndices.x} · Y ${paneIndices.y} · Z ${paneIndices.z}`} />
          <div style={{ display: "grid", gap: 6, paddingTop: 4, borderTop: "1px solid #dbe4ef" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                data-testid="volume-navigation-linked"
                type="checkbox"
                checked={navigationLinked}
                onChange={(event) => onChangeNavigationLinked(event.target.checked)}
              />
              Link orthogonal panes
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <input
                data-testid="volume-navigation-snap"
                type="checkbox"
                checked={voxelSnap}
                onChange={(event) => onChangeVoxelSnap(event.target.checked)}
              />
              Snap probe to voxel center
            </label>
            <label style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
              <span>Coarse step</span>
              <input
                aria-label="Volume coarse slice step"
                type="number"
                min={2}
                max={64}
                value={coarseStep}
                onChange={(event) => onChangeCoarseStep(Math.max(2, Math.min(64, Math.round(Number(event.target.value) || 2))))}
                style={{ width: 62 }}
              />
            </label>
            <label style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
              <span>Orientation</span>
              <select
                aria-label="Volume orientation convention"
                value={orientationConvention}
                onChange={(event) => onChangeOrientationConvention(event.target.value as VolumeOrientationConvention)}
              >
                <option value="scientific">Scientific (+axes)</option>
                <option value="radiological">Radiological (view reversed)</option>
              </select>
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" data-testid="volume-reset-probe" onClick={onResetCrosshair}>Reset center</button>
              <button type="button" onClick={() => onCopyProbe()}>Copy current</button>
            </div>
          </div>
          <div aria-live="polite" data-testid="volume-navigation-announcement" style={{ color: "#315d86", fontSize: 10 }}>
            {navigationAnnouncement}
          </div>
          <div style={{ display: "grid", gap: 6, paddingTop: 6, borderTop: "1px solid #dbe4ef" }}>
            <div style={{ fontWeight: 800, fontSize: 11 }}>Pinned probes</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                aria-label="Pinned probe name"
                value={probeName}
                onChange={(event) => onChangeProbeName(event.target.value)}
                style={{ minWidth: 0, flex: 1 }}
              />
              <button type="button" data-testid="volume-pin-probe" onClick={onPinProbe} disabled={!crosshairSample}>Pin</button>
              <button type="button" onClick={onExportProbes} disabled={!pinnedProbes.length}>Export CSV</button>
            </div>
            {pinnedProbes.length ? pinnedProbes.map((probe) => {
              const stale = isPinnedVolumeProbeStale(probe, volumeObject);
              return (
                <div key={probe.id} data-testid="volume-pinned-probe" style={{ border: "1px solid #d7e2ee", borderRadius: 7, background: "#fff", padding: 7, display: "grid", gap: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 10 }}>
                    <strong>{probe.name}</strong>
                    <span style={{ color: stale ? "#b45309" : "#166534" }}>{stale ? "stale revision" : "current"}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#475569" }}>
                    voxel ({probe.voxelIndex.join(", ")}) · F {formatNumber(probe.components[0] ?? Number.NaN)} · r{probe.volumeRevision}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={{ fontSize: 10 }}>
                      <input type="checkbox" checked={probeCompareIds.includes(probe.id)} onChange={() => onToggleProbeCompare(probe.id)} /> Compare
                    </label>
                    <button type="button" onClick={() => onReplayProbe(probe)}>Replay</button>
                    <button type="button" onClick={() => onCopyProbe(probe)}>Copy</button>
                    <button type="button" onClick={() => onRemoveProbe(probe.id)}>Delete</button>
                  </div>
                </div>
              );
            }) : <div style={{ fontSize: 10, color: "#64748b" }}>No pinned probes.</div>}
            {probeComparison && (
              <div data-testid="volume-probe-comparison" style={{ border: "1px solid #93c5fd", borderRadius: 7, padding: 7, background: "#eff6ff" }}>
                <div style={{ fontSize: 10, fontWeight: 800 }}>{probeComparison.first.name} → {probeComparison.second.name}</div>
                <DetailRow label="World distance" value={formatNumber(probeComparison.worldDistance)} />
                <DetailRow label="Δ component" value={formatNumber(probeComparison.valueDelta)} />
                <DetailRow label="Δ |∇F|" value={formatNumber(probeComparison.gradientMagnitudeDelta)} />
              </div>
            )}
          </div>
          <DetailRow label="Contours" value={contourEnabled ? `${contourCount} levels` : "Hidden"} />
          {sliceReport && <DetailRow label="Slice range" value={`${formatNumber(sliceReport.min)} … ${formatNumber(sliceReport.max)}`} />}
          {sliceHover && <DetailRow label="Hover F" value={formatNumber(sliceHover.value)} />}
        </div>
      )}

      {activeTab === "derived" && (
        <div style={cardStyle} data-testid="volume-derived-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Derived Surfaces</div>
          {showIsosurface && <DetailRow label="Live low-latency preview" value="Visible" />}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" data-testid="volume-derived-apply" onClick={onApplyDerivedResult} disabled={derivedBusy}>Apply full result</button>
            {derivedBusy && <button type="button" data-testid="volume-derived-cancel" onClick={onCancelDerivedResult}>Cancel</button>}
          </div>
          {derivedResults.length ? derivedResults.map((result) => (
            <div
              key={result.id}
              data-testid={`volume-derived-result-${result.state}`}
              style={{ border: "1px solid #d7e2ee", borderRadius: 8, background: "#fff", padding: 8, display: "grid", gap: 5 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                <strong>{result.label}</strong>
                <span style={{ color: result.state === "stale" ? "#b45309" : result.state === "detached" ? "#475569" : "#166534" }}>
                  {result.state}
                </span>
              </div>
              <DetailRow label="Source revision" value={result.sourceVolumeRevision} />
              <DetailRow label="Grid revision" value={result.sourceSampledGridRevision} />
              {extractionEvidence?.filter((entry) => entry.derivedResultId === result.id).map((entry) => <div key={entry.relationId} data-testid="volume-derived-kernel-lineage" style={{ fontSize: 10, color: entry.status === "stale" ? "#b45309" : "#475569" }}>Kernel lineage: {entry.status} · {entry.relationId} · artifact {entry.artifactId}</div>)}
              {result.isosurface && (
                <>
                  <DetailRow label="Algorithm" value={`${result.isosurface.algorithm} · ${result.isosurface.backend}`} />
                  <DetailRow label="Iso value" value={formatNumber(result.isosurface.isoValue)} />
                  <DetailRow label="Mesh" value={`${result.isosurface.metrics.vertexCount.toLocaleString()} V · ${result.isosurface.metrics.faceCount.toLocaleString()} F`} />
                  <DetailRow label="Topology" value={`${result.isosurface.metrics.connectedComponents} components · ${result.isosurface.metrics.boundaryEdgeCount} boundary · ${result.isosurface.metrics.nonManifoldEdgeCount} non-manifold`} />
                  <DetailRow label="Area" value={formatNumber(result.isosurface.metrics.surfaceArea)} />
                  <DetailRow label="Enclosed volume" value={result.isosurface.metrics.enclosedVolume == null ? "n/a" : formatNumber(result.isosurface.metrics.enclosedVolume)} />
                  <DetailRow label="Watertight" value={result.isosurface.metrics.watertight ? "yes" : "no"} />
                  <DetailRow label="Normals" value={result.isosurface.normalMethod} />
                  <DetailRow label="Timing" value={`${formatNumber(result.isosurface.profile.wallTimeMs, 1)} ms${result.isosurface.profile.cacheHit ? " · cache hit" : ""}`} />
                  <DetailRow label="Transfer" value={formatBytes(result.isosurface.profile.transferredBytes)} />
                  {result.isosurface.warnings.map((warning) => <div key={warning} style={{ color: "#92400e", fontSize: 10 }}>{warning}</div>)}
                </>
              )}
              {result.staleReason && <div style={{ color: "#92400e", fontSize: 10 }}>{result.staleReason}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
                <button type="button" onClick={() => onRegenerateDerivedResult(result.id)}>Regenerate</button>
                <button type="button" onClick={() => onBakeDerivedResult(result.id)} disabled={result.state === "snapshot"}>Bake snapshot</button>
                <button type="button" onClick={() => onDetachDerivedResult(result.id)} disabled={result.state === "detached"}>Detach</button>
                <button type="button" data-testid="volume-derived-send-mesh" onClick={() => onSendDerivedResultToMesh(result.id)}>Send to Mesh</button>
                <button type="button" data-testid="volume-derived-send-geometry" onClick={() => onSendDerivedResultToGeometry(result.id)}>Send to Geometry</button>
                <button type="button" data-testid="volume-derived-open-analysis" onClick={() => onOpenDerivedResultInMeshAnalysis(result.id)}>Open in Mesh Analysis</button>
                <button type="button" onClick={() => onDeleteDerivedResult(result.id)}>Delete</button>
              </div>
            </div>
          )) : (
            <div style={{ fontSize: 11, color: "#64748b" }}>No derived isosurface result is active.</div>
          )}
        </div>
      )}

      {activeTab === "analysis" && (
        <div style={cardStyle} data-testid="volume-analysis-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Volume Analysis</div>
          <label style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
            <span>Region threshold</span>
            <input
              aria-label="Volume analysis threshold"
              type="number"
              value={analysisThreshold}
              step="any"
              onChange={(event) => onChangeAnalysisThreshold(Number(event.target.value) || 0)}
              style={{ width: 90 }}
            />
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" data-testid="volume-run-analysis" onClick={onRunAnalysis} disabled={analysisBusy}>
              {analysisBusy ? "Analyzing…" : "Run analysis"}
            </button>
            <button type="button" onClick={onExportAnalysis} disabled={!analysisSummary}>Export report</button>
          </div>
          {analysisSummary ? (
            <>
              <DetailRow label="Finite / missing" value={`${analysisSummary.statistics.finiteCount.toLocaleString()} / ${analysisSummary.statistics.missingCount.toLocaleString()}`} />
              <DetailRow label="Range" value={`${formatNumber(analysisSummary.statistics.minimum ?? Number.NaN)} … ${formatNumber(analysisSummary.statistics.maximum ?? Number.NaN)}`} />
              <DetailRow label="Mean ± σ" value={`${formatNumber(analysisSummary.statistics.mean ?? Number.NaN)} ± ${formatNumber(analysisSummary.statistics.standardDeviation ?? Number.NaN)}`} />
              <DetailRow label="Percentiles" value={`p05 ${formatNumber(analysisSummary.statistics.percentiles.p05 ?? Number.NaN)} · p50 ${formatNumber(analysisSummary.statistics.percentiles.p50 ?? Number.NaN)} · p95 ${formatNumber(analysisSummary.statistics.percentiles.p95 ?? Number.NaN)}`} />
              <DetailRow label="Derivative method" value={`${analysisSummary.derivatives.method.source} · order ${analysisSummary.derivatives.method.stencilOrder}`} />
              <DetailRow label="Region" value={`${analysisSummary.region.voxelCount.toLocaleString()} voxels · ${formatNumber(analysisSummary.region.physicalVolume)} ${spatial.positionUnits}³`} />
              <DetailRow label="Components" value={analysisSummary.region.components.length} />
              <DetailRow label="Boundary area" value={`${formatNumber(analysisSummary.region.surfaceContactArea)} ${spatial.positionUnits}²`} />
              <DetailRow label="Critical candidates" value={analysisSummary.criticalPoints.length} />
              <DetailRow label="Iso crossings" value={analysisSummary.iso.crossingEdgeCount.toLocaleString()} />
              <DetailRow label="Managed fields" value="gradient · magnitude · Hessian · Laplacian · masks" />
              <div style={{ color: "#315d86", fontSize: 10 }}>Dense derived arrays remain in the managed Volume store; this panel keeps only revision-safe handles and summaries.</div>
            </>
          ) : <div style={{ fontSize: 10, color: "#64748b" }}>Run analysis to publish statistics, derivatives, regions, critical candidates, and iso statistics for this revision.</div>}
          <DetailRow label="Result history" value={`${analysisHistoryCount} records`} />
        </div>
      )}

      {activeTab === "segmentation" && (
        <div style={cardStyle} data-testid="volume-segmentation-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Masks &amp; Labels</div>
          <label style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
            <span>Threshold</span>
            <input aria-label="Volume segmentation threshold" type="number" step="any" value={segmentationThreshold} onChange={(event) => onChangeSegmentationThreshold(Number(event.target.value) || 0)} style={{ width: 90 }} />
          </label>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button type="button" data-testid="volume-segmentation-preview" onClick={onPreviewSegmentation}>Preview</button>
            <button type="button" data-testid="volume-segmentation-apply" onClick={onApplySegmentation} disabled={!segmentationHasPreview}>Apply</button>
            <button type="button" onClick={onCancelSegmentation} disabled={!segmentationHasPreview}>Cancel</button>
            <button type="button" onClick={onUndoSegmentation} disabled={!segmentationHistory.undoDepth}>Undo</button>
            <button type="button" onClick={onRedoSegmentation} disabled={!segmentationHistory.redoDepth}>Redo</button>
          </div>
          <DetailRow label="Categorical sampling" value="nearest-neighbor only" />
          <DetailRow label="Labels" value={segmentationLabels.length} />
          <DetailRow label="History buffers" value={`${segmentationHistory.undoDepth} undo · ${segmentationHistory.redoDepth} redo · ${formatBytes(segmentationHistory.ownedBytes)}`} />
          {segmentationLabels.length ? segmentationLabels.map((label) => {
            const stats = segmentationStats.find((entry) => entry.label === label.id);
            return (
              <div key={label.id} data-testid="volume-segmentation-label" style={{ border: "1px solid #d7e2ee", borderRadius: 7, background: "#fff", padding: 7, display: "grid", gap: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: label.color, border: "1px solid #64748b" }} />
                  <strong style={{ flex: 1 }}>{label.name}</strong><span>ID {label.id}</span>
                </div>
                {stats && <DetailRow label="Region" value={`${stats.voxelCount.toLocaleString()} voxels · ${formatNumber(stats.physicalVolume)} ${spatial.positionUnits}³`} />}
                <div style={{ display: "flex", gap: 10, fontSize: 10 }}>
                  <label><input type="checkbox" checked={label.visible} onChange={(event) => onUpdateSegmentationLabel(label.id, { visible: event.target.checked })} /> Visible</label>
                  <label><input type="checkbox" checked={label.locked} onChange={(event) => onUpdateSegmentationLabel(label.id, { locked: event.target.checked })} /> Locked</label>
                </div>
              </div>
            );
          }) : <div style={{ fontSize: 10, color: "#64748b" }}>Preview a threshold to create deterministic connected-component labels.</div>}
        </div>
      )}

      {activeTab === "io" && (
        <div style={cardStyle} data-testid="volume-scientific-io-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Scientific Volume Import / Export</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button type="button" data-testid="volume-import-scientific" onClick={onImportScientificVolume}>Import…</button>
            <button type="button" onClick={() => onExportScientificVolume("npy")}>Export NPY</button>
            <button type="button" onClick={() => onExportScientificVolume("vti")}>Export VTI</button>
            <button type="button" onClick={() => onExportScientificVolume("raw")}>Export RAW</button>
          </div>
          <DetailRow label="Staged formats" value="RAW + JSON · NPY + JSON · VTI" />
          <DetailRow label="Export metadata" value="spacing · origin · direction · units · missing policy" />
          {dataset.scientific && (
            <>
              <DetailRow label="Imported format" value={dataset.scientific.format.toUpperCase()} />
              <DetailRow label="Source scalar layout" value={`${dataset.scientific.scalarType} × ${dataset.scientific.components}`} />
              <DetailRow label="External artifact" value={`${dataset.scientific.externalReference.fileName} · ${formatBytes(dataset.scientific.externalReference.byteLength)}`} />
              <DetailRow label="Content reference" value={dataset.scientific.externalReference.contentHash} />
            </>
          )}
          <div aria-live="polite" style={{ color: /failed|error|unsupported/i.test(ioStatus) ? "#b42318" : "#315d86", fontSize: 10 }}>{ioStatus}</div>
          <div style={{ color: "#64748b", fontSize: 10 }}>Only the explicit external reference and content hash enter the workspace model; dense imported bytes are not copied into local storage.</div>
        </div>
      )}

      {activeTab === "compare" && (
        <div style={cardStyle} data-testid="volume-comparison-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Volume Compare</div>
          <div style={{ fontSize: 10, color: "#475569" }}>Capture A, change or import the active Volume, then compare it as B.</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button type="button" data-testid="volume-compare-capture-a" onClick={onCaptureComparisonBaseline}>Capture A</button>
            <button type="button" onClick={onClearComparisonBaseline} disabled={!comparisonBaselineLabel}>Clear A</button>
            <button type="button" data-testid="volume-compare-run" onClick={onRunComparison} disabled={!comparisonBaselineLabel}>Compare A ↔ B</button>
          </div>
          <DetailRow label="Volume A" value={comparisonBaselineLabel ?? "Not captured"} />
          <DetailRow label="Volume B" value={volumeObject.identity.label} />
          <label style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
            <span>Alignment</span>
            <select aria-label="Volume comparison alignment" value={comparisonAlignment} onChange={(event) => onChangeComparisonAlignment(event.target.value as VolumeAlignmentPolicy)}>
              <option value="exact-grid">Exact grid</option>
              <option value="resample-b-to-a">Resample B → A</option>
              <option value="common-target-grid">Common target (B grid)</option>
              <option value="reject-incompatible">Reject incompatible</option>
            </select>
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
            <span>View</span>
            <select aria-label="Volume comparison view" value={comparisonView} onChange={(event) => onChangeComparisonView(event.target.value as VolumeComparisonView)}>
              <option value="a-b">A | B</option>
              <option value="a-difference">A | Difference</option>
              <option value="overlay">Overlay</option>
              <option value="checkerboard">Checkerboard</option>
              <option value="synchronized-probe">Synchronized probe</option>
            </select>
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
            <span>Change threshold</span>
            <input type="number" step="any" value={comparisonThreshold} onChange={(event) => onChangeComparisonThreshold(Math.max(0, Number(event.target.value) || 0))} style={{ width: 90 }} />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 10 }}>
            {(Object.keys(comparisonSync) as Array<keyof typeof comparisonSync>).map((key) => (
              <label key={key}><input type="checkbox" checked={comparisonSync[key]} onChange={(event) => onChangeComparisonSync(key, event.target.checked)} /> Sync {key}</label>
            ))}
          </div>
          {comparisonSummary && (
            <div style={{ border: "1px solid #93c5fd", borderRadius: 7, padding: 7, background: "#eff6ff", display: "grid", gap: 5 }}>
              <DetailRow label="Alignment used" value={`${comparisonSummary.provenance.alignmentPolicy} · ${comparisonSummary.provenance.interpolation}`} />
              <DetailRow label="Finite / missing pairs" value={`${comparisonSummary.metrics.finitePairCount.toLocaleString()} / ${comparisonSummary.metrics.missingPairCount.toLocaleString()}`} />
              <DetailRow label="Mean signed Δ" value={formatNumber(comparisonSummary.metrics.signedMeanDifference ?? Number.NaN)} />
              <DetailRow label="Mean |Δ|" value={formatNumber(comparisonSummary.metrics.absoluteMeanDifference ?? Number.NaN)} />
              <DetailRow label="L1 / L2 / L∞" value={`${formatNumber(comparisonSummary.metrics.norms.l1)} / ${formatNumber(comparisonSummary.metrics.norms.l2)} / ${formatNumber(comparisonSummary.metrics.norms.linfinity)}`} />
              <DetailRow label="RMSE" value={formatNumber(comparisonSummary.metrics.norms.rmse)} />
              <DetailRow label="Correlation" value={formatNumber(comparisonSummary.metrics.correlation ?? Number.NaN)} />
              <DetailRow label="Changed voxels" value={`${comparisonSummary.metrics.changedVoxelCount.toLocaleString()} · ${(comparisonSummary.metrics.changedFraction * 100).toFixed(2)}%`} />
            </div>
          )}
          {comparisonError && <div role="alert" style={{ color: "#b42318", fontSize: 10 }}>{comparisonError}</div>}
          <DetailRow label="Result history" value={`${comparisonHistoryCount} records`} />
          <div style={{ color: "#64748b", fontSize: 10 }}>Scalar difference fields use managed storage. Label maps use exact-grid confusion, Dice, and Jaccard metrics and are never interpolated.</div>
        </div>
      )}

      {activeTab === "sdf" && (
        <div style={cardStyle} data-testid="volume-sdf-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Voxelization &amp; Signed Distance</div>
          {sdfMetadata ? (
            <>
              <DetailRow label="Output" value={sdfMetadata.output} />
              <DetailRow label="Operation" value={sdfMetadata.operation} />
              <DetailRow label="Backend" value={`${sdfMetadata.backend} ${sdfMetadata.backendVersion}`} />
              <DetailRow label="Sources" value={sdfMetadata.sources.map((source) => `${source.label} r${source.revision}`).join(" + ")} />
              <DetailRow label="Sampling" value={sdfMetadata.sampling.dimensions.join(" × ")} />
            </>
          ) : <div style={{ fontSize: 10, color: "#64748b" }}>No sampled distance field is active.</div>}
          {sdfDiagnostics && (
            <div data-testid="volume-sdf-sign-diagnostics" style={{ border: `1px solid ${sdfDiagnostics.reliable ? "#86d5a5" : "#f0b56b"}`, borderRadius: 7, padding: 7, background: sdfDiagnostics.reliable ? "#f0fdf4" : "#fff7ed" }}>
              <DetailRow label="Sign confidence" value={sdfDiagnostics.confidence} />
              <DetailRow label="Watertight" value={sdfDiagnostics.watertight ? "yes" : "no"} />
              <DetailRow label="Orientation" value={sdfDiagnostics.orientation} />
              <DetailRow label="Boundary / non-manifold" value={`${sdfDiagnostics.boundaryEdgeCount} / ${sdfDiagnostics.nonManifoldEdgeCount}`} />
              <div style={{ fontSize: 10, color: sdfDiagnostics.reliable ? "#166534" : "#9a3412" }}>{sdfDiagnostics.message}</div>
            </div>
          )}
          <label style={{ display: "grid", gap: 4, fontSize: 10 }}>
            Operation
            <select aria-label="SDF operation" value={sdfOperation} onChange={(event) => onChangeSdfOperation(event.target.value as VolumeSdfOperation)}>
              <option value="occupancy">Occupancy voxelization</option>
              <option value="union">Union with current preset</option>
              <option value="intersection">Intersection with current preset</option>
              <option value="subtraction">Subtract current preset</option>
              <option value="offset">Offset</option>
              <option value="shell">Shell</option>
              <option value="smooth-union">Smooth union with current preset</option>
              <option value="reinitialize">Reinitialize signed distance</option>
            </select>
          </label>
          {(sdfOperation === "offset" || sdfOperation === "shell") && (
            <label style={{ display: "grid", gap: 4, fontSize: 10 }}>
              Distance {formatNumber(sdfAmount)}
              <input aria-label="SDF distance" type="range" min={-1} max={1} step={0.01} value={sdfAmount} onChange={(event) => onChangeSdfAmount(Number(event.target.value))} />
            </label>
          )}
          {sdfOperation === "smooth-union" && (
            <label style={{ display: "grid", gap: 4, fontSize: 10 }}>
              Smoothness {formatNumber(sdfSmoothness)}
              <input aria-label="SDF smoothness" type="range" min={0.01} max={1} step={0.01} value={sdfSmoothness} onChange={(event) => onChangeSdfSmoothness(Number(event.target.value))} />
            </label>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" data-testid="volume-sdf-preview" onClick={onPreviewSdfOperation} disabled={!sdfMetadata}>Preview</button>
            <button type="button" data-testid="volume-sdf-apply" onClick={onApplySdfOperation} disabled={!sdfPreviewActive}>Apply</button>
            <button type="button" data-testid="volume-sdf-cancel" onClick={onCancelSdfPreview} disabled={!sdfPreviewActive}>Discard preview</button>
          </div>
          <div role="status" data-testid="volume-sdf-status" style={{ color: sdfPreviewActive ? "#1d4ed8" : "#475569", fontSize: 10 }}>{sdfStatus}</div>
          {sdfMetadata?.warnings.map((warning) => <div key={warning} style={{ color: "#92400e", fontSize: 10 }}>{warning}</div>)}
        </div>
      )}

      {activeTab === "rendering" && (
        <div style={cardStyle} data-testid="volume-rendering-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Direct Volume Rendering</div>
          <label style={{ display: "grid", gap: 4, fontSize: 10 }}>
            Render mode
            <select data-testid="volume-render-mode" aria-label="Volume render mode" value={renderMode} onChange={(event) => onChangeRenderMode(event.target.value as VolumeRenderMode)}>
              <option value="slice">Slice</option>
              <option value="isosurface">Isosurface</option>
              <option value="mip">MIP</option>
              <option value="minip">MinIP</option>
              <option value="average">Average</option>
              <option value="dvr">DVR</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 10 }}>
            Transfer preset
            <select aria-label="Volume transfer preset" value={transferPresetId} onChange={(event) => onChangeTransferPreset(event.target.value)}>
              {VOLUME_TRANSFER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              {transferPresetId === "custom" && <option value="custom">Custom</option>}
            </select>
          </label>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 800 }}>Color control points</div>
            {transferFunction.colorPoints.map((point, index) => (
              <label key={`color-${index}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, fontSize: 10 }}>
                <span>{formatNumber(point.value, 3)}</span>
                <input
                  aria-label={`Transfer color ${index + 1}`}
                  type="color"
                  value={`#${point.color.map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`}
                  onChange={(event) => {
                    const hex = event.target.value;
                    const color: [number, number, number] = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
                    onChangeTransferFunction({ ...transferFunction, id: "custom", label: "Custom", colorPoints: transferFunction.colorPoints.map((entry, entryIndex) => entryIndex === index ? { ...entry, color } : entry) });
                  }}
                />
              </label>
            ))}
            <div style={{ fontSize: 10, fontWeight: 800 }}>Opacity control points</div>
            {transferFunction.opacityPoints.map((point, index) => (
              <label key={`opacity-${index}`} style={{ display: "grid", gridTemplateColumns: "42px minmax(80px, 1fr) 38px", alignItems: "center", gap: 6, fontSize: 10 }}>
                <span>{formatNumber(point.value, 3)}</span>
                <input
                  aria-label={`Transfer opacity ${index + 1}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={point.opacity}
                  onChange={(event) => onChangeTransferFunction({ ...transferFunction, id: "custom", label: "Custom", opacityPoints: transferFunction.opacityPoints.map((entry, entryIndex) => entryIndex === index ? { ...entry, opacity: Number(event.target.value) } : entry) })}
                />
                <span>{formatNumber(point.opacity, 2)}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 10 }}>Quality<select aria-label="Volume render quality" value={renderQuality} onChange={(event) => onChangeRenderQuality(event.target.value as VolumeRenderQuality)}><option value="interactive">Fast</option><option value="balanced">Balanced</option><option value="full">Full</option></select></label>
            <label style={{ display: "grid", gap: 4, fontSize: 10 }}>Sampling<select aria-label="Volume texture sampling" value={textureSampling} onChange={(event) => onChangeTextureSampling(event.target.value as VolumeTextureSampling)}><option value="nearest">Nearest</option><option value="linear">Linear</option></select></label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 10 }}>
            Gradient opacity {formatNumber(gradientOpacity, 2)}
            <input aria-label="Volume gradient opacity" type="range" min={0} max={1} step={0.05} value={gradientOpacity} onChange={(event) => onChangeGradientOpacity(Number(event.target.value))} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 10 }}>Window low<input aria-label="Volume render window low" type="number" min={0} max={1} step={0.01} value={renderWindow[0]} onChange={(event) => onChangeRenderWindow([Math.max(0, Math.min(Number(event.target.value), renderWindow[1] - 0.01)), renderWindow[1]])} /></label>
            <label style={{ display: "grid", gap: 4, fontSize: 10 }}>Window high<input aria-label="Volume render window high" type="number" min={0} max={1} step={0.01} value={renderWindow[1]} onChange={(event) => onChangeRenderWindow([renderWindow[0], Math.min(1, Math.max(Number(event.target.value), renderWindow[0] + 0.01))])} /></label>
          </div>
          <DetailRow label="Component" value="Scalar component 1 of 1" />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}><input type="checkbox" checked={gradientShading} onChange={(event) => onChangeGradientShading(event.target.checked)} />Gradient shading</label>
          {directRenderStatus && (
            <div data-testid="volume-direct-render-status" role="status" style={{ border: `1px solid ${directRenderStatus.state === "ready" ? "#86d5a5" : "#f0b56b"}`, borderRadius: 7, padding: 7, fontSize: 10, color: directRenderStatus.state === "ready" ? "#166534" : "#92400e" }}>
              <strong>{directRenderStatus.state}</strong> · {directRenderStatus.plan.path}<br />{directRenderStatus.message}
            </div>
          )}
        </div>
      )}

      {activeTab === "diagnostics" && (
        <div style={cardStyle} data-testid="volume-diagnostics-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Diagnostics</div>
          <DetailRow label="Grid" value={gridValid ? "Ready" : "Invalid"} />
          <DetailRow label="Engine" value={`${volumeObject.provenance.engine} ${volumeObject.provenance.engineVersion}`} />
          <DetailRow label="Missing values" value={spatial.missingValuePolicy} />
          <DetailRow label="Dependencies" value={volumeObject.provenance.dependencies.length} />
          <DetailRow label="Distance backend" value={distanceBusy ? "Running" : distanceError ? "Failed" : "Idle"} />
          <DetailRow label="Compute backend" value={computeDiagnostics.backend === "native-worker" ? "Native Web Worker" : computeDiagnostics.backend === "vtk-worker" ? "VTK worker" : "Reviewed CPU fallback"} />
          <DetailRow label="Worker lifecycle" value={computeDiagnostics.lifecycle} />
          <DetailRow label="Worker operation" value={computeDiagnostics.operation ?? "None queued"} />
          <DetailRow label="Progress" value={`${Math.round(computeDiagnostics.progress * 100)}%`} />
          <DetailRow label="Memory guard" value={`${computeDiagnostics.memoryPlan.level} · ${formatBytes(computeDiagnostics.memoryPlan.peakWorkingSetBytes)} peak`} />
          <DetailRow label="Cache" value={`${computeDiagnostics.cacheEntries} entries · ${computeDiagnostics.cacheHits} hits`} />
          {computeDiagnostics.memoryPlan.brickLayout && (
            <DetailRow label="Brick contract" value={`${computeDiagnostics.memoryPlan.brickLayout.brickDimensions.join(" × ")} · halo ${computeDiagnostics.memoryPlan.brickLayout.halo}`} />
          )}
          <div data-testid="volume-compute-diagnostics" style={{ color: computeDiagnostics.lifecycle === "failed" ? "#b42318" : "#315d86", fontSize: 10 }}>
            {computeDiagnostics.message}
          </div>
          {definitionError && <div role="alert" style={{ color: "#b42318", fontSize: 11 }}>{definitionError}</div>}
          {distanceError && <div role="alert" style={{ color: "#b42318", fontSize: 11 }}>{distanceError}</div>}
          {!definitionError && !distanceError && gridValid && (
            <div style={{ color: "#166534", fontSize: 11 }}>Volume definition and sampled payload are valid.</div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div style={cardStyle} data-testid="volume-history-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>History</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button type="button" data-testid="volume-save-workspace" onClick={onSaveWorkspace}>Save workspace</button>
            <button type="button" data-testid="volume-restore-workspace" onClick={onRestoreWorkspace}>Restore last</button>
            <button type="button" onClick={onUndoWorkspace} disabled={workspaceHistory.undoDepth === 0}>Undo</button>
            <button type="button" onClick={onRedoWorkspace} disabled={workspaceHistory.redoDepth === 0}>Redo</button>
          </div>
          <div role="status" aria-live="polite" style={{ color: /missing|failed|error|relink/i.test(persistenceStatus) ? "#b42318" : "#315d86", fontSize: 10 }}>{persistenceStatus}</div>
          <DetailRow label="Workspace undo / redo" value={`${workspaceHistory.undoDepth} / ${workspaceHistory.redoDepth}`} />
          <DetailRow label="Current object" value={volumeObject.identity.key} />
          <DetailRow label="Created" value={new Date(volumeObject.provenance.createdAt).toLocaleString()} />
          <DetailRow label="Updated" value={new Date(volumeObject.provenance.updatedAt).toLocaleString()} />
          <DetailRow label="Derived results" value={derivedResults.length} />
          <DetailRow label="Analysis records" value={analysisHistoryCount} />
          <DetailRow label="Comparison records" value={comparisonHistoryCount} />
          <DetailRow label="Stale retained" value={derivedResults.filter((result) => result.state === "stale").length} />
        </div>
      )}
    </section>
  );
};
