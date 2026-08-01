import type { CSSProperties, ReactNode } from "react";

export type ViewerControlsDensity = "normal" | "compact";

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
