import type { CSSProperties, ReactNode } from "react";
import { CommandPreviewLegend } from "./CommandPreviewLegend";
import { ContextualRenderedActionButton, type ContextualButtonAction } from "./ContextualActionButtons";
import type { SelectionHistoryEntry } from "../selection/selectionHistory";

export type ActiveSelectionWorkspace = "Mesh" | "Geometry";
export type ActiveSelectionType = "Object" | "Face" | "Edge" | "Vertex";

export type ActiveSelectionCardAction = ContextualButtonAction;

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
  canBookmarkSelection?: boolean;
  onBookmarkSelection?: () => void;
  bookmarkSelectionTestId?: string;
  canRedoSelection?: boolean;
  onRedoSelection?: () => void;
  redoSelectionTestId?: string;
  selectionHistoryItems?: readonly SelectionHistoryEntry[];
  selectionBookmarks?: readonly SelectionHistoryEntry[];
  onRestoreSelection?: (entry: SelectionHistoryEntry) => void;
  onRemoveSelectionBookmark?: (entry: SelectionHistoryEntry) => void;
  adaptiveGizmoLabel?: ReactNode;
  adaptiveGizmoTestId?: string;
  legendTestId?: string;
  previewHighVisibility?: boolean;
  previewAccessibilityLabel?: ReactNode;
  previewAccessibilityTestId?: string;
  onOpenPreviewSettings?: () => void;
  openPreviewSettingsTestId?: string;
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

