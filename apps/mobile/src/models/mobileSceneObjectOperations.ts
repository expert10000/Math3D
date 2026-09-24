import type { SceneDocument, SurfaceDefinition } from "@math3d/core";

export type MobileDeletedSceneObject = {
  surface: SurfaceDefinition;
  index: number;
};

export type MobileSceneObjectMutation =
  | { ok: true; scene: SceneDocument; objectId: string }
  | { ok: false; message: string };

const withSurfaces = (
  scene: SceneDocument,
  surfaces: SurfaceDefinition[],
  now: number
): SceneDocument => ({ ...scene, surfaces, updatedAt: now });

export const normalizeMobileSceneObjectId = (value: string): string =>
  value.trim().replace(/\s+/g, "-");

export const createUniqueMobileSceneObjectId = (
  scene: SceneDocument,
  preferred: string
): string => {
  const used = new Set((scene.surfaces ?? []).map((surface) => surface.id));
  if (!used.has(preferred)) return preferred;
  let suffix = 2;
  while (used.has(`${preferred}-${suffix}`)) suffix += 1;
  return `${preferred}-${suffix}`;
};

export const renameMobileSceneObject = (
  scene: SceneDocument,
  objectId: string,
  requestedId: string,
  now = Date.now()
): MobileSceneObjectMutation => {
  const nextId = normalizeMobileSceneObjectId(requestedId);
  if (!nextId) return { ok: false, message: "Object name cannot be empty." };
  const surfaces = scene.surfaces ?? [];
  if (!surfaces.some((surface) => surface.id === objectId)) {
    return { ok: false, message: "The selected object no longer exists." };
  }
  if (nextId !== objectId && surfaces.some((surface) => surface.id === nextId)) {
    return { ok: false, message: `An object named ${nextId} already exists.` };
  }
  return {
    ok: true,
    objectId: nextId,
    scene: withSurfaces(
      scene,
      surfaces.map((surface) => surface.id === objectId ? { ...surface, id: nextId } : surface),
      now
    ),
  };
};

export const duplicateMobileSceneObject = (
  scene: SceneDocument,
  objectId: string,
  now = Date.now()
): MobileSceneObjectMutation => {
  const surfaces = scene.surfaces ?? [];
  const index = surfaces.findIndex((surface) => surface.id === objectId);
  if (index < 0) return { ok: false, message: "The selected object no longer exists." };
  const nextId = createUniqueMobileSceneObjectId(scene, `${objectId}-copy`);
  const duplicate = { ...surfaces[index], id: nextId } as SurfaceDefinition;
  const next = [...surfaces];
  next.splice(index + 1, 0, duplicate);
  return { ok: true, objectId: nextId, scene: withSurfaces(scene, next, now) };
};

export const deleteMobileSceneObject = (
  scene: SceneDocument,
  objectId: string,
  now = Date.now()
): { ok: true; scene: SceneDocument; deleted: MobileDeletedSceneObject; nextSelectedId: string | null } | { ok: false; message: string } => {
  const surfaces = scene.surfaces ?? [];
  const index = surfaces.findIndex((surface) => surface.id === objectId);
  if (index < 0) return { ok: false, message: "The selected object no longer exists." };
  const next = surfaces.filter((surface) => surface.id !== objectId);
  return {
    ok: true,
    scene: withSurfaces(scene, next, now),
    deleted: { surface: surfaces[index], index },
    nextSelectedId: next[index]?.id ?? next[index - 1]?.id ?? null,
  };
};

export const restoreMobileSceneObject = (
  scene: SceneDocument,
  deleted: MobileDeletedSceneObject,
  now = Date.now()
): MobileSceneObjectMutation => {
  const surfaces = scene.surfaces ?? [];
  if (surfaces.some((surface) => surface.id === deleted.surface.id)) {
    return { ok: false, message: `An object named ${deleted.surface.id} already exists.` };
  }
  const next = [...surfaces];
  next.splice(Math.max(0, Math.min(deleted.index, next.length)), 0, deleted.surface);
  return { ok: true, objectId: deleted.surface.id, scene: withSurfaces(scene, next, now) };
};
