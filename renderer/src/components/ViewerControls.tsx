import type { CSSProperties, ReactNode } from "react";

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

export const viewerControlButtonStyle = (active = false): CSSProperties => ({
  border: "1px solid " + (active ? "#0a66c2" : "#cbd5e1"),
  borderRadius: 999,
  background: active ? "#e0f2fe" : "#ffffff",
  color: active ? "#0c4a6e" : "#334155",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: active ? 800 : 650,
  lineHeight: 1,
  padding: "4px 8px",
  whiteSpace: "nowrap",
});

type ViewerControlsStripProps = {
  children: ReactNode;
  testId?: string;
  style?: CSSProperties;
};

export function ViewerControlsStrip({ children, testId, style }: ViewerControlsStripProps) {
  return (
    <div data-testid={testId} style={{ ...viewerControlStripStyle, ...style }}>
      {children}
    </div>
  );
}

type ViewerControlGroupProps = {
  children: ReactNode;
  label: ReactNode;
  style?: CSSProperties;
  labelStyle?: CSSProperties;
};

export function ViewerControlGroup({ children, label, style, labelStyle }: ViewerControlGroupProps) {
  return (
    <div style={{ ...viewerControlGroupStyle, ...style }}>
      <span style={{ ...viewerControlLabelStyle, ...labelStyle }}>{label}</span>
      {children}
    </div>
  );
}
