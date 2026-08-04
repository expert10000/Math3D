export type AdaptiveTopologyGizmoWorkspace = "Mesh" | "Geometry";
export type AdaptiveTopologyGizmoSelectionType = "Object" | "Face" | "Edge" | "Vertex";

export type AdaptiveTopologyGizmoConfig = {
  readonly workspace: AdaptiveTopologyGizmoWorkspace;
  readonly selectionType: AdaptiveTopologyGizmoSelectionType;
  readonly label: string;
  readonly modeLabel: string;
  readonly handleLabel: string;
  readonly primaryActionLabel: string;
  readonly statusLabel: string;
};

const CONFIGS: Record<
  AdaptiveTopologyGizmoWorkspace,
  Record<AdaptiveTopologyGizmoSelectionType, Omit<AdaptiveTopologyGizmoConfig, "workspace" | "selectionType" | "statusLabel">>
> = {
  Mesh: {
    Object: {
      label: "Object transform",
      modeLabel: "Move / rotate / scale",
      handleLabel: "object axes",
      primaryActionLabel: "Open in Geometry",
    },
    Face: {
      label: "Face normal",
      modeLabel: "Normal / plane",
      handleLabel: "face normal handle",
      primaryActionLabel: "Subdivide",
    },
    Edge: {
      label: "Edge rail",
      modeLabel: "Slide / bevel",
      handleLabel: "edge tangent handle",
      primaryActionLabel: "Split / Bevel",
    },
    Vertex: {
      label: "Vertex point",
      modeLabel: "Move / weld",
      handleLabel: "point handle",
      primaryActionLabel: "Marker",
    },
  },
  Geometry: {
    Object: {
      label: "Object transform",
      modeLabel: "Move / rotate / scale",
      handleLabel: "object axes",
      primaryActionLabel: "Transform",
    },
    Face: {
      label: "Face edit",
      modeLabel: "Extrude / inset",
      handleLabel: "face normal handle",
      primaryActionLabel: "Extrude / Inset",
    },
    Edge: {
      label: "Edge edit",
      modeLabel: "Split / mirror / offset",
      handleLabel: "edge tangent handle",
      primaryActionLabel: "Split / Offset",
    },
    Vertex: {
      label: "Vertex edit",
      modeLabel: "Move",
      handleLabel: "point handle",
      primaryActionLabel: "Move",
    },
  },
};

export function getAdaptiveTopologyGizmoConfig(
  workspace: AdaptiveTopologyGizmoWorkspace,
  selectionType: AdaptiveTopologyGizmoSelectionType,
  hasSelection = true
): AdaptiveTopologyGizmoConfig {
  const config = CONFIGS[workspace][selectionType];
  const statusLabel = hasSelection
    ? `${config.label}: ${config.modeLabel} (${config.handleLabel})`
    : `${config.label}: waiting for selection`;
  return {
    workspace,
    selectionType,
    ...config,
    statusLabel,
  };
}
