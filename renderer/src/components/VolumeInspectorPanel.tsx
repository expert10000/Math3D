import React, { useMemo, useState } from "react";

import type { VolumeDataset } from "../scene/datasets";
import type { VolumeSliceHover, VolumeSliceReport } from "../scene/volume/sliceVolume";

type VolumeInspectorTab = "volume" | "field" | "sampling" | "slice" | "derived" | "diagnostics" | "history";

export type VolumeInspectorPanelProps = {
  dataset: VolumeDataset;
  label: string;
  formula: string;
  sourceKind: "preset" | "derived";
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
  label,
  formula,
  sourceKind,
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
}) => {
  const [activeTab, setActiveTab] = useState<VolumeInspectorTab>("volume");
  const grid = dataset.grid;
  const spacing = grid.spacing ?? [1, 1, 1];
  const origin = grid.origin ?? [0, 0, 0];
  const domainMax = grid.dims.map((dim, index) => origin[index] + spacing[index] * Math.max(0, dim - 1));
  const sampleCount = grid.dims[0] * grid.dims[1] * grid.dims[2];
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
          <DetailRow label="Representation" value="Scalar volume grid" />
          <DetailRow label="Source" value={sourceKind === "derived" ? "Derived distance field" : "Analytic preset"} />
          <DetailRow label="Dimensions" value={`${grid.dims[0]} × ${grid.dims[1]} × ${grid.dims[2]}`} />
          <DetailRow label="Domain min" value={`(${origin.map((value) => formatNumber(value, 3)).join(", ")})`} />
          <DetailRow label="Domain max" value={`(${domainMax.map((value) => formatNumber(value, 3)).join(", ")})`} />
          <DetailRow label="Samples" value={sampleCount.toLocaleString()} />
          <DetailRow label="Scalar type" value="Float32" />
          <DetailRow label="Spacing" value={`(${spacing.map((value) => formatNumber(value, 3)).join(", ")})`} />
          <DetailRow label="Value range" value={`${formatNumber(valueRange.min)} … ${formatNumber(valueRange.max)}`} />
          <DetailRow label="Units" value="unitless" />
          <DetailRow label="Payload" value={formatBytes(grid.scalars.byteLength)} />
          <DetailRow label="Revision" value="live current" />
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
          <DetailRow label="Storage" value="Float32, x-fastest" />
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
          {showIsosurface ? (
            <>
              <DetailRow label="Isosurface preview" value="Visible" />
              <DetailRow label="Isovalue" value={formatNumber(isoValue)} />
              <div style={{ fontSize: 10, color: "#64748b" }}>
                This is a live derived preview. Mesh counts appear only after a first-class mesh result is created.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "#64748b" }}>No derived isosurface result is active.</div>
          )}
        </div>
      )}

      {activeTab === "diagnostics" && (
        <div style={cardStyle} data-testid="volume-diagnostics-card">
          <div style={{ fontWeight: 850, fontSize: 12 }}>Diagnostics</div>
          <DetailRow label="Grid" value={gridValid ? "Ready" : "Invalid"} />
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
          <div style={{ fontSize: 11 }}><strong>Current:</strong> {label}</div>
          <div style={{ fontSize: 10, color: "#64748b" }}>
            The current live source is selected. Persistent operation-result history is introduced with Volume result objects.
          </div>
        </div>
      )}
    </section>
  );
};
