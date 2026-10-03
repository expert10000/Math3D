import { canonicalJsonStringify, parseMath3DProject, serializeMath3DProject, sha256Checksum,
  VerifiedProjectResources as SharedVerifiedProjectResources, projectResourceInventory as sharedInventory,
  encodeProjectResourceBytes, verifyProjectResourceBytes, MAX_PROJECT_RESOURCE_BYTES, MAX_PROJECT_PACKAGE_BYTES,
  type Math3DProject, type MeshResourceReference, type ProjectResourceRequirement, type ProjectResourceSidecar } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { MeshResourceStore } from "../mesh/meshResourceStore";
import { volumePayloadRequired } from "./nativeVolumeRestore";
export { encodeProjectResourceBytes, verifyProjectResourceBytes, MAX_PROJECT_RESOURCE_BYTES, MAX_PROJECT_PACKAGE_BYTES };
export type { ProjectResourceKind, ProjectResourceRequirement, ProjectResourceSidecar } from "@math3d/core";
const context = { resolveWorkspace: verifyMixedWorkspaceReplay, volumePayloadRequired };
export const projectResourceInventory = (project: Math3DProject) => sharedInventory(project, context);
export class VerifiedProjectResources extends SharedVerifiedProjectResources {
  constructor(project: Math3DProject, sidecars: readonly ProjectResourceSidecar[] = []) { super(project, sidecars, context); }
  meshStore(project: Math3DProject): MeshResourceStore {
    const store = new MeshResourceStore();
    for (const item of projectResourceInventory(project).filter(item => item.kind === "mesh-buffers")) {
      const bytes = this.bytes(item); if (!bytes) throw new TypeError(`Missing Mesh source resource '${item.id}'.`);
      store.import(item.reference as MeshResourceReference, bytes);
    }
    return store;
  }
}
export type ProjectResourceReader = (item: ProjectResourceRequirement) => Uint8Array | null;
export const captureProjectResources = (project: Math3DProject, reader: ProjectResourceReader, allowMissing = false): VerifiedProjectResources => {
  const sidecars: ProjectResourceSidecar[] = [];
  for (const item of projectResourceInventory(project)) {
    const bytes = reader(item);
    if (!bytes) { if (item.required && !allowMissing) throw new TypeError(`Missing source resource '${item.id}'.`); continue; }
    verifyProjectResourceBytes(item, bytes);
    sidecars.push({ id: item.id, kind: item.kind, checksum: sha256Checksum(bytes), byteLength: bytes.length, encoding: item.encoding, shape: item.shape, owners: item.owners, data: encodeProjectResourceBytes(bytes) });
  }
  return new VerifiedProjectResources(project, sidecars);
};
export const exportProjectPackage = (project: Math3DProject, resources: VerifiedProjectResources): string => {
  const checked = parseMath3DProject(serializeMath3DProject(project));
  const sidecars = new VerifiedProjectResources(checked, resources.sidecars()).sidecars();
  const raw = JSON.stringify({ format: "math3d.project-package", schemaVersion: 1, project: checked, resources: sidecars });
  if (new TextEncoder().encode(raw).length > MAX_PROJECT_PACKAGE_BYTES) throw new TypeError("Project package exceeds its size limit.");
  return raw;
};
export const parseProjectPackage = (raw: string) => {
  if (new TextEncoder().encode(raw).length > MAX_PROJECT_PACKAGE_BYTES) throw new TypeError("Project package exceeds its size limit.");
  const value = JSON.parse(raw);
  if (!value || Object.keys(value).sort().join() !== ["format", "schemaVersion", "project", "resources"].sort().join() || value.format !== "math3d.project-package" || value.schemaVersion !== 1) throw new TypeError("Unsupported project package.");
  const project = parseMath3DProject(JSON.stringify(value.project));
  return { project, resources: new VerifiedProjectResources(project, value.resources) };
};
