import type { GeometryScene } from "./types";
import { promoteGeometryToMesh, type GeometryToMeshPromotionMetadata, type GeometryToMeshPromotionMode } from "./meshPromotionContract";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { buildGeometryRenderData } from "./render";

export type CanonicalExpectedMetrics = {
  volume?: number;
  surfaceArea?: number;
  vertexCount?: number;
  faceCount?: number;
};

export type CanonicalSceneDefinition = {
  sceneId: string;
  title: string;
  expectedObjectCount: number;
  expectedOverlayCount: number;
  expectedMetrics?: CanonicalExpectedMetrics;
  expectedWarnings?: string[];
  requiredFeatures: string[];
  session: CanonicalRegressionSession;
};

export type CanonicalSceneObject = {
  id: string;
  name: string;
  mesh: SurfaceMeshData;
};

export type CanonicalSceneAnnotation = {
  id: string;
  objectId: string | null;
  text: string;
};

export type CanonicalSectionRef = {
  id: string;
  objectId: string;
  planePreset: "xy" | "yz" | "xz" | "custom";
};

export type CanonicalHistoryStep = {
  id: string;
  label: string;
  snapshot: CanonicalSceneObject;
};

export type CanonicalRegressionSession = {
  scene: GeometryScene;
  objects: CanonicalSceneObject[];
  overlays: Array<{ id: string; kind: string; objectId?: string | null }>;
  annotations: CanonicalSceneAnnotation[];
  sections: CanonicalSectionRef[];
  historyByObjectId: Record<string, CanonicalHistoryStep[]>;
  comparePair: { aId: string | null; bId: string | null };
  promotions: Record<string, GeometryToMeshPromotionMetadata>;
  warnings: string[];
  deleteProbeObjectId: string;
};

const EPSILON = 1e-9;

const cloneMesh = (mesh: SurfaceMeshData): SurfaceMeshData => ({
  ...mesh,
  positions: Float32Array.from(mesh.positions),
  indices: mesh.indices ? Uint32Array.from(mesh.indices) : null,
  normals: mesh.normals ? Float32Array.from(mesh.normals) : null,
  uvs: mesh.uvs ? Float32Array.from(mesh.uvs) : null,
  adjacency: mesh.adjacency ? mesh.adjacency.map((row) => row.slice()) : null,
  validation: mesh.validation
    ? {
        ...mesh.validation,
        errors: [...mesh.validation.errors],
        warnings: [...mesh.validation.warnings],
        stats: { ...mesh.validation.stats },
      }
    : null,
});

const cloneObject = (obj: CanonicalSceneObject): CanonicalSceneObject => ({
  ...obj,
  mesh: cloneMesh(obj.mesh),
});

const createTetraMesh = (label: string, offsetX: number): SurfaceMeshData => {
  const positions = new Float32Array([
    0 + offsetX, 0, 0,
    1 + offsetX, 0, 0,
    0 + offsetX, 1, 0,
    0 + offsetX, 0, 1,
  ]);
  const indices = new Uint32Array([
    0, 2, 1,
    0, 1, 3,
    0, 3, 2,
    1, 2, 3,
  ]);
  return {
    label,
    positions,
    indices,
    source: { kind: "detachedMesh", fromKind: "canonical-regression", fromLabel: label },
  };
};

const createSceneGeometry = (offset = 0): GeometryScene => ({
  points: [
    { x: -0.6 + offset, y: 0, z: 0, color: 0x1d4ed8, size: 0.06 },
    { x: 0.6 + offset, y: 0, z: 0, color: 0x1d4ed8, size: 0.06 },
    { x: 0 + offset, y: 0.8, z: 0.3, color: 0x1d4ed8, size: 0.06 },
  ],
  segments: [
    {
      a: { x: -0.6 + offset, y: 0, z: 0 },
      b: { x: 0.6 + offset, y: 0, z: 0 },
      color: 0x0f766e,
      opacity: 0.9,
    },
    {
      a: { x: 0.6 + offset, y: 0, z: 0 },
      b: { x: 0 + offset, y: 0.8, z: 0.3 },
      color: 0x0f766e,
      opacity: 0.9,
    },
  ],
});

const computeOverlayCount = (session: CanonicalRegressionSession): number => {
  const renderData = buildGeometryRenderData(session.scene);
  return renderData.overlayPointSets.length + renderData.overlayPolylineGroups.length + session.overlays.length;
};

