import { createDocumentRelation } from "@math3d/core";
import type {
  AnalysisArtifactHandle,
  ComplexAnalysisDocument,
  ComplexBranchPolicy,
  ComplexExpressionAst,
  ComplexResultReference,
  DocumentRelation,
  ScientificSourceGeneration,
} from "@math3d/core";
import type { InMemoryArtifactRegistry } from "@math3d/kernel";

export const COMPLEX_RIEMANN_SURFACE_HANDOFF_SCHEMA_VERSION = 1 as const;

export type ComplexRiemannSurfaceQuantity = "re" | "im" | "abs" | "arg" | "sheet_index";

export type ComplexRiemannSurfaceHandoff = Readonly<{
  schemaVersion: typeof COMPLEX_RIEMANN_SURFACE_HANDOFF_SCHEMA_VERSION;
  handoffId: string;
  source: ScientificSourceGeneration;
  function: Readonly<{
    sourceText: string;
    normalizedAst: ComplexExpressionAst;
    branchPolicy: ComplexBranchPolicy;
  }>;
  resultReferences: readonly ComplexResultReference[];
  generation: Readonly<{
    quantity: ComplexRiemannSurfaceQuantity;
    columns: number;
    rows: number;
    sheetCount: number;
    domain: Readonly<{ uMin: number; uMax: number; vMin: number; vMax: number }>;
  }>;
  artifacts: Readonly<{
    sheetMesh: AnalysisArtifactHandle;
    seams: AnalysisArtifactHandle;
    scalarField: AnalysisArtifactHandle;
  }>;
  seams: readonly Readonly<{
    seamId: string;
    fromSheet: number;
    toSheet: number;
    cutKind: ComplexBranchPolicy["cut"]["kind"];
    cutAngleRadians: number | null;
    orientation: "preserving";
  }>[];
  relationships: readonly Readonly<{
    relationId: string;
    targetModule: "Surfaces" | "Mesh";
    kind: "derived-sheet-surface" | "derived-analysis-mesh";
  }>[];
}>;

export type ComplexRiemannSurfaceLocation = Readonly<{
  handoffId: string;
  vertexIndex: number;
  sheetIndex: number;
  grid: Readonly<{ column: number; row: number }>;
  z: Readonly<{ re: number; im: number }>;
  functionSource: string;
  normalizedAst: ComplexExpressionAst;
  branchPolicy: ComplexBranchPolicy;
  resultReferences: readonly ComplexResultReference[];
  source: ScientificSourceGeneration;
  generation: ComplexRiemannSurfaceHandoff["generation"];
}>;

type CreateInput = Readonly<{
  document: ComplexAnalysisDocument;
  registry: InMemoryArtifactRegistry;
  positions: Float32Array;
  indices: Uint32Array;
  scalarField: Float32Array;
  quantity: ComplexRiemannSurfaceQuantity;
  columns: number;
  rows: number;
  sheetCount: number;
  domain: Readonly<{ uMin: number; uMax: number; vMin: number; vMax: number }>;
}>;

const sourceOf = (document: ComplexAnalysisDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id,
  revision: document.identity.revision,
  structuralHash: document.identity.structuralHash,
  generation: document.identity.revision,
});

const bytesOf = (values: Float32Array | Uint32Array): Uint8Array =>
  new Uint8Array(values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength));

