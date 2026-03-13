import React from "react";
import { formatConstraintValue } from "../geometry/analysis";
import type { ProblemVisualizerResult } from "../geometry/problemPresets";

const BADGE_COLORS = {
  ok: "#2e7d32",
  fail: "#c62828",
  invalid: "#6b7280",
};

const fmtCoord = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "-");

const formatCheckTolerance = (value: number, unit: "unit" | "deg" | "unit2") => {
  if (unit === "deg") return formatConstraintValue(value, "deg");
  if (unit === "unit2") {
    if (!Number.isFinite(value)) return "-";
    if (Math.abs(value) < 1e-3 || Math.abs(value) >= 1000) return value.toExponential(2);
    return value.toFixed(4);
  }
  return formatConstraintValue(value, "unit");
};

const formatCheckResidual = (value: number | null, unit: "unit" | "deg" | "unit2") => {
  if (unit === "deg") return formatConstraintValue(value, "deg");
  if (unit === "unit2") {
    if (value == null || !Number.isFinite(value)) return "-";
    if (Math.abs(value) < 1e-3 || Math.abs(value) >= 1000) return value.toExponential(2);
    return value.toFixed(4);
  }
  return formatConstraintValue(value, "unit");
};

type ProblemAnalyzerPanelProps = {
  result: ProblemVisualizerResult;
};

export const ProblemAnalyzerPanel: React.FC<ProblemAnalyzerPanelProps> = ({ result }) => {
  const pointObjects = result.objects.filter((entry) => entry.type === "point" && entry.valid);

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{result.name}</div>
        <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>{result.description}</div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Coordinates</div>
        <div style={{ display: "grid", gap: 4, fontSize: 11, fontFamily: "monospace" }}>
          {pointObjects.map((entry) => {
            const m = entry.summary;
            return (
              <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 8 }}>
                <span style={{ opacity: 0.75 }}>{entry.label}</span>
                <span>{m}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Distances</div>
        <div style={{ display: "grid", gap: 4, fontSize: 11, fontFamily: "monospace" }}>
          {result.distances.map((row) => (
            <div key={row.id} style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 8 }}>
              <span style={{ opacity: 0.75 }}>{row.label}</span>
              <span>{formatConstraintValue(row.value, "unit")}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Angles</div>
        <div style={{ display: "grid", gap: 4, fontSize: 11, fontFamily: "monospace" }}>
          {result.angles.map((row) => (
            <div key={row.id} style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 8 }}>
              <span style={{ opacity: 0.75 }}>{row.label}</span>
              <span>{row.valueDeg == null ? "-" : `${row.valueDeg.toFixed(3)} deg`}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Checks</div>
        <div style={{ display: "grid", gap: 6 }}>
          {result.checks.map((check) => {
            const color = BADGE_COLORS[check.status];
            return (
              <div
                key={check.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: `${color}22`,
                    color,
                    fontWeight: 700,
                    fontSize: 10,
                    textTransform: "uppercase",
                  }}
                >
                  {check.status}
                </span>
                <span>{check.label}</span>
                <span style={{ fontFamily: "monospace", opacity: 0.72 }}>
                  {formatCheckResidual(check.residual, check.unit)} {"<="}{" "}
                  {formatCheckTolerance(check.tolerance, check.unit)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Construction Graph</div>
        <div style={{ display: "grid", gap: 4, fontSize: 11 }}>
          {result.objects.map((entry) => (
            <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr", gap: 8 }}>
              <span style={{ fontFamily: "monospace", opacity: 0.75 }}>{entry.id}</span>
              <span style={{ opacity: entry.valid ? 0.82 : 1, color: entry.valid ? "inherit" : "#b42318" }}>
                {entry.valid ? entry.summary : entry.error ?? "invalid"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {result.errors.length > 0 && (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            color: "#991b1b",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Solver warnings</div>
          <div style={{ display: "grid", gap: 3, fontFamily: "monospace" }}>
            {result.errors.map((err, idx) => (
              <div key={`${idx}-${err}`}>{err}</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, opacity: 0.6 }}>
        Free points: A({fmtCoord(result.freePoints.A.x)}, {fmtCoord(result.freePoints.A.y)}), B(
        {fmtCoord(result.freePoints.B.x)}, {fmtCoord(result.freePoints.B.y)}), C(
        {fmtCoord(result.freePoints.C.x)}, {fmtCoord(result.freePoints.C.y)})
      </div>
    </div>
  );
};
