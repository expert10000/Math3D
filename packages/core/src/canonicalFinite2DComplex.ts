import { immutableCanonicalJsonClone } from "./commands";
import {
  canonicalJsonStringify,
  isStructuralHash,
  structuralHash,
  type StructuralHash,
} from "./documentIdentity";
import {
  isScientificSourceGeneration,
  type ScientificSourceGeneration,
} from "./scientificJobs";
import {
  normalizeTopologyDocument,
  type TopologyDocument,
  type TopologyDocumentSource,
} from "./topologyDocument";
import type { ValidationResult } from "./validation";

export const CANONICAL_FINITE_2D_COMPLEX_FORMAT = "math3d.canonical-finite-2d-complex" as const;
export const CANONICAL_FINITE_2D_COMPLEX_SCHEMA_VERSION = 1 as const;
export const FINITE_2D_CANONICALIZER_VERSION = "finite-2d-source@1" as const;

export type CanonicalCellDimension = 0 | 1 | 2;
export type CanonicalOrientation = 1 | -1;

export type CanonicalFinite2DSourceReference = Readonly<{
  sourceId: string;
  stage: "source" | "refinement";
  dimension: CanonicalCellDimension;
  cellId: string;
  occurrence?: number;
}>;

export type CanonicalFinite2DVertex = Readonly<{
  id: string;
  name: string;
  sourceRefs: readonly CanonicalFinite2DSourceReference[];
}>;

export type CanonicalFinite2DEdge = Readonly<{
  id: string;
  name: string;
  endpoints: readonly [string, string];
  sourceRefs: readonly CanonicalFinite2DSourceReference[];
}>;

export type CanonicalFinite2DAttachment = Readonly<{
  edgeId: string;
  direction: CanonicalOrientation;
  sourceRef: CanonicalFinite2DSourceReference;
}>;

export type CanonicalFinite2DFace = Readonly<{
  id: string;
  name: string;
  attachment: readonly CanonicalFinite2DAttachment[];
  boundaryWord: string;
  sourceRefs: readonly CanonicalFinite2DSourceReference[];
}>;

export type CanonicalFinite2DComplex = Readonly<{
  format: typeof CANONICAL_FINITE_2D_COMPLEX_FORMAT;
  schemaVersion: typeof CANONICAL_FINITE_2D_COMPLEX_SCHEMA_VERSION;
  dimension: 2;
  id: string;
  name: string;
  sourceId: string;
  vertices: readonly CanonicalFinite2DVertex[];
  edges: readonly CanonicalFinite2DEdge[];
  faces: readonly CanonicalFinite2DFace[];
}>;

export type CanonicalFinite2DResult = Readonly<{
  status: "canonicalized";
  source: ScientificSourceGeneration;
  method: "finite CW identity" | "simplicial incidence" | "fundamental diagram quotient adapter";
  algorithmVersion: typeof FINITE_2D_CANONICALIZER_VERSION;
  complex: CanonicalFinite2DComplex;
  canonicalHash: StructuralHash;
}>;

export type CanonicalFinite2DDiagnostic = Readonly<{
  code: string;
  message: string;
}>;

export type CanonicalFinite2DFailure = Readonly<{
  status: "unsupported" | "invalid-source";
  source?: ScientificSourceGeneration;
  algorithmVersion: typeof FINITE_2D_CANONICALIZER_VERSION;
  diagnostics: readonly CanonicalFinite2DDiagnostic[];
}>;

export type CanonicalFinite2DOutcome = CanonicalFinite2DResult | CanonicalFinite2DFailure;

export type CanonicalFinite2DCellLocator = Readonly<{
  dimension: CanonicalCellDimension;
  cellId: string;
}>;

export type CanonicalFinite2DCellInput = Readonly<{
  id: string;
  name?: string;
  sourceRefs: readonly CanonicalFinite2DSourceReference[];
}>;

export type CanonicalFinite2DEdgeInput = CanonicalFinite2DCellInput & Readonly<{
  endpoints: readonly [string, string];
}>;

export type CanonicalFinite2DFaceInput = CanonicalFinite2DCellInput & Readonly<{
  attachment: readonly CanonicalFinite2DAttachment[];
}>;

