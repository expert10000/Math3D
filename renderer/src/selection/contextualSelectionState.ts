import type { ActiveSelectionType } from "../components/ActiveSelectionCard";
import {
  OBJECT_CONTEXT_COPY,
  type ContextualEntityMode,
  type ContextualSelectionWorkspace,
  formatContextEntityId,
  formatContextEntityLabel,
  formatContextEntityPreview,
  getContextEntityActions,
  getContextEntityEmptyState,
} from "./contextualSelectionModel";

export type ContextualSelectionPickMode = "object" | ContextualEntityMode;

export type ContextualEntitySelectionInput = {
  id: string | number;
  valid: boolean;
  primaryReady?: boolean;
  labelSuffix?: string;
  previewResult?: string | null;
};

export type ContextualSelectionStateInput = {
  workspace: ContextualSelectionWorkspace;
  pickMode: ContextualSelectionPickMode;
  objectLabel?: string | null;
  objectReady?: boolean;
  objectEmptyState?: string;
  selectionCleared?: boolean;
  entities?: Partial<Record<ContextualEntityMode, ContextualEntitySelectionInput>>;
};

export type ContextualSelectionState = {
  selectionLabel: string;
  activeCardType: ActiveSelectionType;
  cardId: string;
  emptyState: string | null;
  actions: readonly string[];
  previewLabel: string | null;
  canRunPrimaryAction: boolean;
};

function activeCardTypeFromPickMode(pickMode: ContextualSelectionPickMode): ActiveSelectionType {
  if (pickMode === "object") return "Object";
  if (pickMode === "face") return "Face";
  if (pickMode === "edge") return "Edge";
  return "Vertex";
}

export function buildContextualSelectionState({
  workspace,
  pickMode,
  objectLabel,
  objectReady,
  objectEmptyState = "Load an object to enable actions",
  selectionCleared = false,
  entities = {},
}: ContextualSelectionStateInput): ContextualSelectionState {
  if (pickMode === "object") {
    const ready = Boolean(objectReady && objectLabel);
    const objectCopy = OBJECT_CONTEXT_COPY[workspace];
    return {
      selectionLabel: ready ? `${objectCopy.selectedPrefix}: ${objectLabel}` : objectCopy.selectEmpty,
      activeCardType: "Object",
      cardId: ready ? objectLabel ?? "none" : "none",
      emptyState: ready ? null : objectEmptyState,
      actions: objectCopy.actions,
      previewLabel: ready ? objectCopy.preview : null,
      canRunPrimaryAction: ready,
    };
  }

  const entity = entities[pickMode];
  const ready = Boolean(entity && entity.valid && !selectionCleared);
  const emptyState = getContextEntityEmptyState(workspace, pickMode);
  return {
    selectionLabel: ready ? `${formatContextEntityLabel(pickMode, entity.id)}${entity.labelSuffix ?? ""}` : emptyState,
    activeCardType: activeCardTypeFromPickMode(pickMode),
    cardId: ready ? formatContextEntityId(pickMode, entity.id) : "none",
    emptyState: ready ? null : emptyState,
    actions: getContextEntityActions(workspace, pickMode),
    previewLabel:
      ready && entity.previewResult ? formatContextEntityPreview(pickMode, entity.id, entity.previewResult) : null,
    canRunPrimaryAction: ready && (entity.primaryReady ?? true),
  };
}
