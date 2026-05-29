import { describe, expect, it } from "vitest";
import {
  createSceneProjectDocument,
  deserializeSceneProject,
  serializeSceneProject,
  validateSceneDocument,
} from "@math3d/core";
import { buildGeometryRenderData } from "./render";
import {
  filterGeometryObjectIdRefs,
  filterGeometryRecordByObjectIds,
  filterGeometrySavedSectionCurves,
  sanitizeGeometryComparePair,
} from "./stabilityGuards";
import {
  GEOMETRY_CANONICAL_REGRESSION_SCENES,
  areMetricsClose,
  computeCanonicalMeshMetrics,
  isFiniteMetricObject,
  type CanonicalRegressionSession,
} from "./canonicalRegressionScenes";

const EXPECTED_SCENE_IDS = [
  "geometry/basic-primitives",
  "geometry/transform-stack",
  "geometry/snapping-alignment",
  "geometry/face-extrusion-preview",
  "geometry/edge-bevel-preview",
  "geometry/vertex-weld-preview",
  "geometry/dimensions-annotations",
  "geometry/object-comparison",
  "geometry/section-plane",
  "geometry/boolean-preview",
  "geometry/variants-history",
  "geometry/promotion-to-mesh",
  "geometry/workbook-task-validation",
  "geometry/save-load-roundtrip",
] as const;

const cloneSession = <T>(value: T): T => structuredClone(value);

const TYPED_MARKER = "__typed_array__";

const roundtripSession = (session: CanonicalRegressionSession): CanonicalRegressionSession => {
  const serialized = JSON.stringify(session, (_, value) => {
    if (value instanceof Float32Array) {
      return { [TYPED_MARKER]: "f32", data: Array.from(value) };
    }
    if (value instanceof Uint32Array) {
      return { [TYPED_MARKER]: "u32", data: Array.from(value) };
    }
    return value;
  });
  return JSON.parse(serialized, (_, value) => {
    if (value && typeof value === "object" && (value as any)[TYPED_MARKER] === "f32") {
      return Float32Array.from((value as { data: number[] }).data);
    }
    if (value && typeof value === "object" && (value as any)[TYPED_MARKER] === "u32") {
      return Uint32Array.from((value as { data: number[] }).data);
    }
    return value;
  }) as CanonicalRegressionSession;
};

const validObjectIdSet = (session: CanonicalRegressionSession): Set<string> =>
  new Set(session.objects.map((entry) => entry.id));

const overlayCount = (session: CanonicalRegressionSession): number => {
  const renderData = buildGeometryRenderData(session.scene);
  return renderData.overlayPointSets.length + renderData.overlayPolylineGroups.length + session.overlays.length;
};

const sessionFingerprint = (session: CanonicalRegressionSession): string =>
  JSON.stringify({
    objects: session.objects.map((entry) => ({
      id: entry.id,
      name: entry.name,
      positions: Array.from(entry.mesh.positions),
      indices: entry.mesh.indices ? Array.from(entry.mesh.indices) : null,
    })),
    annotations: session.annotations,
    sections: session.sections,
    compare: session.comparePair,
    history: session.historyByObjectId,
  });

const replaceObjectSnapshot = (
  session: CanonicalRegressionSession,
  objectId: string,
  snapshot: CanonicalRegressionSession["objects"][number]
): CanonicalRegressionSession => ({
  ...session,
  objects: session.objects.map((entry) => (entry.id === objectId ? cloneSession(snapshot) : entry)),
});

const undoRedoFingerprint = (session: CanonicalRegressionSession): string => {
  const targetId = session.objects[0]?.id ?? null;
  if (!targetId) return sessionFingerprint(session);
  const history = session.historyByObjectId[targetId] ?? [];
  if (history.length < 2) return sessionFingerprint(session);
  const undoSnapshot = history[1].snapshot;
  const redoSnapshot = history[0].snapshot;
  const undone = replaceObjectSnapshot(session, targetId, undoSnapshot);
  const redone = replaceObjectSnapshot(undone, targetId, redoSnapshot);
  return sessionFingerprint(redone);
};

