import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import {
  type CanonicalFinite2DComplex,
  type CanonicalFinite2DResult,
  type CanonicalFinite2DSourceReference,
} from "./canonicalFinite2DComplex";
import {
  validateCanonicalFinite2DStructure,
  type CanonicalFinite2DValidationOutcome,
} from "./canonicalFinite2DValidation";
import { immutableCanonicalJsonClone } from "./commands";
import type { CanonicalJsonValue } from "./documentIdentity";
import type { TopologyDocument } from "./topologyDocument";

export const CANONICAL_FINITE_2D_SURFACE_CLASSIFICATION_VERSION = "finite-surface-classification@2" as const;

export type CanonicalSurfaceEligibilityCheck = Readonly<{
  id: "finite-2d" | "connected" | "edge-links" | "vertex-links" | "boundary-circles" | "euler-characteristic";
  label: string;
  holds: boolean;
  note: string;
  canonicalCells: readonly Readonly<{ dimension: 0 | 1 | 2; cellId: string }>[];
  sourceReferences: readonly CanonicalFinite2DSourceReference[];
}>;

export type CanonicalSurfaceOrientabilityCertificate = Readonly<{
  orientable: boolean;
  method: "signed face-orientation propagation";
  faceOrientationSigns: Readonly<Record<string, 1 | -1>>;
  conflictEdgeIds: readonly string[];
  sourceReferences: readonly CanonicalFinite2DSourceReference[];
}>;

export type CanonicalFormalSurfaceClassification = Readonly<{
  family: "orientable" | "non-orientable";
  label: string;
  genus: number | null;
  crosscapNumber: number | null;
  boundaryComponents: number;
  eulerCharacteristic: number;
  equation: string;
}>;

export type CanonicalSurfaceClassificationReport = Readonly<{
  model: "finite connected compact 2-manifold with optional boundary";
  authority: "canonical finite 2D incidence";
  eligible: boolean;
  eligibilityChecks: readonly CanonicalSurfaceEligibilityCheck[];
  boundaryEdgeIds: readonly string[];
  boundaryComponents: number | null;
  orientability: CanonicalSurfaceOrientabilityCertificate | null;
  classification: CanonicalFormalSurfaceClassification | null;
  canonicalHash: string;
}>;

export type CanonicalSurfaceClassificationDiagnostic = Readonly<{
  code: string;
  message: string;
  sourceReferences: readonly CanonicalFinite2DSourceReference[];
}>;

export type CanonicalSurfaceClassificationOutcome =
  | Readonly<{
      status: "certified-within-model";
      report: CanonicalSurfaceClassificationReport;
      result: AnalysisResultEnvelope;
      validation: CanonicalFinite2DValidationOutcome;
      diagnostics: readonly CanonicalSurfaceClassificationDiagnostic[];
    }>
  | Readonly<{
      status: "unsupported";
      report: null;
      result: AnalysisResultEnvelope;
      validation: CanonicalFinite2DValidationOutcome;
      diagnostics: readonly CanonicalSurfaceClassificationDiagnostic[];
    }>;

type EdgeOccurrence = Readonly<{ faceId: string; direction: 1 | -1 }>;

const uniqueSourceReferences = (
  references: readonly CanonicalFinite2DSourceReference[]
): CanonicalFinite2DSourceReference[] => Array.from(new Map(references.map((reference) => [
  `${reference.sourceId}:${reference.stage}:${reference.dimension}:${reference.cellId}:${reference.occurrence ?? ""}`,
  reference,
])).values());

const cellSourceReferences = (
  complex: CanonicalFinite2DComplex,
  dimension: 0 | 1 | 2,
  cellId: string
): readonly CanonicalFinite2DSourceReference[] => {
  const cells = dimension === 0 ? complex.vertices : dimension === 1 ? complex.edges : complex.faces;
  return cells.find((cell) => cell.id === cellId)?.sourceRefs ?? [];
};

const occurrenceMap = (complex: CanonicalFinite2DComplex): Map<string, EdgeOccurrence[]> => {
  const occurrences = new Map(complex.edges.map((edge) => [edge.id, [] as EdgeOccurrence[]]));
  for (const face of complex.faces) {
    for (const entry of face.attachment) occurrences.get(entry.edgeId)?.push({ faceId: face.id, direction: entry.direction });
  }
  return occurrences;
};

