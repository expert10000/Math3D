import type { FundamentalDiagram, QuotientBuildResult, Realization3D } from "./types";

export type TopologyCellCounts = {
  vertices: number;
  edges: number;
  faces: number;
};

export type TopologyDisplayCounts = {
  meshVertices: number;
  triangles: number;
  curveSamples: number;
};

export type TopologyCountLayers = {
  source: TopologyCellCounts;
  refinement: TopologyCellCounts;
  canonical: TopologyCellCounts & { eulerCharacteristic: number };
  display: TopologyDisplayCounts;
};

const diagramCounts = (diagram: FundamentalDiagram): TopologyCellCounts => ({
  vertices: diagram.vertices.length,
  edges: diagram.edges.length,
  faces: diagram.faces.length,
});

export const countRealizationDisplay = (realization?: Realization3D | null): TopologyDisplayCounts => {
  if (!realization) return { meshVertices: 0, triangles: 0, curveSamples: 0 };
  return {
    meshVertices: realization.faceRealizationMesh.reduce((total, face) => total + face.vertices.length, 0),
    triangles: realization.faceRealizationMesh.reduce((total, face) => total + face.triangles.length, 0),
    curveSamples: Object.values(realization.edgeCurves).reduce((total, points) => total + points.length, 0),
  };
};

export const buildTopologyCountLayers = (
  result: QuotientBuildResult,
  realization?: Realization3D | null
): TopologyCountLayers => {
  const canonical = {
    vertices: result.quotient.vertices.length,
    edges: result.quotient.edges.length,
    faces: result.quotient.faces.length,
  };
  return {
    source: diagramCounts(result.normalizedDiagram),
    refinement: diagramCounts(result.subdividedDiagram),
    canonical: {
      ...canonical,
      eulerCharacteristic: canonical.vertices - canonical.edges + canonical.faces,
    },
    display: countRealizationDisplay(realization),
  };
};