describe("geometry canonical regression scenes", () => {
  it("keeps exact scene id inventory for release gate", () => {
    expect(GEOMETRY_CANONICAL_REGRESSION_SCENES.map((entry) => entry.sceneId)).toEqual(EXPECTED_SCENE_IDS);
  });

  for (const definition of GEOMETRY_CANONICAL_REGRESSION_SCENES) {
    it(`opens ${definition.sceneId} and passes release-gate invariants`, () => {
      expect(definition.requiredFeatures.length).toBeGreaterThan(0);
      expect(isFiniteMetricObject(definition.expectedMetrics)).toBe(true);

      const session = cloneSession(definition.session);
      const initialObjectIds = validObjectIdSet(session);

      const sceneDocValidation = validateSceneDocument({
        id: definition.sceneId,
        title: definition.title,
        createdAt: 1_717_000_000_000,
        updatedAt: 1_717_000_000_000,
        geometry: session.scene,
      });
      expect(sceneDocValidation.ok, `scene validation failed for ${definition.sceneId}`).toBe(true);

      expect(() => buildGeometryRenderData(session.scene)).not.toThrow();
      expect(session.objects.length).toBe(definition.expectedObjectCount);
      expect(overlayCount(session)).toBe(definition.expectedOverlayCount);

      const project = createSceneProjectDocument({
        id: definition.sceneId,
        title: definition.title,
        createdAt: 1_717_000_000_000,
        updatedAt: 1_717_000_000_000,
        geometry: session.scene,
      });
      const parsed = deserializeSceneProject(serializeSceneProject(project));
      expect(parsed.ok).toBe(true);

      const reloaded = roundtripSession(session);
      expect(overlayCount(reloaded)).toBe(definition.expectedOverlayCount);
      expect(reloaded.historyByObjectId).toEqual(session.historyByObjectId);

      for (const annotation of reloaded.annotations) {
        if (annotation.objectId == null) continue;
        expect(initialObjectIds.has(annotation.objectId)).toBe(true);
      }

      const promotionEntries = Object.entries(reloaded.promotions);
      expect(promotionEntries.length).toBeGreaterThan(0);
      for (const [objectId, metadata] of promotionEntries) {
        expect(initialObjectIds.has(objectId)).toBe(true);
        expect(metadata.sourceGeometryId).toBe(objectId);
        expect(metadata.sourceOperationHistory.length).toBeGreaterThan(0);
        expect(metadata.vertexCount).toBeGreaterThan(0);
        expect(metadata.faceCount).toBeGreaterThan(0);
        expect(Number.isFinite(metadata.createdAt)).toBe(true);
      }

      if (definition.expectedMetrics) {
        const metricSource = reloaded.objects[0]?.mesh;
        expect(metricSource).toBeTruthy();
        const actual = metricSource ? computeCanonicalMeshMetrics(metricSource) : undefined;
        expect(areMetricsClose(definition.expectedMetrics, actual)).toBe(true);
      }

      if (definition.expectedWarnings?.length) {
        expect(reloaded.warnings).toEqual(definition.expectedWarnings);
      } else {
        expect(reloaded.warnings.length).toBe(0);
      }

      const objectIdsAfterDelete = new Set(initialObjectIds);
      objectIdsAfterDelete.delete(reloaded.deleteProbeObjectId);
      const compareAfterDelete = sanitizeGeometryComparePair(
        reloaded.comparePair.aId,
        reloaded.comparePair.bId,
        objectIdsAfterDelete
      );
      if (compareAfterDelete.aId) expect(objectIdsAfterDelete.has(compareAfterDelete.aId)).toBe(true);
      if (compareAfterDelete.bId) expect(objectIdsAfterDelete.has(compareAfterDelete.bId)).toBe(true);
      expect(compareAfterDelete.bId).not.toBe(reloaded.deleteProbeObjectId);

      const sectionsAfterDelete = filterGeometrySavedSectionCurves(reloaded.sections, objectIdsAfterDelete);
      expect(sectionsAfterDelete.some((entry) => entry.objectId === reloaded.deleteProbeObjectId)).toBe(false);
      for (const section of sectionsAfterDelete) {
        expect(objectIdsAfterDelete.has(section.objectId)).toBe(true);
      }

      const annotationsAfterDelete = filterGeometryObjectIdRefs(reloaded.annotations, objectIdsAfterDelete);
      for (const annotation of annotationsAfterDelete) {
        if (annotation.objectId) expect(objectIdsAfterDelete.has(annotation.objectId)).toBe(true);
      }

      const historyAfterDelete = filterGeometryRecordByObjectIds(reloaded.historyByObjectId, objectIdsAfterDelete);
      for (const key of Object.keys(historyAfterDelete)) {
        expect(objectIdsAfterDelete.has(key)).toBe(true);
      }

      const baselineFingerprint = sessionFingerprint(reloaded);
      const cycle1 = undoRedoFingerprint(cloneSession(reloaded));
      const cycle2 = undoRedoFingerprint(cloneSession(reloaded));
      expect(cycle1).toBe(cycle2);
      expect(cycle1).toBe(baselineFingerprint);
    });
  }
});