const historyButtonStyle = (disabled?: boolean): CSSProperties => ({
  padding: "3px 8px",
  fontSize: 10,
  fontWeight: 800,
  borderColor: disabled ? "#cbd5e1" : "#bfdbfe",
  background: disabled ? "#f1f5f9" : "#ffffff",
  color: disabled ? "#94a3b8" : "#1e3a8a",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.88 : 1,
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
  canBookmarkSelection,
  onBookmarkSelection,
  bookmarkSelectionTestId,
  canRedoSelection,
  onRedoSelection,
  redoSelectionTestId,
  selectionHistoryItems,
  selectionBookmarks,
  onRestoreSelection,
  onRemoveSelectionBookmark,
  adaptiveGizmoLabel,
  adaptiveGizmoTestId,
  legendTestId,
  previewHighVisibility = false,
  previewAccessibilityLabel,
  previewAccessibilityTestId,
  onOpenPreviewSettings,
  openPreviewSettingsTestId,
}: ActiveSelectionCardProps) {
  const hasSelection = !emptyState;
  const renderSelectionEntryList = (
    label: string,
    entries: readonly SelectionHistoryEntry[] | undefined,
    emptyLabel: string,
    testIdSuffix: string,
    removable = false
  ) => (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span data-testid={`${testId}-${testIdSuffix}`} style={{ display: "grid", gap: 4 }}>
        {entries?.length ? (
          entries.slice(0, 5).map((entry) => (
            <span key={`${testId}-${testIdSuffix}-${entry.key}`} style={{ display: "flex", gap: 5, minWidth: 0 }}>
              <button
                type="button"
                data-testid={`${testId}-${testIdSuffix}-restore-${entry.key}`}
                onClick={() => onRestoreSelection?.(entry)}
                disabled={!onRestoreSelection}
                title={entry.breadcrumb}
                style={{
                  flex: "1 1 auto",
                  minWidth: 0,
                  padding: "3px 6px",
                  fontSize: 10,
                  fontWeight: 800,
                  textAlign: "left",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  borderColor: "#bfdbfe",
                  background: "#ffffff",
                  color: "#1e3a8a",
                }}
              >
                {entry.breadcrumb}
              </button>
              {removable && onRemoveSelectionBookmark && (
                <button
                  type="button"
                  data-testid={`${testId}-${testIdSuffix}-remove-${entry.key}`}
                  onClick={() => onRemoveSelectionBookmark(entry)}
                  title="Remove bookmark"
                  style={{
                    flex: "0 0 auto",
                    padding: "3px 6px",
                    fontSize: 10,
                    fontWeight: 800,
                    borderColor: "#fecaca",
                    background: "#fff1f2",
                    color: "#be123c",
                  }}
                >
                  Remove
                </button>
              )}
            </span>
          ))
        ) : (
          <span style={{ color: "#64748b" }}>{emptyLabel}</span>
        )}
      </span>
    </div>
  );
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
      <div>
        <CommandPreviewLegend
          testId={legendTestId ?? `${testId}-preview-legend`}
          compact
          highVisibility={previewHighVisibility}
        />
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
      {adaptiveGizmoLabel && (
        <div style={rowStyle}>
          <span style={labelStyle}>Gizmo</span>
          <span data-testid={adaptiveGizmoTestId ?? `${testId}-adaptive-gizmo`}>{adaptiveGizmoLabel}</span>
        </div>
      )}
      {actionButtons && actionButtons.length > 0 && (
        <div style={rowStyle}>
          <span style={labelStyle}>Run</span>
          <span style={actionsRowStyle}>
            {actionButtons.map((action) => (
              <ContextualRenderedActionButton
                key={`${testId}-action-${action.label}`}
                {...action}
                variant="card"
              />
            ))}
          </span>
        </div>
      )}
      {(onBookmarkSelection ||
        onRedoSelection ||
        selectionHistoryItems !== undefined ||
        selectionBookmarks !== undefined) && (
        <div style={rowStyle}>
          <span style={labelStyle}>Selection</span>
          <span style={actionsRowStyle}>
            <ContextualRenderedActionButton
              label="Bookmark selection"
              testId={bookmarkSelectionTestId ?? `${testId}-bookmark-selection`}
              onClick={onBookmarkSelection}
              disabled={!onBookmarkSelection || !canBookmarkSelection}
              disabledReason={
                onBookmarkSelection
                  ? "Select an entity before bookmarking it."
                  : "Reload the workspace to enable selection bookmarking."
              }
              variant="card"
            />
            <ContextualRenderedActionButton
              label="Redo selection"
              testId={redoSelectionTestId ?? `${testId}-redo-selection`}
              onClick={onRedoSelection}
              disabled={!onRedoSelection || !canRedoSelection}
              disabledReason={
                onRedoSelection
                  ? "No recent selection is available to restore."
                  : "Reload the workspace to enable selection redo."
              }
              variant="card"
            />
          </span>
        </div>
      )}
      {renderSelectionEntryList("Recent", selectionHistoryItems, "No recent selections", "selection-history")}
      {renderSelectionEntryList("Bookmarks", selectionBookmarks, "No bookmarked selections", "selection-bookmarks", true)}
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
      {previewAccessibilityLabel && (
        <div
          data-testid={previewAccessibilityTestId ?? `${testId}-preview-accessibility`}
          style={{
            display: "grid",
            gap: 5,
            border: "1px solid #bae6fd",
            borderRadius: 8,
            background: "#f0f9ff",
            color: "#0c4a6e",
            padding: "5px 7px",
            fontWeight: 800,
          }}
        >
          <div style={rowStyle}>
            <span style={labelStyle}>Preview accessibility</span>
            <span>{previewAccessibilityLabel}</span>
          </div>
          {onOpenPreviewSettings && (
            <button
              type="button"
              data-testid={openPreviewSettingsTestId ?? `${testId}-open-preview-settings`}
              onClick={onOpenPreviewSettings}
              style={{
                justifySelf: "start",
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 800,
                borderColor: "#7dd3fc",
                background: "#ffffff",
                color: "#0369a1",
              }}
              title="Open preview overlay and accessibility settings."
            >
              Open preview settings
            </button>
          )}
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
            <button type="button" data-testid={undoTestId} onClick={onUndoLast} style={historyButtonStyle(false)}>
              Undo
            </button>
          )}
          {onOpenHistory && (
            <button type="button" data-testid={openHistoryTestId} onClick={onOpenHistory} style={historyButtonStyle(false)}>
              Open history
            </button>
          )}
        </div>
      )}
    </div>
  );
}
