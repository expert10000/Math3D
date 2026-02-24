import type { WorkbookPort } from "./workbookModel";

export type WorkbookOperatorSpec = {
  id: string;
  label: string;
  inputs: WorkbookPort[];
  outputs: WorkbookPort[];
  hidden?: boolean;
  hint?: string[];
};

export const createOperatorRegistry = <T extends { id: string }>(entries: T[]) => {
  const byId = new Map<string, T>();
  entries.forEach((entry) => byId.set(entry.id, entry));
  return {
    list: entries,
    byId,
    get: (id?: string | null) => (id ? byId.get(id) : undefined),
  };
};

export const BASE_COMPUTE_INPUTS: WorkbookPort[] = [
  { id: "dataset", label: "Dataset", type: "dataset" },
  { id: "formula", label: "Formula", type: "formula", optional: true },
  { id: "overlay", label: "Overlay", type: "overlay", optional: true },
  { id: "curve", label: "Curve", type: "curve", optional: true },
  { id: "points", label: "Points", type: "points", optional: true },
  { id: "mask", label: "Mask", type: "mask", optional: true },
  { id: "vector", label: "Vector", type: "vector", optional: true },
];

export const GEODESIC_INPUTS: WorkbookPort[] = [...BASE_COMPUTE_INPUTS];
export const FIELD_SCALAR_INPUTS: WorkbookPort[] = [
  { id: "dataset", label: "Dataset", type: "dataset" },
  { id: "scalar", label: "Scalar", type: "scalar", optional: true },
];
export const FIELD_VECTOR_INPUTS: WorkbookPort[] = [
  { id: "dataset", label: "Dataset", type: "dataset" },
  { id: "vector", label: "Vector", type: "vector", optional: true },
];

export const WORKBOOK_OPERATOR_CATALOG: WorkbookOperatorSpec[] = [
  {
    id: "chart.pointInfo",
    label: "Point info + chart grid",
    inputs: BASE_COMPUTE_INPUTS,
    outputs: [],
    hint: [
      "Use after a Pick point interaction or probe hover.",
      "Reports local chart coords + tangents + normal.",
      "Also enables chart grid or wireframe in the view.",
    ],
  },
  {
    id: "surface.curvature",
    label: "Curvature field + principal directions",
    inputs: BASE_COMPUTE_INPUTS,
    outputs: [{ id: "overlay", label: "Overlay", type: "overlay" }],
    hint: [
      "Turns on curvature coloring (K/H) with principal glyphs.",
      "Use viewer toggles for ridges/valleys or lines.",
    ],
  },
  {
    id: "surface.geodesicDistance",
    label: "Geodesic distance (heat)",
    inputs: GEODESIC_INPUTS,
    outputs: [{ id: "curve", label: "Curve", type: "curve" }],
    hint: [
      "Pick a seed point first. Optional second pick sets target.",
      "Outputs heatmap + shortest path polyline.",
    ],
  },
  {
    id: "surface.parallelTransport",
    label: "Parallel transport (curve)",
    inputs: BASE_COMPUTE_INPUTS,
    outputs: [],
    hint: [
      "Use after Draw curve + Pick direction (optional).",
      "Transports the picked tangent direction along the curve.",
      "Renders vectors along the curve.",
    ],
  },
  {
    id: "field.grad",
    label: "Grad (scalar → vector field)",
    inputs: FIELD_SCALAR_INPUTS,
    outputs: [{ id: "vector", label: "Vector", type: "vector" }],
    hint: [
      "Uses scalar field (defaults to K).",
      "Renders tangent arrows (downsampled).",
    ],
  },
  {
    id: "field.div",
    label: "Div (vector → scalar field)",
    inputs: FIELD_VECTOR_INPUTS,
    outputs: [{ id: "scalar", label: "Scalar", type: "scalar" }],
    hint: [
      "Uses vector field (defaults to grad(K)).",
      "Stores scalar field for reuse.",
    ],
  },
  {
    id: "field.laplacian",
    label: "Laplacian (scalar → scalar field)",
    inputs: FIELD_SCALAR_INPUTS,
    outputs: [{ id: "scalar", label: "Scalar", type: "scalar" }],
    hint: [
      "Equivalent to div(grad(scalar)).",
      "Stores scalar field for reuse.",
    ],
  },
  {
    id: "point_info",
    label: "Point info (legacy)",
    inputs: BASE_COMPUTE_INPUTS,
    outputs: [],
    hidden: true,
  },
  {
    id: "chart_grid",
    label: "Chart grid + coords",
    inputs: BASE_COMPUTE_INPUTS,
    outputs: [{ id: "overlay", label: "Overlay", type: "overlay" }],
  },
  {
    id: "curve_overlay",
    label: "Curve overlay",
    inputs: BASE_COMPUTE_INPUTS,
    outputs: [{ id: "curve", label: "Curve", type: "curve" }],
  },
  {
    id: "direction_overlay",
    label: "Direction overlay",
    inputs: BASE_COMPUTE_INPUTS,
    outputs: [{ id: "curve", label: "Curve", type: "curve" }],
  },
  {
    id: "selection_overlay",
    label: "Selection overlay",
    inputs: BASE_COMPUTE_INPUTS,
    outputs: [{ id: "mask", label: "Mask", type: "mask" }],
  },
  {
    id: "curvature_field",
    label: "Curvature field (legacy)",
    inputs: BASE_COMPUTE_INPUTS,
    outputs: [{ id: "overlay", label: "Overlay", type: "overlay" }],
    hidden: true,
  },
  {
    id: "geodesic_heat",
    label: "Geodesic heat (legacy)",
    inputs: GEODESIC_INPUTS,
    outputs: [{ id: "curve", label: "Curve", type: "curve" }],
    hidden: true,
  },
  {
    id: "geodesic_path",
    label: "Geodesic path",
    inputs: GEODESIC_INPUTS,
    outputs: [{ id: "curve", label: "Curve", type: "curve" }],
  },
  {
    id: "principal_dirs",
    label: "Principal directions",
    inputs: BASE_COMPUTE_INPUTS,
    outputs: [{ id: "overlay", label: "Overlay", type: "overlay" }],
  },
];

export const WORKBOOK_OPERATOR_REGISTRY = createOperatorRegistry(WORKBOOK_OPERATOR_CATALOG);
