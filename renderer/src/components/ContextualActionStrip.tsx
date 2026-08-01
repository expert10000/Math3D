import { useEffect } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { CommandPreviewLegend } from "./CommandPreviewLegend";
import { ContextualRenderedActionButton } from "./ContextualActionButtons";

export type ContextualActionStripOption<T extends string> = {
  id: T;
  label: string;
  title?: string;
};

type ContextualActionStripProps<T extends string> = {
  testId: string;
  pickOptions: readonly ContextualActionStripOption<T>[];
  activePick: T;
  onPickChange: (pick: T) => void;
  selectionLabel: ReactNode;
  selectionTestId?: string;
  previewLabel?: ReactNode;
  previewTestId?: string;
  applyPreviewTestId?: string;
  confirmationLabel?: ReactNode;
  confirmationTestId?: string;
  lastCommandLabel?: ReactNode;
  lastCommandTestId?: string;
  canUndoLast?: boolean;
  onUndoLast?: () => void;
  undoTestId?: string;
  onOpenHistory?: () => void;
  openHistoryTestId?: string;
  canRunPrimaryAction?: boolean;
  onPrimaryAction?: () => void;
  commandPreviewOverlaysVisible?: boolean;
  commandPreviewHighVisibility?: boolean;
  onCommandPreviewOverlaysVisibleChange?: (visible: boolean) => void;
  commandPreviewOverlayToggleTestId?: string;
  commandPreviewLegendTestId?: string;
  keyboardShortcutsEnabled?: boolean;
  getPickTestId?: (pick: T) => string;
  top?: number;
  zIndex?: number;
  children: ReactNode;
};

type ContextualActionStripActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style" | "title"> & {
  testId?: string;
  disabledReason?: string;
  title?: string;
  pulse?: boolean;
};

export function ContextualActionStripAction({
  testId,
  disabled,
  disabledReason,
  title,
  pulse,
  children,
  ...buttonProps
}: ContextualActionStripActionProps) {
  return (
    <ContextualRenderedActionButton
      {...buttonProps}
      label={children}
      testId={testId}
      disabled={disabled}
      disabledReason={disabledReason ?? title}
      pulse={pulse}
      variant="strip"
    />
  );
}