const COMPLEX_FIELDS = new Set([
  "format", "schemaVersion", "dimension", "id", "name", "sourceId", "vertices", "edges", "faces",
]);
const VERTEX_FIELDS = new Set(["id", "name", "sourceRefs"]);
const EDGE_FIELDS = new Set(["id", "name", "endpoints", "sourceRefs"]);
const FACE_FIELDS = new Set(["id", "name", "attachment", "boundaryWord", "sourceRefs"]);
const ATTACHMENT_FIELDS = new Set(["edgeId", "direction", "sourceRef"]);
const SOURCE_REF_FIELDS = new Set(["sourceId", "stage", "dimension", "cellId", "occurrence"]);
const RESULT_FIELDS = new Set(["status", "source", "method", "algorithmVersion", "complex", "canonicalHash"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const exactFields = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[]
): void => {
  const unknown = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  if (unknown.length > 0) errors.push(`${path} contains unknown fields: ${unknown.join(", ")}.`);
};

const validId = (value: unknown, path: string, errors: string[]): value is string => {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    errors.push(`${path} must be an ID-safe string of at most 160 characters.`);
    return false;
  }
  return true;
};

const validName = (value: unknown, path: string, errors: string[]): value is string => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 500) {
    errors.push(`${path} must be a non-empty string of at most 500 characters.`);
    return false;
  }
  return true;
};

const boundaryWordFor = (attachment: readonly Pick<CanonicalFinite2DAttachment, "edgeId" | "direction">[]): string =>
  attachment.map((entry) => `${entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`).join(" ");

const validateSourceRef = (
  value: unknown,
  sourceId: string | null,
  dimension: CanonicalCellDimension,
  path: string,
  errors: string[],
  occurrenceRequired = false
): value is CanonicalFinite2DSourceReference => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  exactFields(value, SOURCE_REF_FIELDS, path, errors);
  validId(value.sourceId, `${path}.sourceId`, errors);
  if (sourceId && value.sourceId !== sourceId) errors.push(`${path}.sourceId must match the canonical source.`);
  if (!['source', 'refinement'].includes(value.stage as string)) errors.push(`${path}.stage is invalid.`);
  if (value.dimension !== dimension) errors.push(`${path}.dimension must be ${dimension}.`);
  validId(value.cellId, `${path}.cellId`, errors);
  if (value.occurrence !== undefined && (!Number.isSafeInteger(value.occurrence) || (value.occurrence as number) < 0)) {
    errors.push(`${path}.occurrence must be a non-negative safe integer when provided.`);
  }
  if (occurrenceRequired && !Number.isSafeInteger(value.occurrence)) {
    errors.push(`${path}.occurrence is required for an attachment token.`);
  }
  return true;
};

const validateCellRefs = (
  value: unknown,
  sourceId: string | null,
  dimension: CanonicalCellDimension,
  path: string,
  errors: string[]
): void => {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must contain at least one source reference.`);
    return;
  }
  const seen = new Set<string>();
  value.forEach((reference, index) => {
    validateSourceRef(reference, sourceId, dimension, `${path}[${index}]`, errors);
    if (!isRecord(reference)) return;
    if (reference.occurrence !== undefined) {
      errors.push(`${path}[${index}].occurrence is reserved for attachment-token references.`);
    }
    const key = `${String(reference.sourceId)}\u0000${String(reference.stage)}\u0000${String(reference.dimension)}\u0000${String(reference.cellId)}`;
    if (seen.has(key)) errors.push(`${path}[${index}] duplicates a source reference.`);
    seen.add(key);
  });
};

const validateCells = (
  value: unknown,
  kind: "vertices" | "edges" | "faces",
  sourceId: string | null,
  errors: string[]
): void => {
  if (!Array.isArray(value)) {
    errors.push(`canonical.${kind} must be an array.`);
    return;
  }
  const dimension = kind === "vertices" ? 0 : kind === "edges" ? 1 : 2;
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const path = `canonical.${kind}[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    exactFields(entry, kind === "vertices" ? VERTEX_FIELDS : kind === "edges" ? EDGE_FIELDS : FACE_FIELDS, path, errors);
    if (validId(entry.id, `${path}.id`, errors)) {
      if (ids.has(entry.id)) errors.push(`${path}.id is duplicated within dimension ${dimension}.`);
      ids.add(entry.id);
    }
    validName(entry.name, `${path}.name`, errors);
    validateCellRefs(entry.sourceRefs, sourceId, dimension, `${path}.sourceRefs`, errors);

    if (kind === "edges") {
      if (!Array.isArray(entry.endpoints) || entry.endpoints.length !== 2) {
        errors.push(`${path}.endpoints must contain exactly two vertex IDs.`);
      } else {
        validId(entry.endpoints[0], `${path}.endpoints[0]`, errors);
        validId(entry.endpoints[1], `${path}.endpoints[1]`, errors);
      }
    }
    if (kind === "faces") {
      if (!Array.isArray(entry.attachment)) {
        errors.push(`${path}.attachment must be an array.`);
      } else {
        entry.attachment.forEach((token, tokenIndex) => {
          const tokenPath = `${path}.attachment[${tokenIndex}]`;
          if (!isRecord(token)) {
            errors.push(`${tokenPath} must be an object.`);
            return;
          }
          exactFields(token, ATTACHMENT_FIELDS, tokenPath, errors);
          validId(token.edgeId, `${tokenPath}.edgeId`, errors);
          if (token.direction !== 1 && token.direction !== -1) errors.push(`${tokenPath}.direction must be 1 or -1.`);
          validateSourceRef(token.sourceRef, sourceId, 1, `${tokenPath}.sourceRef`, errors, true);
          if (isRecord(token.sourceRef) && token.sourceRef.occurrence !== tokenIndex) {
            errors.push(`${tokenPath}.sourceRef.occurrence must equal attachment index ${tokenIndex}.`);
          }
        });
        if (typeof entry.boundaryWord !== "string" || entry.boundaryWord !== boundaryWordFor(entry.attachment as CanonicalFinite2DAttachment[])) {
          errors.push(`${path}.boundaryWord must be the canonical oriented attachment word.`);
        }
      }
    }
  });
};

