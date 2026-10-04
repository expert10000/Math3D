import type { Math3DProject } from "@math3d/core";
import { previewProjectImport } from "./projectTransfer";
import { VerifiedProjectResources } from "./projectResources";
import { parseProjectLibrary, PROJECT_LIBRARY_KEY, projectPayloadKey } from "./projectLibrary";

export const SAMSUNG_EXAMPLE_COUNT = 25;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PreparedProjectExample = { project: Math3DProject; resources: VerifiedProjectResources; previewOnly: boolean };
export const prepareProjectExampleCollection = (raw: string): PreparedProjectExample[] => {
  if (new TextEncoder().encode(raw).length > 1024 * 1024) throw new TypeError("Example collection exceeds its size limit.");
  const value = JSON.parse(raw);
  if (value?.format !== "math3d.example-project-collection" || value.schemaVersion !== 1 || !Array.isArray(value.projects) || !value.projects.length || value.projects.length > 64)
    throw new TypeError("Unsupported example collection.");
  const ids = new Set<string>();
  // Validate every document, replay and provided sidecar before the first write.
  return value.projects.map((item: unknown) => {
    const prepared = previewProjectImport(JSON.stringify(item));
    if (ids.has(prepared.project.identity.id)) throw new TypeError("Duplicate project identity in example collection.");
    ids.add(prepared.project.identity.id);
    return { project: prepared.project, resources: prepared.resources ?? new VerifiedProjectResources(prepared.project), previewOnly: !prepared.canOpenWorkspace };
  });
};

export type ExampleImportProgress = { imported: number; kept: number; remaining: number; previewOnly: number; error?: string };
/** Each project commits with its resources; partial failure can be retried without replacing earlier work. */
export const importProjectExamples = async (store: Store, examples: readonly PreparedProjectExample[], commit: (example: PreparedProjectExample) => Promise<unknown>, onProgress?: (progress: ExampleImportProgress) => void): Promise<ExampleImportProgress> => {
  const library = parseProjectLibrary(store.getItem(PROJECT_LIBRARY_KEY));
  const newCount = examples.filter(example => store.getItem(projectPayloadKey(example.project.identity.id)) === null && !library.entries.some(entry => entry.id === example.project.identity.id)).length;
  if (library.entries.length + newCount > 64) throw new TypeError(`The library has room for ${64 - library.entries.length} more projects; this collection needs ${newCount}. No projects were imported.`);
  const progress: ExampleImportProgress = { imported: 0, kept: 0, remaining: examples.length, previewOnly: 0 };
  for (const example of examples) {
    // Recheck on each asynchronous boundary, retaining even edited or unindexed payloads.
    const current = parseProjectLibrary(store.getItem(PROJECT_LIBRARY_KEY));
    if (store.getItem(projectPayloadKey(example.project.identity.id)) !== null || current.entries.some(entry => entry.id === example.project.identity.id)) progress.kept++;
    else {
      try { await commit(example); progress.imported++; if (example.previewOnly) progress.previewOnly++; }
      catch (failure) { return { ...progress, error: `${example.project.metadata.title}: ${(failure as Error).message}` }; }
    }
    progress.remaining--; onProgress?.({ ...progress });
  }
  return progress;
};
