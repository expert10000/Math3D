import type { ButtonHTMLAttributes, ReactNode } from "react";

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
  confirmationLabel?: ReactNode;
  confirmationTestId?: string;
  canUndoLast?: boolean;
  onUndoLast?: () => void;
  undoTestId?: string;
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
    <button
      {...buttonProps}
      type="button"
      data-testid={testId}
      disabled={disabled}
      title={disabled ? disabledReason ?? title : title}
      style={{
        padding: "3px 8px",
        fontSize: 11,
        fontWeight: 700,
        borderColor: disabled ? "#cbd5e1" : "#bfdbfe",
        background: disabled ? "#f1f5f9" : pulse ? "#dcfce7" : "#ffffff",
        color: disabled ? "#94a3b8" : pulse ? "#166534" : "#1e3a8a",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.88 : 1,
        boxShadow: pulse ? "0 0 0 3px rgba(34, 197, 94, 0.22)" : undefined,
        transition: "background 180ms ease, color 180ms ease, box-shadow 180ms ease",
      }}
    >
      {children}
    </button>
  );
}

export function ContextualActionStrip<T extends string>({
  testId,
  pickOptions,
  activePick,
  onPickChange,
  selectionLabel,
  selectionTestId,
  confirmationLabel,
  confirmationTestId,
  canUndoLast,
  onUndoLast,
  undoTestId,
  getPickTestId,
  zIndex = 8,
  children,
}: ContextualActionStripProps<T>) {
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
      {canUndoLast && onUndoLast && (
        <ContextualActionStripAction testId={undoTestId} onClick={onUndoLast} title="Undo the latest contextual action.">
          Undo last
        </ContextualActionStripAction>
      )}
    </div>
  );
}
