import type {
  OverlayLabelSet,
  OverlayMeshGroup,
  OverlayPointSet,
  OverlayPolylineGroup,
} from "../components/SurfaceViewer";

export type ContextualViewportPreviewWorkspace = "Mesh" | "Geometry";
export type ContextualViewportPreviewPhase = "preview" | "applied";
export type ContextualViewportPreviewRole = "preview" | "selected" | "applied" | "removed" | "removedFaded" | "label";

export const CONTEXTUAL_VIEWPORT_PREVIEW_TIMING = {
  appliedDurationMs: 1800,
  actionPulseMs: 1400,
} as const;

export const CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES = {
  preview: {
    color: 0x38bdf8,
    darkColor: 0x0369a1,
    fillColor: 0xe0f2fe,
    opacity: 0.78,
  },
  selected: {
    color: 0xf97316,
    darkColor: 0xc2410c,
    fillColor: 0xfff7ed,
    opacity: 0.96,
  },
  applied: {
    color: 0x22c55e,
    darkColor: 0x166534,
    fillColor: 0xdcfce7,
    opacity: 0.96,
  },
  removed: {
    color: 0xef4444,
    darkColor: 0xb91c1c,
    fillColor: 0xfee2e2,
    opacity: 0.82,
  },
  removedFaded: {
    color: 0x64748b,
    darkColor: 0x334155,
    fillColor: 0xe2e8f0,
    opacity: 0.34,
  },
  label: {
    color: 0x0f172a,
    darkColor: 0x0f172a,
    fillColor: 0xffffff,
    opacity: 0.98,
  },
} as const;

export type ContextualViewportPreviewOperation =
  | "Subdivide"
  | "Split"
  | "Collapse"
  | "Bevel"
  | "Extrude"
  | "Inset"
  | "Delete"
  | "Move"
  | "Promote";

export type ContextualViewportPreviewOverlays = {
  readonly meshGroups?: readonly OverlayMeshGroup[] | null;
  readonly pointSets?: readonly OverlayPointSet[] | null;
  readonly polylineGroups?: readonly OverlayPolylineGroup[] | null;
  readonly labelSets?: readonly OverlayLabelSet[] | null;
};

export type ContextualViewportPreviewDetail = {
  readonly label: string;
  readonly value: string;
};

export type ContextualViewportPreview = {
  readonly workspace: ContextualViewportPreviewWorkspace;
  readonly operation: ContextualViewportPreviewOperation;
  readonly selectedEntity: string;
  readonly label: string;
  readonly overlays: ContextualViewportPreviewOverlays;
  readonly actionPulseId?: string | null;
  readonly details: readonly ContextualViewportPreviewDetail[];
  readonly overlayCount: number;
  readonly hasOverlay: boolean;
};

export const contextualViewportPreviewRoleColor = (
  role: ContextualViewportPreviewRole,
  tone: "color" | "darkColor" | "fillColor" = "color"
): number => CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES[role][tone];

export const contextualViewportPreviewRoleOpacity = (role: ContextualViewportPreviewRole): number =>
  CONTEXTUAL_VIEWPORT_PREVIEW_ROLE_STYLES[role].opacity;

export function countContextualViewportPreviewOverlays(overlays: ContextualViewportPreviewOverlays): number {
  const meshCount = overlays.meshGroups?.length ?? 0;
  const pointCount = overlays.pointSets?.reduce((sum, set) => sum + (set.points?.length ?? 0), 0) ?? 0;
  const lineCount = overlays.polylineGroups?.reduce((sum, group) => sum + (group.lines?.length ?? 0), 0) ?? 0;
  const labelCount = overlays.labelSets?.reduce((sum, set) => sum + (set.labels?.length ?? 0), 0) ?? 0;
  return meshCount + pointCount + lineCount + labelCount;
}

export function buildContextualViewportPreview({
  workspace,
  operation,
  selectedEntity,
  label,
  overlays,
  actionPulseId,
  details = [],
}: {
  readonly workspace: ContextualViewportPreviewWorkspace;
  readonly operation: ContextualViewportPreviewOperation;
  readonly selectedEntity: string | null | undefined;
  readonly label: string | null | undefined;
  readonly overlays: ContextualViewportPreviewOverlays;
  readonly actionPulseId?: string | null;
  readonly details?: readonly ContextualViewportPreviewDetail[];
}): ContextualViewportPreview | null {
  if (!label || !selectedEntity) return null;
  const overlayCount = countContextualViewportPreviewOverlays(overlays);
  return {
    workspace,
    operation,
    selectedEntity,
    label,
    overlays,
    actionPulseId,
    details,
    overlayCount,
    hasOverlay: overlayCount > 0,
  };
}

