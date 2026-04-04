import { buildRealizationChoices } from "./realization";
import type {
  EquivalenceClass,
  FundamentalDiagram,
  FundamentalDiagramBoundaryHalfEdge,
  Orientation,
  OrientationRelation,
  QuotientBuildResult,
  QuotientComplex,
  QuotientFaceAttachment,
  QuotientInvariantsSummary,
  QuotientPipelineStage,
  QuotientWarning,
  SubdivisionSummary,
} from "./types";

class DisjointSet {
  private readonly parent = new Map<string, string>();
  private readonly rank = new Map<string, number>();

  add(id: string): void {
    if (this.parent.has(id)) return;
    this.parent.set(id, id);
    this.rank.set(id, 0);
  }

  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent) {
      this.add(id);
      return id;
    }
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
      return;
    }
    if (rankA > rankB) {
      this.parent.set(rootB, rootA);
      return;
    }
    this.parent.set(rootB, rootA);
    this.rank.set(rootA, rankA + 1);
  }
}

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const cloneBoundary = (boundary: FundamentalDiagramBoundaryHalfEdge[]): FundamentalDiagramBoundaryHalfEdge[] =>
  boundary.map((entry) => ({ edgeId: entry.edgeId, direction: entry.direction }));

export const cloneFundamentalDiagram = (diagram: FundamentalDiagram): FundamentalDiagram => ({
  ...diagram,
  vertices: diagram.vertices.map((v) => ({ ...v })),
  edges: diagram.edges.map((e) => ({ ...e })),
  faces: diagram.faces.map((f) => ({ ...f, boundary: cloneBoundary(f.boundary) })),
  edgeOrientations: { ...diagram.edgeOrientations },
  edgeLabels: { ...diagram.edgeLabels },
  edgePairings: Object.fromEntries(
    Object.entries(diagram.edgePairings).map(([id, peers]) => [id, [...peers]])
  ),
  vertexLabels: { ...diagram.vertexLabels },
  faceBoundaryWords: { ...diagram.faceBoundaryWords },
  metadata: diagram.metadata
    ? {
        ...diagram.metadata,
        annotations: diagram.metadata.annotations ? [...diagram.metadata.annotations] : undefined,
        styling: diagram.metadata.styling ? { ...diagram.metadata.styling } : undefined,
      }
    : undefined,
});

export const normalizeFundamentalDiagram = (input: FundamentalDiagram): FundamentalDiagram => {
  const diagram = cloneFundamentalDiagram(input);
  const vertexIds = new Set(diagram.vertices.map((vertex) => vertex.id));
  const edgeIds = new Set(diagram.edges.map((edge) => edge.id));
  const faceIds = new Set(diagram.faces.map((face) => face.id));

  for (const edge of diagram.edges) {
    if (!vertexIds.has(edge.from)) vertexIds.add(edge.from);
    if (!vertexIds.has(edge.to)) vertexIds.add(edge.to);
  }

  for (const edgeId of edgeIds) {
    if (!(edgeId in diagram.edgeOrientations)) diagram.edgeOrientations[edgeId] = 1;
    if (!(edgeId in diagram.edgeLabels)) diagram.edgeLabels[edgeId] = "";
    if (!(edgeId in diagram.edgePairings)) diagram.edgePairings[edgeId] = [];
  }

  for (const vertexId of vertexIds) {
    if (!(vertexId in diagram.vertexLabels)) diagram.vertexLabels[vertexId] = vertexId;
  }

  for (const faceId of faceIds) {
    if (!(faceId in diagram.faceBoundaryWords)) {
      const face = diagram.faces.find((entry) => entry.id === faceId);
      const word = face
        ? face.boundary
            .map((entry) => `${diagram.edgeLabels[entry.edgeId] || entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`)
            .join(" ")
        : "";
      diagram.faceBoundaryWords[faceId] = word;
    }
  }

  return diagram;
};

