import { assertScientificProjectResources, createMixedWorkspaceDocument,
  replaceMath3DProjectWorkspace, type Math3DProject } from "@math3d/core";
import { captureProjectResources, projectResourceInventory, type ProjectResourceReader,
  type VerifiedProjectResources } from "./projectResources";

/** Stage source documents in the existing Project; callers commit the verified result atomically. */
export function appendScientificBundleProject(current: Math3DProject,
  incoming: { project: Math3DProject; resources: VerifiedProjectResources }, readCurrent: ProjectResourceReader) {
  const entries = incoming.project.workspace.entries;
  if (!entries.length || entries.some(entry => entry.module !== "vector3d" ||
      entry.checkpoint.format !== "math3d.vector-field3d-document" ||
      entry.checkpoint.source.field.kind !== "scientific-bundle"))
    throw new TypeError("Only verified scientific vector datasets can be added by this importer.");
  const existing = new Set(current.workspace.entries.map(entry => entry.expected.id));
  if (entries.some(entry => existing.has(entry.expected.id)))
    throw new TypeError("An imported dataset identity already exists. Choose the bundle again to create a new copy.");
  // Incoming bytes must never conceal unavailable or damaged existing sources.
  const currentInventory = projectResourceInventory(current);
  assertScientificProjectResources(current, item => {
    const requirement = currentInventory.find(entry => entry.kind === item.kind && entry.id === item.id);
    return requirement ? readCurrent(requirement) : null;
  });
  assertScientificProjectResources(incoming.project, item => incoming.resources.bytes(item));
  const project = replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace, entries: [...current.workspace.entries, ...entries] }));
  const resources = captureProjectResources(project, item =>
    readCurrent(item) ?? incoming.resources.bytes(item));
  assertScientificProjectResources(project, item => resources.bytes(item));
  return { project, resources };
}
