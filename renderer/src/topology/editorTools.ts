import { cloneFundamentalDiagram } from "./quotientBuilder";
import { reviewPolygonWord } from "./polygonWord";
import type { FundamentalDiagram, FundamentalDiagramBoundaryHalfEdge, Orientation } from "./types";

export type FaceAttachmentEditResult =
  | { ok: true; diagram: FundamentalDiagram; normalizedWord: string }
  | { ok: false; diagram: FundamentalDiagram; errors: string[] };

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
      .map((entry) => {
        const sign = entry.direction * (diagram.edgeOrientations[entry.edgeId] ?? 1);
        return `${diagram.edgeLabels[entry.edgeId] || entry.edgeId}${sign < 0 ? "^-1" : ""}`;
      })
      .join(" ");
  }
};

const resolveAttachmentBoundary = (
  diagram: FundamentalDiagram,
  rawWord: string
): { boundary: FundamentalDiagramBoundaryHalfEdge[]; errors: string[] } => {
  const review = reviewPolygonWord(rawWord);
  const errors = review.diagnostics.filter((entry) => entry.severity === "error").map((entry) => entry.message);
  if (errors.length > 0) return { boundary: [], errors };
  const boundary: FundamentalDiagramBoundaryHalfEdge[] = [];
  const consumedByLabel = new Map<string, number>();
  for (const occurrence of review.occurrences) {
    const exact = diagram.edges.find((edge) => edge.id.toLowerCase() === occurrence.label.toLowerCase());
    const byLabel = diagram.edges.filter(
      (edge) => (diagram.edgeLabels[edge.id] || "").trim().toLowerCase() === occurrence.label.toLowerCase()
    );
    const consumed = consumedByLabel.get(occurrence.label) ?? 0;
    const edge = exact ?? byLabel[consumed % Math.max(1, byLabel.length)];
    if (!edge) {
      errors.push(`Token '${occurrence.rawToken}' does not match a source edge id or edge label.`);
      continue;
    }
    if (!exact) consumedByLabel.set(occurrence.label, consumed + 1);
    const authoredOrientation = diagram.edgeOrientations[edge.id] ?? 1;
    boundary.push({ edgeId: edge.id, direction: (occurrence.orientation * authoredOrientation) as Orientation });
  }
  for (let index = 0; index < boundary.length; index += 1) {
    const current = boundary[index];
    const next = boundary[(index + 1) % boundary.length];
    const currentEdge = diagram.edges.find((edge) => edge.id === current.edgeId);
    const nextEdge = diagram.edges.find((edge) => edge.id === next.edgeId);
    if (!currentEdge || !nextEdge) continue;
    const currentEnd = current.direction > 0 ? currentEdge.to : currentEdge.from;
    const nextStart = next.direction > 0 ? nextEdge.from : nextEdge.to;
    if (currentEnd !== nextStart) {
      errors.push(`Attachment is not closed between occurrences ${index + 1} and ${(index + 1) % boundary.length + 1} (${currentEnd} != ${nextStart}).`);
    }
  }
  return { boundary, errors };
};

export const setFaceAttachmentWord = (
  diagram: FundamentalDiagram,
  faceId: string,
  rawWord: string
): FaceAttachmentEditResult => {
  const resolved = resolveAttachmentBoundary(diagram, rawWord);
  if (resolved.errors.length > 0) return { ok: false, diagram: cloneFundamentalDiagram(diagram), errors: resolved.errors };
  const next = cloneFundamentalDiagram(diagram);
  const face = next.faces.find((entry) => entry.id === faceId);
  if (!face) return { ok: false, diagram: next, errors: [`Unknown face '${faceId}'.`] };
  face.boundary = resolved.boundary;
  regenerateBoundaryWordsInPlace(next);
  return { ok: true, diagram: next, normalizedWord: next.faceBoundaryWords[faceId] ?? "" };
};

