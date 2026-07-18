import type { GeometryObject, SceneDocument } from "@math3d/core";
import {
  GEOMETRY_DEBUG_SCENE_DESCRIPTIONS,
  GEOMETRY_DEBUG_SCENE_DOCUMENTS,
} from "./debugScenePresets";

export type GeometrySceneGalleryCategory =
  | "Debug Scenes"
  | "Construction Basics"
  | "Measurement"
  | "Mathematical Demonstrations"
  | "Geometry to Mesh"
  | "Workbook Examples"
  | "Release Smoke";

export type GeometrySceneTimelineAction =
  | { kind: "setPanel"; panel: "create" | "scene" | "object" | "construct" | "transform" | "view" | "history" | "analysis" | "demonstrations" | "theory" | "script" | "euler" }
  | { kind: "selectObject"; objectName: string }
  | { kind: "setComparisonPair"; objectAName: string; objectBName: string }
  | { kind: "setSectionPlane"; preset: "xy" | "yz" | "xz" | "custom"; offset: number }
  | { kind: "setDemonstrationCategory"; category: "cross_sections" | "volume_relations" | "scaling" | "polyhedra_topology" }
  | { kind: "setStatus"; message: string };

export type ConstructionTimelineStep = {
  id: string;
  label: string;
  note: string;
  action?: GeometrySceneTimelineAction;
};

export type ConstructionTimeline = {
  autoplayIntervalMs?: number;
  steps: ConstructionTimelineStep[];
};

export type GeometryGallerySceneEntry = {
  id: string;
  title: string;
  category: GeometrySceneGalleryCategory;
  description: string;
  thumbnail?: string;
  learningGoals?: string[];
  initialScene: SceneDocument;
  timeline?: ConstructionTimeline;
  recommendedPanels?: string[];
};

const thumb = (title: string, subtitle: string, accent: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f8fbff"/><stop offset="100%" stop-color="#e6eef8"/></linearGradient></defs><rect x="0" y="0" width="320" height="180" fill="url(#g)"/><rect x="16" y="16" width="288" height="148" rx="12" fill="#ffffff" stroke="#d6deea"/><circle cx="64" cy="90" r="28" fill="none" stroke="${accent}" stroke-width="4"/><path d="M120 112 L170 58 L210 94 L258 66" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"/><text x="28" y="42" font-family="Segoe UI, Arial" font-size="16" font-weight="700" fill="#1f2937">${title}</text><text x="28" y="62" font-family="Segoe UI, Arial" font-size="12" fill="#475467">${subtitle}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const baseObject = (obj: Partial<GeometryObject> & Pick<GeometryObject, "id" | "name" | "type">): GeometryObject => ({
  id: obj.id,
  name: obj.name,
  type: obj.type,
  params: obj.params ?? {},
  transform: obj.transform ?? {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  },
  visible: obj.visible ?? true,
  material: obj.material ?? { color: 0x8aa4ff, opacity: 1 },
  group: obj.group,
});

const sceneDoc = (
  id: string,
  title: string,
  objects: GeometryObject[],
  metadata?: Record<string, string | number | boolean | null>,
  extensions?: Record<string, unknown>
): SceneDocument => {
  const now = 1_717_000_000_000;
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    objects,
    metadata,
    extensions,
  };
};

const derivedConstructionExtension = (entries: unknown[]) => ({
  "math3d.geometry.derivedConstructions.v1": entries,
});

const dashedLine = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  count = 18
) =>
  Array.from({ length: count }, (_, index) => {
    const t0 = index / count;
    const t1 = Math.min(1, t0 + 0.52 / count);
    return [
      {
        x: a.x + (b.x - a.x) * t0,
        y: a.y + (b.y - a.y) * t0,
        z: a.z + (b.z - a.z) * t0,
      },
      {
        x: a.x + (b.x - a.x) * t1,
        y: a.y + (b.y - a.y) * t1,
        z: a.z + (b.z - a.z) * t1,
      },
    ];
  });

