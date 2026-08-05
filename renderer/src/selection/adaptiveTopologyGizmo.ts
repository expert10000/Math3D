export type AdaptiveTopologyGizmoWorkspace = "Mesh" | "Geometry";
export type AdaptiveTopologyGizmoSelectionType = "Object" | "Face" | "Edge" | "Vertex";
export type AdaptiveTopologyGizmoHandleKind = "object-transform" | "normal-axis" | "edge-rail" | "point";
export type AdaptiveTopologyGizmoDragOperation =
  | "Extrude Face"
  | "Inset Face"
  | "Face Subdivide"
  | "Split Edge"
  | "Bevel Edge"
  | "Move Vertex";

export type AdaptiveTopologyGizmoConfig = {
  readonly workspace: AdaptiveTopologyGizmoWorkspace;
  readonly selectionType: AdaptiveTopologyGizmoSelectionType;
  readonly label: string;
  readonly modeLabel: string;
  readonly handleLabel: string;
  readonly handleKind: AdaptiveTopologyGizmoHandleKind;
  readonly primaryActionLabel: string;
  readonly statusLabel: string;
};

export type AdaptiveTopologyGizmoDragInput = {
  readonly workspace: AdaptiveTopologyGizmoWorkspace;
  readonly selectionType: AdaptiveTopologyGizmoSelectionType;
  readonly operation?: AdaptiveTopologyGizmoDragOperation | null;
  readonly dragDistance: number;
  readonly referenceLength?: number | null;
  readonly initialRatio?: number | null;
  readonly initialAmount?: number | null;
};

export type AdaptiveTopologyGizmoDragParams =
  | { readonly operation: "Extrude Face"; readonly distance: number; readonly label: string }
  | { readonly operation: "Inset Face"; readonly ratio: number; readonly label: string }
  | { readonly operation: "Face Subdivide"; readonly mode: "center-fan" | "four-triangles"; readonly label: string }
  | { readonly operation: "Split Edge"; readonly ratio: number; readonly label: string }
  | { readonly operation: "Bevel Edge"; readonly amount: number; readonly label: string }
  | {
      readonly operation: "Move Vertex";
      readonly amount: number;
      readonly directionSign: 1 | -1;
      readonly label: string;
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
      handleKind: "object-transform",
      primaryActionLabel: "Open in Geometry",
    },
    Face: {
      label: "Face normal",
      modeLabel: "Extrude / inset",
      handleLabel: "face normal handle",
      handleKind: "normal-axis",
      primaryActionLabel: "Extrude / Inset",
    },
    Edge: {
      label: "Edge rail",
      modeLabel: "Slide / bevel",
      handleLabel: "edge tangent handle",
      handleKind: "edge-rail",
      primaryActionLabel: "Split / Bevel",
    },
    Vertex: {
      label: "Vertex point",
      modeLabel: "Move / weld",
      handleLabel: "point handle",
      handleKind: "point",
      primaryActionLabel: "Move",
    },
  },
  Geometry: {
    Object: {
      label: "Object transform",
      modeLabel: "Move / rotate / scale",
      handleLabel: "object axes",
      handleKind: "object-transform",
      primaryActionLabel: "Transform",
    },
    Face: {
      label: "Face edit",
      modeLabel: "Extrude / inset",
      handleLabel: "face normal handle",
      handleKind: "normal-axis",
      primaryActionLabel: "Extrude / Inset",
    },
    Edge: {
      label: "Edge edit",
      modeLabel: "Split / mirror / offset",
      handleLabel: "edge tangent handle",
      handleKind: "edge-rail",
      primaryActionLabel: "Split / Offset",
    },
    Vertex: {
      label: "Vertex edit",
      modeLabel: "Move",
      handleLabel: "point handle",
      handleKind: "point",
      primaryActionLabel: "Move",
    },
  },
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(4).replace(/\.?0+$/, "");
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

export function mapTopologyGizmoDragToParams(input: AdaptiveTopologyGizmoDragInput): AdaptiveTopologyGizmoDragParams | null {
  const dragDistance = Number.isFinite(input.dragDistance) ? input.dragDistance : 0;
  const referenceLength = Math.max(0.001, Number.isFinite(input.referenceLength ?? NaN) ? Number(input.referenceLength) : 1);
  if (input.selectionType === "Face") {
    const requested = input.operation;
    if (requested === "Face Subdivide") {
      const mode = dragDistance < 0 ? "four-triangles" : "center-fan";
      return { operation: "Face Subdivide", mode, label: `mode=${mode}` };
    }
    if (requested === "Inset Face" || dragDistance < 0) {
      const baseRatio = Number.isFinite(input.initialRatio ?? NaN) ? Number(input.initialRatio) : 0.2;
      const ratio = clamp(baseRatio + Math.abs(dragDistance) / referenceLength, 0.02, 0.92);
      return { operation: "Inset Face", ratio, label: `ratio=${formatNumber(ratio)}` };
    }
    const baseDistance = Number.isFinite(input.initialAmount ?? NaN) ? Math.abs(Number(input.initialAmount)) : 0;
    const distance = Math.max(0.001, baseDistance + Math.max(0, dragDistance));
    return { operation: "Extrude Face", distance, label: `distance=${formatNumber(distance)}` };
  }
  if (input.selectionType === "Edge") {
    if (input.operation === "Bevel Edge") {
      const amount = Math.max(
        0.001,
        Number.isFinite(input.initialAmount ?? NaN) ? Number(input.initialAmount) + Math.abs(dragDistance) : Math.abs(dragDistance)
      );
      return { operation: "Bevel Edge", amount, label: `amount=${formatNumber(amount)}` };
    }
    const initialRatio = Number.isFinite(input.initialRatio ?? NaN) ? Number(input.initialRatio) : 0.5;
    const ratio = clamp(initialRatio + dragDistance / referenceLength, 0.01, 0.99);
    return { operation: "Split Edge", ratio, label: `ratio=${formatNumber(ratio)}` };
  }
  if (input.selectionType === "Vertex") {
    const amount = Math.max(0.001, Math.abs(dragDistance));
    const directionSign: 1 | -1 = dragDistance < 0 ? -1 : 1;
    return { operation: "Move Vertex", amount, directionSign, label: `amount=${formatNumber(amount)}` };
  }
  return null;
}
