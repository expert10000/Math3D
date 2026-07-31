import { useEffect } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
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
  keyboardShortcutsEnabled?: boolean;
  getPickTestId?: (pick: T) => string;
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
  keyboardShortcutsEnabled = true,
  getPickTestId,
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
        top: 10,
        left: 12,
        right: 12,
        zIndex,
        display: "flex",
        gap: 6,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "6px 8px",
        border: "1px solid #bfdbfe",
        borderRadius: 8,
        background: "rgba(239, 246, 255, 0.92)",
        boxShadow: "0 8px 18px rgba(15, 23, 42, 0.10)",
        fontSize: 11,
        color: "#1e3a8a",
        pointerEvents: "auto",
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
              border: "1px solid #fed7aa",
              borderRadius: 999,
              background: "#fff7ed",
              color: "#9a3412",
              padding: "2px 8px",
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
            }}
          >
            Apply preview
          </button>
        </>
      )}
      {children}
      {confirmationLabel && (
        <>
          <span style={{ color: "#93a4ba" }}>|</span>
          <span
            data-testid={confirmationTestId}
            style={{
              border: "1px solid #bbf7d0",
              borderRadius: 999,
              background: "#f0fdf4",
              color: "#166534",
              padding: "2px 8px",
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
          }}
        >
          <span>Last: {lastCommandLabel}</span>
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