export function formatContextualViewportPreviewCounts(
  beforeCounts: { readonly vertexCount: number; readonly faceCount: number },
  afterCounts: { readonly vertexCount: number; readonly faceCount: number }
): string {
  return `V ${beforeCounts.vertexCount} -> ${afterCounts.vertexCount}, F ${beforeCounts.faceCount} -> ${afterCounts.faceCount}`;
}

export function applyContextualViewportPreviewAccessibility(
  preview: ContextualViewportPreview | null,
  highVisibility: boolean
): ContextualViewportPreview | null {
  if (!preview || !highVisibility) return preview;
  const overlays =
    applyContextualViewportPreviewOverlayAccessibility(preview.overlays, highVisibility, preview.label) ?? preview.overlays;
  return {
    ...preview,
    overlays,
    overlayCount: countContextualViewportPreviewOverlays(overlays),
    hasOverlay: countContextualViewportPreviewOverlays(overlays) > 0,
  };
}

export function formatContextualViewportPreviewBadgeLabel({
  phase,
  label,
}: {
  readonly phase: ContextualViewportPreviewPhase;
  readonly label: string;
}): string {
  return phase === "applied" ? `Applied: ${label}` : `Viewport preview: ${label}`;
}

export function applyContextualViewportPreviewOverlayContract(
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
  if (!overlays) return null;
  const phaseStyled =
    phase === "applied"
      ? {
          meshGroups: overlays.meshGroups?.map((group) => ({
            ...group,
            color: contextualViewportPreviewRoleColor("applied"),
            opacity: Math.max(group.opacity ?? 0, 0.38),
          })),
          pointSets: overlays.pointSets?.map((set) => ({
            ...set,
            color: contextualViewportPreviewRoleColor("applied"),
            opacity: Math.max(set.opacity ?? 0, contextualViewportPreviewRoleOpacity("applied")),
          })),
          polylineGroups: overlays.polylineGroups?.map((group) => ({
            ...group,
            color: contextualViewportPreviewRoleColor("applied"),
            opacity: Math.max(group.opacity ?? 0, contextualViewportPreviewRoleOpacity("applied")),
          })),
          labelSets: overlays.labelSets?.map((set) => ({
            ...set,
            labels: set.labels.map((label) => ({
              ...label,
              text: label.text.match(/^Applied\b/i) ? label.text : `Applied: ${label.text.replace(/^Preview\s*:?\s*/i, "")}`,
              color: contextualViewportPreviewRoleColor("applied", "darkColor"),
              opacity: Math.max(label.opacity ?? 0, contextualViewportPreviewRoleOpacity("applied")),
            })),
          })),
        }
      : overlays;
  return applyContextualViewportPreviewOverlayAccessibility(phaseStyled, highVisibility, fallbackLabel);
}

export function applyContextualViewportPreviewOverlayAccessibility(
  overlays: ContextualViewportPreviewOverlays | null | undefined,
  highVisibility: boolean,
  fallbackLabel = "command preview"
): ContextualViewportPreviewOverlays | null {
  if (!overlays) return null;
  if (!highVisibility) return overlays;
  const labelSets = overlays.labelSets?.length
    ? overlays.labelSets.map((set) => ({
        ...set,
        size: Math.max(set.size ?? 0.76, 0.92),
        labels: set.labels.map((label) => ({
          ...label,
          text: label.text.match(/^(Preview|Selected|Applied|Removed)\b/i)
            ? label.text
            : `Preview: ${label.text}`,
          color: label.color ?? 0x0f172a,
          opacity: Math.max(label.opacity ?? 0.96, 0.98),
          size: Math.max(label.size ?? set.size ?? 0.76, 0.92),
        })),
      }))
    : [
        {
          size: 0.92,
          labels: [
            {
              text: `Preview: ${fallbackLabel}`,
              position: { x: 0, y: 0, z: 0 },
              color: 0x0369a1,
              opacity: 0.98,
            },
          ],
        },
      ];
  return {
    meshGroups: overlays.meshGroups?.map((group) => ({
      ...group,
      opacity: Math.max(group.opacity ?? 0.3, 0.42),
    })),
    pointSets: overlays.pointSets?.map((set) => ({
      ...set,
      size: Math.max(set.size ?? 0.14, 0.24),
      opacity: Math.max(set.opacity ?? 0.8, 0.96),
    })),
    polylineGroups: overlays.polylineGroups?.map((group) => ({
      ...group,
      opacity: Math.max(group.opacity ?? 0.8, 0.98),
      radiusScale: group.radiusWorld == null ? Math.max(group.radiusScale ?? 1.5, 2.35) : group.radiusScale,
      radiusWorld: group.radiusWorld == null ? group.radiusWorld : Math.max(group.radiusWorld, 0.028),
    })),
    labelSets,
  };
}