const buildFaceBoundaryVertices = (
  diagram: FundamentalDiagram,
  face: FundamentalDiagram["faces"][number],
  warnings: QuotientWarning[]
): string[] => {
  const edgeById = new Map(diagram.edges.map((edge) => [edge.id, edge]));
  const vertices: string[] = [];
  let previousEnd: string | null = null;
  for (let index = 0; index < face.boundary.length; index += 1) {
    const halfEdge = face.boundary[index];
    const edge = edgeById.get(halfEdge.edgeId);
    if (!edge) {
      warnings.push({
        code: "subdivide/missing-edge",
        level: "error",
        message: `Face '${face.id}' references unknown edge '${halfEdge.edgeId}'.`,
        faceId: face.id,
        edgeId: halfEdge.edgeId,
      });
      continue;
    }
    const start = halfEdge.direction > 0 ? edge.from : edge.to;
    const end = halfEdge.direction > 0 ? edge.to : edge.from;
    if (index === 0) {
      vertices.push(start);
    } else if (previousEnd && previousEnd !== start) {
      warnings.push({
        code: "subdivide/non-contiguous-boundary",
        level: "warning",
        message: `Boundary walk of face '${face.id}' is not contiguous near edge '${halfEdge.edgeId}'.`,
        faceId: face.id,
        edgeId: halfEdge.edgeId,
      });
    }
    vertices.push(end);
    previousEnd = end;
  }

  if (vertices.length >= 2 && vertices[0] === vertices[vertices.length - 1]) {
    vertices.pop();
  }
  return vertices;
};

const buildFaceWord = (
  face: FundamentalDiagram["faces"][number],
  diagram: FundamentalDiagram
): string =>
  face.boundary
    .map((entry) => `${diagram.edgeLabels[entry.edgeId] || entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`)
    .join(" ");

const triangulateDiagramFaces = (
  diagram: FundamentalDiagram,
  warnings: QuotientWarning[]
): { diagram: FundamentalDiagram; summary: SubdivisionSummary } => {
  const next = cloneFundamentalDiagram(diagram);
  const faceMap: Record<string, string[]> = {};
  const createdEdgeIds: string[] = [];
  const triangulatedFaceIds: string[] = [];
  const edgeById = new Map(next.edges.map((edge) => [edge.id, edge]));
  let edgeCounter = 0;

  const findHalfEdgeForSegment = (from: string, to: string): FundamentalDiagramBoundaryHalfEdge | null => {
    for (const edge of next.edges) {
      if (edge.from === from && edge.to === to) return { edgeId: edge.id, direction: 1 };
      if (edge.from === to && edge.to === from) return { edgeId: edge.id, direction: -1 };
    }
    return null;
  };

  const ensureSegment = (from: string, to: string): FundamentalDiagramBoundaryHalfEdge => {
    const existing = findHalfEdgeForSegment(from, to);
    if (existing) return existing;

    let edgeId = `sd_e${edgeCounter}`;
    while (edgeById.has(edgeId)) {
      edgeCounter += 1;
      edgeId = `sd_e${edgeCounter}`;
    }
    edgeCounter += 1;
    const edge = { id: edgeId, from, to };
    next.edges.push(edge);
    edgeById.set(edgeId, edge);
    next.edgeOrientations[edgeId] = 1;
    next.edgeLabels[edgeId] = "";
    next.edgePairings[edgeId] = [];
    createdEdgeIds.push(edgeId);
    return { edgeId, direction: 1 };
  };

  const newFaces: FundamentalDiagram["faces"] = [];
  const originalFaces = [...next.faces];
  for (const face of originalFaces) {
    if (face.boundary.length <= 3) {
      newFaces.push(face);
      faceMap[face.id] = [face.id];
      if (!(face.id in next.faceBoundaryWords)) {
        next.faceBoundaryWords[face.id] = buildFaceWord(face, next);
      }
      continue;
    }

    const boundaryVertices = buildFaceBoundaryVertices(next, face, warnings);
    if (boundaryVertices.length < 3) {
      warnings.push({
        code: "subdivide/invalid-face-boundary",
        level: "error",
        message: `Face '${face.id}' could not be triangulated because the boundary is invalid.`,
        faceId: face.id,
      });
      newFaces.push(face);
      faceMap[face.id] = [face.id];
      continue;
    }

    triangulatedFaceIds.push(face.id);
    const triFaceIds: string[] = [];
    for (let index = 1; index < boundaryVertices.length - 1; index += 1) {
      const a = boundaryVertices[0];
      const b = boundaryVertices[index];
      const c = boundaryVertices[index + 1];
      const triFaceId = `${face.id}_tri${index - 1}`;
      const triFace = {
        id: triFaceId,
        boundary: [ensureSegment(a, b), ensureSegment(b, c), ensureSegment(c, a)],
      };
      triFaceIds.push(triFaceId);
      newFaces.push(triFace);
      next.faceBoundaryWords[triFaceId] = buildFaceWord(triFace, next);
    }
    faceMap[face.id] = triFaceIds;
    warnings.push({
      code: "subdivide/triangulated-face",
      level: "info",
      message: `Face '${face.id}' triangulated into ${triFaceIds.length} faces.`,
      faceId: face.id,
    });
  }
  next.faces = newFaces;

  const summary: SubdivisionSummary = {
    applied: triangulatedFaceIds.length > 0,
    originalFaceCount: diagram.faces.length,
    subdividedFaceCount: next.faces.length,
    createdEdgeIds,
    triangulatedFaceIds,
    faceMap,
  };
  return { diagram: next, summary };
};

