import type { Math3DProject } from "@math3d/core";
import { inspectProjectCompatibility, type ProjectCompatibilityOptions } from "./projectTransfer";
import { parsePortableResearchNarrative } from "../workbook/researchNarrative";

/** Verified evidence and an ordinary resource-backed Project preview share the same package bytes. */
export function previewResearchNarrativeImport(raw: string, options: ProjectCompatibilityOptions = {}) {
  const { narrative, project, resources } = parsePortableResearchNarrative(raw);
  return { narrative, preview: { ...inspectProjectCompatibility(project, { ...options, resources }),
    resources, inputKind: "Verified research narrative" } };
}

/** Narrative imports are additional saved Projects, never updates to an existing identity. */
export function assertIndependentNarrativeImport(project: Math3DProject,
  savedProjectIds: readonly string[], activeProjectId?: string | null) {
  if (savedProjectIds.includes(project.identity.id) || activeProjectId === project.identity.id)
    throw new Error("This narrative's Project ID already exists here. Existing work was kept; import an independently created Project copy.");
}
