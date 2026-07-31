import type {
  OverlayLabelSet,
  OverlayMeshGroup,
  OverlayPointSet,
  OverlayPolylineGroup,
} from "../components/SurfaceViewer";

export type ContextualViewportPreviewWorkspace = "Mesh" | "Geometry";

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