const torusLinePlaneConstructions = () => {
  const sourceObjectId = "torus-line-plane-source";
  const createdAt = 1_717_000_100_000;
  const lineAStart = { x: -2.25, y: 0, z: 0 };
  const lineAEnd = { x: 2.25, y: 0, z: 0 };
  const lineBStart = { x: 0, y: -2.25, z: 0 };
  const lineBEnd = { x: 0, y: 2.25, z: 0 };
  const edgeA0 = { x: 0.76, y: 0, z: 0 };
  const edgeA1 = { x: 1.44, y: 0, z: 0 };
  const edgeB0 = { x: 0, y: 0.76, z: 0 };
  const edgeB1 = { x: 0, y: 1.44, z: 0 };
  const planeLines = [
    [{ x: -2, y: -2, z: 0 }, { x: 2, y: -2, z: 0 }],
    [{ x: 2, y: -2, z: 0 }, { x: 2, y: 2, z: 0 }],
    [{ x: 2, y: 2, z: 0 }, { x: -2, y: 2, z: 0 }],
    [{ x: -2, y: 2, z: 0 }, { x: -2, y: -2, z: 0 }],
    [{ x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
    [{ x: 0, y: -2, z: 0 }, { x: 0, y: 2, z: 0 }],
  ];
  return [
    {
      id: "torus-plane-line-a",
      type: "edge-line-through-two-vertices",
      name: "Line A - extended torus edge",
      sourceKind: "edge",
      sourceObjectId,
      sourceEdgeVertexPair: [0, 1],
      sourcePoint: { x: 1.1, y: 0, z: 0 },
      params: { lineMode: "infinite", length: 4.5 },
      sourceRevision: 0,
      sourceTopologySignature: null,
      sourceEdgeSignature: {
        midpoint: { x: 1.1, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        length: 0.68,
      },
      selectedEdgeRef: { objectId: sourceObjectId, edgeVertexPair: [0, 1], a: edgeA0, b: edgeA1 },
      frozenSnapshot: {
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        groups: [
          { lines: dashedLine(lineAStart, lineAEnd), color: 0xfacc15, opacity: 0.68, radiusScale: 3 },
          { lines: [[edgeA0, edgeA1]], color: 0x67e8f9, opacity: 0.42, radiusScale: 8.4 },
          { lines: [[edgeA0, edgeA1]], color: 0x06b6d4, opacity: 1, radiusScale: 5 },
        ],
        pointSets: [{ points: [lineAStart, lineAEnd], color: 0xfacc15, size: 0.13, opacity: 1 }],
        labelSets: [{ size: 0.9, labels: [{ text: "Line A", position: { x: 2.32, y: 0.06, z: 0.06 }, color: 0x0f172a }] }],
      },
      frozenAt: createdAt,
      dependent: true,
      visible: true,
      createdAt,
    },
    {
      id: "torus-plane-line-b",
      type: "edge-line-through-two-vertices",
      name: "Line B - extended torus edge",
      sourceKind: "edge",
      sourceObjectId,
      sourceEdgeVertexPair: [120, 121],
      sourcePoint: { x: 0, y: 1.1, z: 0 },
      params: { lineMode: "infinite", length: 4.5 },
      sourceRevision: 0,
      sourceTopologySignature: null,
      sourceEdgeSignature: {
        midpoint: { x: 0, y: 1.1, z: 0 },
        direction: { x: 0, y: 1, z: 0 },
        length: 0.68,
      },
      selectedEdgeRef: { objectId: sourceObjectId, edgeVertexPair: [120, 121], a: edgeB0, b: edgeB1 },
      frozenSnapshot: {
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 1, z: 0 },
        groups: [
          { lines: dashedLine(lineBStart, lineBEnd), color: 0xfacc15, opacity: 0.68, radiusScale: 3 },
          { lines: [[edgeB0, edgeB1]], color: 0x67e8f9, opacity: 0.42, radiusScale: 8.4 },
          { lines: [[edgeB0, edgeB1]], color: 0x06b6d4, opacity: 1, radiusScale: 5 },
        ],
        pointSets: [{ points: [lineBStart, lineBEnd], color: 0xfacc15, size: 0.13, opacity: 1 }],
        labelSets: [{ size: 0.9, labels: [{ text: "Line B", position: { x: 0.06, y: 2.32, z: 0.06 }, color: 0x0f172a }] }],
      },
      frozenAt: createdAt + 1,
      dependent: true,
      visible: true,
      createdAt: createdAt + 1,
    },
    {
      id: "torus-plane-through-lines",
      type: "line-pair-plane-through-lines",
      name: "Plane Through Lines",
      sourceKind: "edge",
      sourceObjectId,
      sourcePoint: { x: 0, y: 0, z: 0 },
      sourceNormal: { x: 0, y: 0, z: 1 },
      sourceRevision: 0,
      sourceTopologySignature: null,
      frozenSnapshot: {
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 0, z: 1 },
        groups: [
          { lines: planeLines, color: 0x2563eb, opacity: 0.82, radiusScale: 1.85 },
          { lines: [[lineAStart, lineAEnd], [lineBStart, lineBEnd]], color: 0x06b6d4, opacity: 0.95, radiusScale: 3.2 },
        ],
        pointSets: [{ points: [{ x: 0, y: 0, z: 0 }], color: 0x2563eb, size: 0.08, opacity: 0.92 }],
        labelSets: [
          {
            size: 0.9,
            labels: [{ text: "Plane Through Lines", position: { x: 0.12, y: 0.12, z: 0.12 }, color: 0x0f172a }],
          },
        ],
      },
      frozenAt: createdAt + 2,
      dependent: true,
      visible: true,
      createdAt: createdAt + 2,
    },
  ];
};

export const GEOMETRY_SCENE_GALLERY: GeometryGallerySceneEntry[] = [
  ...GEOMETRY_DEBUG_SCENE_DOCUMENTS.map((scene, index) => ({
    id: `scene:${scene.id}`,
    title: scene.title,
    category: "Debug Scenes" as const,
    description: GEOMETRY_DEBUG_SCENE_DESCRIPTIONS.get(scene.id) ?? "Saved geometry debug scene.",
    thumbnail: thumb(
      scene.title.replace("Debug: ", ""),
      `${scene.objects?.length ?? 0} objects`,
      ["#2563eb", "#7c3aed", "#ea580c", "#0f766e", "#dc2626"][index % 5]
    ),
    learningGoals: ["Load a repeatable debug state", "Inspect mixed geometry objects"],
    initialScene: scene,
    recommendedPanels: ["scene", "object", "analysis"],
  })),
  {
    id: "scene:cube-transform-workflow",
    title: "Cube transform workflow",
    category: "Construction Basics",
    description: "Simple transform pipeline with baseline cube and duplicated target cube.",
    thumbnail: thumb("Cube transform", "Translate / rotate / scale", "#2563eb"),
    learningGoals: ["Understand transform stack", "Compare pre/post transform state"],
    initialScene: sceneDoc("cube-transform", "Cube transform workflow", [
      baseObject({ id: "cube-base", name: "Cube base", type: "box", params: { width: 1, height: 1, depth: 1 }, material: { color: 0x60a5fa, opacity: 0.95 } }),
      baseObject({ id: "cube-target", name: "Cube target", type: "box", params: { width: 1, height: 1, depth: 1 }, transform: { position: { x: 2.2, y: 0, z: 0 }, rotation: { x: 0.45, y: 0.25, z: 0.1 }, scale: { x: 1.5, y: 0.8, z: 1.1 } }, material: { color: 0x2563eb, opacity: 0.95 } }),
    ]),
    timeline: {
      autoplayIntervalMs: 1800,
      steps: [
        { id: "s1", label: "Select base", note: "Inspect baseline dimensions.", action: { kind: "selectObject", objectName: "Cube base" } },
        { id: "s2", label: "Switch to transform", note: "Open transform controls.", action: { kind: "setPanel", panel: "transform" } },
        { id: "s3", label: "Select target", note: "Inspect final transformed cube.", action: { kind: "selectObject", objectName: "Cube target" } },
      ],
    },
    recommendedPanels: ["create", "transform", "object"],
  },
  {
    id: "scene:face-extrusion",
    title: "Face extrusion",
    category: "Construction Basics",
    description: "Mesh-ready box prepared for face extrusion walkthrough.",
    thumbnail: thumb("Face extrusion", "Probe face then extrude", "#0ea5e9"),
    learningGoals: ["Use face probe mode", "Run controlled extrusion edit"],
    initialScene: sceneDoc("face-extrusion", "Face extrusion", [
      baseObject({ id: "extrude-box", name: "Extrude box", type: "box", params: { width: 1.5, height: 1, depth: 1 }, material: { color: 0x38bdf8, opacity: 0.95 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Select object", note: "Open the box in Object panel.", action: { kind: "selectObject", objectName: "Extrude box" } },
        { id: "s2", label: "Go analysis", note: "Switch to panel with probe tools.", action: { kind: "setPanel", panel: "analysis" } },
      ],
    },
    recommendedPanels: ["object", "analysis"],
  },
  {
    id: "scene:torus-line-plane-construction",
    title: "Torus line-plane construction",
    category: "Construction Basics",
    description: "Torus with two extended construction lines and the plane through them.",
    thumbnail: thumb("Torus lines", "Two lines -> plane", "#2563eb"),
    learningGoals: ["Inspect extended edge lines", "Verify a plane through two intersecting lines"],
    initialScene: sceneDoc(
      "torus-line-plane-construction",
      "Torus line-plane construction",
      [
        baseObject({
          id: "torus-line-plane-source",
          name: "Construction torus",
          type: "torus",
          params: { radius: 1.1, tube: 0.35, radialSegments: 48, tubularSegments: 120 },
          material: { color: 0x4f46e5, opacity: 0.88 },
        }),
      ],
      { scenario: "torus-line-plane-construction" },
      derivedConstructionExtension(torusLinePlaneConstructions())
    ),
    timeline: {
      steps: [
        { id: "open-construct", label: "Open construct", note: "Show the two extended line constructions.", action: { kind: "setPanel", panel: "construct" } },
        { id: "open-analysis", label: "Inspect relation", note: "Use analysis tools to inspect the restored plane.", action: { kind: "setPanel", panel: "analysis" } },
      ],
    },
    recommendedPanels: ["construct", "analysis", "scene"],
  },
  {
    id: "scene:section-plane",
    title: "Section plane",
    category: "Construction Basics",
    description: "Sphere and cylinder setup for section-plane exploration.",
    thumbnail: thumb("Section plane", "Cross-section sweep", "#0891b2"),
    learningGoals: ["Move section plane", "Compare section curves"],
    initialScene: sceneDoc("section-plane", "Section plane", [
      baseObject({ id: "section-sphere", name: "Section sphere", type: "sphere", params: { radius: 1, widthSegments: 24, heightSegments: 18 }, transform: { position: { x: -1.4, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x0ea5e9, opacity: 0.9 } }),
      baseObject({ id: "section-cylinder", name: "Section cylinder", type: "cylinder", params: { radiusTop: 0.9, radiusBottom: 0.9, height: 2.2, radialSegments: 32 }, transform: { position: { x: 1.4, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x0284c7, opacity: 0.9 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Enable section", note: "Open demonstrations panel.", action: { kind: "setPanel", panel: "demonstrations" } },
        { id: "s2", label: "Set XZ plane", note: "Start with central section.", action: { kind: "setSectionPlane", preset: "xz", offset: 0 } },
      ],
    },
    recommendedPanels: ["demonstrations", "analysis"],
  },
  {
    id: "scene:equal-volume-objects",
    title: "Equal-volume objects",
    category: "Measurement",
    description: "Two cylinders arranged for equal-volume checks.",
    thumbnail: thumb("Equal volume", "Compare V(A) and V(B)", "#16a34a"),
    learningGoals: ["Use compare pair", "Read volume metrics"],
    initialScene: sceneDoc("equal-volume", "Equal-volume objects", [
      baseObject({ id: "eqv-a", name: "Volume object A", type: "cylinder", params: { radiusTop: 0.8, radiusBottom: 0.8, height: 2.4 }, transform: { position: { x: -1.8, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x22c55e, opacity: 0.92 } }),
      baseObject({ id: "eqv-b", name: "Volume object B", type: "cylinder", params: { radiusTop: 0.8, radiusBottom: 0.8, height: 2.4 }, transform: { position: { x: 1.8, y: 0, z: 0 }, rotation: { x: 0.1, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x16a34a, opacity: 0.92 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Select pair", note: "Set both objects as compare operands.", action: { kind: "setComparisonPair", objectAName: "Volume object A", objectBName: "Volume object B" } },
        { id: "s2", label: "Inspect", note: "Open analysis compare controls.", action: { kind: "setPanel", panel: "analysis" } },
      ],
    },
    recommendedPanels: ["analysis", "scene"],
  },
  {
    id: "scene:surface-area-comparison",
    title: "Surface-area comparison",
    category: "Measurement",
    description: "Sphere and cube for area comparison under similar extents.",
    thumbnail: thumb("Surface area", "Sphere vs cube", "#22c55e"),
    learningGoals: ["Compare area metrics", "Interpret shape efficiency"],
    initialScene: sceneDoc("surface-area", "Surface-area comparison", [
      baseObject({ id: "area-sphere", name: "Area sphere", type: "sphere", params: { radius: 1, widthSegments: 26, heightSegments: 18 }, transform: { position: { x: -1.7, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x22c55e, opacity: 0.9 } }),
      baseObject({ id: "area-cube", name: "Area cube", type: "box", params: { width: 1.9, height: 1.9, depth: 1.9 }, transform: { position: { x: 1.7, y: 0, z: 0 }, rotation: { x: 0.2, y: 0.35, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x15803d, opacity: 0.9 } }),
    ]),
    recommendedPanels: ["analysis", "object"],
  },
  {
    id: "scene:bounding-dimensions",
    title: "Bounding dimensions",
    category: "Measurement",
    description: "Mixed primitives for bounding-dimension measurements.",
    thumbnail: thumb("Bounding dims", "Width / height / depth", "#65a30d"),
    learningGoals: ["Read bounds quickly", "Compare dimensions between objects"],
    initialScene: sceneDoc("bounding-dimensions", "Bounding dimensions", [
      baseObject({ id: "bbox-torus", name: "Bounds torus", type: "torus", params: { radius: 1.2, tube: 0.35, radialSegments: 24, tubularSegments: 48 }, transform: { position: { x: -1.8, y: 0, z: 0 }, rotation: { x: 1.1, y: 0.2, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x84cc16, opacity: 0.9 } }),
      baseObject({ id: "bbox-cone", name: "Bounds cone", type: "cone", params: { radius: 0.9, height: 2.1, radialSegments: 24 }, transform: { position: { x: 1.8, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x65a30d, opacity: 0.9 } }),
    ]),
    recommendedPanels: ["analysis", "scene"],
  },
  {
    id: "scene:cavalieri-principle",
    title: "Cavalieri principle",
    category: "Mathematical Demonstrations",
    description: "Classic equal-cross-section setup with two solids.",
    thumbnail: thumb("Cavalieri", "A1(h) == A2(h)", "#f97316"),
    learningGoals: ["Visualize equal section areas", "Connect slices to volume equality"],
    initialScene: sceneDoc("cavalieri", "Cavalieri principle", [
      baseObject({ id: "cav-a", name: "Cavalieri solid A", type: "cylinder", params: { radiusTop: 0.85, radiusBottom: 0.85, height: 2.2, radialSegments: 36 }, transform: { position: { x: -1.8, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0xfb923c, opacity: 0.92 } }),
      baseObject({ id: "cav-b", name: "Cavalieri solid B", type: "cylinder", params: { radiusTop: 0.85, radiusBottom: 0.85, height: 2.2, radialSegments: 36 }, transform: { position: { x: 1.8, y: 0, z: 0 }, rotation: { x: 0.3, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0xf97316, opacity: 0.92 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Demo panel", note: "Switch to demonstration category.", action: { kind: "setDemonstrationCategory", category: "cross_sections" } },
        { id: "s2", label: "Compare pair", note: "Set A/B pair for section comparison.", action: { kind: "setComparisonPair", objectAName: "Cavalieri solid A", objectBName: "Cavalieri solid B" } },
      ],
    },
    recommendedPanels: ["demonstrations", "analysis"],
  },
  {
    id: "scene:sphere-section",
    title: "Sphere section",
    category: "Mathematical Demonstrations",
    description: "Sphere setup for r(h)^2 = R^2 - h^2 section identity.",
    thumbnail: thumb("Sphere section", "r(h)^2 = R^2 - h^2", "#ea580c"),
    learningGoals: ["Link section radius and offset", "Validate measured area against formula"],
    initialScene: sceneDoc("sphere-section", "Sphere section", [
      baseObject({ id: "sphere-main", name: "Section sphere", type: "sphere", params: { radius: 1.2, widthSegments: 30, heightSegments: 24 }, material: { color: 0xea580c, opacity: 0.92 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Cross-sections", note: "Open cross-section demonstration.", action: { kind: "setDemonstrationCategory", category: "cross_sections" } },
        { id: "s2", label: "Plane offset", note: "Move section plane away from center.", action: { kind: "setSectionPlane", preset: "xz", offset: 0.35 } },
      ],
    },
    recommendedPanels: ["demonstrations", "analysis"],
  },
  {
    id: "scene:scaling-laws",
    title: "Scaling laws",
    category: "Mathematical Demonstrations",
    description: "Base object for checking L~s, A~s^2, V~s^3.",
    thumbnail: thumb("Scaling laws", "L/A/V ratios", "#dc2626"),
    learningGoals: ["Observe scale exponent behavior", "Use uniform vs non-uniform scale"],
    initialScene: sceneDoc("scaling-laws", "Scaling laws", [
      baseObject({ id: "scale-object", name: "Scaling object", type: "box", params: { width: 1.1, height: 1.3, depth: 0.9 }, material: { color: 0xdc2626, opacity: 0.9 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Open scaling", note: "Switch to scaling demo card.", action: { kind: "setDemonstrationCategory", category: "scaling" } },
        { id: "s2", label: "Select object", note: "Keep object selected before applying scale presets.", action: { kind: "selectObject", objectName: "Scaling object" } },
      ],
    },
    recommendedPanels: ["demonstrations", "transform", "analysis"],
  },
  {
    id: "scene:euler-polyhedron-relation",
    title: "Euler polyhedron relation",
    category: "Mathematical Demonstrations",
    description: "Polyhedron setup for V - E + F checks.",
    thumbnail: thumb("Euler relation", "V - E + F", "#b91c1c"),
    learningGoals: ["Inspect combinatorics", "Verify Euler characteristic"],
    initialScene: sceneDoc("euler-polyhedron", "Euler polyhedron relation", [
      baseObject({ id: "euler-poly", name: "Euler polyhedron", type: "polyhedron", params: { family: "platonic", platonicKind: "cube", smoothNormals: false }, material: { color: 0xb91c1c, opacity: 0.92 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Open Euler", note: "Go to Euler demonstration tools.", action: { kind: "setDemonstrationCategory", category: "polyhedra_topology" } },
        { id: "s2", label: "Select mesh", note: "Ensure target polyhedron is selected.", action: { kind: "selectObject", objectName: "Euler polyhedron" } },
      ],
    },
    recommendedPanels: ["demonstrations", "euler", "analysis"],
  },
  {
    id: "scene:validity-warning-example",
    title: "Validity warning example",
    category: "Geometry to Mesh",
    description: "Thin torus shape likely to trigger quality/readiness warnings after conversion.",
    thumbnail: thumb("Validity warning", "Mesh readiness warning", "#7c3aed"),
    learningGoals: ["Observe readiness checks", "Repair via weld/normals"],
    initialScene: sceneDoc("validity-warning", "Validity warning example", [
      baseObject({ id: "warn-torus", name: "Warning torus", type: "torus", params: { radius: 1.3, tube: 0.07, radialSegments: 10, tubularSegments: 40 }, material: { color: 0x7c3aed, opacity: 0.9 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Select object", note: "Prepare object for mesh promotion.", action: { kind: "selectObject", objectName: "Warning torus" } },
        { id: "s2", label: "Analyze panel", note: "Open mesh readiness checks after conversion.", action: { kind: "setPanel", panel: "analysis" } },
      ],
    },
    recommendedPanels: ["object", "analysis"],
  },
  {
    id: "scene:promotion-example",
    title: "Promotion example",
    category: "Geometry to Mesh",
    description: "Simple object pair for Geometry -> Mesh promotion and traceability check.",
    thumbnail: thumb("Promotion", "Geometry -> Mesh", "#6d28d9"),
    learningGoals: ["Run promotion flow", "Inspect promotion metadata"],
    initialScene: sceneDoc("promotion-example", "Promotion example", [
      baseObject({ id: "promote-a", name: "Promote source", type: "box", params: { width: 1.4, height: 1, depth: 1 }, material: { color: 0x8b5cf6, opacity: 0.94 } }),
      baseObject({ id: "promote-b", name: "Promote comparison", type: "cylinder", params: { radiusTop: 0.5, radiusBottom: 0.5, height: 1.5 }, transform: { position: { x: 1.8, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x6d28d9, opacity: 0.94 } }),
    ]),
    recommendedPanels: ["scene", "analysis"],
  },
  {
    id: "scene:analysis-result",
    title: "Analysis result",
    category: "Geometry to Mesh",
    description: "Prepared pair for quick analysis snapshot and compare metrics.",
    thumbnail: thumb("Analysis result", "Topology + metrics", "#9333ea"),
    learningGoals: ["Generate analysis snapshot", "Read topology summary"],
    initialScene: sceneDoc("analysis-result", "Analysis result", [
      baseObject({ id: "analysis-a", name: "Analysis object A", type: "cone", params: { radius: 0.8, height: 2, radialSegments: 22 }, transform: { position: { x: -1.3, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0xa855f7, opacity: 0.92 } }),
      baseObject({ id: "analysis-b", name: "Analysis object B", type: "sphere", params: { radius: 1, widthSegments: 24, heightSegments: 16 }, transform: { position: { x: 1.3, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x9333ea, opacity: 0.92 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Set compare", note: "Compare A and B in analysis mode.", action: { kind: "setComparisonPair", objectAName: "Analysis object A", objectBName: "Analysis object B" } },
        { id: "s2", label: "Open analyze", note: "Inspect metrics and topology outputs.", action: { kind: "setPanel", panel: "analysis" } },
      ],
    },
    recommendedPanels: ["analysis", "scene"],
  },
  {
    id: "scene:guided-construction",
    title: "Guided construction",
    category: "Workbook Examples",
    description: "Starter geometry for a guided build + annotation workflow.",
    thumbnail: thumb("Guided construction", "Workbook-ready scene", "#0f766e"),
    learningGoals: ["Follow staged build", "Use scene + construct tabs"],
    initialScene: sceneDoc("guided-construction", "Guided construction", [
      baseObject({ id: "guide-base", name: "Guide base", type: "box", params: { width: 1.6, height: 0.2, depth: 1.1 }, transform: { position: { x: 0, y: -0.8, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x0f766e, opacity: 0.95 } }),
      baseObject({ id: "guide-post", name: "Guide post", type: "cylinder", params: { radiusTop: 0.15, radiusBottom: 0.15, height: 1.7, radialSegments: 20 }, transform: { position: { x: -0.45, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x115e59, opacity: 0.95 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Open construct", note: "Switch to construct tab for helper creation.", action: { kind: "setPanel", panel: "construct" } },
        { id: "s2", label: "Inspect anchor", note: "Select post as reference element.", action: { kind: "selectObject", objectName: "Guide post" } },
      ],
    },
    recommendedPanels: ["construct", "scene", "analysis"],
  },
  {
    id: "scene:validated-student-task",
    title: "Validated student task",
    category: "Workbook Examples",
    description: "Scene seed for a student task that can be measured and validated.",
    thumbnail: thumb("Student task", "Measure + validate", "#0d9488"),
    learningGoals: ["Measure key entities", "Validate expected relation"],
    initialScene: sceneDoc("validated-student-task", "Validated student task", [
      baseObject({ id: "task-left", name: "Task object left", type: "cone", params: { radius: 0.55, height: 1.4, radialSegments: 18 }, transform: { position: { x: -1.2, y: 0, z: 0 }, rotation: { x: 0, y: 0.2, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x14b8a6, opacity: 0.93 } }),
      baseObject({ id: "task-right", name: "Task object right", type: "cone", params: { radius: 0.55, height: 1.4, radialSegments: 18 }, transform: { position: { x: 1.2, y: 0, z: 0 }, rotation: { x: 0, y: -0.2, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x0d9488, opacity: 0.93 } }),
    ]),
    timeline: {
      steps: [
        { id: "s1", label: "Set compare", note: "Create comparison pair for measurements.", action: { kind: "setComparisonPair", objectAName: "Task object left", objectBName: "Task object right" } },
        { id: "s2", label: "Open analysis", note: "Use probe and stats for validation.", action: { kind: "setPanel", panel: "analysis" } },
      ],
    },
    recommendedPanels: ["analysis", "scene", "object"],
  },
  {
    id: "scene:release-smoke-basic-primitives",
    title: "Release smoke: basic primitives",
    category: "Release Smoke",
    description: "Release-gate scene for primitive rendering, selection, and inspector synchronization.",
    thumbnail: thumb("Release smoke", "Basic primitives", "#2563eb"),
    learningGoals: ["Verify primitive rendering", "Verify scene/object selection synchronization"],
    initialScene: sceneDoc("release-smoke-basic-primitives", "Release smoke: basic primitives", [
      baseObject({ id: "smoke-box", name: "Smoke box", type: "box", params: { width: 1, height: 1, depth: 1 }, transform: { position: { x: -2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }),
      baseObject({ id: "smoke-sphere", name: "Smoke sphere", type: "sphere", params: { radius: 0.7 }, material: { color: 0x22c55e, opacity: 0.95 } }),
      baseObject({ id: "smoke-cylinder", name: "Smoke cylinder", type: "cylinder", params: { radiusTop: 0.6, radiusBottom: 0.6, height: 1.5 }, transform: { position: { x: 2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0xf97316, opacity: 0.95 } }),
    ], { releaseSmoke: true, scenario: "basic-primitives" }),
    recommendedPanels: ["scene", "object"],
  },
  {
    id: "scene:release-smoke-dependency-tree",
    title: "Release smoke: dependency tree",
    category: "Release Smoke",
    description: "Release-gate source scene for dependency-tree and downstream-update checks.",
    thumbnail: thumb("Release smoke", "Dependency tree", "#7c3aed"),
    learningGoals: ["Inspect dependency ordering", "Verify safe downstream updates"],
    initialScene: sceneDoc("release-smoke-dependency-tree", "Release smoke: dependency tree", [
      baseObject({ id: "dependency-source-a", name: "Dependency source A", type: "box", transform: { position: { x: -1.2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }),
      baseObject({ id: "dependency-source-b", name: "Dependency source B", type: "sphere", transform: { position: { x: 1.2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x7c3aed, opacity: 0.95 } }),
    ], { releaseSmoke: true, scenario: "dependency-tree" }),
    recommendedPanels: ["construct", "history"],
  },
  {
    id: "scene:release-smoke-construction-history",
    title: "Release smoke: construction history",
    category: "Release Smoke",
    description: "Release-gate scene for history navigation and selected-object refresh.",
    thumbnail: thumb("Release smoke", "Construction history", "#0f766e"),
    learningGoals: ["Verify history navigation", "Verify selected-object refresh"],
    initialScene: sceneDoc("release-smoke-construction-history", "Release smoke: construction history", [
      baseObject({ id: "history-base", name: "History base", type: "box" }),
      baseObject({ id: "history-target", name: "History target", type: "cone", transform: { position: { x: 2, y: 0, z: 0 }, rotation: { x: 0, y: 0.35, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0x0f766e, opacity: 0.95 } }),
    ], { releaseSmoke: true, scenario: "construction-history" }),
    timeline: {
      steps: [
        { id: "select-base", label: "Select base", note: "Establish initial selected object.", action: { kind: "selectObject", objectName: "History base" } },
        { id: "open-history", label: "Open history", note: "Inspect construction history.", action: { kind: "setPanel", panel: "history" } },
        { id: "select-target", label: "Select target", note: "Verify inspector refresh.", action: { kind: "selectObject", objectName: "History target" } },
      ],
    },
    recommendedPanels: ["history", "object"],
  },
  {
    id: "scene:release-smoke-extension-subset",
    title: "Release smoke: extension subset",
    category: "Release Smoke",
    description: "Release-gate scene for the supported extension subset and experimental-state labeling.",
    thumbnail: thumb("Release smoke", "Extension subset", "#9333ea"),
    learningGoals: ["Verify supported extension actions", "Verify unfinished actions are not presented as stable"],
    initialScene: sceneDoc("release-smoke-extension-subset", "Release smoke: extension subset", [
      baseObject({ id: "extension-source", name: "Extension source", type: "torus", params: { radius: 1, tube: 0.25, radialSegments: 20, tubularSegments: 36 }, material: { color: 0x9333ea, opacity: 0.95 } }),
    ], { releaseSmoke: true, scenario: "extension-subset" }),
    recommendedPanels: ["object", "analysis"],
  },
  {
    id: "scene:release-smoke-delete-recompute",
    title: "Release smoke: deletion and recompute",
    category: "Release Smoke",
    description: "Release-gate scene for safe deletion, stale dependencies, and recomputation refresh.",
    thumbnail: thumb("Release smoke", "Delete and recompute", "#dc2626"),
    learningGoals: ["Verify safe source deletion", "Verify recomputation refresh"],
    initialScene: sceneDoc("release-smoke-delete-recompute", "Release smoke: deletion and recompute", [
      baseObject({ id: "recompute-source", name: "Recompute source", type: "sphere", transform: { position: { x: -1.2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, material: { color: 0xdc2626, opacity: 0.95 } }),
      baseObject({ id: "recompute-dependent", name: "Recompute dependent", type: "box", transform: { position: { x: 1.2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }),
    ], { releaseSmoke: true, scenario: "delete-recompute" }),
    timeline: {
      steps: [
        { id: "select-source", label: "Select source", note: "Select the source before deletion.", action: { kind: "selectObject", objectName: "Recompute source" } },
        { id: "open-scene", label: "Open scene", note: "Delete source and inspect dependent state.", action: { kind: "setPanel", panel: "scene" } },
        { id: "open-history", label: "Open history", note: "Restore or recreate source and verify refresh.", action: { kind: "setPanel", panel: "history" } },
      ],
    },
    recommendedPanels: ["scene", "history", "object"],
  },
];

export const GEOMETRY_SCENE_GALLERY_BY_ID = new Map(GEOMETRY_SCENE_GALLERY.map((entry) => [entry.id, entry] as const));

export const GEOMETRY_SCENE_GALLERY_CATEGORY_ORDER: GeometrySceneGalleryCategory[] = [
  "Debug Scenes",
  "Release Smoke",
  "Construction Basics",
  "Measurement",
  "Mathematical Demonstrations",
  "Geometry to Mesh",
  "Workbook Examples",
];
