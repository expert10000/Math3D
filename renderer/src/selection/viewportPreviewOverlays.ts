import type {
  OverlayLabel,
  OverlayLabelSet,
  OverlayMeshGroup,
  OverlayPointSet,
  OverlayPolylineGroup,
} from "../components/SurfaceViewer";
import {
  applyContextualViewportPreviewOverlayContract,
  contextualViewportPreviewRoleColor,
  contextualViewportPreviewRoleOpacity,
  type ContextualViewportPreviewOverlays,
  type ContextualViewportPreviewPhase,
  type ContextualViewportPreviewRole,
} from "./contextualViewportPreview";

export type ViewportPreviewPoint = { x: number; y: number; z: number };

export const viewportPreviewRoleColor = contextualViewportPreviewRoleColor;
export const viewportPreviewRoleOpacity = contextualViewportPreviewRoleOpacity;

export function offsetViewportPreviewLabelPosition(
  point: ViewportPreviewPoint,
  offset: Partial<ViewportPreviewPoint> = { y: 0.034 }
): ViewportPreviewPoint {
  return {
    x: point.x + (offset.x ?? 0),
    y: point.y + (offset.y ?? 0),
    z: point.z + (offset.z ?? 0),
  };
}

export function makeViewportPreviewMeshGroup({
  positions,
  indices = null,
  role = "preview",
  opacity = 0.3,
  doubleSided = true,
}: {
  readonly positions: ArrayLike<number>;
  readonly indices?: ArrayLike<number> | null;
  readonly role?: ContextualViewportPreviewRole;
  readonly opacity?: number;
  readonly doubleSided?: boolean;
}): OverlayMeshGroup {
  return {
    positions,
    indices,
    color: viewportPreviewRoleColor(role),
    opacity,
    doubleSided,
  };
}

export function makeViewportPreviewPointSet({
  points,
  role = "preview",
  tone = "color",
  size,
  opacity,
}: {
  readonly points: ViewportPreviewPoint[];
  readonly role?: ContextualViewportPreviewRole;
  readonly tone?: "color" | "darkColor" | "fillColor";
  readonly size?: number;
  readonly opacity?: number;
}): OverlayPointSet {
  return {
    points,
    color: viewportPreviewRoleColor(role, tone),
    size,
    opacity,
  };
}

export function makeViewportPreviewPolylineGroup({
  lines,
  role = "preview",
  tone = "color",
  opacity,
  radiusScale,
  radiusWorld,
}: {
  readonly lines: OverlayPolylineGroup["lines"];
  readonly role?: ContextualViewportPreviewRole;
  readonly tone?: "color" | "darkColor" | "fillColor";
  readonly opacity?: number;
  readonly radiusScale?: number;
  readonly radiusWorld?: number;
}): OverlayPolylineGroup {
  return {
    lines,
    color: viewportPreviewRoleColor(role, tone),
    opacity,
    radiusScale,
    radiusWorld,
  };
}

export function makeViewportPreviewLabel({
  text,
  position,
  role = "preview",
  tone = "darkColor",
  opacity,
  size,
}: {
  readonly text: string;
  readonly position: ViewportPreviewPoint;
  readonly role?: ContextualViewportPreviewRole;
  readonly tone?: "color" | "darkColor" | "fillColor";
  readonly opacity?: number;
  readonly size?: number;
}): OverlayLabel {
  return {
    text,
    position,
    color: viewportPreviewRoleColor(role, tone),
    opacity,
    size,
  };
}

export function makeViewportPreviewLabelSet({
  labels,
  size = 0.76,
  role = "preview",
}: {
  readonly labels: readonly Omit<Parameters<typeof makeViewportPreviewLabel>[0], "role">[];
  readonly size?: number;
  readonly role?: ContextualViewportPreviewRole;
}): OverlayLabelSet {
  return {
    size,
    labels: labels.map((label) => makeViewportPreviewLabel({ ...label, role })),
  };
}

export function normalizeViewportPreviewOverlays(
  overlays: ContextualViewportPreviewOverlays | null | undefined,
  {
    phase = "preview",
    highVisibility = false,
    fallbackLabel = "command preview",
  }: {
    readonly phase?: ContextualViewportPreviewPhase;
    readonly highVisibility?: boolean;
    readonly fallbackLabel?: string;
  } = {}
): ContextualViewportPreviewOverlays | null {
  return applyContextualViewportPreviewOverlayContract(overlays, { phase, highVisibility, fallbackLabel });
}