const stageStatus = (warnings: QuotientWarning[], prefix: string): "done" | "warning" =>
  warnings.some((warning) => warning.code.startsWith(prefix)) ? "warning" : "done";

const buildLabelGroups = (diagram: FundamentalDiagram): Record<string, string[]> => {
  const groups: Record<string, string[]> = {};
  for (const edge of diagram.edges) {
    const label = diagram.edgeLabels[edge.id]?.trim();
    if (!label) continue;
    if (!groups[label]) groups[label] = [];
    groups[label].push(edge.id);
  }
  return groups;
};

const buildEquivalence = (diagram: FundamentalDiagram, warnings: QuotientWarning[]) => {
  const vertexDsu = new DisjointSet();
  const edgeDsu = new DisjointSet();
  const edgeById = new Map(diagram.edges.map((edge) => [edge.id, edge]));
  const relationSeen = new Set<string>();
  const orientationRelations: OrientationRelation[] = [];

  for (const vertex of diagram.vertices) vertexDsu.add(vertex.id);
  for (const edge of diagram.edges) edgeDsu.add(edge.id);

  const enqueueRelation = (edgeA: string, edgeB: string, source: "pairing" | "label") => {
    if (edgeA === edgeB) return;
    const key = edgeA < edgeB ? `${edgeA}::${edgeB}` : `${edgeB}::${edgeA}`;
    if (relationSeen.has(key)) return;
    relationSeen.add(key);

    const a = edgeById.get(edgeA);
    const b = edgeById.get(edgeB);
    if (!a || !b) {
      warnings.push({
        code: "equivalence/missing-edge-reference",
        level: "error",
        message: `Identification references unknown edge (${edgeA}, ${edgeB}).`,
      });
      return;
    }
    edgeDsu.union(edgeA, edgeB);

    const orientationA = diagram.edgeOrientations[edgeA] ?? 1;
    const orientationB = diagram.edgeOrientations[edgeB] ?? 1;
    const relation = orientationA === orientationB ? "match" : "reverse";
    orientationRelations.push({ edgeA, edgeB, relation });

    if (relation === "match") {
      vertexDsu.union(a.from, b.from);
      vertexDsu.union(a.to, b.to);
    } else {
      vertexDsu.union(a.from, b.to);
      vertexDsu.union(a.to, b.from);
    }

    if (source === "pairing") {
      const reciprocal = diagram.edgePairings[edgeB]?.includes(edgeA) ?? false;
      if (!reciprocal) {
        warnings.push({
          code: "equivalence/non-reciprocal-pairing",
          level: "warning",
          message: `Pairing ${edgeA} -> ${edgeB} is not reciprocal.`,
          edgeId: edgeA,
        });
      }
    }
  };

  for (const edge of diagram.edges) {
    const peers = uniqueSorted(diagram.edgePairings[edge.id] ?? []);
    if (peers.length === 0) continue;
    for (const peer of peers) enqueueRelation(edge.id, peer, "pairing");
  }

  const labelGroups = buildLabelGroups(diagram);
  for (const [label, edges] of Object.entries(labelGroups)) {
    if (edges.length <= 1) continue;
    const sortedEdges = uniqueSorted(edges);
    for (let index = 1; index < sortedEdges.length; index += 1) {
      enqueueRelation(sortedEdges[index - 1], sortedEdges[index], "label");
    }
    if (sortedEdges.some((edgeId) => (diagram.edgePairings[edgeId] ?? []).length === 0)) {
      warnings.push({
        code: "equivalence/label-derived-identification",
        level: "info",
        message: `Derived identification class from shared label '${label}'.`,
      });
    }
  }

  for (const edge of diagram.edges) {
    if (edge.id.startsWith("sd_e")) continue;
    const label = diagram.edgeLabels[edge.id]?.trim() ?? "";
    const peers = diagram.edgePairings[edge.id] ?? [];
    const labelGroupSize = label ? labelGroups[label]?.length ?? 0 : 0;
    if (!peers.length && labelGroupSize <= 1) {
      warnings.push({
        code: "equivalence/unpaired-edge",
        level: "warning",
        message: `Edge '${edge.id}' is currently not identified with another edge.`,
        edgeId: edge.id,
      });
    }
  }

  return { vertexDsu, edgeDsu, orientationRelations };
};

