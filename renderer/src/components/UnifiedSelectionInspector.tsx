import type React from "react";
import type { SelectionResult, UnifiedSelectionSet } from "../selection/unifiedSelection";

type UnifiedSelectionInspectorProps = {
  selection: SelectionResult | null;
  selectionSet?: UnifiedSelectionSet | null;
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

const pluralKind = (kind: string, count: number): string =>
  count === 1 ? kind : kind === "vertex" ? "vertices" : `${kind}s`;

const entityIdLabel = (item: SelectionResult): string => item.entityId.replace(/^(object|face|edge|vertex):/, "");

const uniqueSorted = <T extends number | string>(values: readonly T[]): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result.sort((a, b) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  });
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

const multiSummaryStyle: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: 7,
  background: "#eff6ff",
  padding: "6px 7px",
  display: "grid",
  gap: 3,
};

export const UnifiedSelectionInspector = ({
  selection,
  selectionSet = null,
  title = "Selection inspector",
  materialInfo = null,
  creaseInfo = null,
}: UnifiedSelectionInspectorProps) => {
  const multiSelection = selectionSet && selectionSet.count > 1 ? selectionSet : null;
  const activeSelection = selection ?? selectionSet?.activeSelection ?? null;
  const selectedItems = multiSelection?.items ?? [];
  const adjacentVertices = uniqueSorted(selectedItems.flatMap((item) => item.adjacency.vertices));
  const adjacentEdges = uniqueSorted(selectedItems.flatMap((item) => item.adjacency.edges));
  const adjacentFaces = uniqueSorted(selectedItems.flatMap((item) => item.adjacency.faces));
  const boundaryCount = selectedItems.filter((item) => item.topologyFlags.hasTopology && item.topologyFlags.boundary).length;
  const nonManifoldCount = selectedItems.filter((item) => item.topologyFlags.hasTopology && item.topologyFlags.nonManifold).length;
  const stateLabel = multiSelection ? "selected" : activeSelection ? activeSelection.state : "none";
  const multiObjectLabel =
    multiSelection && multiSelection.objectLabels.length === 1
      ? multiSelection.objectLabels[0]
      : multiSelection && multiSelection.objectLabels.length > 1
        ? `${multiSelection.objectLabels.length} objects`
        : "n/a";
  const multiEntityType =
    multiSelection && multiSelection.selectionTypes.length === 1 ? multiSelection.selectionTypes[0] : "items";
  const multiEntityLabel = multiSelection
    ? `${multiSelection.count} ${pluralKind(multiEntityType, multiSelection.count)} selected`
    : "";
  const selectedEntityIds = multiSelection ? uniqueSorted(selectedItems.map(entityIdLabel)) : [];
  const multiScopeLabel =
    multiSelection && multiSelection.objectLabels.length > 1
      ? `Across ${multiSelection.objectLabels.length} objects`
      : multiSelection && multiSelection.objectLabels.length === 1
        ? multiSelection.objectLabels[0]
        : "";

  return (
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
        <span style={{ color: "#075985", fontWeight: 700 }}>{stateLabel}</span>
      </div>
      {multiSelection ? (
        <div style={{ display: "grid", gap: 6 }} data-testid="unified-selection-multi-summary">
          <div style={multiSummaryStyle}>
            <strong data-testid="unified-selection-multi-headline" style={{ color: "#075985", fontSize: 12 }}>
              {multiEntityLabel}
            </strong>
            <span style={{ color: "#334155", fontSize: 10.5 }}>{multiScopeLabel}</span>
            <span style={{ color: "#64748b", fontSize: 10 }}>
              Active: {activeSelection?.label ?? multiSelection.activeSelection?.label ?? "n/a"}
            </span>
          </div>
          <div style={rowStyle}>
          <span style={labelStyle}>Object</span>
          <span data-testid="unified-selection-object">{multiObjectLabel}</span>
          <span style={labelStyle}>Entity</span>
          <span data-testid="unified-selection-entity">
            {multiEntityLabel}
          </span>
          <span style={labelStyle}>Selected {pluralKind(multiEntityType, multiSelection.count)}</span>
          <span data-testid="unified-selection-multi-ids">{list(selectedEntityIds)}</span>
          <span style={labelStyle}>Active</span>
          <span data-testid="unified-selection-active">{activeSelection?.label ?? multiSelection.activeSelection?.label ?? "n/a"}</span>
          <span style={labelStyle}>Point</span>
          <span>{fmtVec3(activeSelection?.point)}</span>
          <span style={labelStyle}>Normal</span>
          <span>{fmtVec3(activeSelection?.normal)}</span>
          <span style={labelStyle}>Vertices</span>
          <span data-testid="unified-selection-adjacent-vertices">{list(adjacentVertices)}</span>
          <span style={labelStyle}>Edges</span>
          <span data-testid="unified-selection-adjacent-edges">{list(adjacentEdges)}</span>
          <span style={labelStyle}>Faces</span>
          <span data-testid="unified-selection-adjacent-faces">{list(adjacentFaces)}</span>
          <span style={labelStyle}>Boundary</span>
          <span data-testid="unified-selection-boundary">{boundaryCount ? `${boundaryCount}/${multiSelection.count}` : "no"}</span>
          <span style={labelStyle}>Non-manifold</span>
          <span data-testid="unified-selection-non-manifold">{nonManifoldCount ? `${nonManifoldCount}/${multiSelection.count}` : "no"}</span>
          <span style={labelStyle}>Crease / sharp</span>
          <span>{creaseInfo ?? "n/a"}</span>
          <span style={labelStyle}>Material</span>
          <span>{materialInfo ?? "n/a"}</span>
          </div>
        </div>
      ) : activeSelection ? (
      <div style={rowStyle}>
        <span style={labelStyle}>Object</span>
        <span data-testid="unified-selection-object">{activeSelection.objectLabel || activeSelection.objectId}</span>
        <span style={labelStyle}>Entity</span>
        <span data-testid="unified-selection-entity">
          {activeSelection.entityType} {activeSelection.entityId.replace(/^(object|face|edge|vertex):/, "") || "object"}
        </span>
        <span style={labelStyle}>Point</span>
        <span>{fmtVec3(activeSelection.point)}</span>
        <span style={labelStyle}>Normal</span>
        <span>{fmtVec3(activeSelection.normal)}</span>
        <span style={labelStyle}>Vertices</span>
        <span data-testid="unified-selection-adjacent-vertices">{list(activeSelection.adjacency.vertices)}</span>
        <span style={labelStyle}>Edges</span>
        <span data-testid="unified-selection-adjacent-edges">{list(activeSelection.adjacency.edges)}</span>
        <span style={labelStyle}>Faces</span>
        <span data-testid="unified-selection-adjacent-faces">{list(activeSelection.adjacency.faces)}</span>
        <span style={labelStyle}>Boundary</span>
        <span data-testid="unified-selection-boundary">{activeSelection.topologyFlags.hasTopology ? (activeSelection.topologyFlags.boundary ? "yes" : "no") : "n/a"}</span>
        <span style={labelStyle}>Non-manifold</span>
        <span data-testid="unified-selection-non-manifold">
          {activeSelection.topologyFlags.hasTopology ? (activeSelection.topologyFlags.nonManifold ? "yes" : "no") : "n/a"}
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
};