export function ContextualActionStrip<T extends string>({
  testId,
  pickOptions,
  activePick,
  onPickChange,
  selectionLabel,
  selectionTestId,
  previewLabel,
  previewTestId,
  applyPreviewTestId,
  confirmationLabel,
  confirmationTestId,
  lastCommandLabel,
  lastCommandTestId,
  canUndoLast,
  onUndoLast,
  undoTestId,
  onOpenHistory,
  openHistoryTestId,
  canRunPrimaryAction,
  onPrimaryAction,
  commandPreviewOverlaysVisible = true,
  commandPreviewHighVisibility = false,
  onCommandPreviewOverlaysVisibleChange,
  commandPreviewOverlayToggleTestId,
  commandPreviewLegendTestId,
  keyboardShortcutsEnabled = true,
  getPickTestId,
  top = 10,
  zIndex = 8,
  children,
}: ContextualActionStripProps<T>) {
  useEffect(() => {
    if (!keyboardShortcutsEnabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const editingText =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        Boolean(target?.isContentEditable);
      if (editingText) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && canUndoLast && onUndoLast) {
        event.preventDefault();
        onUndoLast();
        return;
      }
      if (event.key === "Enter" && canRunPrimaryAction && onPrimaryAction) {
        event.preventDefault();
        onPrimaryAction();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canRunPrimaryAction, canUndoLast, keyboardShortcutsEnabled, onPrimaryAction, onUndoLast]);

  return (
    <div
      data-testid={testId}
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        top,
        left: 12,
        zIndex,
        maxWidth: "calc(100% - 24px)",
        display: "flex",
        gap: 5,
        alignItems: "center",
        flexWrap: "nowrap",
        overflow: "visible",
        padding: "4px 7px",
        border: "1px solid #bfdbfe",
        borderRadius: 999,
        background: "rgba(239, 246, 255, 0.82)",
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
        fontSize: 11,
        color: "#1e3a8a",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "#475467", fontWeight: 700 }}>Pick:</span>
      {pickOptions.map((pickOption) => {
        const active = activePick === pickOption.id;
        return (
          <button
            key={`${testId}-pick-${pickOption.id}`}
            type="button"
            data-testid={getPickTestId?.(pickOption.id)}
            onClick={() => onPickChange(pickOption.id)}
            aria-pressed={active}
            style={{
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: active ? 800 : 650,
              borderColor: active ? "#0a66c2" : "#bfdbfe",
              background: active ? "#dbeafe" : "#ffffff",
              color: active ? "#1d4ed8" : "#334155",
              pointerEvents: "auto",
            }}
            title={pickOption.title}
          >
            {pickOption.label}
          </button>
        );
      })}
      <span style={{ color: "#93a4ba" }}>|</span>
      <strong data-testid={selectionTestId}>{selectionLabel}</strong>
      {previewLabel && (
        <>
          <span style={{ color: "#93a4ba" }}>|</span>
          <span
            data-testid={previewTestId}
            style={{
              display: "inline-block",
              border: "1px solid #fed7aa",
              borderRadius: 999,
              background: "#fff7ed",
              color: "#9a3412",
              maxWidth: 240,
              overflow: "hidden",
              padding: "2px 8px",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 800,
            }}
          >
            {previewLabel}
          </span>
          <button
            type="button"
            data-testid={applyPreviewTestId}
            onClick={onPrimaryAction}
            disabled={!canRunPrimaryAction || !onPrimaryAction}
            title={
              canRunPrimaryAction
                ? "Apply the visible contextual preview. Shortcut: Enter."
                : "Select a valid entity before applying the preview."
            }
            style={{
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 800,
              borderColor: canRunPrimaryAction ? "#fdba74" : "#cbd5e1",
              background: canRunPrimaryAction ? "#ffedd5" : "#f1f5f9",
              color: canRunPrimaryAction ? "#9a3412" : "#94a3b8",
              cursor: canRunPrimaryAction ? "pointer" : "not-allowed",
              pointerEvents: "auto",
            }}
          >
            Apply preview
          </button>
        </>
      )}
      {children}
      <span style={{ color: "#93a4ba" }}>|</span>
      <span style={{ pointerEvents: "auto" }}>
        <CommandPreviewLegend
          testId={commandPreviewLegendTestId}
          compact
          highVisibility={commandPreviewHighVisibility}
        />
      </span>
      {onCommandPreviewOverlaysVisibleChange && (
        <label
          title="Show or hide viewport command preview badges and ghost overlays. Strip preview text remains visible."
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            border: "1px solid #cbd5e1",
            borderRadius: 999,
            background: commandPreviewOverlaysVisible ? "#f0fdf4" : "#f8fafc",
            color: commandPreviewOverlaysVisible ? "#166534" : "#475467",
            padding: "2px 7px",
            fontWeight: 800,
            cursor: "pointer",
            pointerEvents: "auto",
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="checkbox"
            data-testid={commandPreviewOverlayToggleTestId}
            checked={commandPreviewOverlaysVisible}
            onChange={(event) => onCommandPreviewOverlaysVisibleChange(event.target.checked)}
            style={{ width: 12, height: 12, margin: 0 }}
          />
          Overlays
        </label>
      )}
      {confirmationLabel && (
        <>
          <span style={{ color: "#93a4ba" }}>|</span>
          <span
            data-testid={confirmationTestId}
            style={{
              display: "inline-block",
              border: "1px solid #bbf7d0",
              borderRadius: 999,
              background: "#f0fdf4",
              color: "#166534",
              maxWidth: 240,
              overflow: "hidden",
              padding: "2px 8px",
              pointerEvents: "none",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 800,
            }}
          >
            {confirmationLabel}
          </span>
        </>
      )}
      {lastCommandLabel && (
        <span
          data-testid={lastCommandTestId}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            border: "1px solid #c7d2fe",
            borderRadius: 999,
            background: "#eef2ff",
            color: "#3730a3",
            padding: "2px 7px",
            fontWeight: 800,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              display: "inline-block",
              maxWidth: 220,
              overflow: "hidden",
              pointerEvents: "none",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              verticalAlign: "bottom",
            }}
          >
            Last: {lastCommandLabel}
          </span>
          {canUndoLast && onUndoLast && (
            <>
              <span style={{ color: "#93a4ba" }}>|</span>
              <button
                type="button"
                data-testid={undoTestId}
                onClick={onUndoLast}
                title="Undo the latest contextual action. Shortcut: Ctrl+Z."
                style={{
                  border: 0,
                  background: "transparent",
                  color: "#1d4ed8",
                  fontWeight: 900,
                  padding: 0,
                  pointerEvents: "auto",
                  cursor: "pointer",
                }}
              >
                Undo
              </button>
            </>
          )}
          {onOpenHistory && (
            <>
              <span style={{ color: "#93a4ba" }}>|</span>
              <button
                type="button"
                data-testid={openHistoryTestId}
                onClick={onOpenHistory}
                title="Open the command history for this workspace."
                style={{
                  border: 0,
                  background: "transparent",
                  color: "#1d4ed8",
                  fontWeight: 900,
                  padding: 0,
                  pointerEvents: "auto",
                  cursor: "pointer",
                }}
              >
                Open history
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
}
