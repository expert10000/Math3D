import type { CSSProperties } from "react";
import { CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES } from "../selection/contextualViewportPreview";

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
  ["Preview", CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.preview.color],
  ["Selected", CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.selected.color],
  ["Applied", CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.applied.color],
  ["Removed", CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES.removed.color],
] as const;

const colorToCss = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

export function CommandPreviewLegend({
  testId,
  compact = false,
  highVisibility = false,
}: {
  testId?: string;
  compact?: boolean;
  highVisibility?: boolean;
}) {
  if (compact) {
    return (
      <details
        data-testid={testId}
        data-high-visibility={highVisibility ? "true" : "false"}
        title={`Command preview colors: Preview is cyan/blue, Selected is orange, Applied is green, Removed is red/gray. High visibility is ${
          highVisibility ? "on" : "off"
        }.`}
        style={{
          ...legendStyle,
          position: "relative",
          padding: "1px 7px",
          fontSize: 10,
          borderColor: highVisibility ? "#0f172a" : legendStyle.borderColor,
          boxShadow: highVisibility ? "0 0 0 2px rgba(14, 165, 233, 0.22)" : undefined,
        }}
      >
        <summary style={{ cursor: "pointer", listStyle: "none" }}>Preview</summary>
        <span
          style={{
            position: "absolute",
            top: "calc(100% + 5px)",
            left: 0,
            zIndex: 90,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            background: "#ffffff",
            boxShadow: "0 8px 18px rgba(15, 23, 42, 0.14)",
            padding: "5px 7px",
            whiteSpace: "nowrap",
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
                  background: colorToCss(color),
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
      </details>
    );
  }

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
              background: colorToCss(color),
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
