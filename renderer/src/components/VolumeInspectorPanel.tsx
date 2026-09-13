import React, { useMemo, useState } from "react";

import type { VolumeDataset } from "../scene/datasets";
import type { VolumeSliceHover, VolumeSliceReport } from "../scene/volume/sliceVolume";
import {
  describeVolumeDefinition,
  describeVolumeSource,
  type VolumeDerivedResult,
  type VolumeObject,
} from "../volume";

type VolumeInspectorTab = "volume" | "field" | "sampling" | "slice" | "derived" | "diagnostics" | "history";

export type VolumeInspectorPanelProps = {
  dataset: VolumeDataset;
  volumeObject: VolumeObject;
  valueRange: { min: number; max: number };
  viewMode: "slices" | "3d";
  crosshair: [number, number, number] | null;
  crosshairIndex: [number, number, number];
  crosshairSample: { value: number; gradMag: number } | null;
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
}) => {
  const [activeTab, setActiveTab] = useState<VolumeInspectorTab>("volume");
  const grid = dataset.grid;
  const { spatial } = volumeObject;
  const spacing = spatial.spacing;
  const origin = spatial.origin;
  const domainMax = spatial.dimensions.map((dim, index) => origin[index] + spacing[index] * Math.max(0, dim - 1));
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
          <DetailRow label="Domain min" value={`(${origin.map((value) => formatNumber(value, 3)).join(", ")})`} />
          <DetailRow label="Domain max" value={`(${domainMax.map((value) => formatNumber(value, 3)).join(", ")})`} />
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
          <DetailRow label="World" value={crosshair ? `(${crosshair.map((value) => formatNumber(value, 3)).join(", ")})` : "n/a"} />
          <DetailRow label="F" value={crosshairSample ? formatNumber(crosshairSample.value) : "n/a"} />
          <DetailRow label="|∇F|" value={crosshairSample ? formatNumber(crosshairSample.gradMag) : "n/a"} />
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
