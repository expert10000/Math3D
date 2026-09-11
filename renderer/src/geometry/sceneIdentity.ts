import type { SurfaceMeshSource } from "../mesh/surfaceMesh";
import {
  createSceneEntityIdentity,
  sceneEntityId,
  type SceneEntityIdentity,
  type SceneSourceKind,
} from "../scene/sceneIdentity";
import type { GeometryToMeshPromotionMetadata } from "./meshPromotionContract";
import {
  buildGeometryCanonicalMetadata,
  geometryCanonicalMetadataToSceneMetadata,
  type GeometryBoundsMetadata,
} from "./metadataLineage";
import type { GeometryObject } from "./proceduralObjects";

export type GeometryDatasetSceneObject = {
  id: string;
  name: string;
  visible: boolean;
  mesh: { source: SurfaceMeshSource; positions?: ArrayLike<number>; indices?: ArrayLike<number> | null };
  promotion?: GeometryToMeshPromotionMetadata | null;
};

const boundsFromPositions = (positions: ArrayLike<number> | null | undefined): GeometryBoundsMetadata | null => {
  if (!positions || positions.length < 3) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = Number(positions[i]);
    const y = Number(positions[i + 1]);
    const z = Number(positions[i + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return Number.isFinite(minX) ? { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] } : null;
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
  const procedural = input.objects.map((object) => {
    const sourceLocalIds = typeof object.params.sourceObjectIds === "string"
      ? object.params.sourceObjectIds.split(",").map((id) => id.trim()).filter(Boolean)
      : [];
    const sourceIds = sourceLocalIds.map((id) => sceneEntityId("geometry", id));
    const sourceKind: SceneSourceKind = sourceIds.length ? "derived" : "procedural";
    const canonicalMetadata = buildGeometryCanonicalMetadata({
      objectType: object.type,
      params: object.params,
      revision: revisions[object.id] ?? 0,
      sourceKind,
      representation: object.type === "constructed" ? "sampled-construction" : "parametric-procedural",
      sourceRevision: sourceLocalIds.length
        ? Math.max(...sourceLocalIds.map((id) => revisions[id] ?? 0))
        : null,
      operation: String(object.params.operation ?? object.params.authoringSource ?? object.params.constructionKind ?? "create"),
    });
    return createSceneEntityIdentity({
      localId: object.id,
      revision: revisions[object.id] ?? 0,
      moduleKind: "geometry",
      sourceKind,
      parentId: sourceIds[0] ?? null,
      derivedFromIds: sourceIds,
      dependencyIds: sourceIds,
      metadata: {
        ...geometryCanonicalMetadataToSceneMetadata(canonicalMetadata),
        name: object.name,
        objectType: object.type,
        group: object.group ?? null,
        visible: object.visible,
        representation: object.type === "constructed" ? "sampled-construction" : "parametric-procedural",
        constructionFamily: object.params.constructionFamily ?? null,
        constructionKind: object.params.constructionKind ?? null,
        authoringSource: object.params.authoringSource ?? "procedural",
        sourceObjectIds: sourceLocalIds.join(","),
        sourceEntityIds: object.params.sourceEntityIds ?? "",
      },
    });
  });
  const datasets = input.datasetObjects.map((object) => {
    const sourceLocalId = object.promotion?.sourceGeometryId ?? null;
    const sourceId = sourceLocalId ? sceneEntityId("geometry", sourceLocalId) : null;
    const sourceKind = sourceKindForDataset(object);
    const vertexCount = object.mesh.positions ? Math.floor(object.mesh.positions.length / 3) : object.promotion?.vertexCount ?? null;
    const canonicalMetadata = buildGeometryCanonicalMetadata({
      objectType: "mesh",
      revision: revisions[object.id] ?? 0,
      sourceKind,
      representation: "triangle-mesh",
      bounds: boundsFromPositions(object.mesh.positions),
      vertexCount,
      precision: "float32 positions",
      sourceRevision: sourceLocalId ? revisions[sourceLocalId] ?? 0 : null,
      operation: object.promotion?.promotionMode ?? object.mesh.source.kind,
    });
    return createSceneEntityIdentity({
      localId: object.id,
      revision: revisions[object.id] ?? 0,
      moduleKind: "geometry",
      sourceKind,
      parentId: sourceId,
      derivedFromIds: sourceId ? [sourceId] : [],
      dependencyIds: sourceId ? [sourceId] : [],
      metadata: {
        ...geometryCanonicalMetadataToSceneMetadata(canonicalMetadata),
        name: object.name,
        visible: object.visible,
        representation: "triangle-mesh",
        meshSourceKind: object.mesh.source.kind,
        promotionMode: object.promotion?.promotionMode ?? null,
        sourceRevision: sourceLocalId ? revisions[sourceLocalId] ?? 0 : null,
        operation: object.promotion?.promotionMode ?? object.mesh.source.kind,
      },
    });
  });
  return [...procedural, ...datasets];
};
