import React, { useMemo, useState } from "react";

import type { VolumeDataset } from "../scene/datasets";
import type { VolumeSliceHover, VolumeSliceReport } from "../scene/volume/sliceVolume";
import {
  describeVolumeDefinition,
  describeVolumeSource,
  isPinnedVolumeProbeStale,
  volumeGridIndexToWorld,
  type PinnedVolumeProbe,
  type VolumeDerivedResult,
  type VolumeObject,
  type VolumeOrientationConvention,
  type VolumeProbeComparison,
  type VolumeProbeReading,
} from "../volume";

type VolumeInspectorTab = "volume" | "field" | "sampling" | "slice" | "derived" | "diagnostics" | "history";

export type VolumeInspectorPanelProps = {
  dataset: VolumeDataset;
  volumeObject: VolumeObject;
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
  definitionError: string | null;
  derivedResults: readonly VolumeDerivedResult[];
  onDeleteDerivedResult: (id: string) => void;
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
  definitionError,
  derivedResults,
  onDeleteDerivedResult,
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
          {showIsosurface && <DetailRow label="Isosurface preview" value="Visible" />}
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
              {result.staleReason && <div style={{ color: "#92400e", fontSize: 10 }}>{result.staleReason}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#64748b", fontSize: 10 }}>
                  Mesh counts appear when a first-class mesh payload is created.
                </span>
                <button type="button" onClick={() => onDeleteDerivedResult(result.id)} style={{ fontSize: 10 }}>Delete</button>
              </div>
            </div>
          )) : (
            <div style={{ fontSize: 11, color: "#64748b" }}>No derived isosurface result is active.</div>
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
          <DetailRow label="Current object" value={volumeObject.identity.key} />
          <DetailRow label="Created" value={new Date(volumeObject.provenance.createdAt).toLocaleString()} />
          <DetailRow label="Updated" value={new Date(volumeObject.provenance.updatedAt).toLocaleString()} />
          <DetailRow label="Derived results" value={derivedResults.length} />
          <DetailRow label="Stale retained" value={derivedResults.filter((result) => result.state === "stale").length} />
        </div>
      )}
    </section>
  );
};
