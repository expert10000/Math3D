import {
  ENTITY_CONTEXT_COPY,
  getContextEntityDisabledReason,
  type ContextualEntityMode,
  type ContextualSelectionWorkspace,
} from "./contextualSelectionModel";

export type ContextualOperationKey =
  | "subdivide-face"
  | "split-edge"
  | "collapse-edge"
  | "bevel-edge"
  | "vertex-marker"
  | "extrude-face"
  | "inset-face"
  | "delete-face"
  | "mirror-edge"
  | "offset-edge"
  | "move-vertex";

export type ContextualActionDescriptor = {
  readonly label: string;
  readonly testIdSuffix: string;
  readonly disabledReason: string;
  readonly pulseId: string;
  readonly operationKey: ContextualOperationKey;
};

type ContextualActionDescriptorSpec = Omit<ContextualActionDescriptor, "label" | "disabledReason">;

const CONTEXTUAL_ACTION_DESCRIPTOR_SPECS = {
  mesh: {
    face: [
      {
        operationKey: "subdivide-face",
        testIdSuffix: "subdivide-face",
        pulseId: "mesh:face-subdivide",
      },
    ],
    edge: [
      {
        operationKey: "split-edge",
        testIdSuffix: "split-edge",
        pulseId: "mesh:edge-split",
      },
      {
        operationKey: "collapse-edge",
        testIdSuffix: "collapse-edge",
        pulseId: "mesh:edge-collapse",
      },
      {
        operationKey: "bevel-edge",
        testIdSuffix: "bevel-edge",
        pulseId: "mesh:edge-bevel",
      },
    ],
    vertex: [
      {
        operationKey: "vertex-marker",
        testIdSuffix: "vertex-marker",
        pulseId: "mesh:vertex-marker",
      },
    ],
  },
  geometry: {
    face: [
      {
        operationKey: "extrude-face",
        testIdSuffix: "extrude-face",
        pulseId: "geometry:face-extrude",
      },
      {
        operationKey: "inset-face",
        testIdSuffix: "inset-face",
        pulseId: "geometry:face-inset",
      },
      {
        operationKey: "delete-face",
        testIdSuffix: "delete-face",
        pulseId: "geometry:face-delete",
      },
    ],
    edge: [
      {
        operationKey: "split-edge",
        testIdSuffix: "split-edge",
        pulseId: "geometry:edge-split",
      },
      {
        operationKey: "mirror-edge",
        testIdSuffix: "mirror-edge",
        pulseId: "geometry:mirror-copy",
      },
      {
        operationKey: "offset-edge",
        testIdSuffix: "offset-edge",
        pulseId: "geometry:offset",
      },
    ],
    vertex: [
      {
        operationKey: "vertex-marker",
        testIdSuffix: "vertex-marker",
        pulseId: "geometry:vertex-marker",
      },
      {
        operationKey: "move-vertex",
        testIdSuffix: "move-vertex",
        pulseId: "geometry:vertex-move",
      },
    ],
  },
} as const satisfies Record<
  ContextualSelectionWorkspace,
  Record<ContextualEntityMode, readonly ContextualActionDescriptorSpec[]>
>;

export function getContextualActionDescriptors(
  workspace: ContextualSelectionWorkspace,
  mode: ContextualEntityMode
): readonly ContextualActionDescriptor[] {
  const labels = ENTITY_CONTEXT_COPY[workspace][mode].actions;
  return CONTEXTUAL_ACTION_DESCRIPTOR_SPECS[workspace][mode].map((spec, index) => {
    const label = labels[index] ?? spec.operationKey;
    return {
      ...spec,
      label,
      disabledReason: getContextEntityDisabledReason(workspace, mode, label),
    };
  });
}

export function contextualActionTestId(prefix: string, descriptor: ContextualActionDescriptor): string {
  return `${prefix}-${descriptor.testIdSuffix}`;
}
