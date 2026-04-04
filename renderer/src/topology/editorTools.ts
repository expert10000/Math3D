import { cloneFundamentalDiagram } from "./quotientBuilder";
import type { FundamentalDiagram } from "./types";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const nextDiagramId = (prefix: string, existingIds: string[]): string => {
  let n = 0;
  const idSet = new Set(existingIds);
  while (idSet.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
};

export const regenerateBoundaryWordsInPlace = (diagram: FundamentalDiagram): void => {
  for (const face of diagram.faces) {
    diagram.faceBoundaryWords[face.id] = face.boundary
      .map((entry) => `${diagram.edgeLabels[entry.edgeId] || entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`)
      .join(" ");
  }
};

export const moveVertexInDiagram = (
  diagram: FundamentalDiagram,
  vertexId: string,
  x: number,
  y: number
): FundamentalDiagram => {
  const next = cloneFundamentalDiagram(diagram);
  const vertex = next.vertices.find((entry) => entry.id === vertexId);
  if (!vertex) return next;
  vertex.x = clamp(x, -2.6, 2.6);
  vertex.y = clamp(y, -2.0, 2.0);
  regenerateBoundaryWordsInPlace(next);
  return next;
};

export const addVertexToDiagram = (diagram: FundamentalDiagram, x: number, y: number): FundamentalDiagram => {
  const next = cloneFundamentalDiagram(diagram);
  const vertexId = nextDiagramId("v", next.vertices.map((vertex) => vertex.id));
  next.vertices.push({ id: vertexId, x, y });
  next.vertexLabels[vertexId] = vertexId;
  regenerateBoundaryWordsInPlace(next);
  return next;
};

export const addEdgeToDiagram = (
  diagram: FundamentalDiagram,
  fromId: string,
  toId: string,
  appendToFirstFaceBoundary: boolean
): FundamentalDiagram => {
  if (fromId === toId) return cloneFundamentalDiagram(diagram);
  const next = cloneFundamentalDiagram(diagram);
  const edgeId = nextDiagramId("e", next.edges.map((edge) => edge.id));
  next.edges.push({ id: edgeId, from: fromId, to: toId });
  next.edgeLabels[edgeId] = "";
  next.edgeOrientations[edgeId] = 1;
  next.edgePairings[edgeId] = [];
  if (appendToFirstFaceBoundary && next.faces[0]) {
    next.faces[0].boundary.push({ edgeId, direction: 1 });
  }
  regenerateBoundaryWordsInPlace(next);
  return next;
};

export const removeEdgeFromDiagram = (diagram: FundamentalDiagram, edgeIdToRemove: string): FundamentalDiagram => {
  const next = cloneFundamentalDiagram(diagram);
  next.edges = next.edges.filter((edge) => edge.id !== edgeIdToRemove);
  delete next.edgeLabels[edgeIdToRemove];
  delete next.edgeOrientations[edgeIdToRemove];
  delete next.edgePairings[edgeIdToRemove];
  for (const edgeId of Object.keys(next.edgePairings)) {
    next.edgePairings[edgeId] = (next.edgePairings[edgeId] ?? []).filter((peer) => peer !== edgeIdToRemove);
  }
  for (const face of next.faces) {
    face.boundary = face.boundary.filter((entry) => entry.edgeId !== edgeIdToRemove);
  }
  regenerateBoundaryWordsInPlace(next);
  return next;
};

export const removeVertexFromDiagram = (diagram: FundamentalDiagram, vertexIdToRemove: string): FundamentalDiagram => {
  const next = cloneFundamentalDiagram(diagram);
  const removedEdgeIds = new Set(
    next.edges.filter((edge) => edge.from === vertexIdToRemove || edge.to === vertexIdToRemove).map((edge) => edge.id)
  );
  next.vertices = next.vertices.filter((vertex) => vertex.id !== vertexIdToRemove);
  next.edges = next.edges.filter((edge) => !removedEdgeIds.has(edge.id));
  delete next.vertexLabels[vertexIdToRemove];
  for (const edgeId of removedEdgeIds) {
    delete next.edgeLabels[edgeId];
    delete next.edgeOrientations[edgeId];
    delete next.edgePairings[edgeId];
  }
  for (const edgeId of Object.keys(next.edgePairings)) {
    next.edgePairings[edgeId] = (next.edgePairings[edgeId] ?? []).filter((peer) => !removedEdgeIds.has(peer));
  }
  for (const face of next.faces) {
    face.boundary = face.boundary.filter((entry) => !removedEdgeIds.has(entry.edgeId));
  }
  regenerateBoundaryWordsInPlace(next);
  return next;
};
