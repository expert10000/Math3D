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
  highVisibility = false,
}: {
  testId?: string;
  compact?: boolean;
  highVisibility?: boolean;
}) {
  return (
    <span
      data-testid={testId}
      data-high-visibility={highVisibility ? "true" : "false"}
      title={`Command preview colors: Preview is cyan/blue, Selected is orange, Applied is green, Removed is red/gray. High visibility is ${
        highVisibility ? "on" : "off"
      }.`}
      style={{
        ...legendStyle,
        fontSize: compact ? 10 : undefined,
        flexWrap: compact ? "wrap" : undefined,
        whiteSpace: compact ? "normal" : "nowrap",
        borderColor: highVisibility ? "#0f172a" : legendStyle.borderColor,
        boxShadow: highVisibility ? "0 0 0 2px rgba(14, 165, 233, 0.22)" : undefined,
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
              boxShadow: highVisibility
                ? "0 0 0 2px #ffffff, 0 0 0 3px #0f172a"
                : "0 0 0 1px rgba(15, 23, 42, 0.12)",
            }}
          />
          {label}
        </span>
      ))}
      <span
        data-testid={testId ? `${testId}-high-visibility-state` : undefined}
        style={{
          borderLeft: "1px solid #cbd5e1",
          color: highVisibility ? "#0f172a" : "#475569",
          paddingLeft: 5,
        }}
      >
        High visibility: {highVisibility ? "on" : "off"}
      </span>
    </span>
  );
}
