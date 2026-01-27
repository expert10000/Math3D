import React from "react";
import type { GeodesicDiskStats } from "../math/geodesicDisk";
import type { SelectionMetricKey, SelectionMetricStats } from "../math/selection/selectionStats";

type Props = {
  stats: GeodesicDiskStats | null;
  curvatureStats?: Partial<Record<SelectionMetricKey, SelectionMetricStats>>;
  sampleCount?: number;
  compact?: boolean;
};

const metricLabels: Record<SelectionMetricKey, string> = {
  K: "K",
  H: "H",
  k1: "k1",
  k2: "k2",
};

function fmt(v: number, digits = 3) {
  return Number.isFinite(v) ? v.toFixed(digits) : "n/a";
}

export const DiskStatsPanel: React.FC<Props> = ({
  stats,
  curvatureStats,
  sampleCount,
  compact = false,
}) => {
  const metricRows = (["K", "H", "k1", "k2"] as const).filter((key) => curvatureStats?.[key]);
  const hasMetrics = metricRows.length > 0;

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
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Disk stats</div>
      {!stats ? (
        <div style={{ color: "#6b7280" }}>No disk computed.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 8px" }}>
            <div style={{ color: "#556" }}>Vertices inside</div>
            <div>{stats.vertexCount}</div>
            <div style={{ color: "#556" }}>Triangles</div>
            <div>{stats.triangleCount}</div>
            <div style={{ color: "#556" }}>Area</div>
            <div>{fmt(stats.area)}</div>
            <div style={{ color: "#556" }}>Perimeter</div>
            <div>{fmt(stats.perimeter)}</div>
            <div style={{ color: "#556" }}>Phi min / mean / max</div>
            <div>
              {fmt(stats.phi.min)} / {fmt(stats.phi.mean)} / {fmt(stats.phi.max)}
            </div>
            {typeof sampleCount === "number" && (
              <>
                <div style={{ color: "#556" }}>Samples inside</div>
                <div>{sampleCount}</div>
              </>
            )}
          </div>

          {hasMetrics && curvatureStats && (
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
                  const m = curvatureStats[key];
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
        </>
      )}
    </div>
  );
};
