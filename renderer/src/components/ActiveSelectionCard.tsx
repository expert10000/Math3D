import type { CSSProperties, ReactNode } from "react";

export type ActiveSelectionWorkspace = "Mesh" | "Geometry";
export type ActiveSelectionType = "Object" | "Face" | "Edge" | "Vertex";

export type ActiveSelectionCardAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  testId?: string;
  pulse?: boolean;
};

export type ActiveSelectionCardProps = {
  testId: string;
  workspace: ActiveSelectionWorkspace;
  type: ActiveSelectionType;
  entityId: ReactNode;
  actions: readonly string[];
  actionButtons?: readonly ActiveSelectionCardAction[];
  emptyState?: ReactNode;
  confirmationLabel?: ReactNode;
  confirmationTestId?: string;
  lastCommandLabel?: ReactNode;
  lastCommandTestId?: string;
  canUndoLast?: boolean;
  onUndoLast?: () => void;
  undoTestId?: string;
  onOpenHistory?: () => void;
  openHistoryTestId?: string;
  onClearSelection?: () => void;
};

export type ActiveSelectionSummary = {
  workspace: ActiveSelectionWorkspace;
  type: ActiveSelectionType;
  entityId: ReactNode;
  actions: readonly string[];
  emptyState?: ReactNode;
  eventLabel: string | null;
  eventKey: string | null;
  pulseKey: string | null;
};

const selectionEntityText = (entityId: ReactNode): string | null =>
  typeof entityId === "string" && entityId.trim() && entityId !== "none" ? entityId.trim() : null;

const formatSelectionEventLabel = (type: ActiveSelectionType, entityId: ReactNode): string | null => {
  const text = selectionEntityText(entityId);
  if (!text) return null;
  if (type === "Object") return `Selected object: ${text}`;
  const typeLower = type.toLowerCase();
  return text.toLowerCase().startsWith(typeLower)
    ? `Selected ${text.slice(0, 1).toLowerCase()}${text.slice(1)}`
    : `Selected ${typeLower} ${text}`;
};

export const buildActiveSelectionSummary = ({
  workspace,
  type,
  entityId,
  actions,
  emptyState,
}: {
  workspace: ActiveSelectionWorkspace;
  type: ActiveSelectionType;
  entityId: ReactNode;
  actions: readonly string[];
  emptyState?: ReactNode;
}): ActiveSelectionSummary => {
  const eventLabel = emptyState ? null : formatSelectionEventLabel(type, entityId);
  const eventKey = eventLabel ? `${workspace}:${type}:${selectionEntityText(entityId) ?? eventLabel}` : null;
  return {
    workspace,
    type,
    entityId,
    actions,
    emptyState,
    eventLabel,
    eventKey,
    pulseKey: eventKey,
  };
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

const actionsRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
};

const actionButtonStyle = (disabled?: boolean, pulse?: boolean): CSSProperties => ({
  padding: "3px 8px",
  fontSize: 10,
  fontWeight: 800,
  borderColor: disabled ? "#cbd5e1" : "#bfdbfe",
  background: disabled ? "#f1f5f9" : pulse ? "#dcfce7" : "#ffffff",
  color: disabled ? "#94a3b8" : pulse ? "#166534" : "#1e3a8a",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.88 : 1,
  boxShadow: pulse ? "0 0 0 3px rgba(34, 197, 94, 0.18)" : undefined,
});

export function ActiveSelectionCard({
  testId,
  workspace,
  type,
  entityId,
  actions,
  actionButtons,
  emptyState,
  confirmationLabel,
  confirmationTestId,
  lastCommandLabel,
  lastCommandTestId,
  canUndoLast,
  onUndoLast,
  undoTestId,
  onOpenHistory,
  openHistoryTestId,
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
      {actionButtons && actionButtons.length > 0 && (
        <div style={rowStyle}>
          <span style={labelStyle}>Run</span>
          <span style={actionsRowStyle}>
            {actionButtons.map((action) => (
              <button
                key={`${testId}-action-${action.label}`}
                type="button"
                data-testid={action.testId}
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.disabled ? action.disabledReason : undefined}
                style={actionButtonStyle(action.disabled, action.pulse)}
              >
                {action.label}
              </button>
            ))}
          </span>
        </div>
      )}
      {confirmationLabel && (
        <div
          data-testid={confirmationTestId}
          style={{
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            background: "#f0fdf4",
            color: "#166534",
            padding: "5px 7px",
            fontWeight: 800,
          }}
        >
          {confirmationLabel}
        </div>
      )}
      {lastCommandLabel && (
        <div
          data-testid={lastCommandTestId}
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
            border: "1px solid #c7d2fe",
            borderRadius: 8,
            background: "#eef2ff",
            color: "#3730a3",
            padding: "5px 7px",
            fontWeight: 800,
          }}
        >
          <span>Last: {lastCommandLabel}</span>
          {canUndoLast && onUndoLast && (
            <button type="button" data-testid={undoTestId} onClick={onUndoLast} style={actionButtonStyle(false)}>
              Undo
            </button>
          )}
          {onOpenHistory && (
            <button type="button" data-testid={openHistoryTestId} onClick={onOpenHistory} style={actionButtonStyle(false)}>
              Open history
            </button>
          )}
        </div>
      )}
    </div>
  );
}
