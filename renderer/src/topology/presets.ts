import type { FundamentalDiagram, Orientation } from "./types";

type PolygonInput = {
  id: string;
  name: string;
  description: string;
  vertices: Array<{ id: string; x: number; y: number; label?: string }>;
  boundary: Array<{
    edgeId: string;
    from: string;
    to: string;
    label: string;
    orientation: Orientation;
    pairings?: string[];
    direction?: Orientation;
  }>;
  boundaryWord?: string;
};

const makeSingleFaceDiagram = (input: PolygonInput): FundamentalDiagram => {
  const faceId = "f0";
  const edgeOrientations: FundamentalDiagram["edgeOrientations"] = {};
  const edgeLabels: FundamentalDiagram["edgeLabels"] = {};
  const edgePairings: FundamentalDiagram["edgePairings"] = {};
  const vertexLabels: FundamentalDiagram["vertexLabels"] = {};

  for (const vertex of input.vertices) vertexLabels[vertex.id] = vertex.label ?? vertex.id;
  for (const edge of input.boundary) {
    edgeOrientations[edge.edgeId] = edge.orientation;
    edgeLabels[edge.edgeId] = edge.label;
    edgePairings[edge.edgeId] = edge.pairings ? [...edge.pairings] : [];
  }

  return {
    id: input.id,
    name: input.name,
    vertices: input.vertices.map((entry) => ({ id: entry.id, x: entry.x, y: entry.y })),
    edges: input.boundary.map((entry) => ({ id: entry.edgeId, from: entry.from, to: entry.to })),
    faces: [
      {
        id: faceId,
        boundary: input.boundary.map((edge) => ({
          edgeId: edge.edgeId,
          direction: edge.direction ?? 1,
        })),
      },
    ],
    edgeOrientations,
    edgeLabels,
    edgePairings,
    vertexLabels,
    faceBoundaryWords: { [faceId]: input.boundaryWord ?? input.boundary.map((edge) => edge.label).join(" ") },
    metadata: {
      description: input.description,
    },
  };
};

export type TopologyPreset = {
  id: string;
  label: string;
  summary: string;
  buildDiagram: () => FundamentalDiagram;
};