const certifyBoundary = (
  complex: CanonicalFinite2DComplex,
  boundaryEdgeIds: readonly string[]
): Readonly<{ valid: boolean; components: number; invalidVertexIds: readonly string[] }> => {
  if (boundaryEdgeIds.length === 0) return { valid: true, components: 0, invalidVertexIds: [] };
  const boundarySet = new Set(boundaryEdgeIds);
  const adjacency = new Map(complex.vertices.map((vertex) => [vertex.id, new Set<string>()]));
  const degree = new Map(complex.vertices.map((vertex) => [vertex.id, 0]));
  for (const edge of complex.edges) {
    if (!boundarySet.has(edge.id)) continue;
    const [start, end] = edge.endpoints;
    degree.set(start, (degree.get(start) ?? 0) + 1);
    degree.set(end, (degree.get(end) ?? 0) + 1);
    adjacency.get(start)?.add(end);
    adjacency.get(end)?.add(start);
  }
  const boundaryVertexIds = [...degree].filter(([, value]) => value > 0).map(([vertexId]) => vertexId);
  const invalidVertexIds = boundaryVertexIds.filter((vertexId) => degree.get(vertexId) !== 2);
  const visited = new Set<string>();
  let components = 0;
  for (const vertexId of boundaryVertexIds) {
    if (visited.has(vertexId)) continue;
    components += 1;
    const stack = [vertexId];
    visited.add(vertexId);
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of adjacency.get(current) ?? []) {
        if ((degree.get(next) ?? 0) === 0 || visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
  }
  return { valid: invalidVertexIds.length === 0, components, invalidVertexIds };
};

const certifyOrientability = (
  complex: CanonicalFinite2DComplex,
  occurrences: ReadonlyMap<string, readonly EdgeOccurrence[]>
): CanonicalSurfaceOrientabilityCertificate => {
  const constraints = new Map(complex.faces.map((face) => [
    face.id,
    [] as Array<{ faceId: string; factor: 1 | -1; edgeId: string }>,
  ]));
  for (const [edgeId, edgeOccurrences] of occurrences) {
    if (edgeOccurrences.length !== 2) continue;
    const [first, second] = edgeOccurrences as readonly [EdgeOccurrence, EdgeOccurrence];
    const factor = (-first.direction * second.direction) as 1 | -1;
    constraints.get(first.faceId)?.push({ faceId: second.faceId, factor, edgeId });
    constraints.get(second.faceId)?.push({ faceId: first.faceId, factor, edgeId });
  }
  const faceOrientationSigns: Record<string, 1 | -1> = {};
  const conflictEdgeIds = new Set<string>();
  for (const face of complex.faces) {
    if (faceOrientationSigns[face.id]) continue;
    faceOrientationSigns[face.id] = 1;
    const stack = [face.id];
    while (stack.length > 0) {
      const faceId = stack.pop()!;
      for (const constraint of constraints.get(faceId) ?? []) {
        const expected = (faceOrientationSigns[faceId]! * constraint.factor) as 1 | -1;
        const current = faceOrientationSigns[constraint.faceId];
        if (current && current !== expected) {
          conflictEdgeIds.add(constraint.edgeId);
          continue;
        }
        if (!current) {
          faceOrientationSigns[constraint.faceId] = expected;
          stack.push(constraint.faceId);
        }
      }
    }
  }
  const conflicts = [...conflictEdgeIds].sort((left, right) => left.localeCompare(right));
  return {
    orientable: conflicts.length === 0,
    method: "signed face-orientation propagation",
    faceOrientationSigns,
    conflictEdgeIds: conflicts,
    sourceReferences: uniqueSourceReferences(conflicts.flatMap((edgeId) => cellSourceReferences(complex, 1, edgeId))),
  };
};

const classificationLabel = (orientable: boolean, index: number, boundaryComponents: number): string => {
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

const resultEnvelope = (
  canonical: CanonicalFinite2DResult,
  status: "certified" | "unsupported",
  summary: Readonly<Record<string, CanonicalJsonValue>>,
  diagnostics: readonly CanonicalSurfaceClassificationDiagnostic[]
): AnalysisResultEnvelope => createAnalysisResultEnvelope({
  resultId: `${canonical.source.documentId}/result/surface-classification/g${canonical.source.generation}`,
  status,
  provenance: {
    source: canonical.source,
    operation: {
      type: "topology.surface-classification",
      algorithm: "finite 2-manifold eligibility, signed orientation propagation, and Euler classification",
      algorithmVersion: CANONICAL_FINITE_2D_SURFACE_CLASSIFICATION_VERSION,
      parameters: { canonicalHash: canonical.canonicalHash },
    },
    engine: { name: "Math3D shared core", version: "1" },
    elapsedMs: 0,
  },
  summary,
  warnings: status === "certified" && summary.eligible === false
    ? ["Formal surface classification was withheld because one or more displayed eligibility gates failed."]
    : [],
  diagnostics: diagnostics.map((entry) => ({ code: entry.code, severity: "warning", message: entry.message })),
  artifacts: [],
});

export const classifyCanonicalFinite2DSurface = (
  canonical: CanonicalFinite2DResult,
  document: TopologyDocument
): CanonicalSurfaceClassificationOutcome => {
  const validation = validateCanonicalFinite2DStructure(canonical, document);
  if (validation.status !== "certified-within-model" || !validation.report) {
    const diagnostics = validation.diagnostics.map((entry) => ({
      code: `surface-classification/${entry.code}`,
      message: entry.message,
      sourceReferences: entry.sourceReferences,
    }));
    return immutableCanonicalJsonClone({
      status: "unsupported",
      report: null,
      result: resultEnvelope(canonical, "unsupported", {
        authority: "unsupported",
        eligible: null,
        canonicalHash: canonical.canonicalHash,
        limitation: "Canonical structural validation did not authorize surface classification.",
      }, diagnostics),
      validation,
      diagnostics,
    }) as CanonicalSurfaceClassificationOutcome;
  }

  const complex = canonical.complex;
  const occurrences = occurrenceMap(complex);
  const invalidEdgeIds = validation.report.edgeLinks
    .filter((link) => link.kind !== "boundary-candidate" && link.kind !== "interior-candidate")
    .map((link) => link.edgeId);
  const invalidVertexIds = validation.report.vertexLinks
    .filter((link) => !link.supportedForSurfaceEligibility)
    .map((link) => link.vertexId);
  const boundaryEdgeIds = [...validation.report.boundaryCandidateEdgeIds];
  const boundary = certifyBoundary(complex, boundaryEdgeIds);
  const referenceFor = (dimension: 0 | 1 | 2, ids: readonly string[]) =>
    uniqueSourceReferences(ids.flatMap((cellId) => cellSourceReferences(complex, dimension, cellId)));
  const checks: CanonicalSurfaceEligibilityCheck[] = [
    {
      id: "finite-2d",
      label: "Finite nonempty 2D canonical complex",
      holds: complex.vertices.length > 0 && complex.faces.length > 0,
      note: `${complex.vertices.length} zero-cells, ${complex.edges.length} one-cells, ${complex.faces.length} two-cells.`,
      canonicalCells: [],
      sourceReferences: [],
    },
    {
      id: "connected",
      label: "Connected canonical 1-skeleton",
      holds: validation.report.connectedComponents === 1,
      note: `${validation.report.connectedComponents} connected component(s).`,
      canonicalCells: [],
      sourceReferences: [],
    },
    {
      id: "edge-links",
      label: "Every edge link is one or two points",
      holds: invalidEdgeIds.length === 0,
      note: invalidEdgeIds.length === 0
        ? `${boundaryEdgeIds.length} boundary edge(s); every other edge is interior.`
        : `Unsupported edge links: ${invalidEdgeIds.join(", ")}.`,
      canonicalCells: invalidEdgeIds.map((cellId) => ({ dimension: 1, cellId })),
      sourceReferences: referenceFor(1, invalidEdgeIds),
    },
    {
      id: "vertex-links",
      label: "Every vertex link is a circle or interval",
      holds: invalidVertexIds.length === 0,
      note: invalidVertexIds.length === 0
        ? "All canonical vertex links pass the surface-manifold gate."
        : `Unsupported vertex links: ${invalidVertexIds.join(", ")}.`,
      canonicalCells: invalidVertexIds.map((cellId) => ({ dimension: 0, cellId })),
      sourceReferences: referenceFor(0, invalidVertexIds),
    },
    {
      id: "boundary-circles",
      label: "Boundary graph is a disjoint union of circles",
      holds: boundary.valid,
      note: boundary.valid
        ? `${boundary.components} boundary component(s).`
        : `Boundary degree failed at vertices: ${boundary.invalidVertexIds.join(", ")}.`,
      canonicalCells: boundary.invalidVertexIds.map((cellId) => ({ dimension: 0, cellId })),
      sourceReferences: referenceFor(0, boundary.invalidVertexIds),
    },
  ];
  const manifoldEligible = checks.every((check) => check.holds);
  const orientability = manifoldEligible ? certifyOrientability(complex, occurrences) : null;
  const eulerCharacteristic = complex.vertices.length - complex.edges.length + complex.faces.length;
  const numerator = orientability ? 2 - boundary.components - eulerCharacteristic : Number.NaN;
  const index = orientability?.orientable ? numerator / 2 : numerator;
  const validIndex = !!orientability && Number.isSafeInteger(index) && (orientability.orientable ? index >= 0 : index >= 1);
  checks.push({
    id: "euler-characteristic",
    label: "Euler characteristic yields a valid classification index",
    holds: validIndex,
    note: !orientability
      ? `Withheld until connected manifold and boundary gates pass; cellular Euler characteristic is ${eulerCharacteristic}.`
      : validIndex
        ? orientability.orientable
          ? `${eulerCharacteristic} = 2 - 2·${index} - ${boundary.components}.`
          : `${eulerCharacteristic} = 2 - ${index} - ${boundary.components}.`
        : `Euler characteristic ${eulerCharacteristic} does not yield a valid ${orientability.orientable ? "genus" : "crosscap number"}.`,
    canonicalCells: [],
    sourceReferences: [],
  });
  const eligible = checks.every((check) => check.holds);
  const classification: CanonicalFormalSurfaceClassification | null = eligible && orientability
    ? {
        family: orientability.orientable ? "orientable" : "non-orientable",
        label: classificationLabel(orientability.orientable, index, boundary.components),
        genus: orientability.orientable ? index : null,
        crosscapNumber: orientability.orientable ? null : index,
        boundaryComponents: boundary.components,
        eulerCharacteristic,
        equation: orientability.orientable
          ? `${eulerCharacteristic} = 2 - 2·${index} - ${boundary.components}`
          : `${eulerCharacteristic} = 2 - ${index} - ${boundary.components}`,
      }
    : null;
  const diagnostics = checks.filter((check) => !check.holds).map((check) => ({
    code: `surface-eligibility/${check.id}`,
    message: check.note,
    sourceReferences: check.sourceReferences,
  }));
  const report: CanonicalSurfaceClassificationReport = {
    model: "finite connected compact 2-manifold with optional boundary",
    authority: "canonical finite 2D incidence",
    eligible,
    eligibilityChecks: checks,
    boundaryEdgeIds,
    boundaryComponents: eligible ? boundary.components : null,
    orientability,
    classification,
    canonicalHash: canonical.canonicalHash,
  };
  const result = resultEnvelope(canonical, "certified", {
    authority: report.authority,
    eligible,
    canonicalHash: canonical.canonicalHash,
    eulerCharacteristic,
    boundaryComponents: report.boundaryComponents,
    orientable: orientability?.orientable ?? null,
    classification: classification?.label ?? null,
    family: classification?.family ?? null,
    genus: classification?.genus ?? null,
    crosscapNumber: classification?.crosscapNumber ?? null,
    eligibility: Object.fromEntries(checks.map((check) => [check.id, check.holds])),
  } as Readonly<Record<string, CanonicalJsonValue>>, diagnostics);
  return immutableCanonicalJsonClone({
    status: "certified-within-model",
    report,
    result,
    validation,
    diagnostics,
  }) as CanonicalSurfaceClassificationOutcome;
};
