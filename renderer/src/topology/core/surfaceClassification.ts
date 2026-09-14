import type {
  CanonicalTopologyComplex,
  TopologyDiagnostic,
  TopologyObject,
  TopologyResult,
} from "./contracts";
import { createTopologyResult } from "./provenance";
import type { TopologyStructuralValidationReport } from "./structuralValidation";
import type { TopologyAlgebraicConsistency } from "./algebraicConsistency";

export const TOPOLOGY_SURFACE_CLASSIFICATION_VERSION = "finite-surface-classification@1" as const;

export type SurfaceEligibilityCheck = {
  id: "finite-2d" | "connected" | "edge-links" | "vertex-links" | "boundary-circles" | "algebra-consistent";
  label: string;
  holds: boolean;
  note: string;
  cellRefs: Array<{ dimension: 0 | 1 | 2; cellId: string }>;
};

export type SurfaceVertexLinkCertification = {
  vertexId: string;
  nodeCount: number;
  components: number;
  degreeOneNodes: number;
  degreeTwoNodes: number;
  otherDegreeNodes: number;
  kind: "circle" | "interval" | "unsupported";
};

export type SurfaceOrientabilityCertificate = {
  orientable: boolean;
  method: "signed face-orientation propagation";
  faceOrientationSigns: Record<string, 1 | -1>;
  conflictEdgeIds: string[];
};

export type FormalSurfaceClassification = {
  family: "orientable" | "non-orientable";
  label: string;
  genus: number | null;
  crosscapNumber: number | null;
  boundaryComponents: number;
  eulerCharacteristic: number;
  equation: string;
};

export type SurfaceClassificationReport = {
  model: "finite connected compact 2-manifold with optional boundary";
  eligible: boolean;
  eligibilityChecks: SurfaceEligibilityCheck[];
  vertexLinks: SurfaceVertexLinkCertification[];
  boundaryEdgeIds: string[];
  boundaryComponents: number | null;
  orientability: SurfaceOrientabilityCertificate | null;
  classification: FormalSurfaceClassification | null;
};

type EdgeOccurrence = { faceId: string; direction: 1 | -1 };

const occurrenceMap = (complex: CanonicalTopologyComplex): Map<string, EdgeOccurrence[]> => {
  const occurrences = new Map(complex.edges.map((edge) => [edge.id, [] as EdgeOccurrence[]]));
  complex.faces.forEach((face) => face.attachment.forEach((entry) => {
    occurrences.get(entry.edgeId)?.push({ faceId: face.id, direction: entry.direction });
  }));
  return occurrences;
};

const certifyVertexLinks = (complex: CanonicalTopologyComplex): SurfaceVertexLinkCertification[] => {
  const edgeById = new Map(complex.edges.map((edge) => [edge.id, edge]));
  const nodesByVertex = new Map(complex.vertices.map((vertex) => [vertex.id, [] as string[]]));
  const adjacency = new Map<string, string[]>();
  complex.edges.forEach((edge) => edge.endpoints.forEach((vertexId, endpointIndex) => {
    const nodeId = `${edge.id}:${endpointIndex}`;
    nodesByVertex.get(vertexId)?.push(nodeId);
    adjacency.set(nodeId, []);
  }));
  complex.faces.forEach((face) => {
    const oriented = face.attachment.flatMap((entry) => {
      const edge = edgeById.get(entry.edgeId);
      if (!edge) return [];
      const startIndex = entry.direction === 1 ? 0 : 1;
      const endIndex = entry.direction === 1 ? 1 : 0;
      return [{
        startVertex: edge.endpoints[startIndex],
        endVertex: edge.endpoints[endIndex],
        startNode: `${edge.id}:${startIndex}`,
        endNode: `${edge.id}:${endIndex}`,
      }];
    });
    oriented.forEach((current, index) => {
      const next = oriented[(index + 1) % oriented.length];
      if (!next || current.endVertex !== next.startVertex) return;
      adjacency.get(current.endNode)?.push(next.startNode);
      adjacency.get(next.startNode)?.push(current.endNode);
    });
  });

  return complex.vertices.map((vertex) => {
    const nodes = nodesByVertex.get(vertex.id) ?? [];
    const visited = new Set<string>();
    let components = 0;
    nodes.forEach((nodeId) => {
      if (visited.has(nodeId)) return;
      components += 1;
      const stack = [nodeId];
      visited.add(nodeId);
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        (adjacency.get(current) ?? []).forEach((next) => {
          if (visited.has(next)) return;
          visited.add(next);
          stack.push(next);
        });
      }
    });
    const degrees = nodes.map((nodeId) => adjacency.get(nodeId)?.length ?? 0);
    const degreeOneNodes = degrees.filter((degree) => degree === 1).length;
    const degreeTwoNodes = degrees.filter((degree) => degree === 2).length;
    const otherDegreeNodes = degrees.length - degreeOneNodes - degreeTwoNodes;
    const kind =
      nodes.length > 0 && components === 1 && degreeTwoNodes === nodes.length
        ? "circle"
        : nodes.length > 0 && components === 1 && degreeOneNodes === 2 && degreeTwoNodes === nodes.length - 2
          ? "interval"
          : "unsupported";
    return { vertexId: vertex.id, nodeCount: nodes.length, components, degreeOneNodes, degreeTwoNodes, otherDegreeNodes, kind };
  });
};

