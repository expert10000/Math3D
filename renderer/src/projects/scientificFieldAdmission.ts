import type { Math3DProject } from "@math3d/core";
import { loadVerifiedVectorFieldTransfer } from "../vectorfield3d/loadVerifiedVectorFieldTransfer";

/** External scientific resources are references, not embedded Project package payloads.
 * Verify before activation so a failed reopen leaves the current Project intact. */
export async function verifyProjectVectorFieldSources(project: Math3DProject,
  verifier?: Window["scientificScenes"]) {
  for (const entry of project.workspace.entries) {
    const source = entry.checkpoint;
    if (source.format !== "math3d.vector-field3d-document" || source.source.field.kind !== "scientific-bundle") continue;
    try { await loadVerifiedVectorFieldTransfer(source, verifier); }
    catch (cause) { throw new TypeError(`Project scientific field unavailable: ${source.metadata.title}. ${(cause as Error).message}`); }
  }
}
