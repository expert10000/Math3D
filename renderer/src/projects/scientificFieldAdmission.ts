import type { Math3DProject, ScientificProjectResourceReader } from "@math3d/core";
import { loadVerifiedVectorFieldTransfer } from "../vectorfield3d/loadVerifiedVectorFieldTransfer";

export class ProjectScientificFieldUnavailableError extends TypeError {
  constructor(title: string, cause: unknown) {
    super(`Project scientific field unavailable: ${title}. ${String((cause as Error).message ?? cause)}`);
    this.name = "ProjectScientificFieldUnavailableError";
  }
}

/** Verify packaged or legacy external sources before activation, leaving the current Project intact on failure. */
export async function verifyProjectVectorFieldSources(project: Math3DProject,
  verifier?: Window["scientificScenes"], resources?: ScientificProjectResourceReader) {
  for (const entry of project.workspace.entries) {
    const source = entry.checkpoint;
    if (source.format !== "math3d.vector-field3d-document" || source.source.field.kind !== "scientific-bundle") continue;
    try { await loadVerifiedVectorFieldTransfer(source, verifier, { project, resources }); }
    catch (cause) { throw new ProjectScientificFieldUnavailableError(source.metadata.title, cause); }
  }
}
