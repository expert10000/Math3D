import React from "react";
import {
  canGeometryResultDriveViewport,
  compareGeometryAnalysisRecords,
  type GeometryAnalysisInspectorRecord,
} from "../geometry/analysisResultWorkflow";

type GeometryAnalysisInspectorPanelProps = {
  result: GeometryAnalysisInspectorRecord | null;
  savedResults: readonly GeometryAnalysisInspectorRecord[];
  compareResult: GeometryAnalysisInspectorRecord | null;
  currentSourceRevision: number;
  onSelectSaved: (id: string) => void;
  onSave: () => void;
  onRename: () => void;
  onCompare: () => void;
  onDuplicateSettings: () => void;
  onRecompute: () => void;
  onOpenSource: () => void;
  onOpenDerivative: () => void;
  onPromoteOverlay: () => void;
  onExport: () => void;
};

const card: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#fff",
  display: "grid",
  gap: 8,
  fontSize: 11,
};

const label: React.CSSProperties = { color: "#64748b" };

const lifecycleColors: Record<GeometryAnalysisInspectorRecord["lifecycle"], { border: string; background: string; color: string }> = {
  running: { border: "#93c5fd", background: "#eff6ff", color: "#1d4ed8" },
  preview: { border: "#7dd3fc", background: "#ecfeff", color: "#0e7490" },
  complete: { border: "#86efac", background: "#f0fdf4", color: "#166534" },
  saved: { border: "#a7f3d0", background: "#ecfdf5", color: "#047857" },
  failed: { border: "#fca5a5", background: "#fef2f2", color: "#b91c1c" },
  cancelled: { border: "#cbd5e1", background: "#f8fafc", color: "#475569" },
  stale: { border: "#fdba74", background: "#fff7ed", color: "#9a3412" },
  superseded: { border: "#c4b5fd", background: "#f5f3ff", color: "#6d28d9" },
};

export function GeometryAnalysisInspectorPanel(props: GeometryAnalysisInspectorPanelProps) {
  const result = props.result;
  if (!result) {
    return (
      <div data-testid="geometry-analysis-inspector-empty" style={card}>
        <strong>Analysis</strong>
        <div style={label}>Run or select a Geometry analysis result to inspect it here.</div>
      </div>
    );
  }
  const lifecycle = lifecycleColors[result.lifecycle];
  const viewportCurrent = canGeometryResultDriveViewport(result, props.currentSourceRevision);
  const comparison = props.compareResult ? compareGeometryAnalysisRecords(result, props.compareResult) : [];
  return (
    <div data-testid="geometry-analysis-inspector" style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong>{result.name}</strong>
        <span data-testid="geometry-analysis-inspector-lifecycle" style={{ ...lifecycle, border: `1px solid ${lifecycle.border}`, borderRadius: 999, padding: "2px 8px", fontWeight: 800 }}>
          {result.lifecycle}
        </span>
      </div>
      <div data-testid="geometry-analysis-inspector-metadata" style={{ display: "grid", gridTemplateColumns: "92px minmax(0, 1fr)", gap: "4px 8px" }}>
        {[
          ["Quantity", result.quantity],
          ["Method", result.method],
          ["Domain", result.domain],
          ["Units", result.units],
          ["Precision", result.precision],
          ["Sampling", result.sampling],
          ["Engine", result.engine],
          ["Source", `${result.sourceObjectName} · r${result.sourceRevision}`],
          ["Result", `v${result.resultVersion}`],
          ["Timing", result.computeTimeMs == null ? "n/a" : `${result.computeTimeMs.toFixed(2)} ms`],
          ["Timestamp", new Date(result.updatedAt).toLocaleString()],
        ].map(([key, value]) => <React.Fragment key={key}><span style={label}>{key}</span><span>{value}</span></React.Fragment>)}
      </div>
      <div data-testid="geometry-analysis-inspector-statistics" style={{ borderTop: "1px solid #e2e8f0", paddingTop: 7 }}>
        <strong>Statistics</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4, marginTop: 4 }}>
          {Object.entries(result.statistics).length
            ? Object.entries(result.statistics).map(([key, value]) => <div key={key}><span style={label}>{key}: </span>{String(value ?? "n/a")}</div>)
            : <div style={label}>No scalar statistics for this result.</div>}
        </div>
      </div>
      <div data-testid="geometry-analysis-inspector-warnings" style={{ color: result.warnings.length ? "#92400e" : "#166534" }}>
        <strong>Warnings:</strong> {result.warnings.length ? result.warnings.join(" · ") : "None"}
      </div>
      {!viewportCurrent && (
        <div data-testid="geometry-analysis-inspector-stale-guard" style={{ border: "1px solid #fdba74", borderRadius: 6, background: "#fff7ed", color: "#9a3412", padding: 6 }}>
          Preserved for inspection. This result cannot drive the current viewport because its lifecycle or source revision is not current.
        </div>
      )}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <button type="button" onClick={props.onSave}>Save</button>
        <button type="button" onClick={props.onRename}>Rename</button>
        <button type="button" onClick={props.onCompare}>Compare</button>
        <button type="button" onClick={props.onDuplicateSettings}>Duplicate settings</button>
        <button type="button" onClick={props.onRecompute}>Recompute</button>
        <button type="button" onClick={props.onOpenSource}>Open source</button>
        <button type="button" onClick={props.onOpenDerivative} disabled={!viewportCurrent}>Open derivative</button>
        <button type="button" onClick={props.onPromoteOverlay} disabled={!viewportCurrent}>Promote overlay</button>
        <button type="button" onClick={props.onExport}>Export</button>
      </div>
      {props.savedResults.length > 0 && (
        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 7, display: "grid", gap: 5 }}>
          <strong>Saved results</strong>
          {props.savedResults.slice(0, 8).map((saved) => (
            <button key={saved.id} type="button" onClick={() => props.onSelectSaved(saved.id)} style={{ textAlign: "left" }}>
              {saved.name} · {saved.lifecycle} · source r{saved.sourceRevision}
            </button>
          ))}
        </div>
      )}
      {props.compareResult && (
        <div data-testid="geometry-analysis-inspector-comparison" style={{ borderTop: "1px solid #e2e8f0", paddingTop: 7, display: "grid", gap: 3 }}>
          <strong>Compare with {props.compareResult.name}</strong>
          {comparison.map((row) => (
            <div key={row.key} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 5, color: row.equal ? "#475569" : "#9a3412" }}>
              <span>{row.key}</span><span>{row.left}</span><span>{row.right}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
