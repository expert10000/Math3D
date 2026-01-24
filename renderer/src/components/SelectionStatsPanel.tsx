import React from "react";
import type { SelectionHistogram, SelectionMetricKey, SelectionStats } from "../math/selection/selectionStats";

type Props = {
  stats: SelectionStats;
  availableMetrics: SelectionMetricKey[];
  selectedMetric: SelectionMetricKey | null;
  onSelectedMetricChange?: (metric: SelectionMetricKey) => void;
  compact?: boolean;
};

const metricLabels: Record<SelectionMetricKey, string> = {
  K: "K",
  H: "H",
  k1: "k1",
  k2: "k2",
};


function fmt(v: number, digits = 3) {
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

function fmtVec3(v: [number, number, number]) {
  return `(${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])})`;
}

function renderHistogram(histogram: SelectionHistogram) {
  const { bins } = histogram;
  


  if (!bins.length) return null;
  const maxBin = Math.max(1, ...bins);
  const width = 240;
  const height = 64;
  const barWidth = width / bins.length;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {bins.map((bin, i) => {
        const h = Math.max(1, (bin / maxBin) * (height - 6));
        const x = i * barWidth;
        const y = height - h;
        return <rect key={i} x={x + 0.5} y={y} width={barWidth - 1} height={h} fill="#4c6ef5" />;
      })}
    </svg>
  );
}

export const SelectionStatsPanel: React.FC<Props> = ({
  stats,
  availableMetrics,
  selectedMetric,
  onSelectedMetricChange,
  compact = false,
}) => {
  const metricRows = (["K", "H", "k1", "k2"] as const).filter((key) => stats.metrics[key]);
  const hasMetrics = metricRows.length > 0;
  const histogram = stats.histogram;
  const hasHistogram = stats.count > 0 && histogram && histogram.bins.length > 0;

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "110px 1fr",
    gap: "6px 8px",
    fontSize: 11,
  };

  return (
    <div
      style={{
        border: "1px solid #d9dde7",
        borderRadius: 10,
        padding: compact ? "8px 10px" : "10px 12px",
        background: "#f7f8fb",
        fontSize: 11,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Selection stats</div>
      {stats.count === 0 ? (
        <div style={{ color: "#6b7280" }}>No points selected.</div>
      ) : (
        <>
          <div style={gridStyle}>
            <div style={{ color: "#556" }}>Count</div>
            <div>{stats.count}</div>
            <div style={{ color: "#556" }}>Mean normal</div>
            <div>{fmtVec3(stats.meanNormal)}</div>
            <div style={{ color: "#556" }}>BBox size</div>
            <div>
              {fmtVec3(stats.bbox.size)} diag {fmt(stats.bbox.diag)}
            </div>
          </div>

          {hasMetrics && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr 1fr",
                  gap: "4px 8px",
                  fontSize: 11,
                }}
              >
                <div style={{ fontWeight: 600, color: "#556" }}>Metric</div>
                <div style={{ fontWeight: 600, color: "#556" }}>Mean ± Std</div>
                <div style={{ fontWeight: 600, color: "#556" }}>Min / Max</div>
                {metricRows.map((key) => {
                  const m = stats.metrics[key];
                  if (!m) return null;
                  return (
                    <React.Fragment key={key}>
                      <div style={{ fontWeight: 600 }}>{metricLabels[key]}</div>
                      <div>
                        {fmt(m.mean)} ± {fmt(m.std)}
                      </div>
                      <div>
                        {fmt(m.min)} / {fmt(m.max)}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {hasHistogram && histogram && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 11 }}>Histogram</div>
                {availableMetrics.length > 0 && onSelectedMetricChange && (
                  <select
                    value={selectedMetric ?? availableMetrics[0]}
                    onChange={(e) => onSelectedMetricChange(e.target.value as SelectionMetricKey)}
                    style={{ fontSize: 11, padding: "2px 6px" }}
                  >
                    {availableMetrics.map((m) => (
                      <option key={m} value={m}>
                        {metricLabels[m]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {renderHistogram(histogram)}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#667" }}>
                <span>min {fmt(histogram.min)}</span>
                <span>max {fmt(histogram.max)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
