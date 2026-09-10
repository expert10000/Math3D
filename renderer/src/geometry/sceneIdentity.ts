import type { SurfaceMeshSource } from "../mesh/surfaceMesh";
import {
  createSceneEntityIdentity,
  sceneEntityId,
  type SceneEntityIdentity,
  type SceneSourceKind,
} from "../scene/sceneIdentity";
import type { GeometryToMeshPromotionMetadata } from "./meshPromotionContract";
import type { GeometryObject } from "./proceduralObjects";

export type GeometryDatasetSceneObject = {
  id: string;
  name: string;
  visible: boolean;
  mesh: { source: SurfaceMeshSource };
  promotion?: GeometryToMeshPromotionMetadata | null;
};

const sourceKindForDataset = (object: GeometryDatasetSceneObject): SceneSourceKind => {
  if (object.promotion?.sourceGeometryId) return "derived";
  if (object.mesh.source.kind === "import") return "import";
  return "dataset";
};

export const buildGeometrySceneIdentities = (input: {
  objects: readonly GeometryObject[];
  datasetObjects: readonly GeometryDatasetSceneObject[];
  revisions?: Readonly<Record<string, number>>;
}): SceneEntityIdentity[] => {
  const revisions = input.revisions ?? {};
  const procedural = input.objects.map((object) =>
    createSceneEntityIdentity({
      localId: object.id,
      revision: revisions[object.id] ?? 0,
      moduleKind: "geometry",
      sourceKind: "procedural",
      metadata: {
        name: object.name,
        objectType: object.type,
        group: object.group ?? null,
        visible: object.visible,
        representation: "parametric-procedural",
      },
    })
  );
  const datasets = input.datasetObjects.map((object) => {
    const sourceLocalId = object.promotion?.sourceGeometryId ?? null;
    const sourceId = sourceLocalId ? sceneEntityId("geometry", sourceLocalId) : null;
    return createSceneEntityIdentity({
      localId: object.id,
      revision: revisions[object.id] ?? 0,
      moduleKind: "geometry",
      sourceKind: sourceKindForDataset(object),
      parentId: sourceId,
      derivedFromIds: sourceId ? [sourceId] : [],
      dependencyIds: sourceId ? [sourceId] : [],
      metadata: {
        name: object.name,
        visible: object.visible,
        representation: "triangle-mesh",
        meshSourceKind: object.mesh.source.kind,
        promotionMode: object.promotion?.promotionMode ?? null,
      },
    });
  });
  return [...procedural, ...datasets];
};
