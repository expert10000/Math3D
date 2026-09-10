import type { GeometryGalleryRecipe } from "./objectGalleryCatalog";

export type GeometryConstructFamilyId =
  | "primitives"
  | "reference"
  | "curves"
  | "surfaces"
  | "solids"
  | "derived";

export type GeometryConstructParameter = {
  id: "size" | "secondarySize" | "height" | "thickness" | "offset" | "turns" | "segments" | "degree";
  label: string;
  min: number;
  max: number;
  step: number;
};

export type GeometryConstructTool = {
  id: string;
  family: GeometryConstructFamilyId;
  label: string;
  description: string;
  classification: "existing" | "new";
  referenceCount: 0 | 1 | 2;
  constructedKind?: string;
  primitiveRecipe?: GeometryGalleryRecipe;
  legacyTarget?: "points" | "lines" | "planes" | "circles" | "axes" | "bounding";
  parameters?: GeometryConstructParameter[];
};

export type GeometryConstructFamily = {
  id: GeometryConstructFamilyId;
  label: string;
  description: string;
  tools: readonly GeometryConstructTool[];
};

const SIZE: GeometryConstructParameter = { id: "size", label: "Size", min: 0.1, max: 10, step: 0.1 };
const SECONDARY: GeometryConstructParameter = { id: "secondarySize", label: "Secondary", min: 0.05, max: 10, step: 0.05 };
const HEIGHT: GeometryConstructParameter = { id: "height", label: "Height", min: 0.1, max: 20, step: 0.1 };
const THICKNESS: GeometryConstructParameter = { id: "thickness", label: "Thickness", min: 0.005, max: 0.5, step: 0.005 };
const OFFSET: GeometryConstructParameter = { id: "offset", label: "Offset", min: -5, max: 5, step: 0.05 };
const TURNS: GeometryConstructParameter = { id: "turns", label: "Turns", min: 0.25, max: 12, step: 0.25 };
const SEGMENTS: GeometryConstructParameter = { id: "segments", label: "Segments", min: 8, max: 160, step: 1 };
const DEGREE: GeometryConstructParameter = { id: "degree", label: "Degree", min: 1, max: 7, step: 1 };

const existing = (
  id: string,
  label: string,
  description: string,
  legacyTarget: NonNullable<GeometryConstructTool["legacyTarget"]>
): GeometryConstructTool => ({
  id,
  family: "reference",
  label,
  description,
  classification: "existing",
  referenceCount: 0,
  legacyTarget,
});

const generated = (
  family: GeometryConstructFamilyId,
  id: string,
  label: string,
  description: string,
  referenceCount: 0 | 1 | 2,
  parameters: GeometryConstructParameter[]
): GeometryConstructTool => ({
  id,
  family,
  label,
  description,
  classification: "new",
  referenceCount,
  constructedKind: id,
  parameters,
});

const primitive = (
  id: string,
  label: string,
  description: string,
  primitiveRecipe: GeometryGalleryRecipe
): GeometryConstructTool => ({
  id,
  family: "primitives",
  label,
  description,
  classification: "existing",
  referenceCount: 0,
  primitiveRecipe,
});

export const GEOMETRY_EXISTING_REFERENCE_TOOL_IDS = {
  points: [
    "midpoint",
    "face-centroid",
    "vertex-point-marker",
    "vertex-coordinate-label",
    "vertex-normal-endpoint",
    "edge-midpoint",
    "object-centroid",
    "vertex-translated-copy-point",
  ],
  lines: [
    "line-through-objects",
    "angle-bisector",
    "parallel-line-through-object",
    "perpendicular-line-through-object",
    "normal-to-object-at-object",
    "edge-line-through-two-vertices",
    "edge-line-through-midpoint-and-vertex",
    "face-normal-line",
    "face-line-perpendicular-to-plane",
    "edge-direction-vector",
    "edge-perpendicular-bisector-line",
    "edge-parallel-line-through-vertex",
    "edge-equal-length-copied-segment",
  ],
  planes: [
    "through-3-points",
    "through-line-point",
    "through-2-lines",
    "parallel",
    "perpendicular",
    "offset",
    "mid-plane",
    "tangent-plane",
    "symmetry-plane",
    "principal-plane",
    "best-fit-plane",
  ],
  circles: ["circle-center-through-object", "tangent-to-circle-at-object"],
  axes: ["object-principal-axes-preview", "edge-aligned-axis"],
  bounding: ["object-bounding-box", "object-circumscribed-sphere-preview", "object-inscribed-reference-sphere"],
} as const;

