import type { ReactNode } from "react";

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
  getPickTestId?: (pick: T) => string;
  zIndex?: number;
  children: ReactNode;
};

export function ContextualActionStrip<T extends string>({
  testId,
  pickOptions,
  activePick,
  onPickChange,
  selectionLabel,
  selectionTestId,
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
    </div>
  );
}
