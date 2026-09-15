import {
  normalizeCanonicalFinite2DResult,
  type CanonicalCellDimension,
  type CanonicalFinite2DCellLocator,
  type CanonicalFinite2DComplex,
  type CanonicalFinite2DResult,
  type CanonicalFinite2DSourceReference,
} from "./canonicalFinite2DComplex";
import { immutableCanonicalJsonClone } from "./commands";
import { normalizeTopologyDocument, type TopologyDocument } from "./topologyDocument";
import type { ScientificSourceGeneration } from "./scientificJobs";
import type { StructuralHash } from "./documentIdentity";

export const CANONICAL_FINITE_2D_VALIDATOR_VERSION = "finite-2d-structure@1" as const;

export type CanonicalFinite2DValidationDiagnostic = Readonly<{
  code: string;
  severity: "warning" | "error";
  message: string;
  canonicalCell?: CanonicalFinite2DCellLocator;
  sourceReferences: readonly CanonicalFinite2DSourceReference[];
}>;

export type CanonicalFinite2DEdgeLink = Readonly<{
  edgeId: string;
  attachmentOccurrences: number;
  attachedFaceIds: readonly string[];
  kind: "isolated" | "boundary-candidate" | "interior-candidate" | "unsupported";
}>;

export type CanonicalFinite2DVertexLink = Readonly<{
  vertexId: string;
  incidentEdgeEnds: number;
  faceCorners: number;
  components: number;
  degreeSequence: readonly number[];
  kind: "empty" | "circle-candidate" | "interval-candidate" | "unsupported";
  supportedForSurfaceEligibility: boolean;
}>;

export type CanonicalFinite2DChainEntry = Readonly<{
  vertexId: string;
  faceId: string;
  value: string;
}>;

export type CanonicalFinite2DValidationReport = Readonly<{
  model: "canonical finite 2D complex";
  cellCounts: Readonly<{ vertices: number; edges: number; faces: number }>;
  connectedComponents: number;
  boundaryCandidateEdgeIds: readonly string[];
  edgeLinks: readonly CanonicalFinite2DEdgeLink[];
  vertexLinks: readonly CanonicalFinite2DVertexLink[];
  chainCondition: Readonly<{
    verified: boolean;
    holds: boolean;
    nonzeroEntries: readonly CanonicalFinite2DChainEntry[];
  }>;
  eligibility: Readonly<{
    cellularAlgebra: boolean;
    formalHomologyJob: boolean;
    surfaceManifold: boolean;
  }>;
}>;

export type CanonicalFinite2DValidationOutcome = Readonly<{
  status: "certified-within-model" | "failed" | "invalid-artifact";
  algorithmVersion: typeof CANONICAL_FINITE_2D_VALIDATOR_VERSION;
  source?: ScientificSourceGeneration;
  canonicalHash?: StructuralHash;
  report: CanonicalFinite2DValidationReport | null;
  diagnostics: readonly CanonicalFinite2DValidationDiagnostic[];
}>;

export type CanonicalFinite2DFormalHomologyGate =
  | Readonly<{
      allowed: true;
      source: ScientificSourceGeneration;
      canonicalHash: StructuralHash;
      validatorVersion: typeof CANONICAL_FINITE_2D_VALIDATOR_VERSION;
    }>
  | Readonly<{
      allowed: false;
      validatorVersion: typeof CANONICAL_FINITE_2D_VALIDATOR_VERSION;
      diagnosticCodes: readonly string[];
    }>;

type MutableDiagnostic = {
  code: string;
  severity: "warning" | "error";
  message: string;
  canonicalCell?: CanonicalFinite2DCellLocator;
  sourceReferences: CanonicalFinite2DSourceReference[];
};

