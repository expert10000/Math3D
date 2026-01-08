// src/components/TabButton.tsx
import React from "react";

export type TabButtonProps = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

export const TabButton: React.FC<TabButtonProps> = ({
  active,
  onClick,
  children,
}) => (
  <button
    onClick={onClick}
    style={{
      padding: "6px 14px",
      border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
      background: active ? "var(--accent-soft)" : "rgba(255,255,255,0.75)",
      color: active ? "var(--accent-strong)" : "var(--text)",
      cursor: "pointer",
      borderRadius: 999,
      fontSize: 13,
      fontWeight: active ? 700 : 600,
      boxShadow: active ? "0 3px 10px rgba(29,53,87,0.15)" : "none",
      marginRight: 0,
    }}
  >
    {children}
  </button>
);

export default TabButton;