export const normalizeCanonicalFinite2DComplex = (
  value: unknown
): ValidationResult<CanonicalFinite2DComplex> => {
  if (!isRecord(value)) return { ok: false, errors: ["Canonical finite 2D complex must be an object."] };
  try {
    canonicalJsonStringify(value);
  } catch (error) {
    return {
      ok: false,
      errors: [`Canonical finite 2D complex must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  const errors: string[] = [];
  exactFields(value, COMPLEX_FIELDS, "canonical", errors);
  if (value.format !== CANONICAL_FINITE_2D_COMPLEX_FORMAT) {
    errors.push(`canonical.format must be '${CANONICAL_FINITE_2D_COMPLEX_FORMAT}'.`);
  }
  if (value.schemaVersion !== CANONICAL_FINITE_2D_COMPLEX_SCHEMA_VERSION) {
    errors.push(`canonical.schemaVersion must be ${CANONICAL_FINITE_2D_COMPLEX_SCHEMA_VERSION}.`);
  }
  if (value.dimension !== 2) errors.push("canonical.dimension must be 2.");
  validId(value.id, "canonical.id", errors);
  validName(value.name, "canonical.name", errors);
  const sourceId = validId(value.sourceId, "canonical.sourceId", errors) ? value.sourceId : null;
  validateCells(value.vertices, "vertices", sourceId, errors);
  validateCells(value.edges, "edges", sourceId, errors);
  validateCells(value.faces, "faces", sourceId, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone(value) as CanonicalFinite2DComplex };
};

export const canonicalFinite2DComplexHash = (complex: CanonicalFinite2DComplex): StructuralHash => {
  const normalized = normalizeCanonicalFinite2DComplex(complex);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return structuralHash(normalized.value);
};

const sortedRefs = (references: readonly CanonicalFinite2DSourceReference[]): CanonicalFinite2DSourceReference[] =>
  [...references].sort((left, right) =>
    left.stage.localeCompare(right.stage) ||
    left.dimension - right.dimension ||
    left.cellId.localeCompare(right.cellId) ||
    (left.occurrence ?? -1) - (right.occurrence ?? -1)
  );

const sourceGenerationFor = (document: TopologyDocument, generation: number): ScientificSourceGeneration => ({
  documentId: document.identity.id,
  revision: document.identity.revision,
  structuralHash: document.identity.structuralHash,
  generation,
});

export const createCanonicalFinite2DResult = (input: Readonly<{
  document: TopologyDocument;
  generation?: number;
  method: CanonicalFinite2DResult["method"];
  name: string;
  vertices: readonly CanonicalFinite2DCellInput[];
  edges: readonly CanonicalFinite2DEdgeInput[];
  faces: readonly CanonicalFinite2DFaceInput[];
}>): CanonicalFinite2DResult => {
  const normalizedDocument = normalizeTopologyDocument(input.document);
  if (!normalizedDocument.ok) throw new TypeError(normalizedDocument.errors.join(" "));
  const generation = input.generation ?? 1;
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new TypeError("Canonicalization generation must be a positive safe integer.");
  }
  const sourceId = normalizedDocument.value.source.sourceId;
  const complexCandidate = {
    format: CANONICAL_FINITE_2D_COMPLEX_FORMAT,
    schemaVersion: CANONICAL_FINITE_2D_COMPLEX_SCHEMA_VERSION,
    dimension: 2 as const,
    id: `${normalizedDocument.value.identity.id}/canonical`,
    name: input.name,
    sourceId,
    vertices: [...input.vertices]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entry) => ({ id: entry.id, name: entry.name ?? entry.id, sourceRefs: sortedRefs(entry.sourceRefs) })),
    edges: [...input.edges]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entry) => ({
        id: entry.id,
        name: entry.name ?? entry.id,
        endpoints: [...entry.endpoints] as [string, string],
        sourceRefs: sortedRefs(entry.sourceRefs),
      })),
    faces: [...input.faces]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entry) => ({
        id: entry.id,
        name: entry.name ?? entry.id,
        attachment: entry.attachment.map((token) => ({
          edgeId: token.edgeId,
          direction: token.direction,
          sourceRef: { ...token.sourceRef },
        })),
        boundaryWord: boundaryWordFor(entry.attachment),
        sourceRefs: sortedRefs(entry.sourceRefs),
      })),
  };
  const normalizedComplex = normalizeCanonicalFinite2DComplex(complexCandidate);
  if (!normalizedComplex.ok) throw new TypeError(normalizedComplex.errors.join(" "));
  const complex = normalizedComplex.value;
  return immutableCanonicalJsonClone({
    status: "canonicalized",
    source: sourceGenerationFor(normalizedDocument.value, generation),
    method: input.method,
    algorithmVersion: FINITE_2D_CANONICALIZER_VERSION,
    complex,
    canonicalHash: structuralHash(complex),
  }) as CanonicalFinite2DResult;
};

export const normalizeCanonicalFinite2DResult = (
  value: unknown
): ValidationResult<CanonicalFinite2DResult> => {
  if (!isRecord(value)) return { ok: false, errors: ["Canonicalization result must be an object."] };
  try {
    canonicalJsonStringify(value);
  } catch (error) {
    return {
      ok: false,
      errors: [`Canonicalization result must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  const errors: string[] = [];
  exactFields(value, RESULT_FIELDS, "canonicalization", errors);
  if (value.status !== "canonicalized") errors.push("canonicalization.status must be canonicalized.");
  if (!isScientificSourceGeneration(value.source)) errors.push("canonicalization.source must be an exact source generation.");
  if (!['finite CW identity', 'simplicial incidence', 'fundamental diagram quotient adapter'].includes(value.method as string)) {
    errors.push("canonicalization.method is invalid.");
  }
  if (value.algorithmVersion !== FINITE_2D_CANONICALIZER_VERSION) {
    errors.push(`canonicalization.algorithmVersion must be '${FINITE_2D_CANONICALIZER_VERSION}'.`);
  }
  const complex = normalizeCanonicalFinite2DComplex(value.complex);
  if (!complex.ok) errors.push(...complex.errors);
  if (!isStructuralHash(value.canonicalHash)) errors.push("canonicalization.canonicalHash must be a SHA-256 structural hash.");
  if (complex.ok && value.canonicalHash !== structuralHash(complex.value)) {
    errors.push("canonicalization.canonicalHash does not match the canonical complex.");
  }
  if (complex.ok && isScientificSourceGeneration(value.source)) {
    if (complex.value.id !== `${value.source.documentId}/canonical`) {
      errors.push("canonicalization complex ID must be derived from its source document ID.");
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone(value) as CanonicalFinite2DResult };
};

const sourceRef = (
  source: TopologyDocumentSource,
  dimension: CanonicalCellDimension,
  cellId: string,
  occurrence?: number
): CanonicalFinite2DSourceReference => ({
  sourceId: source.sourceId,
  stage: "source",
  dimension,
  cellId,
  ...(occurrence === undefined ? {} : { occurrence }),
});

const requireRecordArray = (value: unknown, path: string): Record<string, unknown>[] => {
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) {
    throw new TypeError(`${path} must be an array of objects.`);
  }
  return value as Record<string, unknown>[];
};

const requireId = (value: unknown, path: string): string => {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new TypeError(`${path} must be an ID-safe string.`);
  return value;
};

const requireName = (value: unknown, fallback: string, path: string): string => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${path} must be a non-empty string.`);
  return value;
};

const requireOrientation = (value: unknown, path: string): CanonicalOrientation => {
  if (value !== 1 && value !== -1) throw new TypeError(`${path} must be 1 or -1.`);
  return value;
};

const canonicalizeCW = (document: TopologyDocument, generation: number): CanonicalFinite2DResult => {
  const source = document.source;
  const model = source.model;
  const modelId = requireId(model.id, "source.model.id");
  const name = requireName(model.name, modelId, "source.model.name");
  const vertices = requireRecordArray(model.vertices, "source.model.vertices").map((entry, index) => {
    const id = requireId(entry.id, `source.model.vertices[${index}].id`);
    return { id, name: requireName(entry.name, id, `source.model.vertices[${index}].name`), sourceRefs: [sourceRef(source, 0, id)] };
  });
  const edges = requireRecordArray(model.edges, "source.model.edges").map((entry, index) => {
    const id = requireId(entry.id, `source.model.edges[${index}].id`);
    if (!Array.isArray(entry.endpoints) || entry.endpoints.length !== 2) {
      throw new TypeError(`source.model.edges[${index}].endpoints must contain two vertex IDs.`);
    }
    return {
      id,
      name: requireName(entry.name, id, `source.model.edges[${index}].name`),
      endpoints: [
        requireId(entry.endpoints[0], `source.model.edges[${index}].endpoints[0]`),
        requireId(entry.endpoints[1], `source.model.edges[${index}].endpoints[1]`),
      ] as [string, string],
      sourceRefs: [sourceRef(source, 1, id)],
    };
  });
  const faces = requireRecordArray(model.faces, "source.model.faces").map((entry, index) => {
    const id = requireId(entry.id, `source.model.faces[${index}].id`);
    const attachment = requireRecordArray(entry.attachment, `source.model.faces[${index}].attachment`).map((token, occurrence) => ({
      edgeId: requireId(token.edgeId, `source.model.faces[${index}].attachment[${occurrence}].edgeId`),
      direction: requireOrientation(
        token.direction,
        `source.model.faces[${index}].attachment[${occurrence}].direction`
      ),
      sourceRef: sourceRef(source, 1, requireId(token.edgeId, `source.model.faces[${index}].attachment[${occurrence}].edgeId`), occurrence),
    }));
    return {
      id,
      name: requireName(entry.name, id, `source.model.faces[${index}].name`),
      attachment,
      sourceRefs: [sourceRef(source, 2, id)],
    };
  });
  return createCanonicalFinite2DResult({ document, generation, method: "finite CW identity", name, vertices, edges, faces });
};

const canonicalizeSimplicial = (document: TopologyDocument, generation: number): CanonicalFinite2DResult => {
  const source = document.source;
  const model = source.model;
  const modelId = requireId(model.id, "source.model.id");
  const name = requireName(model.name, modelId, "source.model.name");
  if (!Array.isArray(model.vertexIds)) throw new TypeError("source.model.vertexIds must be an array.");
  const vertices = model.vertexIds.map((entry, index) => {
    const id = requireId(entry, `source.model.vertexIds[${index}]`);
    return { id, sourceRefs: [sourceRef(source, 0, id)] };
  });
  const edges = requireRecordArray(model.edges, "source.model.edges").map((entry, index) => {
    const id = requireId(entry.id, `source.model.edges[${index}].id`);
    if (!Array.isArray(entry.vertices) || entry.vertices.length !== 2) {
      throw new TypeError(`source.model.edges[${index}].vertices must contain two vertex IDs.`);
    }
    return {
      id,
      endpoints: [
        requireId(entry.vertices[0], `source.model.edges[${index}].vertices[0]`),
        requireId(entry.vertices[1], `source.model.edges[${index}].vertices[1]`),
      ] as [string, string],
      sourceRefs: [sourceRef(source, 1, id)],
    };
  });
  const edgeByPair = new Map<string, typeof edges[number]>();
  for (const edge of [...edges].sort((left, right) => left.id.localeCompare(right.id))) {
    const key = [...edge.endpoints].sort().join("\u0000");
    if (edgeByPair.has(key)) throw new TypeError(`source.model.edges contains more than one edge for '${edge.endpoints.join("-")}'.`);
    edgeByPair.set(key, edge);
  }
  const faces = requireRecordArray(model.triangles, "source.model.triangles").map((entry, index) => {
    const id = requireId(entry.id, `source.model.triangles[${index}].id`);
    if (!Array.isArray(entry.vertices) || entry.vertices.length !== 3) {
      throw new TypeError(`source.model.triangles[${index}].vertices must contain three vertex IDs.`);
    }
    const triangle = entry.vertices.map((vertex, vertexIndex) =>
      requireId(vertex, `source.model.triangles[${index}].vertices[${vertexIndex}]`)
    );
    const attachment = triangle.map((from, occurrence) => {
      const to = triangle[(occurrence + 1) % 3]!;
      const edge = edgeByPair.get([from, to].sort().join("\u0000"));
      if (!edge) throw new TypeError(`source triangle '${id}' side '${from}-${to}' has no declared edge.`);
      return {
        edgeId: edge.id,
        direction: (edge.endpoints[0] === from && edge.endpoints[1] === to ? 1 : -1) as CanonicalOrientation,
        sourceRef: sourceRef(source, 1, edge.id, occurrence),
      };
    });
    return { id, attachment, sourceRefs: [sourceRef(source, 2, id)] };
  });
  return createCanonicalFinite2DResult({ document, generation, method: "simplicial incidence", name, vertices, edges, faces });
};

export const canonicalizeFinite2DTopologyDocument = (
  value: TopologyDocument,
  generation = 1
): CanonicalFinite2DOutcome => {
  const normalized = normalizeTopologyDocument(value);
  if (!normalized.ok) {
    return {
      status: "invalid-source",
      algorithmVersion: FINITE_2D_CANONICALIZER_VERSION,
      diagnostics: normalized.errors.map((message) => ({ code: "canonicalization/invalid-document", message })),
    };
  }
  const document = normalized.value;
  const source = sourceGenerationFor(document, generation);
  if (!Number.isSafeInteger(generation) || generation < 1) {
    return {
      status: "invalid-source",
      source: { ...source, generation: 1 },
      algorithmVersion: FINITE_2D_CANONICALIZER_VERSION,
      diagnostics: [{ code: "canonicalization/invalid-generation", message: "Generation must be a positive safe integer." }],
    };
  }
  try {
    if (document.source.kind === "cw-complex") return canonicalizeCW(document, generation);
    if (document.source.kind === "simplicial-complex") return canonicalizeSimplicial(document, generation);
    return {
      status: "unsupported",
      source,
      algorithmVersion: FINITE_2D_CANONICALIZER_VERSION,
      diagnostics: [{
        code: "canonicalization/unsupported-source-kind",
        message: `Source kind '${document.source.kind}' requires its scoped compatibility adapter.`,
      }],
    };
  } catch (error) {
    return {
      status: "invalid-source",
      source,
      algorithmVersion: FINITE_2D_CANONICALIZER_VERSION,
      diagnostics: [{
        code: "canonicalization/invalid-source-model",
        message: error instanceof Error ? error.message : "Canonicalization failed for the declared source model.",
      }],
    };
  }
};

const cellsAtDimension = (
  complex: CanonicalFinite2DComplex,
  dimension: CanonicalCellDimension
): readonly (CanonicalFinite2DVertex | CanonicalFinite2DEdge | CanonicalFinite2DFace)[] =>
  dimension === 0 ? complex.vertices : dimension === 1 ? complex.edges : complex.faces;

export const locateCanonicalCellSourceReferences = (
  complex: CanonicalFinite2DComplex,
  locator: CanonicalFinite2DCellLocator
): readonly CanonicalFinite2DSourceReference[] =>
  cellsAtDimension(complex, locator.dimension).find((cell) => cell.id === locator.cellId)?.sourceRefs ?? [];

export const locateCanonicalCellsForSource = (
  complex: CanonicalFinite2DComplex,
  source: Readonly<{ dimension: CanonicalCellDimension; cellId: string }>
): readonly CanonicalFinite2DCellLocator[] =>
  cellsAtDimension(complex, source.dimension)
    .filter((cell) => cell.sourceRefs.some((reference) =>
      reference.sourceId === complex.sourceId &&
      reference.dimension === source.dimension &&
      reference.cellId === source.cellId
    ))
    .map((cell) => ({ dimension: source.dimension, cellId: cell.id }));