const PRESETS: TopologyPreset[] = [
  {
    id: "dunce_cap",
    label: "Dunce cap",
    summary: "Triangle with all three edges identified into one class (flagship example).",
    buildDiagram: () =>
      makeSingleFaceDiagram({
        id: "preset/dunce-cap",
        name: "Dunce cap",
        description: "Canonical dunce cap model with a a a boundary identification.",
        vertices: [
          { id: "v0", x: -1.1, y: 0.86, label: "A" },
          { id: "v1", x: 1.1, y: 0.86, label: "B" },
          { id: "v2", x: 0, y: -1.05, label: "C" },
        ],
        boundary: [
          { edgeId: "e0", from: "v0", to: "v1", label: "a", orientation: 1, pairings: ["e1", "e2"] },
          { edgeId: "e1", from: "v1", to: "v2", label: "a", orientation: 1, pairings: ["e0", "e2"] },
          { edgeId: "e2", from: "v2", to: "v0", label: "a", orientation: 1, pairings: ["e0", "e1"] },
        ],
        boundaryWord: "a a a",
      }),
  },
  {
    id: "mobius_from_rectangle",
    label: "Möbius band from rectangle",
    summary: "Rectangle with one opposite edge pair identified with reversal.",
    buildDiagram: () =>
      makeSingleFaceDiagram({
        id: "preset/mobius-rectangle",
        name: "Möbius band from rectangle",
        description: "One pair identified with reversed orientation, two boundary edges left open.",
        vertices: [
          { id: "v0", x: -1.2, y: 0.75 },
          { id: "v1", x: 1.2, y: 0.75 },
          { id: "v2", x: 1.2, y: -0.75 },
          { id: "v3", x: -1.2, y: -0.75 },
        ],
        boundary: [
          { edgeId: "e0", from: "v0", to: "v1", label: "b", orientation: 1 },
          { edgeId: "e1", from: "v1", to: "v2", label: "a", orientation: 1, pairings: ["e3"] },
          { edgeId: "e2", from: "v2", to: "v3", label: "c", orientation: 1 },
          { edgeId: "e3", from: "v3", to: "v0", label: "a", orientation: -1, pairings: ["e1"] },
        ],
        boundaryWord: "b a c a^-1",
      }),
  },
  {
    id: "projective_plane",
    label: "Projective plane model",
    summary: "Square model where opposite edges are identified in matching orientation.",
    buildDiagram: () =>
      makeSingleFaceDiagram({
        id: "preset/projective-plane",
        name: "Projective plane model",
        description: "Classical square model with matching-orientation opposite edge identification.",
        vertices: [
          { id: "v0", x: -1.15, y: 0.9 },
          { id: "v1", x: 1.15, y: 0.9 },
          { id: "v2", x: 1.15, y: -0.9 },
          { id: "v3", x: -1.15, y: -0.9 },
        ],
        boundary: [
          { edgeId: "e0", from: "v0", to: "v1", label: "a", orientation: 1, pairings: ["e2"] },
          { edgeId: "e1", from: "v1", to: "v2", label: "b", orientation: 1, pairings: ["e3"] },
          { edgeId: "e2", from: "v2", to: "v3", label: "a", orientation: 1, pairings: ["e0"] },
          { edgeId: "e3", from: "v3", to: "v0", label: "b", orientation: 1, pairings: ["e1"] },
        ],
        boundaryWord: "a b a b",
      }),
  },
  {
    id: "torus_square",
    label: "Torus square",
    summary: "Square with opposite edges paired in reversed boundary direction.",
    buildDiagram: () =>
      makeSingleFaceDiagram({
        id: "preset/torus-square",
        name: "Torus square",
        description: "Square quotient model for the torus.",
        vertices: [
          { id: "v0", x: -1.1, y: 0.85 },
          { id: "v1", x: 1.1, y: 0.85 },
          { id: "v2", x: 1.1, y: -0.85 },
          { id: "v3", x: -1.1, y: -0.85 },
        ],
        boundary: [
          { edgeId: "e0", from: "v0", to: "v1", label: "a", orientation: 1, pairings: ["e2"] },
          { edgeId: "e1", from: "v1", to: "v2", label: "b", orientation: 1, pairings: ["e3"] },
          { edgeId: "e2", from: "v3", to: "v2", label: "a", orientation: -1, pairings: ["e0"] },
          { edgeId: "e3", from: "v0", to: "v3", label: "b", orientation: -1, pairings: ["e1"] },
        ],
        boundaryWord: "a b a^-1 b^-1",
      }),
  },
  {
    id: "klein_bottle_square",
    label: "Klein bottle square",
    summary: "Square model with one opposite pair reversed and the other matched.",
    buildDiagram: () =>
      makeSingleFaceDiagram({
        id: "preset/klein-bottle-square",
        name: "Klein bottle square",
        description: "Classical square model for the Klein bottle quotient.",
        vertices: [
          { id: "v0", x: -1.1, y: 0.85 },
          { id: "v1", x: 1.1, y: 0.85 },
          { id: "v2", x: 1.1, y: -0.85 },
          { id: "v3", x: -1.1, y: -0.85 },
        ],
        boundary: [
          { edgeId: "e0", from: "v0", to: "v1", label: "a", orientation: 1, pairings: ["e2"] },
          { edgeId: "e1", from: "v1", to: "v2", label: "b", orientation: 1, pairings: ["e3"] },
          { edgeId: "e2", from: "v3", to: "v2", label: "a", orientation: -1, pairings: ["e0"] },
          { edgeId: "e3", from: "v3", to: "v0", label: "b", orientation: 1, pairings: ["e1"] },
        ],
        boundaryWord: "a b a^-1 b",
      }),
  },
  {
    id: "cone",
    label: "Cone",
    summary: "Disk-like triangle boundary collapsed to one class.",
    buildDiagram: () =>
      makeSingleFaceDiagram({
        id: "preset/cone",
        name: "Cone from triangle contraction",
        description: "Simple cone-like quotient where boundary edges collapse into one class.",
        vertices: [
          { id: "v0", x: -1, y: 0.82 },
          { id: "v1", x: 1, y: 0.82 },
          { id: "v2", x: 0, y: -1 },
        ],
        boundary: [
          { edgeId: "e0", from: "v0", to: "v1", label: "c", orientation: 1, pairings: ["e1", "e2"] },
          { edgeId: "e1", from: "v1", to: "v2", label: "c", orientation: 1, pairings: ["e0", "e2"] },
          { edgeId: "e2", from: "v2", to: "v0", label: "c", orientation: 1, pairings: ["e0", "e1"] },
        ],
        boundaryWord: "c c c",
      }),
  },
  {
    id: "suspension",
    label: "Suspension",
    summary: "Quadrilateral placeholder suspension-style quotient diagram.",
    buildDiagram: () =>
      makeSingleFaceDiagram({
        id: "preset/suspension",
        name: "Suspension model",
        description: "Starter suspension-like model for experimentation.",
        vertices: [
          { id: "v0", x: 0, y: 1.05 },
          { id: "v1", x: 1.1, y: 0 },
          { id: "v2", x: 0, y: -1.05 },
          { id: "v3", x: -1.1, y: 0 },
        ],
        boundary: [
          { edgeId: "e0", from: "v0", to: "v1", label: "a", orientation: 1, pairings: ["e2"] },
          { edgeId: "e1", from: "v1", to: "v2", label: "b", orientation: 1, pairings: ["e3"] },
          { edgeId: "e2", from: "v2", to: "v3", label: "a", orientation: -1, pairings: ["e0"] },
          { edgeId: "e3", from: "v3", to: "v0", label: "b", orientation: -1, pairings: ["e1"] },
        ],
        boundaryWord: "a b a^-1 b^-1",
      }),
  },
  {
    id: "cylinder",
    label: "Cylinder",
    summary: "Rectangle with one opposite side pair identified.",
    buildDiagram: () =>
      makeSingleFaceDiagram({
        id: "preset/cylinder",
        name: "Cylinder from rectangle",
        description: "One pair of opposite edges identified; remaining edges become boundary circles.",
        vertices: [
          { id: "v0", x: -1.2, y: 0.75 },
          { id: "v1", x: 1.2, y: 0.75 },
          { id: "v2", x: 1.2, y: -0.75 },
          { id: "v3", x: -1.2, y: -0.75 },
        ],
        boundary: [
          { edgeId: "e0", from: "v0", to: "v1", label: "u", orientation: 1 },
          { edgeId: "e1", from: "v1", to: "v2", label: "a", orientation: 1, pairings: ["e3"] },
          { edgeId: "e2", from: "v2", to: "v3", label: "v", orientation: 1 },
          { edgeId: "e3", from: "v0", to: "v3", label: "a", orientation: 1, pairings: ["e1"] },
        ],
        boundaryWord: "u a v a^-1",
      }),
  },
  {
    id: "sphere_boundary_contraction",
    label: "Sphere from disk boundary contraction",
    summary: "Disk boundary contracted toward a single vertex class.",
    buildDiagram: () =>
      makeSingleFaceDiagram({
        id: "preset/sphere-boundary-contraction",
        name: "Sphere from disk boundary contraction",
        description: "Starter model for whole-boundary contraction into one class.",
        vertices: [
          { id: "v0", x: -1, y: 0.8 },
          { id: "v1", x: 1, y: 0.8 },
          { id: "v2", x: 0.2, y: -1.0 },
        ],
        boundary: [
          { edgeId: "e0", from: "v0", to: "v1", label: "s", orientation: 1, pairings: ["e1", "e2"] },
          { edgeId: "e1", from: "v1", to: "v2", label: "s", orientation: 1, pairings: ["e0", "e2"] },
          { edgeId: "e2", from: "v2", to: "v0", label: "s", orientation: 1, pairings: ["e0", "e1"] },
        ],
        boundaryWord: "s s s",
      }),
  },
];

export const TOPOLOGY_PRESETS = PRESETS;
export const TOPOLOGY_PRESET_BY_ID = new Map(TOPOLOGY_PRESETS.map((preset) => [preset.id, preset]));
export const DEFAULT_TOPOLOGY_PRESET_ID = TOPOLOGY_PRESETS[0]?.id ?? "dunce_cap";
