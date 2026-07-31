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

export type ContextualViewportPreview = {
  readonly workspace: ContextualViewportPreviewWorkspace;
  readonly operation: ContextualViewportPreviewOperation;
  readonly selectedEntity: string;
  readonly label: string;
  readonly overlays: ContextualViewportPreviewOverlays;
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
}: {
  readonly workspace: ContextualViewportPreviewWorkspace;
  readonly operation: ContextualViewportPreviewOperation;
  readonly selectedEntity: string | null | undefined;
  readonly label: string | null | undefined;
  readonly overlays: ContextualViewportPreviewOverlays;
}): ContextualViewportPreview | null {
  if (!label || !selectedEntity) return null;
  const overlayCount = countContextualViewportPreviewOverlays(overlays);
  return {
    workspace,
    operation,
    selectedEntity,
    label,
    overlays,
    overlayCount,
    hasOverlay: overlayCount > 0,
  };
}