export const createComplexRiemannSurfaceHandoff = (input: CreateInput): ComplexRiemannSurfaceHandoff => {
  const vertexCount = input.positions.length / 3;
  if (!Number.isSafeInteger(vertexCount) || vertexCount !== input.scalarField.length) {
    throw new TypeError("Riemann sheet mesh positions and scalar field must describe the same vertices.");
  }
  if (input.columns < 2 || input.rows < 2 || input.sheetCount < 1 || vertexCount !== input.columns * input.rows * input.sheetCount) {
    throw new TypeError("Riemann sheet mesh dimensions do not match its generation grid.");
  }
  const source = sourceOf(input.document);
  const suffix = `${source.revision}:${source.structuralHash.slice(-16)}:${input.quantity}`;
  const artifacts = {
    sheetMesh: { artifactId: `complex-riemann:${suffix}:mesh`, kind: "mesh", role: "complex-riemann/sheet-mesh" },
    seams: { artifactId: `complex-riemann:${suffix}:seams`, kind: "table", role: "complex-riemann/seams" },
    scalarField: { artifactId: `complex-riemann:${suffix}:scalar`, kind: "sampled-grid", role: `complex-riemann/scalar/${input.quantity}` },
  } as const satisfies Record<string, AnalysisArtifactHandle>;
  const seams = Object.freeze(Array.from({ length: input.sheetCount }, (_, sheet) => Object.freeze({
    seamId: `cut:${sheet}->${(sheet + 1) % input.sheetCount}`,
    fromSheet: sheet,
    toSheet: (sheet + 1) % input.sheetCount,
    cutKind: input.document.branchPolicy.cut.kind,
    cutAngleRadians: input.document.branchPolicy.cut.angleRadians,
    orientation: "preserving" as const,
  })));
  const meshBytes = new Uint8Array(input.positions.byteLength + input.indices.byteLength);
  meshBytes.set(bytesOf(input.positions));
  meshBytes.set(bytesOf(input.indices), input.positions.byteLength);
  const seamBytes = new TextEncoder().encode(JSON.stringify(seams));
  const ownerId = "complex-riemann-handoff";
  const payloads: readonly [AnalysisArtifactHandle, string, Uint8Array][] = [
    [artifacts.sheetMesh, "float32-positions+uint32-triangles", meshBytes],
    [artifacts.seams, "utf8-json", seamBytes],
    [artifacts.scalarField, "float32-le", bytesOf(input.scalarField)],
  ];
  for (const [handle, encoding, bytes] of payloads) {
    input.registry.declare({ handle, source, ownerId, encoding });
    input.registry.beginComputation(handle.artifactId, ownerId, source);
    input.registry.publish({ artifactId: handle.artifactId, source, ownerId, bytes });
  }
  const handoffId = `complex-riemann-handoff:${suffix}`;
  return Object.freeze({
    schemaVersion: COMPLEX_RIEMANN_SURFACE_HANDOFF_SCHEMA_VERSION,
    handoffId,
    source,
    function: Object.freeze({
      sourceText: input.document.function.sourceText,
      normalizedAst: input.document.function.normalizedAst,
      branchPolicy: input.document.branchPolicy,
    }),
    resultReferences: Object.freeze([...input.document.results]),
    generation: Object.freeze({ quantity: input.quantity, columns: input.columns, rows: input.rows, sheetCount: input.sheetCount, domain: input.domain }),
    artifacts: Object.freeze(artifacts),
    seams,
    relationships: Object.freeze([
      Object.freeze({ relationId: `${handoffId}:surfaces`, targetModule: "Surfaces" as const, kind: "derived-sheet-surface" as const }),
      Object.freeze({ relationId: `${handoffId}:mesh`, targetModule: "Mesh" as const, kind: "derived-analysis-mesh" as const }),
    ]),
  });
};

export const locateComplexRiemannSurfaceVertex = (
  handoff: ComplexRiemannSurfaceHandoff,
  vertexIndex: number
): ComplexRiemannSurfaceLocation | null => {
  const perSheet = handoff.generation.columns * handoff.generation.rows;
  if (!Number.isSafeInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= perSheet * handoff.generation.sheetCount) return null;
  const sheetIndex = Math.floor(vertexIndex / perSheet);
  const local = vertexIndex % perSheet;
  const row = Math.floor(local / handoff.generation.columns);
  const column = local % handoff.generation.columns;
  const { uMin, uMax, vMin, vMax } = handoff.generation.domain;
  return Object.freeze({
    handoffId: handoff.handoffId,
    vertexIndex,
    sheetIndex,
    grid: Object.freeze({ column, row }),
    z: Object.freeze({
      re: uMin + (uMax - uMin) * column / Math.max(1, handoff.generation.columns - 1),
      im: vMin + (vMax - vMin) * row / Math.max(1, handoff.generation.rows - 1),
    }),
    functionSource: handoff.function.sourceText,
    normalizedAst: handoff.function.normalizedAst,
    branchPolicy: handoff.function.branchPolicy,
    resultReferences: handoff.resultReferences,
    source: handoff.source,
    generation: handoff.generation,
  });
};

export const adaptComplexRiemannSurfaceHandoffRelations = (
  handoff: ComplexRiemannSurfaceHandoff
): readonly DocumentRelation[] => Object.freeze(handoff.relationships.map((relationship) =>
  createDocumentRelation({
    kind: "derived-from",
    sources: [handoff.source],
    sourceOrder: "unordered",
    target: {
      type: "artifact",
      artifactId: handoff.artifacts.sheetMesh.artifactId,
      artifactKind: handoff.artifacts.sheetMesh.kind,
      role: handoff.artifacts.sheetMesh.role,
    },
    operation: "complex.riemann-surface",
    parameters: {
      targetModule: relationship.targetModule,
      relationshipKind: relationship.kind,
      quantity: handoff.generation.quantity,
      columns: handoff.generation.columns,
      rows: handoff.generation.rows,
      sheetCount: handoff.generation.sheetCount,
    },
    ...(handoff.resultReferences.length
      ? { producer: { resultIds: handoff.resultReferences.map((reference) => reference.resultId) } }
      : {}),
    tool: { name: "Math3D Complex Riemann-surface adapter", version: "1" },
  })
));

export const isComplexRiemannSurfaceHandoffCurrent = (
  handoff: ComplexRiemannSurfaceHandoff,
  document: ComplexAnalysisDocument
): boolean => handoff.source.documentId === document.identity.id &&
  handoff.source.revision === document.identity.revision &&
  handoff.source.structuralHash === document.identity.structuralHash;
