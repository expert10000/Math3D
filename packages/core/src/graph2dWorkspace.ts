/** Graphs module registration. Source documents arrive with the Graph2D model (G2D02). */
export const GRAPH2D_WORKSPACE_CONTRACT = Object.freeze({
  module: "graph2d",
  label: "Graphs",
  initialObjectKind: "explicit-cartesian",
  capabilities: Object.freeze({
    emptyScene: true,
    documentEditing: false,
    sampling: false,
    analysis: false,
    projectPersistence: false,
  }),
} as const);

/** A detached view projection, never a saved mathematical source document. */
export type EmptyGraph2DScene = Readonly<{
  objects: readonly [];
  selectedObjectId: null;
}>;

export const createEmptyGraph2DScene = (): EmptyGraph2DScene => ({
  objects: [],
  selectedObjectId: null,
});
