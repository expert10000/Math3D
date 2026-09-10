export type SceneModuleKind =
  | "geometry"
  | "mesh"
  | "surfaces"
  | "curves"
  | "volume"
  | "topology"
  | "complex-analysis";

export type SceneSourceKind =
  | "procedural"
  | "dataset"
  | "import"
  | "derived"
  | "gallery"
  | "demo"
  | "scratch"
  | "workbook"
  | "script"
  | "unknown";

export type SceneMetadataValue = string | number | boolean | null;

export type SceneEntityIdentity = {
  id: string;
  localId: string;
  revision: number;
  moduleKind: SceneModuleKind;
  sourceKind: SceneSourceKind;
  parentId: string | null;
  derivedFromIds: string[];
  dependencyIds: string[];
  metadata: Record<string, SceneMetadataValue>;
};

export const sceneEntityId = (moduleKind: SceneModuleKind, localId: string): string =>
  `${moduleKind}:${localId}`;

const uniqueIds = (ids: readonly string[] | null | undefined): string[] =>
  Array.from(new Set((ids ?? []).filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())));

export const createSceneEntityIdentity = (input: {
  localId: string;
  revision?: number;
  moduleKind: SceneModuleKind;
  sourceKind: SceneSourceKind;
  parentId?: string | null;
  derivedFromIds?: readonly string[];
  dependencyIds?: readonly string[];
  metadata?: Record<string, SceneMetadataValue>;
}): SceneEntityIdentity => {
  const localId = input.localId.trim();
  if (!localId) throw new Error("Scene identity requires a local ID.");
  const revision = Number.isFinite(input.revision) ? Math.max(0, Math.floor(Number(input.revision))) : 0;
  return {
    id: sceneEntityId(input.moduleKind, localId),
    localId,
    revision,
    moduleKind: input.moduleKind,
    sourceKind: input.sourceKind,
    parentId: input.parentId?.trim() || null,
    derivedFromIds: uniqueIds(input.derivedFromIds),
    dependencyIds: uniqueIds(input.dependencyIds),
    metadata: { ...(input.metadata ?? {}) },
  };
};

export const buildSceneIdentityIndex = (
  identities: readonly SceneEntityIdentity[]
): ReadonlyMap<string, SceneEntityIdentity> => {
  const index = new Map<string, SceneEntityIdentity>();
  for (const identity of identities) {
    if (index.has(identity.id)) throw new Error(`Duplicate scene identity: ${identity.id}`);
    index.set(identity.id, identity);
  }
  return index;
};

export const resolveSceneLocalId = (
  identities: ReadonlyMap<string, SceneEntityIdentity>,
  sceneId: string | null | undefined,
  expectedModule?: SceneModuleKind
): string | null => {
  if (!sceneId) return null;
  const identity = identities.get(sceneId);
  if (!identity || (expectedModule && identity.moduleKind !== expectedModule)) return null;
  return identity.localId;
};

export const revisionsFromSceneIdentities = (
  identities: readonly SceneEntityIdentity[] | null | undefined,
  moduleKind: SceneModuleKind
): Record<string, number> => {
  const revisions: Record<string, number> = {};
  for (const identity of identities ?? []) {
    if (!identity || identity.moduleKind !== moduleKind || !identity.localId) continue;
    const revision = Number(identity.revision);
    if (!Number.isFinite(revision)) continue;
    revisions[identity.localId] = Math.max(0, Math.floor(revision));
  }
  return revisions;
};