const primitiveTools: GeometryConstructTool[] = [
  primitive("primitive-sphere", "Sphere", "Editable sphere from the existing object registry.", { type: "sphere" }),
  primitive("primitive-box", "Box", "Editable box from the existing object registry.", { type: "box" }),
  primitive("primitive-polygon", "Polygon", "Planar polygon primitive.", { type: "polygon" }),
  primitive("primitive-cylinder", "Cylinder", "Editable cylinder primitive.", { type: "cylinder" }),
  primitive("primitive-cone", "Cone", "Editable cone primitive.", { type: "cone" }),
  primitive("primitive-torus", "Torus", "Editable torus primitive.", { type: "torus" }),
  primitive("primitive-plane", "Plane", "Finite reference plane object.", { type: "plane" }),
  primitive("primitive-polyhedron", "Polyhedron", "Platonic and constructive polyhedron families.", { type: "polyhedron" }),
];

const referenceTools: GeometryConstructTool[] = [
  existing("reference-points", "Points", "Midpoints, centroids, markers, coordinates, normal endpoints, and translated points.", "points"),
  existing("reference-lines", "Lines", "Lines, bisectors, parallels, perpendiculars, normals, directions, and copied segments.", "lines"),
  existing("reference-planes", "Planes", "Point, line, face, offset, symmetry, principal, and best-fit plane constructions.", "planes"),
  existing("reference-circles", "Circles", "Center-through-point circles and tangent constructions.", "circles"),
  existing("reference-axes", "Axes", "Principal and edge-aligned axes.", "axes"),
  existing("reference-bounding", "Bounding", "Bounding boxes and inscribed or circumscribed reference spheres.", "bounding"),
];

const curveTools: GeometryConstructTool[] = [
  generated("curves", "curve-polyline", "Polyline", "Piecewise-linear curve through ordered points.", 0, [SIZE, SECONDARY, THICKNESS, SEGMENTS]),
  generated("curves", "curve-interpolation", "Interpolation", "Smooth interpolant through control points.", 0, [SIZE, SECONDARY, THICKNESS, SEGMENTS]),
  generated("curves", "curve-bezier", "Bézier", "Cubic Bézier curve with editable scale.", 0, [SIZE, SECONDARY, THICKNESS, SEGMENTS]),
  generated("curves", "curve-bspline", "B-spline", "Sampled B-spline-style curve with degree metadata.", 0, [SIZE, SECONDARY, DEGREE, THICKNESS, SEGMENTS]),
  generated("curves", "curve-nurbs", "NURBS", "Sampled rational spline curve with degree metadata.", 0, [SIZE, SECONDARY, DEGREE, THICKNESS, SEGMENTS]),
  generated("curves", "curve-helix", "Helix", "Helical curve with radius, height, and turn count.", 0, [SECONDARY, HEIGHT, TURNS, THICKNESS, SEGMENTS]),
  generated("curves", "curve-composite", "Composite", "Joined piecewise curve retained as one scene object.", 0, [SIZE, SECONDARY, THICKNESS, SEGMENTS]),
];

const surfaceTools: GeometryConstructTool[] = [
  generated("surfaces", "surface-ruled", "Ruled", "Surface interpolated between two boundary curves.", 2, [SIZE, SECONDARY, SEGMENTS]),
  generated("surfaces", "surface-extrude", "Extrude", "Surface produced by translating a profile curve.", 1, [SIZE, HEIGHT, SEGMENTS]),
  generated("surfaces", "surface-revolve", "Revolve", "Surface of revolution around an axis.", 1, [SIZE, HEIGHT, SEGMENTS]),
  generated("surfaces", "surface-sweep", "Sweep", "Profile swept along a path.", 2, [SIZE, SECONDARY, SEGMENTS]),
  generated("surfaces", "surface-loft", "Loft", "Surface interpolated through section curves.", 2, [SIZE, HEIGHT, SEGMENTS]),
  generated("surfaces", "surface-bezier", "Bézier", "Tensor-product Bézier-style patch.", 0, [SIZE, SECONDARY, DEGREE, SEGMENTS]),
  generated("surfaces", "surface-bspline", "B-spline", "Sampled B-spline-style surface.", 0, [SIZE, SECONDARY, DEGREE, SEGMENTS]),
  generated("surfaces", "surface-nurbs", "NURBS", "Sampled rational spline surface.", 0, [SIZE, SECONDARY, DEGREE, SEGMENTS]),
  generated("surfaces", "surface-coons", "Coons patch", "Patch interpolating four boundary curves.", 0, [SIZE, SECONDARY, SEGMENTS]),
];

