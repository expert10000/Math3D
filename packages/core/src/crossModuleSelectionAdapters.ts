import { normalizeAdapterFrame, type AdapterFrame, type AdapterSelectionKind,
  type AdapterSelectionReference } from "./crossModuleAdapterRegistry";
import { isScientificSourceGeneration, matchesScientificSourceGeneration,
  type ScientificSourceGeneration } from "./scientificJobs";
import { normalizeScientificSelection, type ScientificSelection } from "./scientificSelection";
import { normalizeViewerCommittedSelection, type ViewerCommittedSelection } from "./viewerProvenance";
import type { ValidationResult } from "./validation";

/** Bind a saved v1 selection to the workspace's exact current generation before linking. */
export const referenceFromScientificSelection = (
  selection: ScientificSelection,
  currentSource: ScientificSourceGeneration | null,
  frame: AdapterFrame,
  kind: AdapterSelectionKind,
): ValidationResult<AdapterSelectionReference> => {
  const normalized = normalizeScientificSelection(selection);
  if (!normalized.ok) return { ok: false, errors: normalized.errors };
  if (!normalizeAdapterFrame(frame).ok)
    return { ok: false, errors: ["Declared adapter frame is invalid."] };
  if (normalized.value.source?.kind !== "document" || !normalized.value.source.checkpoint)
    return { ok: false, errors: ["Saved selection has no pinned document checkpoint."] };
  if (!currentSource || !isScientificSourceGeneration(currentSource))
    return { ok: false, errors: ["Current source generation is unavailable."] };
  const { documentId, checkpoint } = normalized.value.source;
  if (documentId !== currentSource.documentId || checkpoint.revision !== currentSource.revision ||
      checkpoint.structuralHash !== currentSource.structuralHash)
    return { ok: false, errors: ["Saved selection checkpoint is stale."] };
  const geometryKind = normalized.value.geometry.kind;
  const actualKind: AdapterSelectionKind = geometryKind === "point" ? "point" :
    geometryKind.includes("line") || geometryKind.includes("polyline") ? "path" : "region";
  if (actualKind !== kind) return { ok: false, errors: [`Selection geometry is ${actualKind}, not ${kind}.`] };
  if (frame.kind !== "cartesian" || frame.axes.length !== normalized.value.frame.axes.length ||
      frame.axes.some((axis, index) => axis.name !== normalized.value.frame.axes[index]?.name ||
        axis.unit !== normalized.value.frame.axes[index]?.unit))
    return { ok: false, errors: ["Declared frame axes do not match the saved selection."] };
  return { ok: true, value: { source: { ...currentSource }, resourceSha256: null, kind, frame: structuredClone(frame) } };
};

/** Viewer entity IDs have no coordinate mapping; the caller must declare a frame explicitly. */
export const referenceFromViewerCommittedSelection = (
  selection: ViewerCommittedSelection,
  frame: AdapterFrame,
): ValidationResult<AdapterSelectionReference> => {
  const normalized = normalizeViewerCommittedSelection(selection);
  if (!normalized || !normalized.entityIds.length)
    return { ok: false, errors: ["A committed viewer selection with entity IDs is required."] };
  if (!normalizeAdapterFrame(frame).ok)
    return { ok: false, errors: ["Declared adapter frame is invalid."] };
  if (!isScientificSourceGeneration(normalized.source) || !matchesScientificSourceGeneration(normalized.source, selection.source))
    return { ok: false, errors: ["Viewer source generation is invalid."] };
  return { ok: true, value: { source: { ...normalized.source }, resourceSha256: null,
    kind: "entity", frame: structuredClone(frame) } };
};