const buildClasses = (ids: string[], dsu: DisjointSet, prefix: string): { classes: EquivalenceClass[]; classBySource: Record<string, string> } => {
  const buckets = new Map<string, string[]>();
  for (const id of ids) {
    const root = dsu.find(id);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(id);
    else buckets.set(root, [id]);
  }

  const classes: EquivalenceClass[] = [];
  const classBySource: Record<string, string> = {};
  Array.from(buckets.values())
    .map((sourceIds) => uniqueSorted(sourceIds))
    .sort((left, right) => left[0].localeCompare(right[0]))
    .forEach((sourceIds, index) => {
      const id = `${prefix}${index}`;
      classes.push({ id, sourceIds });
      for (const sourceId of sourceIds) classBySource[sourceId] = id;
    });

  return { classes, classBySource };
};

const uniquePush = (target: string[], value: string): void => {
  if (!target.includes(value)) target.push(value);
};

const buildAttachmentWord = (boundary: Array<{ edgeId: string; direction: Orientation }>): string =>
  boundary.map((entry) => `${entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`).join(" ");

const computeConnectedComponents = (
  vertexIds: string[],
  adjacency: Record<string, string[]>
): number => {
  const visited = new Set<string>();
  let components = 0;
  for (const vertexId of vertexIds) {
    if (visited.has(vertexId)) continue;
    components += 1;
    const stack = [vertexId];
    visited.add(vertexId);
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      for (const next of adjacency[current] ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
  }
  return components;
};

const buildQuotientComplex = (
  diagram: FundamentalDiagram,
  vertexClasses: EquivalenceClass[],
  edgeClasses: EquivalenceClass[],
  vertexClassBySource: Record<string, string>,
  edgeClassBySource: Record<string, string>,
  warnings: QuotientWarning[]
): QuotientComplex => {
  const edgeById = new Map(diagram.edges.map((edge) => [edge.id, edge]));
  const quotientVertices = vertexClasses.map((entry) => ({
    id: entry.id,
    sourceVertexIds: [...entry.sourceIds],
    label:
      entry.sourceIds
        .map((sourceId) => diagram.vertexLabels[sourceId] ?? sourceId)
        .join(" = "),
  }));

  const quotientEdges = edgeClasses.map((entry) => {
    const representative = edgeById.get(entry.sourceIds[0]);
    const endpointA = representative ? vertexClassBySource[representative.from] : quotientVertices[0]?.id ?? "qV0";
    const endpointB = representative ? vertexClassBySource[representative.to] : quotientVertices[0]?.id ?? "qV0";
    const labelCandidates = uniqueSorted(
      entry.sourceIds
        .map((sourceId) => diagram.edgeLabels[sourceId])
        .filter((label): label is string => !!label)
    );
    return {
      id: entry.id,
      sourceEdgeIds: [...entry.sourceIds],
      label: labelCandidates.join("/") || entry.id,
      endpointVertexIds: [endpointA, endpointB] as [string, string],
    };
  });

  const incidences = {
    vertexToEdges: Object.fromEntries(quotientVertices.map((vertex) => [vertex.id, [] as string[]])),
    edgeToFaces: Object.fromEntries(quotientEdges.map((edge) => [edge.id, [] as string[]])),
  };

  for (const edge of quotientEdges) {
    uniquePush(incidences.vertexToEdges[edge.endpointVertexIds[0]], edge.id);
    uniquePush(incidences.vertexToEdges[edge.endpointVertexIds[1]], edge.id);
  }

  const attachmentMap: Record<string, QuotientFaceAttachment> = {};
  const cellBoundaries: QuotientComplex["cellBoundaries"] = [];
  const quotientFaces: QuotientComplex["faces"] = [];
  const simplicialTriangles: Array<{ id: string; sourceFaceId: string; vertices: [string, string, string] }> = [];
  let simplexCounter = 0;

  diagram.faces.forEach((face, faceIndex) => {
    const attachmentBoundary: Array<{ edgeId: string; direction: Orientation }> = [];
    const verticesAlongBoundary: string[] = [];
    for (const halfEdge of face.boundary) {
      const edgeClassId = edgeClassBySource[halfEdge.edgeId];
      if (!edgeClassId) {
        warnings.push({
          code: "quotient/missing-edge-class",
          level: "error",
          message: `Face '${face.id}' references unknown edge '${halfEdge.edgeId}'.`,
          faceId: face.id,
          edgeId: halfEdge.edgeId,
        });
        continue;
      }
      attachmentBoundary.push({ edgeId: edgeClassId, direction: halfEdge.direction });
      uniquePush(incidences.edgeToFaces[edgeClassId], `qF${faceIndex}`);
      const sourceEdge = edgeById.get(halfEdge.edgeId);
      if (sourceEdge) {
        const sourceVertex = halfEdge.direction > 0 ? sourceEdge.from : sourceEdge.to;
        const vertexClassId = vertexClassBySource[sourceVertex];
        if (vertexClassId) verticesAlongBoundary.push(vertexClassId);
      }
    }

    const attachmentId = `att${faceIndex}`;
    const boundaryWordFromFace = diagram.faceBoundaryWords[face.id]?.trim();
    const boundaryWord = boundaryWordFromFace || buildAttachmentWord(attachmentBoundary);
    attachmentMap[attachmentId] = {
      id: attachmentId,
      faceId: `qF${faceIndex}`,
      boundary: attachmentBoundary,
      boundaryWord,
    };
    quotientFaces.push({
      id: `qF${faceIndex}`,
      sourceFaceIds: [face.id],
      attachmentId,
    });
    cellBoundaries.push({
      faceId: `qF${faceIndex}`,
      edgeWalk: [...attachmentBoundary],
    });

    const uniqueVertices = uniqueSorted(verticesAlongBoundary);
    if (uniqueVertices.length >= 3) {
      for (let index = 1; index < uniqueVertices.length - 1; index += 1) {
        simplicialTriangles.push({
          id: `t${simplexCounter}`,
          sourceFaceId: face.id,
          vertices: [uniqueVertices[0], uniqueVertices[index], uniqueVertices[index + 1]],
        });
        simplexCounter += 1;
      }
    }
  });

  const quotientEdgesByVertex: Record<string, string[]> = Object.fromEntries(
    quotientVertices.map((vertex) => [vertex.id, [] as string[]])
  );
  for (const edge of quotientEdges) {
    uniquePush(quotientEdgesByVertex[edge.endpointVertexIds[0]], edge.endpointVertexIds[1]);
    uniquePush(quotientEdgesByVertex[edge.endpointVertexIds[1]], edge.endpointVertexIds[0]);
  }

  const connectedComponents = computeConnectedComponents(
    quotientVertices.map((vertex) => vertex.id),
    quotientEdgesByVertex
  );
  const nonManifoldEdgeCount = quotientEdges.filter((edge) => (incidences.edgeToFaces[edge.id]?.length ?? 0) > 2).length;

  const invariants: QuotientInvariantsSummary = {
    vertexCount: quotientVertices.length,
    edgeCount: quotientEdges.length,
    faceCount: quotientFaces.length,
    eulerCharacteristic: quotientVertices.length - quotientEdges.length + quotientFaces.length,
    connectedComponents,
    isConnected: connectedComponents <= 1,
    nonManifoldEdgeCount,
  };

  return {
    id: `${diagram.id}/quotient`,
    name: `${diagram.name} quotient`,
    vertices: quotientVertices,
    edges: quotientEdges,
    faces: quotientFaces,
    incidences,
    attachmentMap,
    cellBoundaries,
    simplicialRefinement:
      simplicialTriangles.length > 0
        ? {
            source: "face-fan",
            triangles: simplicialTriangles,
          }
        : null,
    invariants,
  };
};

export const buildQuotientPipeline = (input: FundamentalDiagram): QuotientBuildResult => {
  const warnings: QuotientWarning[] = [];
  const normalizedDiagram = normalizeFundamentalDiagram(input);
  const { diagram: subdividedDiagram, summary: subdivision } = triangulateDiagramFaces(normalizedDiagram, warnings);
  if (!subdivision.applied) {
    warnings.push({
      code: "subdivide/not-needed",
      level: "info",
      message: "No subdivision required for the current diagram.",
    });
  }

  const { vertexDsu, edgeDsu, orientationRelations } = buildEquivalence(subdividedDiagram, warnings);
  const { classes: vertexClasses, classBySource: vertexClassBySource } = buildClasses(
    subdividedDiagram.vertices.map((vertex) => vertex.id),
    vertexDsu,
    "qV"
  );
  const { classes: edgeClasses, classBySource: edgeClassBySource } = buildClasses(
    subdividedDiagram.edges.map((edge) => edge.id),
    edgeDsu,
    "qE"
  );

  const quotient = buildQuotientComplex(
    subdividedDiagram,
    vertexClasses,
    edgeClasses,
    vertexClassBySource,
    edgeClassBySource,
    warnings
  );
  const realizations = buildRealizationChoices(quotient);

  const pipeline: QuotientPipelineStage[] = [
    {
      id: "diagram",
      label: "Fundamental Diagram",
      status: "done",
      note: "Diagram loaded and normalized.",
    },
    {
      id: "subdivide",
      label: "Subdivision / Triangulation",
      status: stageStatus(warnings, "subdivide/"),
      note: subdivision.applied
        ? `Triangulated ${subdivision.triangulatedFaceIds.length} face(s), added ${subdivision.createdEdgeIds.length} diagonal edge(s).`
        : "No face required triangulation.",
    },
    {
      id: "equivalence",
      label: "Equivalence Classes",
      status: stageStatus(warnings, "equivalence/"),
      note: "Vertex and edge classes computed from pairings + labels.",
    },
    {
      id: "quotient",
      label: "Quotient Complex",
      status: stageStatus(warnings, "quotient/"),
      note: "CW-style quotient with incidence and attachments.",
    },
    {
      id: "realization",
      label: "Geometric Realization",
      status: "done",
      note: `${realizations.length} realization choice(s) generated in R^3.`,
    },
    {
      id: "render",
      label: "Render",
      status: "done",
      note: "Ready for Diagram / Quotient / Realization / Animation views.",
    },
  ];

  return {
    normalizedDiagram,
    subdividedDiagram,
    subdivision,
    vertexClasses,
    edgeClasses,
    orientationRelations,
    vertexClassBySource,
    edgeClassBySource,
    quotient,
    realizations,
    warnings,
    pipeline,
  };
};
