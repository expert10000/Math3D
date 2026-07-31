import type { CSSProperties } from "react";

const legendStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: "1px solid #cbd5e1",
  borderRadius: 999,
  background: "#ffffff",
  color: "#334155",
  padding: "2px 7px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const legendItems = [
  ["Preview", "#38bdf8"],
  ["Selected", "#f97316"],
  ["Applied", "#22c55e"],
  ["Removed", "#ef4444"],
] as const;

export function CommandPreviewLegend({
  testId,
  compact = false,
}: {
  testId?: string;
  compact?: boolean;
}) {
  return (
    <span
      data-testid={testId}
      title="Command preview colors: Preview is cyan/blue, Selected is orange, Applied is green, Removed is red/gray."
      style={{
        ...legendStyle,
        fontSize: compact ? 10 : undefined,
        flexWrap: compact ? "wrap" : undefined,
        whiteSpace: compact ? "normal" : "nowrap",
      }}
    >
      {legendItems.map(([label, color]) => (
        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: color,
              boxShadow: "0 0 0 1px rgba(15, 23, 42, 0.12)",
            }}
          />
          {label}
        </span>
      ))}
    </span>
  );
}