export const computeCanonicalMeshMetrics = (mesh: Pick<SurfaceMeshData, "positions" | "indices">): CanonicalExpectedMetrics => {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const vertexCount = Math.floor(positions.length / 3);
  const faceCount = indices ? Math.floor(indices.length / 3) : Math.floor(positions.length / 9);

  let surfaceArea = 0;
  let signedVolume = 0;
  const triCount = faceCount;
  const at = (index: number) => {
    const base = index * 3;
    return {
      x: Number(positions[base] ?? 0),
      y: Number(positions[base + 1] ?? 0),
      z: Number(positions[base + 2] ?? 0),
    };
  };

  for (let i = 0; i < triCount; i += 1) {
    const ia = indices ? Number(indices[i * 3] ?? 0) : i * 3;
    const ib = indices ? Number(indices[i * 3 + 1] ?? 0) : i * 3 + 1;
    const ic = indices ? Number(indices[i * 3 + 2] ?? 0) : i * 3 + 2;
    const a = at(ia);
    const b = at(ib);
    const c = at(ic);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const acx = c.x - a.x;
    const acy = c.y - a.y;
    const acz = c.z - a.z;
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    surfaceArea += 0.5 * Math.hypot(cx, cy, cz);
    signedVolume += (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6;
  }

  return {
    volume: Math.abs(signedVolume),
    surfaceArea,
    vertexCount,
    faceCount,
  };
};

const metricApproxEqual = (a: number | undefined, b: number | undefined): boolean => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= 1e-6 + Math.max(Math.abs(a), Math.abs(b)) * 1e-6;
};

const makeScene = (args: {
  sceneId: string;
  title: string;
  requiredFeatures: string[];
  overlayKinds: string[];
  warning?: string;
  includeExpectedMetrics?: boolean;
  promotionMode?: GeometryToMeshPromotionMode;
}): CanonicalSceneDefinition => {
  const meshA = createTetraMesh(`${args.sceneId}-A`, 0);
  const meshB = createTetraMesh(`${args.sceneId}-B`, 1.4);
  const objectA: CanonicalSceneObject = { id: `${args.sceneId}:objA`, name: "Object A", mesh: meshA };
  const objectB: CanonicalSceneObject = { id: `${args.sceneId}:objB`, name: "Object B", mesh: meshB };
  const previousA = cloneObject(objectA);
  previousA.name = "Object A (before edit)";

  const promotionMode = args.promotionMode ?? "analysis_ready_mesh";
  const promoted = promoteGeometryToMesh({
    mesh: meshA,
    sourceGeometryId: objectA.id,
    sourceOperationHistory: ["create primitive", "apply transform", "preview edit"],
    promotionMode,
    createdAt: 1_717_000_000_000,
  });

  const session: CanonicalRegressionSession = {
    scene: createSceneGeometry(args.overlayKinds.length * 0.05),
    objects: [objectA, objectB],
    overlays: args.overlayKinds.map((kind, index) => ({ id: `${args.sceneId}:ov${index}`, kind, objectId: objectA.id })),
    annotations: [
      { id: `${args.sceneId}:annA`, objectId: objectA.id, text: "Dimension A" },
      { id: `${args.sceneId}:annB`, objectId: objectB.id, text: "Dimension B" },
      { id: `${args.sceneId}:annShared`, objectId: null, text: "Global note" },
    ],
    sections: [
      { id: `${args.sceneId}:secA`, objectId: objectA.id, planePreset: "xy" },
      { id: `${args.sceneId}:secB`, objectId: objectB.id, planePreset: "yz" },
    ],
    historyByObjectId: {
      [objectA.id]: [
        { id: `${args.sceneId}:histA:1`, label: "After edit", snapshot: cloneObject(objectA) },
        { id: `${args.sceneId}:histA:0`, label: "Before edit", snapshot: previousA },
      ],
      [objectB.id]: [{ id: `${args.sceneId}:histB:0`, label: "Created", snapshot: cloneObject(objectB) }],
    },
    comparePair: { aId: objectA.id, bId: objectB.id },
    promotions: {
      [objectA.id]: promoted.metadata,
    },
    warnings: args.warning ? [args.warning] : [],
    deleteProbeObjectId: objectB.id,
  };

  const metrics = computeCanonicalMeshMetrics(meshA);
  const expectedMetrics = args.includeExpectedMetrics
    ? {
        volume: metrics.volume,
        surfaceArea: metrics.surfaceArea,
        vertexCount: metrics.vertexCount,
        faceCount: metrics.faceCount,
      }
    : undefined;
  const expectedOverlayCount = computeOverlayCount(session);

  if (expectedMetrics) {
    if (!metricApproxEqual(expectedMetrics.volume, 1 / 6)) {
      throw new Error("Canonical tetra volume changed.");
    }
    const expectedArea = (3 + Math.sqrt(3)) / 2;
    if (!metricApproxEqual(expectedMetrics.surfaceArea, expectedArea)) {
      throw new Error("Canonical tetra surface area changed.");
    }
  }

  return {
    sceneId: args.sceneId,
    title: args.title,
    expectedObjectCount: session.objects.length,
    expectedOverlayCount,
    expectedMetrics,
    expectedWarnings: session.warnings.length ? [...session.warnings] : undefined,
    requiredFeatures: [...args.requiredFeatures],
    session,
  };
};