const solidTools: GeometryConstructTool[] = [
  generated("solids", "solid-extrusion", "Extrusion", "Closed profile extruded into a solid.", 1, [SIZE, SECONDARY, HEIGHT, SEGMENTS]),
  generated("solids", "solid-revolution", "Revolution", "Closed profile revolved into a solid.", 1, [SIZE, HEIGHT, SEGMENTS]),
  generated("solids", "solid-sweep", "Sweep", "Closed profile swept along a path.", 2, [SIZE, SECONDARY, SEGMENTS]),
  generated("solids", "solid-loft", "Loft", "Closed solid interpolated through section profiles.", 2, [SIZE, HEIGHT, SEGMENTS]),
];

const derivedTools: GeometryConstructTool[] = [
  generated("derived", "derived-offset", "Offset", "Offset surface or curve retaining source identity.", 1, [SIZE, SECONDARY, OFFSET, SEGMENTS]),
  generated("derived", "derived-projection", "Projection", "Curve projected onto a target plane or surface.", 2, [SIZE, SECONDARY, THICKNESS, SEGMENTS]),
  generated("derived", "derived-intersection", "Intersection", "Intersection curve derived from two sources.", 2, [SIZE, SECONDARY, THICKNESS, SEGMENTS]),
  generated("derived", "derived-boundary", "Boundary", "Boundary curve extracted from a source surface.", 1, [SIZE, SECONDARY, THICKNESS, SEGMENTS]),
  generated("derived", "derived-iso-curve", "Iso-curve", "Constant-parameter curve on a source surface.", 1, [SIZE, SECONDARY, THICKNESS, OFFSET, SEGMENTS]),
  generated("derived", "derived-normal-curve", "Normal curve", "Curve traced from the source normal field.", 1, [SIZE, SECONDARY, THICKNESS, SEGMENTS]),
];

export const GEOMETRY_CONSTRUCT_FAMILIES: readonly GeometryConstructFamily[] = [
  { id: "primitives", label: "Primitives", description: "Existing editable procedural primitives.", tools: primitiveTools },
  { id: "reference", label: "Reference", description: "All existing point, line, plane, circle, axis, and bounding tools.", tools: referenceTools },
  { id: "curves", label: "Curves", description: "Free, interpolated, spline, helical, and composite curves.", tools: curveTools },
  { id: "surfaces", label: "Surfaces", description: "Generated and patch surface constructions.", tools: surfaceTools },
  { id: "solids", label: "Solids", description: "Profile and section driven solids.", tools: solidTools },
  { id: "derived", label: "Derived", description: "Geometry created from one or more existing sources.", tools: derivedTools },
] as const;

export const GEOMETRY_CONSTRUCT_TOOL_BY_ID = new Map(
  GEOMETRY_CONSTRUCT_FAMILIES.flatMap((family) => family.tools).map((tool) => [tool.id, tool] as const)
);

export const DEFAULT_GEOMETRY_CONSTRUCT_PARAMETER_VALUES: Record<GeometryConstructParameter["id"], number> = {
  size: 1.4,
  secondarySize: 0.75,
  height: 1.8,
  thickness: 0.035,
  offset: 0.2,
  turns: 2.5,
  segments: 48,
  degree: 3,
};

export const buildGeometryConstructRecipe = (
  tool: GeometryConstructTool,
  parameters: Partial<Record<GeometryConstructParameter["id"], number>>,
  sourceObjectIds: readonly string[],
  authoringSource = "professional-construct"
): GeometryGalleryRecipe | null => {
  if (tool.primitiveRecipe) {
    return {
      ...tool.primitiveRecipe,
      name: tool.primitiveRecipe.name ?? tool.label,
      params: { ...(tool.primitiveRecipe.params ?? {}) },
    };
  }
  if (!tool.constructedKind || tool.legacyTarget) return null;
  return {
    type: "constructed",
    name: tool.label,
    params: {
      constructionKind: tool.constructedKind,
      constructionFamily: tool.family,
      authoringSource,
      sourceObjectIds: sourceObjectIds.join(","),
      ...DEFAULT_GEOMETRY_CONSTRUCT_PARAMETER_VALUES,
      ...parameters,
    },
  };
};

export const geometryConstructSourcesReady = (
  tool: GeometryConstructTool,
  sourceObjectIds: readonly string[]
) => sourceObjectIds.filter(Boolean).length >= tool.referenceCount;
