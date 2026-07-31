import type { CSSProperties, KeyboardEvent } from "react";
import type { ContextualViewportPreview } from "../selection/contextualViewportPreview";

type ContextualViewportPreviewBadgeProps = {
  readonly testId: string;
  readonly preview: ContextualViewportPreview;
  readonly state?: "preview" | "applied";
  readonly appliedLabel?: string | null;
  readonly top: number;
  readonly right?: number;
  readonly zIndex?: number;
  readonly maxWidth?: number;
  readonly highVisibility?: boolean;
  readonly onApply?: () => void;
  readonly onHoverStart?: () => void;
  readonly onHoverEnd?: () => void;
};

const previewBadgeStyle = ({
  top,
  right = 14,
  zIndex = 17,
  maxWidth = 380,
  clickable,
  state,
  highVisibility,
}: {
  readonly top: number;
  readonly right?: number;
  readonly zIndex?: number;
  readonly maxWidth?: number;
  readonly clickable: boolean;
  readonly state: "preview" | "applied";
  readonly highVisibility: boolean;
}): CSSProperties => ({
  position: "absolute",
  top,
  right,
  zIndex,
  maxWidth,
  border: highVisibility
    ? state === "applied"
      ? "2px solid #15803d"
      : "2px solid #0369a1"
    : state === "applied"
      ? "1px solid #86efac"
      : "1px solid #99f6e4",
  borderRadius: 8,
  background: highVisibility
    ? state === "applied"
      ? "rgba(220,252,231,0.98)"
      : "rgba(224,242,254,0.98)"
    : state === "applied"
      ? "rgba(240,253,244,0.96)"
      : "rgba(240,253,250,0.94)",
  color: highVisibility ? "#0f172a" : state === "applied" ? "#166534" : "#0f766e",
  padding: highVisibility ? "7px 10px" : "6px 9px",
  fontSize: highVisibility ? 12 : 11,
  fontWeight: highVisibility ? 900 : 800,
  boxShadow:
    highVisibility
      ? "0 0 0 3px rgba(255,255,255,0.92), 0 10px 28px rgba(15, 23, 42, 0.26)"
      : state === "applied"
        ? "0 8px 24px rgba(22, 101, 52, 0.18)"
        : "0 8px 24px rgba(15, 23, 42, 0.12)",
  pointerEvents: "auto",
  cursor: clickable ? "pointer" : "default",
  userSelect: "none",
  transition: "opacity 180ms ease, transform 180ms ease, border-color 180ms ease, background 180ms ease",
});

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "2px 8px",
  marginTop: 5,
  fontWeight: 700,
  color: "#115e59",
};

export function ContextualViewportPreviewBadge({
  testId,
  preview,
  state = "preview",
  appliedLabel,
  top,
  right,
  zIndex,
  maxWidth,
  highVisibility = false,
  onApply,
  onHoverStart,
  onHoverEnd,
}: ContextualViewportPreviewBadgeProps) {
  const clickable = Boolean(onApply);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onApply) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onApply();
  };

  return (
    <div
      data-testid={testId}
      data-preview-workspace={preview.workspace}
      data-preview-operation={preview.operation}
      data-preview-entity={preview.selectedEntity}
      data-preview-action-pulse={preview.actionPulseId ?? ""}
      data-preview-state={state}
      data-overlay-count={preview.overlayCount}
      data-has-overlay={preview.hasOverlay ? "true" : "false"}
      data-high-visibility={highVisibility ? "true" : "false"}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={`${clickable ? "Click to apply this preview. " : ""}High visibility is ${
        highVisibility ? "on" : "off"
      }.`}
      onClick={(event) => {
        event.stopPropagation();
        onApply?.();
      }}
      onKeyDown={handleKeyDown}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onMouseDown={(event) => event.stopPropagation()}
      style={previewBadgeStyle({ top, right, zIndex, maxWidth, clickable, state, highVisibility })}
    >
      <div>
        {state === "applied" ? `Applied: ${appliedLabel ?? preview.label}` : `Viewport preview: ${preview.label}`}
      </div>
      {highVisibility && (
        <div
          data-testid={`${testId}-accessibility-labels`}
          style={{
            marginTop: 4,
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            fontSize: 10,
          }}
        >
          {["Preview", "Selected", "Applied", "Removed"].map((label) => (
            <span
              key={label}
              style={{
                border: "1px solid #0f172a",
                borderRadius: 999,
                background: "#ffffff",
                color: "#0f172a",
                padding: "1px 5px",
                fontWeight: 900,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
      <div data-testid={`${testId}-details`} style={detailGridStyle}>
        <span>Operation</span>
        <span>{preview.operation}</span>
        <span>Selected</span>
        <span>{preview.selectedEntity}</span>
        {preview.details.map((detail) => (
          <span key={`${detail.label}:${detail.value}`} style={{ display: "contents" }}>
            <span>{detail.label}</span>
            <span>{detail.value}</span>
          </span>
        ))}
        <span>Overlay</span>
        <span>{preview.overlayCount} item{preview.overlayCount === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}
