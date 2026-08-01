import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export type ViewerControlsDensity = "normal" | "compact";
export type ViewerControlsMode = ViewerControlsDensity | "hidden";

export const viewerControlStripStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 5,
  padding: "5px 7px",
};

export const viewerControlGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "wrap",
  minHeight: 28,
  padding: "2px 5px",
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  background: "rgba(255, 255, 255, 0.92)",
};

export const viewerControlLabelStyle: CSSProperties = {
  alignSelf: "center",
  color: "#1e3a8a",
  fontSize: 11,
  fontWeight: 850,
  marginRight: 1,
  whiteSpace: "nowrap",
};

export const viewerControlCheckStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: "#334155",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

export const viewerControlButtonStyle = (active = false, density: ViewerControlsDensity = "normal"): CSSProperties => ({
  border: "1px solid " + (active ? "#0a66c2" : "#cbd5e1"),
  borderRadius: 999,
  background: active ? "#e0f2fe" : "#ffffff",
  color: active ? "#0c4a6e" : "#334155",
  cursor: "pointer",
  fontSize: density === "compact" ? 10 : 11,
  fontWeight: active ? 800 : 650,
  lineHeight: 1,
  padding: density === "compact" ? "3px 6px" : "4px 8px",
  whiteSpace: "nowrap",
});

export const viewerControlsOverlayChipStyle = (active = false): CSSProperties => ({
  borderRadius: 999,
  border: "1px solid " + (active ? "#93c5fd" : "#cbd5e1"),
  background: active ? "rgba(239, 246, 255, 0.96)" : "rgba(255, 255, 255, 0.96)",
  color: active ? "#1d4ed8" : "#334155",
  fontWeight: 850,
  fontSize: 11,
  padding: "4px 9px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "0 8px 18px rgba(15, 23, 42, 0.12)",
});

const viewerControlsModeLabel = (value: ViewerControlsDensity) =>
  value === "compact" ? "Controls: Compact" : "Controls: Full";

type ViewerControlsModeSelectProps = {
  value: ViewerControlsDensity;
  testId: string;
  onChange: (mode: ViewerControlsMode) => void;
  style?: CSSProperties;
};

export function ViewerControlsModeSelect({ value, testId, onChange, style }: ViewerControlsModeSelectProps) {
  const [open, setOpen] = useState(false);
  const chooseMode = (mode: ViewerControlsMode) => {
    setOpen(false);
    onChange(mode);
  };

  return (
    <div
      data-testid={testId}
      data-mode={value}
      style={{
        position: "relative",
        display: "inline-flex",
        ...style,
      }}
    >
      <button
        type="button"
        data-testid={`${testId}-button`}
        onClick={() => setOpen((current) => !current)}
        style={{
          ...viewerControlsOverlayChipStyle(value === "compact"),
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          minWidth: 118,
          justifyContent: "space-between",
        }}
      title={
        value === "compact"
          ? "Compact controls use shorter labels and tighter spacing."
          : "Full controls show complete labels."
      }
        aria-label="Viewer controls mode"
        aria-expanded={open}
      >
        <span>{viewerControlsModeLabel(value)}</span>
        <span aria-hidden="true" style={{ fontSize: 9, color: "#64748b" }}>
          v
        </span>
      </button>
      {open && (
        <div
          data-testid={`${testId}-menu`}
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 80,
            minWidth: 152,
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            background: "rgba(255, 255, 255, 0.98)",
            boxShadow: "0 12px 26px rgba(15, 23, 42, 0.18)",
            padding: 4,
            display: "grid",
            gap: 3,
          }}
        >
          {[
            ["normal", "Full controls", "Full controls show complete labels."],
            ["compact", "Compact controls", "Compact controls use shorter labels and tighter spacing."],
            ["hidden", "Hide controls", "Hide controls and leave only the Show controls chip."],
          ].map(([mode, label, title]) => (
            <button
              key={mode}
              type="button"
              data-testid={`${testId}-${mode}`}
              role="menuitem"
              onClick={() => chooseMode(mode as ViewerControlsMode)}
              style={{
                border: "1px solid " + (mode === value ? "#93c5fd" : "transparent"),
                borderRadius: 6,
                background: mode === value ? "#eff6ff" : "transparent",
                color: mode === value ? "#1d4ed8" : "#334155",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: mode === value ? 800 : 650,
                padding: "5px 7px",
                textAlign: "left",
              }}
              title={title}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const compactStripStyle: CSSProperties = {
  gap: 3,
  padding: "3px 5px",
};

const compactGroupStyle: CSSProperties = {
  gap: 3,
  minHeight: 24,
  padding: "1px 4px",
  borderRadius: 6,
};

const compactLabelStyle: CSSProperties = {
  fontSize: 10,
  marginRight: 0,
};

type ViewerControlsStripProps = {
  children: ReactNode;
  testId?: string;
  density?: ViewerControlsDensity;
  style?: CSSProperties;
};

export function ViewerControlsStrip({ children, testId, density = "normal", style }: ViewerControlsStripProps) {
  return (
    <div
      data-testid={testId}
      data-density={density}
      style={{
        ...viewerControlStripStyle,
        ...(density === "compact" ? compactStripStyle : undefined),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type ViewerControlGroupProps = {
  children: ReactNode;
  label: ReactNode;
  density?: ViewerControlsDensity;
  style?: CSSProperties;
  labelStyle?: CSSProperties;
};

export function ViewerControlGroup({ children, label, density = "normal", style, labelStyle }: ViewerControlGroupProps) {
  return (
    <div
      data-density={density}
      style={{
        ...viewerControlGroupStyle,
        ...(density === "compact" ? compactGroupStyle : undefined),
        ...style,
      }}
    >
      <span
        style={{
          ...viewerControlLabelStyle,
          ...(density === "compact" ? compactLabelStyle : undefined),
          ...labelStyle,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
