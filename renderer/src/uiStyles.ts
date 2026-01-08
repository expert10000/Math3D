// src/uiStyles.ts
import type React from "react";

export const uiStyles: { [k: string]: React.CSSProperties } = {
  appRoot: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100vh",   // full window height

    // 👇 add these lines
    width: "100vw",
    maxWidth: "100vw",
    margin: 0,
  },

  wrap: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    alignItems: "stretch",
    gap: 0,
    padding: "0 16px 16px",
  },

  panelLeft: {
    paddingRight: 8,
    borderRight: "1px solid #eee",
    overflow: "auto",
  },

  stack: {
    flex: "1 1 auto",
    minWidth: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },

  header: {
    padding: "12px 18px",
    borderBottom: "1px solid #eee",
  },
  h1: { margin: "0 0 8px 0", fontSize: 22 },
  tabs: { display: "flex", gap: 8, margin: "8px 0 12px" },
  tab: {
    padding: "6px 12px",
    border: "1px solid #ccc",
    background: "#f7f7f7",
    cursor: "pointer",
    borderRadius: 6,
    fontSize: 13,
  },
  tabActive: {
    background: "#fff",
    borderColor: "#888",
    boxShadow: "0 1px 2px rgba(0,0,0,.08) inset",
  },
  controls: {
    display: "grid",
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gap: 8,
    alignItems: "flex-end",
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
  hint: { fontSize: 11, color: "#666" },

  svg: {
    background: "#fafafa",
    border: "1px solid #ddd",
    flex: 1,
    width: "100%",
  },
  h2: { fontSize: 14, margin: "10px 0 6px" },
  h3: { fontSize: 13, margin: 0 },
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
