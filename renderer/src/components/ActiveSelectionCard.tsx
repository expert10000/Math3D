import type { CSSProperties, ReactNode } from "react";

export type ActiveSelectionCardProps = {
  testId: string;
  workspace: "Mesh" | "Geometry";
  type: "Object" | "Face" | "Edge" | "Vertex";
  entityId: ReactNode;
  actions: readonly string[];
  emptyState?: ReactNode;
  onClearSelection?: () => void;
};

const cardStyle: CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: 8,
  padding: "8px 9px",
  background: "#eff6ff",
  color: "#1e3a8a",
  display: "grid",
  gap: 6,
  fontSize: 11,
};

const titleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px minmax(0, 1fr)",
  gap: 6,
};

const labelStyle: CSSProperties = {
  color: "#475569",
  fontWeight: 700,
};

export function ActiveSelectionCard({
  testId,
  workspace,
  type,
  entityId,
  actions,
  emptyState,
  onClearSelection,
}: ActiveSelectionCardProps) {
  const hasSelection = !emptyState;
  return (
    <div data-testid={testId} style={cardStyle}>
      <div style={titleRowStyle}>
        <strong>Active selection</strong>
        {onClearSelection && (
          <button
            type="button"
            data-testid={`${testId}-clear`}
            onClick={onClearSelection}
            disabled={!hasSelection}
            title={hasSelection ? "Clear the current selected entity." : "No selected entity to clear."}
            style={{
              fontSize: 10,
              padding: "2px 7px",
              borderColor: hasSelection ? "#93c5fd" : "#cbd5e1",
              color: hasSelection ? "#1d4ed8" : "#94a3b8",
              cursor: hasSelection ? "pointer" : "not-allowed",
            }}
          >
            Clear selection
          </button>
        )}
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Workspace</span>
        <span data-testid={`${testId}-workspace`}>{workspace}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Type</span>
        <span data-testid={`${testId}-type`}>{type}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>ID</span>
        <strong data-testid={`${testId}-id`}>{emptyState ?? entityId}</strong>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Available</span>
        <span data-testid={`${testId}-actions`}>{actions.length ? actions.join(", ") : "none"}</span>
      </div>
    </div>
  );
}
