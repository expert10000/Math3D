import type { Math3DProject, ScientificProjectResourceReader } from "@math3d/core";
import { loadVerifiedVectorFieldTransfer } from "../vectorfield3d/loadVerifiedVectorFieldTransfer";

/** Verify packaged or legacy external sources before activation, leaving the current Project intact on failure. */
export async function verifyProjectVectorFieldSources(project: Math3DProject,
  verifier?: Window["scientificScenes"], resources?: ScientificProjectResourceReader) {
  for (const entry of project.workspace.entries) {
    const source = entry.checkpoint;
    if (source.format !== "math3d.vector-field3d-document" || source.source.field.kind !== "scientific-bundle") continue;
    try { await loadVerifiedVectorFieldTransfer(source, verifier, { project, resources }); }
    catch (cause) { throw new TypeError(`Project scientific field unavailable: ${source.metadata.title}. ${(cause as Error).message}`); }
  }
}
