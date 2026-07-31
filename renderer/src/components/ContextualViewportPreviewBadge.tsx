import type { CSSProperties, KeyboardEvent } from "react";
import type { ContextualViewportPreview } from "../selection/contextualViewportPreview";

type ContextualViewportPreviewBadgeProps = {
  readonly testId: string;
  readonly preview: ContextualViewportPreview;
  readonly top: number;
  readonly right?: number;
  readonly zIndex?: number;
  readonly maxWidth?: number;
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
}: {
  readonly top: number;
  readonly right?: number;
  readonly zIndex?: number;
  readonly maxWidth?: number;
  readonly clickable: boolean;
}): CSSProperties => ({
  position: "absolute",
  top,
  right,
  zIndex,
  maxWidth,
  border: "1px solid #99f6e4",
  borderRadius: 8,
  background: "rgba(240,253,250,0.94)",
  color: "#0f766e",
  padding: "6px 9px",
  fontSize: 11,
  fontWeight: 800,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
  pointerEvents: "auto",
  cursor: clickable ? "pointer" : "default",
  userSelect: "none",
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
  top,
  right,
  zIndex,
  maxWidth,
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
      data-overlay-count={preview.overlayCount}
      data-has-overlay={preview.hasOverlay ? "true" : "false"}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? "Click to apply this preview." : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onApply?.();
      }}
      onKeyDown={handleKeyDown}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onMouseDown={(event) => event.stopPropagation()}
      style={previewBadgeStyle({ top, right, zIndex, maxWidth, clickable })}
    >
      <div>Viewport preview: {preview.label}</div>
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
