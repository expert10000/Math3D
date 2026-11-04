import { parseMath3DProject, serializeMath3DProject, structuralHash, upsertMath3DProjectNote } from "@math3d/core";
import { captureProjectResources } from "./projectResources";
import { commitProjectResources, loadProjectResources } from "./projectResourceArchive";
import { parseProjectLibrary, PROJECT_LIBRARY_KEY, PROJECT_STORAGE_KEY, saveLibraryProject } from "./projectLibrary";
import { createProjectSavedMeshComparisonNote } from "./projectSavedMeshComparisonNotes";

/** Persist a Workbook-authored observation through the same exact Project resource transaction as Projects. */
export async function saveSavedMeshComparisonObservation(storage: Storage, projectId: string,
  comparisonId: string, comparisonHash: string, title: string, body: string) {
  const raw = storage.getItem(PROJECT_STORAGE_KEY);
  if (!raw) throw new TypeError("Save a named Project first.");
  const saved = parseMath3DProject(raw);
  if (saved.identity.id !== projectId || !parseProjectLibrary(storage.getItem(PROJECT_LIBRARY_KEY)).entries.some(item => item.id === projectId))
    throw new TypeError("The linked saved Project changed or is unavailable.");
  const pair = saved.savedMeshComparisons?.find(item => item.id === comparisonId);
  if (!pair || structuralHash(pair) !== comparisonHash) throw new TypeError("The pinned comparison changed.");
  const previous = await loadProjectResources(saved);
  const now = Date.now();
  const note = createProjectSavedMeshComparisonNote(saved, pair, item => previous.bytes(item), title, body, now,
    `workbook-mesh-comparison-${pair.id}-${now}`);
  const next = upsertMath3DProjectNote(saved, note);
  const resources = captureProjectResources(next, item => previous.bytes(item), true);
  await commitProjectResources(next, resources, () => saveLibraryProject(storage, next, now, undefined,
    { expectedBytes: serializeMath3DProject(saved) }));
  return { project: next, resources, note };
}