export const GEOMETRY_CANONICAL_REGRESSION_SCENES: CanonicalSceneDefinition[] = [
  makeScene({
    sceneId: "geometry/basic-primitives",
    title: "Basic Primitives",
    includeExpectedMetrics: true,
    requiredFeatures: ["create-primitive", "metrics-panel", "object-list"],
    overlayKinds: ["grid", "axis"],
  }),
  makeScene({
    sceneId: "geometry/transform-stack",
    title: "Transform Stack",
    requiredFeatures: ["translate", "rotate", "scale", "transform-history"],
    overlayKinds: ["transform-gizmo", "snap-guides"],
  }),
  makeScene({
    sceneId: "geometry/snapping-alignment",
    title: "Snapping And Alignment",
    requiredFeatures: ["snapping", "alignment", "reference-points"],
    overlayKinds: ["snap-preview", "alignment-guides", "reference-lines"],
  }),
  makeScene({
    sceneId: "geometry/face-extrusion-preview",
    title: "Face Extrusion Preview",
    requiredFeatures: ["face-select", "extrude-preview", "preview-accept-cancel"],
    overlayKinds: ["face-highlight", "preview-mesh"],
  }),
  makeScene({
    sceneId: "geometry/edge-bevel-preview",
    title: "Edge Bevel Preview",
    requiredFeatures: ["edge-select", "bevel-preview", "preview-accept-cancel"],
    overlayKinds: ["edge-highlight", "bevel-preview"],
  }),
  makeScene({
    sceneId: "geometry/vertex-weld-preview",
    title: "Vertex Weld Preview",
    requiredFeatures: ["vertex-select", "weld-preview", "topology-check"],
    overlayKinds: ["vertex-highlight", "weld-preview"],
    warning: "Potential self-intersection warning on aggressive weld.",
    promotionMode: "repaired_mesh",
  }),
  makeScene({
    sceneId: "geometry/dimensions-annotations",
    title: "Dimensions And Annotations",
    requiredFeatures: ["dimension-tool", "annotation-layer", "attachment-persistence"],
    overlayKinds: ["dimension-overlay", "annotation-overlay", "leader-lines"],
  }),
  makeScene({
    sceneId: "geometry/object-comparison",
    title: "Object Comparison",
    requiredFeatures: ["compare-a-b", "delta-metrics", "linked-camera"],
    overlayKinds: ["compare-overlay", "delta-callouts"],
  }),
  makeScene({
    sceneId: "geometry/section-plane",
    title: "Section Plane",
    requiredFeatures: ["section-plane", "section-curve-save", "section-curve-reload"],
    overlayKinds: ["section-plane-overlay", "section-curve-overlay"],
  }),
  makeScene({
    sceneId: "geometry/boolean-preview",
    title: "Boolean Preview",
    requiredFeatures: ["boolean-preview", "boolean-warnings", "preview-curves"],
    overlayKinds: ["boolean-preview-mesh", "boolean-preview-curves"],
    warning: "Boolean preview produced fallback triangulation.",
  }),
  makeScene({
    sceneId: "geometry/variants-history",
    title: "Variants And History",
    requiredFeatures: ["variant-sets", "history-rollback", "history-duplicate"],
    overlayKinds: ["variant-ghost-overlay", "history-marker"],
  }),
  makeScene({
    sceneId: "geometry/promotion-to-mesh",
    title: "Promotion To Mesh",
    includeExpectedMetrics: true,
    requiredFeatures: ["promote-to-mesh", "promotion-metadata", "promotion-lock"],
    overlayKinds: ["promotion-overlay", "mesh-info"],
    promotionMode: "frozen_baked_object",
  }),
  makeScene({
    sceneId: "geometry/workbook-task-validation",
    title: "Workbook Task Validation",
    requiredFeatures: ["workbook-bindings", "task-validation", "overlay-sync"],
    overlayKinds: ["workbook-overlay", "task-status-overlay"],
  }),
  makeScene({
    sceneId: "geometry/save-load-roundtrip",
    title: "Save Load Roundtrip",
    requiredFeatures: ["save-scene", "reload-scene", "state-sanitize-on-load"],
    overlayKinds: ["save-state-overlay", "reload-state-overlay"],
  }),
];

export const findCanonicalGeometryScene = (sceneId: string): CanonicalSceneDefinition | null =>
  GEOMETRY_CANONICAL_REGRESSION_SCENES.find((entry) => entry.sceneId === sceneId) ?? null;

export const areMetricsClose = (
  expected: CanonicalExpectedMetrics | undefined,
  actual: CanonicalExpectedMetrics | undefined
): boolean => {
  if (!expected) return true;
  if (!actual) return false;
  return (
    metricApproxEqual(expected.volume, actual.volume) &&
    metricApproxEqual(expected.surfaceArea, actual.surfaceArea) &&
    (expected.vertexCount == null || expected.vertexCount === actual.vertexCount) &&
    (expected.faceCount == null || expected.faceCount === actual.faceCount)
  );
};

export const isFiniteMetricObject = (metrics: CanonicalExpectedMetrics | undefined): boolean => {
  if (!metrics) return true;
  const values = [metrics.volume, metrics.surfaceArea, metrics.vertexCount, metrics.faceCount];
  return values.every((value) => value == null || (Number.isFinite(value) && value >= -EPSILON));
};
