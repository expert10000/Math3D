// src/uiStyles.ts
import type React from "react";

export const uiStyles: { [k: string]: React.CSSProperties } = {
  appRoot: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100vh",   // full window height
    width: "100vw",
    maxWidth: "100vw",
    margin: 0,
    color: "var(--text)",
    background: "transparent",
  },

  wrap: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    alignItems: "stretch",
    gap: 12,
    padding: "12px 16px 16px",
  },

  panelLeft: {
    padding: "12px 12px 14px",
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow-soft)",
    overflow: "auto",
  },

  stack: {
    flex: "1 1 auto",
    minWidth: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
  },

  header: {
    padding: "14px 18px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow-soft)",
    background: "var(--panel-strong)",
    margin: "12px 16px 0",
  },
  h1: {
    margin: "0 0 6px 0",
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: "0.25px",
    fontFamily: "Georgia, \"Times New Roman\", serif",
    textTransform: "uppercase",
  },
  tabs: {
    display: "flex",
    gap: 6,
    margin: "6px 0 10px",
    padding: "4px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid var(--border)",
  },
  tab: {
    padding: "6px 12px",
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--muted)",
  },
  tabActive: {
    background: "var(--accent-soft)",
    borderColor: "var(--accent)",
    color: "var(--accent-strong)",
    boxShadow: "0 4px 10px rgba(29,53,87,0.18)",
  },
  controls: {
    display: "grid",
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gap: 10,
    alignItems: "flex-end",
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    boxShadow: "var(--shadow-soft)",
  },
  group: {
    gridColumn: "span 3",
    display: "grid",
    gap: 4,
    fontSize: 12,
  },
  groupWide: { gridColumn: "span 6" },
  inlineLabel: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    fontSize: 12,
  },
  hint: { fontSize: 11, color: "var(--muted)" },

  svg: {
    background: "var(--panel-strong)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "var(--shadow-soft)",
    flex: 1,
    width: "100%",
  },
  h2: {
    fontSize: 14,
    margin: "10px 0 6px",
    letterSpacing: "0.25px",
    fontWeight: 600,
    textTransform: "uppercase",
  },
  h3: {
    fontSize: 13,
    margin: 0,
    color: "var(--text)",
    letterSpacing: "0.2px",
    fontWeight: 600,
  },
  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 6,
    fontSize: 12,
  },
  presetsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
};
