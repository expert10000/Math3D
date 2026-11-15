import type { UnifiedSelection, UnifiedSelectionKind, UnifiedSelectionVec3 } from "./unifiedSelection";

/** The committed selection belongs to a logical scene object, not a workbench. */
export type SceneSelection = {
  readonly objectId: string;
  readonly representationId: string | null;
  readonly kind: UnifiedSelectionKind;
  readonly componentIds: readonly string[];
  readonly worldPoint: UnifiedSelectionVec3 | null;
  readonly normal: UnifiedSelectionVec3 | null;
  readonly sourceWorkspace: "geometry" | "mesh" | "analysis";
};

export type ComponentRemap = {
  readonly oldId: string;
  readonly newIds: readonly string[];
  readonly status: "preserved" | "split" | "merged" | "deleted";
};

export type SelectionTransfer = {
  readonly selection: SceneSelection;
  readonly notice: string | null;
};

export const sceneSelectionFromUnified = (selection: UnifiedSelection | null): SceneSelection | null => {
  if (!selection || selection.lifecycle !== "selected") return null;
  const componentId = selection.selectionType === "face"
    ? selection.faceId == null ? null : `face:${selection.faceId}`
    : selection.selectionType === "edge"
      ? selection.edgeId == null ? null : `edge:${selection.edgeId}`
      : selection.selectionType === "vertex"
        ? selection.vertexId == null ? null : `vertex:${selection.vertexId}`
        : null;
  return {
    objectId: selection.sourceSceneEntityId ?? selection.sceneEntityId ?? selection.objectId,
    representationId: selection.sceneEntityId ?? selection.meshKey ?? null,
    kind: selection.selectionType,
    componentIds: componentId ? [componentId] : [],
    worldPoint: selection.worldPosition ?? null,
    normal: selection.normal ?? null,
    sourceWorkspace: selection.workspace,
  };
};

/** Explicit remaps keep selection stable after topology edits; missing mappings fall back to the object. */
export const transferSceneSelection = (
  source: SceneSelection,
  representationId: string,
  remaps: readonly ComponentRemap[] = []
): SelectionTransfer => {
  if (source.kind === "object") return { selection: { ...source, representationId }, notice: null };
  const byOldId = new Map(remaps.map((remap) => [remap.oldId, remap]));
  const mapped = source.componentIds.flatMap((id) => byOldId.get(id)?.newIds ?? []);
  const unique = [...new Set(mapped)];
  if (!unique.length) {
    return {
      selection: { ...source, representationId, kind: "object", componentIds: [] },
      notice: "The selected component has no verified match in this representation; the object remains selected.",
    };
  }
  return {
    selection: { ...source, representationId, componentIds: unique },
    notice: unique.length > 1 ? `The selected component maps to ${unique.length} components.` : null,
  };
};
