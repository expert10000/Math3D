import { canonicalJsonStringify, exportProjectPackage, Graph2DPointTableStore, parseMath3DProject,
  parseProjectPackage, projectResourceInventory, VerifiedProjectResources, type ProjectResourceSidecar } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";

export const MAX_MOBILE_PROJECT_PACKAGE_BYTES = 25 * 1024 * 1024;
const key = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`;

/** One atomic library record owns the named JSON and its verified resource bytes. */
export const readMobileProjectResources = (stored: MobileStoredSceneProject) => {
  const project = parseMath3DProject(stored.serializedProject);
  const resources = new VerifiedProjectResources(project, stored.projectResources ?? []);
  if (new TextEncoder().encode(JSON.stringify(stored.projectResources ?? [])).length > MAX_MOBILE_PROJECT_PACKAGE_BYTES)
    throw new TypeError("Mobile project resources exceed 25 MiB.");
  const inventory = projectResourceInventory(project);
  return { project, resources, inventory: inventory.map(item => ({ ...item, available: resources.bytes(item) !== null })) };
};

export const attachMobileProjectResources = (stored: MobileStoredSceneProject, raw: string, now = Date.now()): MobileStoredSceneProject => {
  if (new TextEncoder().encode(raw).length > MAX_MOBILE_PROJECT_PACKAGE_BYTES) throw new TypeError("Mobile package exceeds 25 MiB.");
  const incoming = parseProjectPackage(raw), current = readMobileProjectResources(stored);
  if (incoming.project.identity.id !== current.project.identity.id ||
    canonicalJsonStringify(incoming.project.workspace) !== canonicalJsonStringify(current.project.workspace))
    throw new TypeError("Resources belong to a different project version. Existing work was kept.");
  const merged = new Map<string, ProjectResourceSidecar>();
  for (const item of [...current.resources.sidecars(), ...incoming.resources.sidecars()]) {
    const prior = merged.get(key(item));
    if (prior && prior.checksum !== item.checksum) throw new TypeError("Conflicting resource bytes. Existing resources were kept.");
    merged.set(key(item), item);
  }
  const next = { ...stored, updatedAt: now, projectResources: [...merged.values()] };
  readMobileProjectResources(next);
  return next;
};

export const serializeMobileProjectPackage = (stored: MobileStoredSceneProject): string => {
  const { project, resources } = readMobileProjectResources(stored);
  const raw = exportProjectPackage(project, resources);
  if (new TextEncoder().encode(raw).length > MAX_MOBILE_PROJECT_PACKAGE_BYTES) throw new TypeError("Mobile package exceeds 25 MiB.");
  return raw;
};

export const mobileProjectGraphTables = (stored: MobileStoredSceneProject, fallback?: Graph2DPointTableStore) => {
  const { resources, inventory } = readMobileProjectResources(stored);
  const tables = new Map(inventory.filter(item => item.kind === "graph-point-table").flatMap(item => {
    const bytes = resources.bytes(item); return bytes ? [[item.id, new TextDecoder().decode(bytes)] as const] : [];
  }));
  return new Graph2DPointTableStore({
    read: id => tables.get(id) ?? fallback?.backing?.read(id) ?? null,
    write: (id, content) => { if (!fallback?.backing) throw new TypeError("Project table store is read-only."); fallback.backing.write(id, content); },
  });
};