const certifyBoundary = (
  complex: CanonicalTopologyComplex,
  boundaryEdgeIds: string[]
): { valid: boolean; components: number; invalidVertexIds: string[] } => {
  if (boundaryEdgeIds.length === 0) return { valid: true, components: 0, invalidVertexIds: [] };
  const boundarySet = new Set(boundaryEdgeIds);
  const adjacency = new Map(complex.vertices.map((vertex) => [vertex.id, new Set<string>()]));
  const degree = new Map(complex.vertices.map((vertex) => [vertex.id, 0]));
  complex.edges.filter((edge) => boundarySet.has(edge.id)).forEach((edge) => {
    const [start, end] = edge.endpoints;
    degree.set(start, (degree.get(start) ?? 0) + 1);
    degree.set(end, (degree.get(end) ?? 0) + 1);
    adjacency.get(start)?.add(end);
    adjacency.get(end)?.add(start);
  });
  const boundaryVertexIds = [...degree.entries()].filter(([, value]) => value > 0).map(([vertexId]) => vertexId);
  const invalidVertexIds = boundaryVertexIds.filter((vertexId) => degree.get(vertexId) !== 2);
  const visited = new Set<string>();
  let components = 0;
  boundaryVertexIds.forEach((vertexId) => {
    if (visited.has(vertexId)) return;
    components += 1;
    const stack = [vertexId];
    visited.add(vertexId);
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      adjacency.get(current)?.forEach((next) => {
        if ((degree.get(next) ?? 0) === 0 || visited.has(next)) return;
        visited.add(next);
        stack.push(next);
      });
    }
  });
  return { valid: invalidVertexIds.length === 0, components, invalidVertexIds };
};

const certifyOrientability = (
  complex: CanonicalTopologyComplex,
  occurrences: Map<string, EdgeOccurrence[]>
): SurfaceOrientabilityCertificate => {
  const constraints = new Map(complex.faces.map((face) => [face.id, [] as Array<{ faceId: string; factor: 1 | -1; edgeId: string }>]));
  occurrences.forEach((edgeOccurrences, edgeId) => {
    if (edgeOccurrences.length !== 2) return;
    const [first, second] = edgeOccurrences;
    const factor = (-first.direction * second.direction) as 1 | -1;
    constraints.get(first.faceId)?.push({ faceId: second.faceId, factor, edgeId });
    constraints.get(second.faceId)?.push({ faceId: first.faceId, factor, edgeId });
  });
  const faceOrientationSigns: Record<string, 1 | -1> = {};
  const conflicts = new Set<string>();
  complex.faces.forEach((face) => {
    if (faceOrientationSigns[face.id]) return;
    faceOrientationSigns[face.id] = 1;
    const stack = [face.id];
    while (stack.length > 0) {
      const faceId = stack.pop();
      if (!faceId) continue;
      (constraints.get(faceId) ?? []).forEach((constraint) => {
        const expected = (faceOrientationSigns[faceId] * constraint.factor) as 1 | -1;
        const current = faceOrientationSigns[constraint.faceId];
        if (current && current !== expected) {
          conflicts.add(constraint.edgeId);
          return;
        }
        if (!current) {
          faceOrientationSigns[constraint.faceId] = expected;
          stack.push(constraint.faceId);
        }
      });
    }
  });
  return {
    orientable: conflicts.size === 0,
    method: "signed face-orientation propagation",
    faceOrientationSigns,
    conflictEdgeIds: [...conflicts].sort((left, right) => left.localeCompare(right)),
  };
};