export const addFaceFromAttachmentWord = (
  diagram: FundamentalDiagram,
  rawWord: string,
  name = "Face"
): FaceAttachmentEditResult => {
  const resolved = resolveAttachmentBoundary(diagram, rawWord);
  if (resolved.errors.length > 0) return { ok: false, diagram: cloneFundamentalDiagram(diagram), errors: resolved.errors };
  const next = cloneFundamentalDiagram(diagram);
  const faceId = nextDiagramId("f", next.faces.map((face) => face.id));
  next.faces.push({ id: faceId, name: name.trim() || faceId, boundary: resolved.boundary });
  regenerateBoundaryWordsInPlace(next);
  return { ok: true, diagram: next, normalizedWord: next.faceBoundaryWords[faceId] ?? "" };
};

export const renameDiagramCell = (
  diagram: FundamentalDiagram,
  dimension: 0 | 1 | 2,
  cellId: string,
  name: string
): FundamentalDiagram => {
  const next = cloneFundamentalDiagram(diagram);
  const normalized = name.trim() || cellId;
  if (dimension === 0 && next.vertices.some((entry) => entry.id === cellId)) next.vertexLabels[cellId] = normalized;
  if (dimension === 1 && next.edges.some((entry) => entry.id === cellId)) next.edgeLabels[cellId] = normalized;
  if (dimension === 2) {
    const face = next.faces.find((entry) => entry.id === cellId);
    if (face) face.name = normalized;
  }
  regenerateBoundaryWordsInPlace(next);
  return next;
};

export const reverseFaceAttachment = (diagram: FundamentalDiagram, faceId: string): FundamentalDiagram => {
  const next = cloneFundamentalDiagram(diagram);
  const face = next.faces.find((entry) => entry.id === faceId);
  if (!face) return next;
  face.boundary = [...face.boundary].reverse().map((entry) => ({ edgeId: entry.edgeId, direction: (entry.direction * -1) as Orientation }));
  regenerateBoundaryWordsInPlace(next);
  return next;
};

export const removeFaceFromDiagram = (diagram: FundamentalDiagram, faceId: string): FundamentalDiagram => {
  const next = cloneFundamentalDiagram(diagram);
  next.faces = next.faces.filter((entry) => entry.id !== faceId);
  delete next.faceBoundaryWords[faceId];
  return next;
};

export const subdivideFaceByDiagonal = (diagram: FundamentalDiagram, faceId: string): FaceAttachmentEditResult => {
  const next = cloneFundamentalDiagram(diagram);
  const face = next.faces.find((entry) => entry.id === faceId);
  if (!face || face.boundary.length < 4) {
    return { ok: false, diagram: next, errors: ["A face needs at least four boundary occurrences for diagonal subdivision."] };
  }
  const splitIndex = Math.floor(face.boundary.length / 2);
  const first = face.boundary[0];
  const second = face.boundary[splitIndex];
  const firstEdge = next.edges.find((entry) => entry.id === first.edgeId);
  const secondEdge = next.edges.find((entry) => entry.id === second.edgeId);
  if (!firstEdge || !secondEdge) return { ok: false, diagram: next, errors: ["Face boundary references an unknown edge."] };
  const startVertex = first.direction > 0 ? firstEdge.from : firstEdge.to;
  const endVertex = second.direction > 0 ? secondEdge.from : secondEdge.to;
  if (startVertex === endVertex) {
    return { ok: false, diagram: next, errors: ["The deterministic diagonal collapses to one source vertex; choose a less identified source face."] };
  }
  const diagonalId = nextDiagramId("e", next.edges.map((entry) => entry.id));
  next.edges.push({ id: diagonalId, from: startVertex, to: endVertex });
  next.edgeLabels[diagonalId] = diagonalId;
  next.edgeOrientations[diagonalId] = 1;
  next.edgePairings[diagonalId] = [];
  const originalBoundary = [...face.boundary];
  const secondFaceId = nextDiagramId("f", next.faces.map((entry) => entry.id));
  const originalName = face.name || face.id;
  face.name = `${originalName} A`;
  face.boundary = [...originalBoundary.slice(0, splitIndex), { edgeId: diagonalId, direction: -1 }];
  next.faces.push({
    id: secondFaceId,
    name: `${originalName} B`,
    boundary: [{ edgeId: diagonalId, direction: 1 }, ...originalBoundary.slice(splitIndex)],
  });
  regenerateBoundaryWordsInPlace(next);
  return { ok: true, diagram: next, normalizedWord: next.faceBoundaryWords[faceId] ?? "" };
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
