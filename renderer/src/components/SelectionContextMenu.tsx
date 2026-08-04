import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { ActiveSelectionCardAction } from "./ActiveSelectionCard";

export type SelectionContextMenuProps = {
  readonly testId: string;
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly breadcrumb: string;
  readonly actions: readonly ActiveSelectionCardAction[];
  readonly onClose: () => void;
};

const layerStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 42,
  background: "transparent",
};

const menuStyle: CSSProperties = {
  position: "fixed",
  width: 224,
  maxWidth: "calc(100vw - 16px)",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "rgba(255,255,255,0.98)",
  boxShadow: "0 18px 38px rgba(15,23,42,0.2)",
  padding: 6,
  display: "grid",
  gap: 4,
  fontSize: 11,
  color: "#0f172a",
};

const actionStyle = (disabled?: boolean): CSSProperties => ({
  border: "1px solid transparent",
  borderRadius: 6,
  background: disabled ? "#f8fafc" : "transparent",
  color: disabled ? "#94a3b8" : "#0f172a",
  textAlign: "left",
  padding: "6px 8px",
  fontWeight: 750,
  cursor: disabled ? "not-allowed" : "pointer",
});

export function SelectionContextMenu({
  testId,
  x,
  y,
  title,
  breadcrumb,
  actions,
  onClose,
}: SelectionContextMenuProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid={`${testId}-layer`}
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
      style={layerStyle}
    >
      <div
        data-testid={testId}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
        style={{
          ...menuStyle,
          left: `clamp(8px, ${x}px, calc(100vw - 232px))`,
          top: `clamp(8px, ${y}px, calc(100vh - 320px))`,
        }}
      >
        <div style={{ padding: "5px 7px 4px", display: "grid", gap: 2 }}>
          <strong>{title}</strong>
          <span data-testid={`${testId}-breadcrumb`} style={{ color: "#475569", overflowWrap: "anywhere" }}>
            {breadcrumb}
          </span>
        </div>
        <div style={{ height: 1, background: "#e2e8f0" }} />
        {actions.length ? (
          actions.map((action) => (
            <button
              key={`${testId}-${action.testId ?? String(action.label)}`}
              type="button"
              data-testid={action.testId ? `${action.testId}-menu` : undefined}
              onClick={(event) => {
                if (action.disabled) return;
                action.onClick?.(event);
                onClose();
              }}
              disabled={action.disabled}
              title={action.disabled ? action.disabledReason : undefined}
              style={actionStyle(action.disabled)}
            >
              {action.label}
            </button>
          ))
        ) : (
          <div style={{ padding: "6px 8px", color: "#64748b", fontWeight: 700 }}>No actions available</div>
        )}
      </div>
    </div>
  );
}