const classificationLabel = (
  orientable: boolean,
  index: number,
  boundaryComponents: number
): string => {
  if (orientable && index === 0 && boundaryComponents === 0) return "Sphere (orientable genus 0)";
  if (orientable && index === 0 && boundaryComponents === 1) return "Disk (orientable genus 0, boundary 1)";
  if (orientable && index === 0 && boundaryComponents === 2) return "Cylinder / annulus (orientable genus 0, boundary 2)";
  if (orientable && index === 1 && boundaryComponents === 0) return "Torus (orientable genus 1)";
  if (!orientable && index === 1 && boundaryComponents === 0) return "Projective plane (non-orientable crosscap 1)";
  if (!orientable && index === 1 && boundaryComponents === 1) return "Möbius band (non-orientable crosscap 1, boundary 1)";
  if (!orientable && index === 2 && boundaryComponents === 0) return "Klein bottle (non-orientable crosscap 2)";
  return orientable
    ? `Orientable surface of genus ${index} with ${boundaryComponents} boundary component(s)`
    : `Non-orientable surface of crosscap number ${index} with ${boundaryComponents} boundary component(s)`;
};

export const certifyAndClassifySurface = (
  object: TopologyObject,
  structuralResult: TopologyResult<TopologyStructuralValidationReport>,
  algebraResult: TopologyResult<TopologyAlgebraicConsistency>
): TopologyResult<SurfaceClassificationReport> => {
  if (structuralResult.status === "failed" || !structuralResult.value || algebraResult.status !== "exact" || !algebraResult.value?.holds) {
    return createTopologyResult({
      status: "unsupported",
      method: "finite 2-manifold eligibility and classification",
      assumptions: ["structurally valid canonical complex", "passing exact Euler–homology consistency"],
      sourceRevision: object.provenance.source.revision,
      algorithmVersion: TOPOLOGY_SURFACE_CLASSIFICATION_VERSION,
      diagnostics: [{
        code: "surface-classification/prerequisites-unavailable",
        severity: "error",
        message: "Surface eligibility was withheld because structural or exact algebraic prerequisites are unavailable.",
      }],
    });
  }

  const complex = object.canonical;
  const occurrences = occurrenceMap(complex);
  const invalidEdgeIds = complex.edges.filter((edge) => {
    const count = occurrences.get(edge.id)?.length ?? 0;
    return count !== 1 && count !== 2;
  }).map((edge) => edge.id);
  const boundaryEdgeIds = complex.edges.filter((edge) => (occurrences.get(edge.id)?.length ?? 0) === 1).map((edge) => edge.id);
  const vertexLinks = certifyVertexLinks(complex);
  const invalidVertexIds = vertexLinks.filter((link) => link.kind === "unsupported").map((link) => link.vertexId);
  const boundary = certifyBoundary(complex, boundaryEdgeIds);
  const checks: SurfaceEligibilityCheck[] = [
    {
      id: "finite-2d",
      label: "Finite nonempty 2D canonical complex",
      holds: complex.vertices.length > 0 && complex.faces.length > 0,
      note: `${complex.vertices.length} vertices, ${complex.edges.length} edges, ${complex.faces.length} faces.`,
      cellRefs: [],
    },
    {
      id: "connected",
      label: "Connected 1-skeleton",
      holds: structuralResult.value.connectedComponents === 1,
      note: `${structuralResult.value.connectedComponents} connected component(s).`,
      cellRefs: [],
    },
    {
      id: "edge-links",
      label: "Every edge link is one or two points",
      holds: invalidEdgeIds.length === 0,
      note: invalidEdgeIds.length === 0 ? `${boundaryEdgeIds.length} boundary edge(s); all remaining edges are interior.` : `Unsupported edge occurrences: ${invalidEdgeIds.join(", ")}.`,
      cellRefs: invalidEdgeIds.map((cellId) => ({ dimension: 1 as const, cellId })),
    },
    {
      id: "vertex-links",
      label: "Every vertex link is a circle or interval",
      holds: invalidVertexIds.length === 0,
      note: invalidVertexIds.length === 0 ? "All vertex links are certified within the finite CW incidence model." : `Unsupported vertex links: ${invalidVertexIds.join(", ")}.`,
      cellRefs: invalidVertexIds.map((cellId) => ({ dimension: 0 as const, cellId })),
    },
    {
      id: "boundary-circles",
      label: "Boundary graph is a disjoint union of circles",
      holds: boundary.valid,
      note: boundary.valid ? `${boundary.components} boundary component(s).` : `Boundary degree failed at vertices: ${boundary.invalidVertexIds.join(", ")}.`,
      cellRefs: boundary.invalidVertexIds.map((cellId) => ({ dimension: 0 as const, cellId })),
    },
    {
      id: "algebra-consistent",
      label: "Exact algebraic consistency",
      holds: algebraResult.value.holds,
      note: `Cellular and homological Euler characteristic equal ${algebraResult.value.cellularEulerCharacteristic}.`,
      cellRefs: [],
    },
  ];
  const eligible = checks.every((check) => check.holds);
  const orientability = eligible ? certifyOrientability(complex, occurrences) : null;
  let classification: FormalSurfaceClassification | null = null;
  const diagnostics: TopologyDiagnostic[] = checks
    .filter((check) => !check.holds)
    .map((check) => ({
      code: `surface-eligibility/${check.id}`,
      severity: "warning" as const,
      message: check.note,
      ...(check.cellRefs[0] ? { cellRef: check.cellRefs[0] } : {}),
    }));

  if (eligible && orientability) {
    const chi = algebraResult.value.cellularEulerCharacteristic;
    const numerator = 2 - boundary.components - chi;
    const validIndex = orientability.orientable ? numerator >= 0 && numerator % 2 === 0 : numerator >= 1;
    const index = orientability.orientable ? numerator / 2 : numerator;
    if (validIndex) {
      classification = {
        family: orientability.orientable ? "orientable" : "non-orientable",
        label: classificationLabel(orientability.orientable, index, boundary.components),
        genus: orientability.orientable ? index : null,
        crosscapNumber: orientability.orientable ? null : index,
        boundaryComponents: boundary.components,
        eulerCharacteristic: chi,
        equation: orientability.orientable
          ? `${chi} = 2 - 2·${index} - ${boundary.components}`
          : `${chi} = 2 - ${index} - ${boundary.components}`,
      };
    } else {
      diagnostics.push({
        code: "surface-classification/inconsistent-index",
        severity: "error",
        message: `Eligibility data and Euler characteristic ${chi} do not yield a valid ${orientability.orientable ? "genus" : "crosscap number"}.`,
      });
    }
  }

  return createTopologyResult({
    status: eligible && !classification ? "failed" : "certified-within-model",
    value: {
      model: "finite connected compact 2-manifold with optional boundary",
      eligible,
      eligibilityChecks: checks,
      vertexLinks,
      boundaryEdgeIds,
      boundaryComponents: eligible ? boundary.components : null,
      orientability,
      classification,
    },
    method: "edge/vertex link certification, boundary-cycle analysis, signed face orientation, and Euler classification",
    assumptions: [
      "the canonical finite CW incidence and attachment data are authoritative",
      "edge links with one occurrence are boundary and two occurrences are interior",
      "classification applies only after every displayed eligibility check passes",
    ],
    sourceRevision: object.provenance.source.revision,
    algorithmVersion: TOPOLOGY_SURFACE_CLASSIFICATION_VERSION,
    diagnostics,
  });
};
