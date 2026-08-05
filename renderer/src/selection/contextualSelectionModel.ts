export type ContextualSelectionWorkspace = "mesh" | "geometry";
export type ContextualEntityMode = "face" | "edge" | "vertex";

export const OBJECT_CONTEXT_COPY = {
  mesh: {
    chip: "Mesh Object",
    selectedPrefix: "Selected mesh object",
    selectEmpty: "Select a Mesh object",
    preview: "Preview: open selected mesh in Geometry",
    wholeSelected: "Whole mesh selected",
    actions: ["Open in Geometry", "Save edited", "Mesh source"],
  },
  geometry: {
    chip: "Geometry Object",
    selectedPrefix: "Selected geometry object",
    selectEmpty: "Select a Geometry object",
    preview: "Preview: open selected Geometry object details",
    wholeSelected: "Whole Geometry object selected",
    actions: ["Open Object Details", "Transform", "History"],
  },
} as const;

export const ENTITY_CONTEXT_COPY = {
  mesh: {
    face: {
      actions: ["Subdivide", "Extrude", "Inset"],
      emptyState: "Choose a face to enable Subdivide / Extrude / Inset",
    },
    edge: {
      actions: ["Split", "Collapse", "Bevel", "Loop", "Ring", "Boundary", "Sharp", "Feature"],
      emptyState: "Choose an edge to enable Split / Collapse / Bevel / Loop / Ring / Boundary / Sharp / Feature",
    },
    vertex: {
      actions: ["Marker", "Move"],
      emptyState: "Choose a vertex to enable Marker / Move",
    },
  },
  geometry: {
    face: {
      actions: ["Extrude", "Inset", "Delete"],
      emptyState: "Choose a face to enable Extrude",
    },
    edge: {
      actions: ["Split", "Mirror", "Offset"],
      emptyState: "Choose an edge to enable Split / Mirror / Offset",
    },
    vertex: {
      actions: ["Marker", "Move"],
      emptyState: "Choose a vertex to enable Marker / Move",
    },
  },
} as const;

export function capitalizeEntityMode(mode: ContextualEntityMode): "Face" | "Edge" | "Vertex" {
  return mode === "face" ? "Face" : mode === "edge" ? "Edge" : "Vertex";
}

export function formatContextEntityLabel(mode: ContextualEntityMode, id: string | number): string {
  return `Selected ${mode} ${id}`;
}

export function formatContextEntityId(mode: ContextualEntityMode, id: string | number): string {
  return `${capitalizeEntityMode(mode)} ${id}`;
}

export function formatContextEntityPreview(mode: ContextualEntityMode, id: string | number, result: string): string {
  return `Preview: ${capitalizeEntityMode(mode)} ${id} -> ${result}`;
}

export function getContextEntityActions(
  workspace: ContextualSelectionWorkspace,
  mode: ContextualEntityMode
): readonly string[] {
  return ENTITY_CONTEXT_COPY[workspace][mode].actions;
}

export function getContextEntityEmptyState(workspace: ContextualSelectionWorkspace, mode: ContextualEntityMode): string {
  return ENTITY_CONTEXT_COPY[workspace][mode].emptyState;
}

export function getContextEntityDisabledReason(
  _workspace: ContextualSelectionWorkspace,
  mode: ContextualEntityMode,
  action: string
): string {
  const noun = mode === "edge" ? "an edge" : mode === "face" ? "a face" : "a vertex";
  return `Choose ${noun} to enable ${action}.`;
}
