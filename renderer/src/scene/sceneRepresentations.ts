import type { GeometryMeshRelation } from "../geometry/geometryMeshRelations";

export type SceneRepresentationKind = "parametric" | "evaluated" | "editable-mesh";
export type SceneRepresentationState = "linked" | "modified-linked" | "detached" | "stale" | "invalid";
export type SceneRepresentationAction =
  | "Edit Definition" | "Edit Geometry" | "Generate Mesh" | "Edit Mesh"
  | "Update Mesh" | "Detach Mesh" | "Return to Source";

export type SceneRepresentation = {
  readonly id: string;
  readonly kind: SceneRepresentationKind;
  readonly label: string;
  readonly state: SceneRepresentationState;
  readonly sourceRevision: number | null;
};

export type SceneEntity = {
  readonly id: string;
  readonly name: string;
  readonly representations: readonly SceneRepresentation[];
};

export type SceneGeometryEntry = {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly parametric: boolean;
};

export type SceneMeshEntry = {
  readonly id: string;
  readonly name: string;
  readonly sourceGeometryId: string | null;
  readonly sourceRevision: number | null;
  readonly modified: boolean;
  readonly detached: boolean;
  readonly invalid: boolean;
};

/** Collapse all representations of a Geometry object into one logical scene entity. */
export const buildSceneEntities = (input: {
  geometry: readonly SceneGeometryEntry[];
  meshes: readonly SceneMeshEntry[];
  relations?: readonly GeometryMeshRelation[];
}): readonly SceneEntity[] => {
  const entities = new Map<string, { id: string; name: string; representations: SceneRepresentation[] }>();
  for (const geometry of input.geometry) {
    const id = `geometry:${geometry.id}`;
    entities.set(id, {
      id,
      name: geometry.name,
      representations: [{
        id: `${id}:${geometry.parametric ? "definition" : "geometry"}`,
        kind: geometry.parametric ? "parametric" : "evaluated",
        label: geometry.parametric ? "Parametric Geometry" : "Evaluated Geometry",
        state: "linked",
        sourceRevision: geometry.revision,
      }],
    });
  }
  for (const mesh of input.meshes) {
    const relation = input.relations?.find((item) => item.meshId === mesh.id);
    const sourceId = mesh.detached ? null : mesh.sourceGeometryId ?? relation?.sourceGeometryId ?? null;
    const linkedId = sourceId ? `geometry:${sourceId}` : null;
    const entity = linkedId ? entities.get(linkedId) : null;
    const id = entity?.id ?? `mesh:${mesh.id}`;
    const target = entity ?? entities.get(id) ?? { id, name: mesh.name, representations: [] };
    const sourceRevision = mesh.sourceRevision ?? relation?.sourceRevision ?? null;
    const liveRevision = sourceId ? input.geometry.find((entry) => entry.id === sourceId)?.revision ?? null : null;
    const state: SceneRepresentationState = mesh.invalid || relation?.status === "broken"
      ? "invalid"
      : mesh.detached || !entity
        ? "detached"
        : relation?.status === "stale" || (liveRevision != null && sourceRevision != null && liveRevision > sourceRevision)
          ? "stale"
          : mesh.modified
            ? "modified-linked"
            : "linked";
    if (!target.representations.some((representation) => representation.id === `mesh:${mesh.id}`)) {
      target.representations.push({ id: `mesh:${mesh.id}`, kind: "editable-mesh", label: "Editable Mesh", state, sourceRevision });
    }
    entities.set(id, target);
  }
  return [...entities.values()];
};

export const selectActiveRepresentation = (
  entity: SceneEntity,
  preferredId: string | null | undefined
): SceneRepresentation =>
  entity.representations.find((representation) => representation.id === preferredId) ?? entity.representations[0];
