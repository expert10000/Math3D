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
      padding: "6px 12px",
      border: "1px solid #ccc",
      background: active ? "#fff" : "#f7f7f7",
      cursor: "pointer",
      borderRadius: 6,
      fontSize: 13,
      boxShadow: active ? "0 1px 2px rgba(0,0,0,.08) inset" : "none",
      marginRight: 8,
    }}
  >
    {children}
  </button>
);

export default TabButton;