const diagnostic = (
  code: string,
  severity: MutableDiagnostic["severity"],
  message: string,
  canonicalCell?: CanonicalFinite2DCellLocator,
  sourceReferences: readonly CanonicalFinite2DSourceReference[] = []
): MutableDiagnostic => ({
  code,
  severity,
  message,
  ...(canonicalCell ? { canonicalCell } : {}),
  sourceReferences: [...sourceReferences],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const recordIds = (value: unknown): Set<string> =>
  new Set(
    Array.isArray(value)
      ? value
          .filter(isRecord)
          .map((entry) => entry.id)
          .filter((id): id is string => typeof id === "string")
      : []
  );

const stringIds = (value: unknown): Set<string> =>
  new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

const sourceCellIds = (
  document: TopologyDocument
): Record<CanonicalCellDimension, Set<string>> | null => {
  const model = document.source.model;
  if (document.source.kind === "cw-complex" || document.source.kind === "fundamental-diagram") {
    return { 0: recordIds(model.vertices), 1: recordIds(model.edges), 2: recordIds(model.faces) };
  }
  if (document.source.kind === "simplicial-complex") {
    return { 0: stringIds(model.vertexIds), 1: recordIds(model.edges), 2: recordIds(model.triangles) };
  }
  return null;
};

const cellSourceReferences = (
  complex: CanonicalFinite2DComplex,
  locator: CanonicalFinite2DCellLocator
): readonly CanonicalFinite2DSourceReference[] => {
  const cells = locator.dimension === 0 ? complex.vertices : locator.dimension === 1 ? complex.edges : complex.faces;
  return cells.find((cell) => cell.id === locator.cellId)?.sourceRefs ?? [];
};

const connectedComponentCount = (complex: CanonicalFinite2DComplex): number => {
  if (complex.vertices.length === 0) return 0;
  const adjacency = new Map(complex.vertices.map((vertex) => [vertex.id, new Set<string>()]));
  for (const edge of complex.edges) {
    if (!adjacency.has(edge.endpoints[0]) || !adjacency.has(edge.endpoints[1])) continue;
    adjacency.get(edge.endpoints[0])!.add(edge.endpoints[1]);
    adjacency.get(edge.endpoints[1])!.add(edge.endpoints[0]);
  }
  const visited = new Set<string>();
  let components = 0;
  for (const vertex of complex.vertices) {
    if (visited.has(vertex.id)) continue;
    components += 1;
    const stack = [vertex.id];
    visited.add(vertex.id);
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
  }
  return components;
};

const sourceGuardMatches = (result: CanonicalFinite2DResult, document: TopologyDocument): boolean =>
  result.source.documentId === document.identity.id &&
  result.source.revision === document.identity.revision &&
  result.source.structuralHash === document.identity.structuralHash;

const validateSourceReferences = (
  complex: CanonicalFinite2DComplex,
  knownSourceIds: Record<CanonicalCellDimension, Set<string>> | null,
  diagnostics: MutableDiagnostic[]
): void => {
  if (!knownSourceIds) {
    diagnostics.push(diagnostic(
      "source-map/unsupported-source-kind",
      "error",
      "Source-cell references cannot be certified for this topology source kind."
    ));
    return;
  }
  for (const [dimension, cells] of [
    [0, complex.vertices],
    [1, complex.edges],
    [2, complex.faces],
  ] as const) {
    for (const cell of cells) {
      for (const reference of cell.sourceRefs) {
        if (reference.stage === "source" && !knownSourceIds[dimension].has(reference.cellId)) {
          diagnostics.push(diagnostic(
            "source-map/dangling-reference",
            "error",
            `Canonical ${dimension}-cell '${cell.id}' references missing source cell '${reference.cellId}'.`,
            { dimension, cellId: cell.id },
            [reference]
          ));
        }
      }
    }
  }
  for (const face of complex.faces) {
    for (const token of face.attachment) {
      const reference = token.sourceRef;
      if (reference.stage === "source" && !knownSourceIds[1].has(reference.cellId)) {
        diagnostics.push(diagnostic(
          "source-map/dangling-attachment-reference",
          "error",
          `Face '${face.id}' attachment references missing source edge '${reference.cellId}'.`,
          { dimension: 2, cellId: face.id },
          [reference]
        ));
      }
    }
  }
};

const buildVertexLinks = (
  complex: CanonicalFinite2DComplex,
  edgeLinks: readonly CanonicalFinite2DEdgeLink[],
  diagnostics: MutableDiagnostic[]
): CanonicalFinite2DVertexLink[] => {
  const vertexIds = new Set(complex.vertices.map((vertex) => vertex.id));
  const edgeById = new Map(complex.edges.map((edge) => [edge.id, edge]));
  const nodesByVertex = new Map(complex.vertices.map((vertex) => [vertex.id, [] as string[]]));
  const adjacency = new Map<string, string[]>();
  const cornerCount = new Map(complex.vertices.map((vertex) => [vertex.id, 0]));

  for (const edge of complex.edges) {
    edge.endpoints.forEach((vertexId, endpointIndex) => {
      if (!vertexIds.has(vertexId)) return;
      const nodeId = `${edge.id}:${endpointIndex}`;
      nodesByVertex.get(vertexId)!.push(nodeId);
      adjacency.set(nodeId, []);
    });
  }
  for (const face of complex.faces) {
    const oriented = face.attachment.map((token) => {
      const edge = edgeById.get(token.edgeId);
      if (!edge) return null;
      const startIndex = token.direction === 1 ? 0 : 1;
      const endIndex = token.direction === 1 ? 1 : 0;
      return {
        startVertex: edge.endpoints[startIndex],
        endVertex: edge.endpoints[endIndex],
        startNode: `${edge.id}:${startIndex}`,
        endNode: `${edge.id}:${endIndex}`,
      };
    });
    for (let index = 0; index < oriented.length; index += 1) {
      const current = oriented[index];
      const next = oriented[(index + 1) % oriented.length];
      if (!current || !next || current.endVertex !== next.startVertex) continue;
      adjacency.get(current.endNode)?.push(next.startNode);
      adjacency.get(next.startNode)?.push(current.endNode);
      cornerCount.set(current.endVertex, (cornerCount.get(current.endVertex) ?? 0) + 1);
    }
  }

  const unsupportedEdges = new Set(
    edgeLinks.filter((link) => link.kind === "isolated" || link.kind === "unsupported").map((link) => link.edgeId)
  );
  return complex.vertices.map((vertex) => {
    const nodes = nodesByVertex.get(vertex.id) ?? [];
    const visited = new Set<string>();
    let components = 0;
    for (const node of nodes) {
      if (visited.has(node)) continue;
      components += 1;
      const stack = [node];
      visited.add(node);
      while (stack.length > 0) {
        const current = stack.pop()!;
        for (const next of adjacency.get(current) ?? []) {
          if (visited.has(next)) continue;
          visited.add(next);
          stack.push(next);
        }
      }
    }
    const degreeSequence = nodes.map((node) => adjacency.get(node)?.length ?? 0).sort((a, b) => a - b);
    const circle = degreeSequence.length > 0 && degreeSequence.every((degree) => degree === 2);
    const interval =
      degreeSequence.length >= 2 &&
      degreeSequence.filter((degree) => degree === 1).length === 2 &&
      degreeSequence.every((degree) => degree === 1 || degree === 2);
    const incidentUnsupportedEdge = complex.edges.some(
      (edge) => edge.endpoints.includes(vertex.id) && unsupportedEdges.has(edge.id)
    );
    const supported = nodes.length === 0 || (!incidentUnsupportedEdge && components === 1 && (circle || interval));
    const kind: CanonicalFinite2DVertexLink["kind"] = nodes.length === 0
      ? "empty"
      : supported && circle
        ? "circle-candidate"
        : supported && interval
          ? "interval-candidate"
          : "unsupported";
    if (!supported) {
      diagnostics.push(diagnostic(
        "link/unsupported-vertex",
        "warning",
        `Vertex '${vertex.id}' has a disconnected, branched, or unsupported link.`,
        { dimension: 0, cellId: vertex.id },
        vertex.sourceRefs
      ));
    }
    return {
      vertexId: vertex.id,
      incidentEdgeEnds: nodes.length,
      faceCorners: cornerCount.get(vertex.id) ?? 0,
      components,
      degreeSequence,
      kind,
      supportedForSurfaceEligibility: supported,
    };
  });
};

/**
 * Certifies the T03 canonical artifact against its exact T02 source generation.
 * This is pure and never repairs, mutates, realizes, or submits the complex.
 */
export const validateCanonicalFinite2DStructure = (
  value: CanonicalFinite2DResult,
  sourceDocument: TopologyDocument
): CanonicalFinite2DValidationOutcome => {
  const normalizedResult = normalizeCanonicalFinite2DResult(value);
  const normalizedDocument = normalizeTopologyDocument(sourceDocument);
  if (!normalizedResult.ok || !normalizedDocument.ok) {
    const messages = [
      ...(normalizedResult.ok ? [] : normalizedResult.errors),
      ...(normalizedDocument.ok ? [] : normalizedDocument.errors),
    ];
    return immutableCanonicalJsonClone({
      status: "invalid-artifact",
      algorithmVersion: CANONICAL_FINITE_2D_VALIDATOR_VERSION,
      report: null,
      diagnostics: messages.map((message) => diagnostic(
        "validation/invalid-artifact",
        "error",
        message
      )),
    }) as CanonicalFinite2DValidationOutcome;
  }

  const result = normalizedResult.value;
  const document = normalizedDocument.value;
  const complex = result.complex;
  const diagnostics: MutableDiagnostic[] = [];
  if (!sourceGuardMatches(result, document)) {
    diagnostics.push(diagnostic(
      "source/generation-mismatch",
      "error",
      "Canonical artifact source identity/revision/hash does not match the topology document."
    ));
  }
  if (complex.sourceId !== document.source.sourceId) {
    diagnostics.push(diagnostic(
      "source/id-mismatch",
      "error",
      `Canonical source '${complex.sourceId}' does not match document source '${document.source.sourceId}'.`
    ));
  }
  validateSourceReferences(complex, sourceCellIds(document), diagnostics);

  const vertexIds = new Set(complex.vertices.map((vertex) => vertex.id));
  const edgeById = new Map(complex.edges.map((edge) => [edge.id, edge]));
  const attachmentOccurrences = new Map(complex.edges.map((edge) => [edge.id, 0]));
  const attachedFaceIds = new Map(complex.edges.map((edge) => [edge.id, new Set<string>()]));
  let incidenceComplete = true;

  for (const edge of complex.edges) {
    for (const vertexId of edge.endpoints) {
      if (vertexIds.has(vertexId)) continue;
      incidenceComplete = false;
      diagnostics.push(diagnostic(
        "edge/dangling-endpoint",
        "error",
        `Edge '${edge.id}' references missing endpoint vertex '${vertexId}'.`,
        { dimension: 1, cellId: edge.id },
        edge.sourceRefs
      ));
    }
  }

  const composition = new Map<string, bigint>();
  for (const face of complex.faces) {
    if (face.attachment.length === 0) {
      incidenceComplete = false;
      diagnostics.push(diagnostic(
        "attachment/empty",
        "error",
        `Face '${face.id}' has an empty attachment walk.`,
        { dimension: 2, cellId: face.id },
        face.sourceRefs
      ));
      continue;
    }
    const oriented = face.attachment.map((token) => {
      const edge = edgeById.get(token.edgeId);
      if (!edge) {
        incidenceComplete = false;
        diagnostics.push(diagnostic(
          "attachment/dangling-edge",
          "error",
          `Face '${face.id}' references missing edge '${token.edgeId}'.`,
          { dimension: 2, cellId: face.id },
          [token.sourceRef]
        ));
        return null;
      }
      attachmentOccurrences.set(edge.id, (attachmentOccurrences.get(edge.id) ?? 0) + 1);
      attachedFaceIds.get(edge.id)!.add(face.id);
      const start = token.direction === 1 ? edge.endpoints[0] : edge.endpoints[1];
      const end = token.direction === 1 ? edge.endpoints[1] : edge.endpoints[0];
      if (vertexIds.has(start) && vertexIds.has(end)) {
        const startKey = `${start}\u0000${face.id}`;
        const endKey = `${end}\u0000${face.id}`;
        composition.set(startKey, (composition.get(startKey) ?? 0n) - 1n);
        composition.set(endKey, (composition.get(endKey) ?? 0n) + 1n);
      }
      return { start, end, sourceReference: token.sourceRef };
    });
    for (let index = 0; index < oriented.length; index += 1) {
      const current = oriented[index];
      const next = oriented[(index + 1) % oriented.length];
      if (!current || !next || current.end === next.start) continue;
      diagnostics.push(diagnostic(
        "attachment/non-contiguous",
        "error",
        `Face '${face.id}' attachment is not closed at occurrences ${index} and ${(index + 1) % oriented.length}.`,
        { dimension: 2, cellId: face.id },
        [current.sourceReference, next.sourceReference]
      ));
    }
  }

  const nonzeroEntries = [...composition.entries()]
    .filter(([, coefficient]) => coefficient !== 0n)
    .map(([key, coefficient]) => {
      const [vertexId, faceId] = key.split("\u0000");
      return { vertexId: vertexId!, faceId: faceId!, value: coefficient.toString() };
    })
    .sort((left, right) => left.vertexId.localeCompare(right.vertexId) || left.faceId.localeCompare(right.faceId));
  if (incidenceComplete) {
    for (const entry of nonzeroEntries) {
      diagnostics.push(diagnostic(
        "chain/nonzero-boundary-composition",
        "error",
        `The d1*d2 coefficient at vertex '${entry.vertexId}', face '${entry.faceId}' is ${entry.value}.`,
        { dimension: 2, cellId: entry.faceId },
        cellSourceReferences(complex, { dimension: 2, cellId: entry.faceId })
      ));
    }
  }

  const edgeLinks: CanonicalFinite2DEdgeLink[] = complex.edges.map((edge) => {
    const count = attachmentOccurrences.get(edge.id) ?? 0;
    const kind: CanonicalFinite2DEdgeLink["kind"] = count === 0
      ? "isolated"
      : count === 1
        ? "boundary-candidate"
        : count === 2
          ? "interior-candidate"
          : "unsupported";
    if (kind === "isolated" || kind === "unsupported") {
      diagnostics.push(diagnostic(
        kind === "isolated" ? "link/isolated-edge" : "link/unsupported-edge",
        "warning",
        kind === "isolated"
          ? `Edge '${edge.id}' has no 2-cell attachment occurrence.`
          : `Edge '${edge.id}' has ${count} attachment occurrences, outside the supported surface model.`,
        { dimension: 1, cellId: edge.id },
        edge.sourceRefs
      ));
    }
    return {
      edgeId: edge.id,
      attachmentOccurrences: count,
      attachedFaceIds: [...(attachedFaceIds.get(edge.id) ?? [])].sort(),
      kind,
    };
  });
  const vertexLinks = buildVertexLinks(complex, edgeLinks, diagnostics);
  const errorCount = diagnostics.filter((entry) => entry.severity === "error").length;
  const chainVerified = incidenceComplete;
  const chainHolds = chainVerified && nonzeroEntries.length === 0;
  const cellularAlgebra = errorCount === 0 && chainHolds;
  const connectedComponents = connectedComponentCount(complex);
  const surfaceManifold =
    cellularAlgebra &&
    complex.vertices.length > 0 &&
    complex.faces.length > 0 &&
    connectedComponents === 1 &&
    edgeLinks.every((link) => link.kind === "boundary-candidate" || link.kind === "interior-candidate") &&
    vertexLinks.every((link) => link.supportedForSurfaceEligibility);
  const report: CanonicalFinite2DValidationReport = {
    model: "canonical finite 2D complex",
    cellCounts: {
      vertices: complex.vertices.length,
      edges: complex.edges.length,
      faces: complex.faces.length,
    },
    connectedComponents,
    boundaryCandidateEdgeIds: edgeLinks
      .filter((link) => link.kind === "boundary-candidate")
      .map((link) => link.edgeId),
    edgeLinks,
    vertexLinks,
    chainCondition: { verified: chainVerified, holds: chainHolds, nonzeroEntries },
    eligibility: {
      cellularAlgebra,
      formalHomologyJob: cellularAlgebra,
      surfaceManifold,
    },
  };
  return immutableCanonicalJsonClone({
    status: cellularAlgebra ? "certified-within-model" : "failed",
    algorithmVersion: CANONICAL_FINITE_2D_VALIDATOR_VERSION,
    source: result.source,
    canonicalHash: result.canonicalHash,
    report,
    diagnostics,
  }) as CanonicalFinite2DValidationOutcome;
};

/** The only T04 entry point that authorizes a later formal homology submission. */
export const gateCanonicalFinite2DFormalHomology = (
  value: CanonicalFinite2DResult,
  sourceDocument: TopologyDocument
): CanonicalFinite2DFormalHomologyGate => {
  const validation = validateCanonicalFinite2DStructure(value, sourceDocument);
  if (
    validation.status === "certified-within-model" &&
    validation.report?.eligibility.formalHomologyJob &&
    validation.source &&
    validation.canonicalHash
  ) {
    return immutableCanonicalJsonClone({
      allowed: true,
      source: validation.source,
      canonicalHash: validation.canonicalHash,
      validatorVersion: CANONICAL_FINITE_2D_VALIDATOR_VERSION,
    }) as CanonicalFinite2DFormalHomologyGate;
  }
  return immutableCanonicalJsonClone({
    allowed: false,
    validatorVersion: CANONICAL_FINITE_2D_VALIDATOR_VERSION,
    diagnosticCodes: validation.diagnostics.map((entry) => entry.code),
  }) as CanonicalFinite2DFormalHomologyGate;
};
