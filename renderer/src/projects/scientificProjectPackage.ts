import { captureScientificFieldBytes, type Math3DProject } from "@math3d/core";
import { captureProjectResourcesAsync, projectResourceInventory, type ProjectResourceReader } from "./projectResources";
import { loadVerifiedVectorFieldTransfer } from "../vectorfield3d/loadVerifiedVectorFieldTransfer";

/** The existing inventory supplies ownership and deduplication for all four source resources. */
export async function capturePortableProjectResources(project: Math3DProject, read: ProjectResourceReader) {
  const inventory = projectResourceInventory(project), captured = new Map<string, Uint8Array>();
  const key = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`;
  const bytes = (item: { kind: string; id: string }) => {
    const requirement = inventory.find(candidate => key(candidate) === key(item));
    return captured.get(key(item)) ?? (requirement ? read(requirement) : null);
  };
  for (const entry of project.workspace.entries) {
    const source = entry.checkpoint;
    if (source.format !== "math3d.vector-field3d-document" || source.source.field.kind !== "scientific-bundle") continue;
    const transfer = await loadVerifiedVectorFieldTransfer(source, undefined, { project, resources: bytes });
    for (const resource of captureScientificFieldBytes(source, transfer)) captured.set(key(resource), resource.bytes);
  }
  return captureProjectResourcesAsync(project, item => bytes(item));
}
