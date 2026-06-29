import type { GeometryObject, SceneDocument } from "@math3d/core";

type DebugScenePreset = {
  id: string;
  title: string;
  description: string;
  objects: GeometryObject[];
};

const NOW = 1_717_000_000_000;

const object = (
  id: string,
  name: string,
  type: GeometryObject["type"],
  position: [number, number, number],
  color: number,
  params: GeometryObject["params"] = {},
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1]
): GeometryObject => ({
  id,
  name,
  type,
  params,
  transform: {
    position: { x: position[0], y: position[1], z: position[2] },
    rotation: { x: rotation[0], y: rotation[1], z: rotation[2] },
    scale: { x: scale[0], y: scale[1], z: scale[2] },
  },
  visible: true,
  material: { color, opacity: 0.94 },
  group: "debug-scene",
});

const presets: DebugScenePreset[] = [
  {
    id: "debug-primitive-lineup",
    title: "Debug: primitive lineup",
    description: "Eight common solids arranged for fast rendering, selection, and inspector checks.",
    objects: [
      object("debug-lineup-box", "Blue box", "box", [-3, 0, -1.4], 0x2563eb, { width: 1.2, height: 1.2, depth: 1.2 }),
      object("debug-lineup-sphere", "Green sphere", "sphere", [-1, 0, -1.4], 0x16a34a, { radius: 0.75, widthSegments: 24, heightSegments: 16 }),
      object("debug-lineup-cylinder", "Orange cylinder", "cylinder", [1, 0, -1.4], 0xf97316, { radiusTop: 0.65, radiusBottom: 0.65, height: 1.6, radialSegments: 24 }),
      object("debug-lineup-cone", "Red cone", "cone", [3, 0, -1.4], 0xdc2626, { radius: 0.75, height: 1.7, radialSegments: 24 }),
      object("debug-lineup-torus", "Purple torus", "torus", [-3, 0, 1.4], 0x7c3aed, { radius: 0.75, tube: 0.24, radialSegments: 18, tubularSegments: 36 }, [Math.PI / 2, 0, 0]),
      object("debug-lineup-prism", "Hexagonal prism", "polyhedron", [-1, 0, 1.4], 0x0891b2, { family: "prism", n: 6, radius: 0.75, height: 1.5 }),
      object("debug-lineup-pyramid", "Square pyramid", "polyhedron", [1, 0, 1.4], 0xd97706, { family: "pyramid", n: 4, radius: 0.85, height: 1.6 }),
      object("debug-lineup-dodeca", "Dodecahedron", "polyhedron", [3, 0, 1.4], 0x0f766e, { family: "platonic", kind: "dodeca", radius: 0.8 }),
    ],
  },
  {
    id: "debug-polyhedron-lab",
    title: "Debug: polyhedron lab",
    description: "Nine polyhedron families for topology, edge display, and parameter debugging.",
    objects: [
      object("debug-poly-tetra", "Tetrahedron", "polyhedron", [-3, 0, -1.5], 0xef4444, { family: "platonic", kind: "tetra", radius: 0.8 }),
      object("debug-poly-cube", "Platonic cube", "polyhedron", [-1.5, 0, -1.5], 0xf97316, { family: "platonic", kind: "cube", radius: 0.8 }),
      object("debug-poly-octa", "Octahedron", "polyhedron", [0, 0, -1.5], 0xeab308, { family: "platonic", kind: "octa", radius: 0.8 }),
      object("debug-poly-dodeca", "Dodecahedron", "polyhedron", [1.5, 0, -1.5], 0x22c55e, { family: "platonic", kind: "dodeca", radius: 0.8 }),
      object("debug-poly-icosa", "Icosahedron", "polyhedron", [3, 0, -1.5], 0x06b6d4, { family: "platonic", kind: "icosa", radius: 0.8 }),
      object("debug-poly-prism", "Pentagonal prism", "polyhedron", [-2.25, 0, 1.3], 0x3b82f6, { family: "prism", n: 5, radius: 0.75, height: 1.5 }),
      object("debug-poly-pyramid", "Hexagonal pyramid", "polyhedron", [-0.75, 0, 1.3], 0x6366f1, { family: "pyramid", n: 6, radius: 0.8, height: 1.6 }),
      object("debug-poly-frustum", "Twisted frustum", "polyhedron", [0.75, 0, 1.3], 0x8b5cf6, { family: "frustum", n: 6, radius: 0.8, topRadius: 0.45, height: 1.5, twistAngle: 25 }),
      object("debug-poly-antiprism", "Antiprism", "polyhedron", [2.25, 0, 1.3], 0xec4899, { family: "antiprism", n: 6, radius: 0.78, height: 1.5 }),
    ],
  },
  {
    id: "debug-stacked-towers",
    title: "Debug: stacked towers",
    description: "Ten vertically stacked solids for depth, overlap, and transform debugging.",
    objects: [
      object("debug-tower-base-a", "Tower A base", "box", [-2, -1.35, 0], 0x1d4ed8, { width: 1.5, height: 0.35, depth: 1.5 }),
      object("debug-tower-body-a", "Tower A cylinder", "cylinder", [-2, -0.35, 0], 0x3b82f6, { radiusTop: 0.55, radiusBottom: 0.65, height: 1.65, radialSegments: 24 }),
      object("debug-tower-cap-a", "Tower A cone", "cone", [-2, 0.85, 0], 0x60a5fa, { radius: 0.72, height: 0.9, radialSegments: 24 }),
      object("debug-tower-ring-a", "Tower A ring", "torus", [-2, -1.05, 0], 0x93c5fd, { radius: 0.65, tube: 0.11, radialSegments: 16, tubularSegments: 32 }, [Math.PI / 2, 0, 0]),
      object("debug-tower-orb-a", "Tower A orb", "sphere", [-2, 1.45, 0], 0xbfdbfe, { radius: 0.32 }),
      object("debug-tower-base-b", "Tower B base", "polyhedron", [2, -1.2, 0], 0x9a3412, { family: "prism", n: 6, radius: 0.95, height: 0.45 }),
      object("debug-tower-body-b", "Tower B box", "box", [2, -0.25, 0], 0xea580c, { width: 1.15, height: 1.45, depth: 1.15 }, [0, 0.3, 0]),
      object("debug-tower-cap-b", "Tower B pyramid", "polyhedron", [2, 0.95, 0], 0xf97316, { family: "pyramid", n: 4, radius: 0.9, height: 1.0 }, [0, Math.PI / 4, 0]),
      object("debug-tower-ring-b", "Tower B ring", "torus", [2, -0.9, 0], 0xfb923c, { radius: 0.68, tube: 0.12, radialSegments: 16, tubularSegments: 32 }, [Math.PI / 2, 0, 0]),
      object("debug-tower-orb-b", "Tower B orb", "sphere", [2, 1.6, 0], 0xfed7aa, { radius: 0.32 }),
    ],
  },
  {
    id: "debug-transform-grid",
    title: "Debug: transform grid",
    description: "Twelve repeated objects with varied rotation and scale for transform and picking checks.",
    objects: [
      object("debug-grid-box-1", "Grid box 1", "box", [-3, -0.6, -2], 0x2563eb, { width: 1, height: 1, depth: 1 }, [0, 0.15, 0], [0.7, 1.2, 0.7]),
      object("debug-grid-cone-1", "Grid cone 1", "cone", [-1, -0.6, -2], 0x7c3aed, { radius: 0.65, height: 1.5 }, [0.15, 0, 0.1]),
      object("debug-grid-prism-1", "Grid prism 1", "polyhedron", [1, -0.6, -2], 0x0891b2, { family: "prism", n: 5, radius: 0.7, height: 1.4 }, [0, 0.25, 0]),
      object("debug-grid-sphere-1", "Grid sphere 1", "sphere", [3, -0.6, -2], 0x16a34a, { radius: 0.7 }, [0, 0, 0], [1.2, 0.75, 0.9]),
      object("debug-grid-cylinder-1", "Grid cylinder 1", "cylinder", [-3, -0.6, 0], 0xea580c, { radiusTop: 0.55, radiusBottom: 0.75, height: 1.5 }, [0.15, 0, 0.2]),
      object("debug-grid-torus-1", "Grid torus 1", "torus", [-1, -0.6, 0], 0xdb2777, { radius: 0.7, tube: 0.2 }, [Math.PI / 2, 0.25, 0]),
      object("debug-grid-box-2", "Grid box 2", "box", [1, -0.6, 0], 0x4f46e5, { width: 1.1, height: 1.1, depth: 1.1 }, [0.2, 0.45, 0.15]),
      object("debug-grid-pyramid-1", "Grid pyramid 1", "polyhedron", [3, -0.6, 0], 0xca8a04, { family: "pyramid", n: 5, radius: 0.78, height: 1.5 }, [0, 0.35, 0]),
      object("debug-grid-sphere-2", "Grid sphere 2", "sphere", [-3, -0.6, 2], 0x0d9488, { radius: 0.7 }, [0, 0, 0], [0.75, 1.25, 0.9]),
      object("debug-grid-cone-2", "Grid cone 2", "cone", [-1, -0.6, 2], 0xdc2626, { radius: 0.72, height: 1.55 }, [-0.15, 0.2, -0.1]),
      object("debug-grid-frustum-1", "Grid frustum 1", "polyhedron", [1, -0.6, 2], 0x9333ea, { family: "frustum", n: 6, radius: 0.78, topRadius: 0.4, height: 1.45, twistAngle: 18 }),
      object("debug-grid-cylinder-2", "Grid cylinder 2", "cylinder", [3, -0.6, 2], 0x0284c7, { radiusTop: 0.72, radiusBottom: 0.52, height: 1.55 }, [-0.12, 0, 0.18]),
    ],
  },
  {
    id: "debug-section-comparison",
    title: "Debug: section comparison",
    description: "Seven translucent solids aligned for section-plane and measurement comparisons.",
    objects: [
      object("debug-section-sphere", "Section sphere", "sphere", [-3, 0, 0], 0x2563eb, { radius: 0.9, widthSegments: 28, heightSegments: 20 }),
      object("debug-section-cylinder", "Section cylinder", "cylinder", [-2, 0, 0], 0x0891b2, { radiusTop: 0.75, radiusBottom: 0.75, height: 1.8, radialSegments: 28 }),
      object("debug-section-cone", "Section cone", "cone", [-1, 0, 0], 0x16a34a, { radius: 0.85, height: 1.8, radialSegments: 28 }),
      object("debug-section-box", "Section box", "box", [0, 0, 0], 0xeab308, { width: 1.45, height: 1.45, depth: 1.45 }, [0.15, 0.3, 0]),
      object("debug-section-prism", "Section prism", "polyhedron", [1, 0, 0], 0xf97316, { family: "prism", n: 6, radius: 0.82, height: 1.7 }),
      object("debug-section-pyramid", "Section pyramid", "polyhedron", [2, 0, 0], 0xdc2626, { family: "pyramid", n: 5, radius: 0.9, height: 1.8 }),
      object("debug-section-torus", "Section torus", "torus", [3, 0, 0], 0x9333ea, { radius: 0.72, tube: 0.25, radialSegments: 22, tubularSegments: 40 }, [Math.PI / 2, 0, 0]),
    ],
  },
];

export const GEOMETRY_DEBUG_SCENE_DOCUMENTS: SceneDocument[] = presets.map((preset) => ({
  id: preset.id,
  title: preset.title,
  createdAt: NOW,
  updatedAt: NOW,
  objects: preset.objects,
  metadata: {
    debugScene: true,
    objectCount: preset.objects.length,
    description: preset.description,
  },
}));

export const GEOMETRY_DEBUG_SCENE_DESCRIPTIONS = new Map(
  presets.map((preset) => [preset.id, preset.description] as const)
);
