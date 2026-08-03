import type React from "react";
import type { SelectionResult } from "../selection/unifiedSelection";

type UnifiedSelectionInspectorProps = {
  selection: SelectionResult | null;
  title?: string;
  materialInfo?: string | null;
  creaseInfo?: string | null;
};

const fmtNumber = (value: number): string => (Number.isFinite(value) ? value.toFixed(4) : "n/a");
const fmtVec3 = (value: readonly [number, number, number] | null | undefined): string =>
  value ? `(${fmtNumber(value[0])}, ${fmtNumber(value[1])}, ${fmtNumber(value[2])})` : "n/a";

const list = (values: readonly (number | string)[] | null | undefined): string => {
  if (!values?.length) return "n/a";
  const visible = values.slice(0, 18).join(", ");
  return values.length > 18 ? `${visible}, +${values.length - 18} more` : visible;
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "116px minmax(0, 1fr)",
  gap: "4px 8px",
  alignItems: "baseline",
};

const labelStyle: React.CSSProperties = {
  color: "#556",
  fontWeight: 600,
};

export const UnifiedSelectionInspector = ({
  selection,
  title = "Selection inspector",
  materialInfo = null,
  creaseInfo = null,
}: UnifiedSelectionInspectorProps) => (
  <div
    data-testid="unified-selection-inspector"
    style={{
      border: "1px solid #dbeafe",
      borderRadius: 8,
      background: "#f8fbff",
      padding: "7px 8px",
      display: "grid",
      gap: 6,
      fontSize: 10.5,
      color: "#0f172a",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
      <strong>{title}</strong>
      <span style={{ color: "#075985", fontWeight: 700 }}>{selection ? selection.state : "none"}</span>
    </div>
    {selection ? (
      <div style={rowStyle}>
        <span style={labelStyle}>Object</span>
        <span data-testid="unified-selection-object">{selection.objectLabel || selection.objectId}</span>
        <span style={labelStyle}>Entity</span>
        <span data-testid="unified-selection-entity">
          {selection.entityType} {selection.entityId.replace(/^(object|face|edge|vertex):/, "") || "object"}
        </span>
        <span style={labelStyle}>Point</span>
        <span>{fmtVec3(selection.point)}</span>
        <span style={labelStyle}>Normal</span>
        <span>{fmtVec3(selection.normal)}</span>
        <span style={labelStyle}>Vertices</span>
        <span data-testid="unified-selection-adjacent-vertices">{list(selection.adjacency.vertices)}</span>
        <span style={labelStyle}>Edges</span>
        <span data-testid="unified-selection-adjacent-edges">{list(selection.adjacency.edges)}</span>
        <span style={labelStyle}>Faces</span>
        <span data-testid="unified-selection-adjacent-faces">{list(selection.adjacency.faces)}</span>
        <span style={labelStyle}>Boundary</span>
        <span data-testid="unified-selection-boundary">{selection.topologyFlags.hasTopology ? (selection.topologyFlags.boundary ? "yes" : "no") : "n/a"}</span>
        <span style={labelStyle}>Non-manifold</span>
        <span data-testid="unified-selection-non-manifold">
          {selection.topologyFlags.hasTopology ? (selection.topologyFlags.nonManifold ? "yes" : "no") : "n/a"}
        </span>
        <span style={labelStyle}>Crease / sharp</span>
        <span>{creaseInfo ?? "n/a"}</span>
        <span style={labelStyle}>Material</span>
        <span>{materialInfo ?? "n/a"}</span>
      </div>
    ) : (
      <div style={{ color: "#64748b" }}>No selected entity.</div>
    )}
  </div>
);
