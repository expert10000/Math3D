import {
  createAnalysisResultEnvelope,
  createAnalysisResultFromScientificJob,
  createCurrentDocumentRelation,
  createScientificJobRequest,
  matchesScientificSourceGeneration,
  type AnalysisArtifactHandle,
  type AnalysisArtifactKind,
  type AnalysisDiagnostic,
  type AnalysisEngineProvenance,
  type AnalysisNumericContext,
  type AnalysisResultEnvelope,
  type AnalysisResultStatus,
  type CanonicalJsonValue,
  type DocumentRelation,
  type ScientificJobFailure,
  type ScientificJobLimits,
  type ScientificSourceGeneration,
} from "@math3d/core";
import {
  createInMemoryArtifactRegistry,
  createInProcessScientificJobService,
  type InMemoryArtifactRegistry,
  type ScientificJobExecutionContext,
} from "@math3d/kernel";
import type { GeometryDocumentAdapter } from "./geometryDocumentAdapter";

export type GeometryDenseArtifact = Readonly<{
  kind: AnalysisArtifactKind;
  role: string;
  encoding: string;
  bytes: Uint8Array;
}>;

export type GeometryDerivedComputation = Readonly<{
  status: AnalysisResultStatus;
  algorithm: string;
  algorithmVersion: string;
  engine: AnalysisEngineProvenance;
  elapsedMs: number;
  numericContext?: AnalysisNumericContext;
  summary: Readonly<Record<string, CanonicalJsonValue>>;
  warnings?: readonly string[];
  diagnostics?: readonly AnalysisDiagnostic[];
  artifacts?: readonly GeometryDenseArtifact[];
  promotedTarget?: ScientificSourceGeneration;
  locateBack?: Readonly<Record<string, string>>;
}>;

export type GeometryDerivedExecutor = Readonly<{
  operationType: string;
  execute: (
    parameters: CanonicalJsonValue,
    context: ScientificJobExecutionContext
  ) => GeometryDerivedComputation | Promise<GeometryDerivedComputation>;
}>;

export type GeometryDerivedPublication = Readonly<{
  result: AnalysisResultEnvelope;
  relations: readonly DocumentRelation[];
}>;

export type GeometryDerivedOutcome = GeometryDerivedPublication | ScientificJobFailure;

const DEFAULT_LIMITS = (): ScientificJobLimits => ({
  deadlineAt: Date.now() + 30_000,
  maxInputBytes: 64 * 1024,
  maxOutputBytes: 64 * 1024,
  maxMemoryBytes: 256 * 1024 * 1024,
  maxWorkUnits: 10_000_000,
});
const asRecord = (value: CanonicalJsonValue): Record<string, CanonicalJsonValue> => value as Record<string, CanonicalJsonValue>;

export class GeometryDerivedResourceCoordinator {
  readonly #adapter: GeometryDocumentAdapter;
  readonly #artifacts: InMemoryArtifactRegistry;
  readonly #jobs: ReturnType<typeof createInProcessScientificJobService>;
  readonly #results: AnalysisResultEnvelope[] = [];
  readonly #relations: DocumentRelation[] = [];
  readonly #locateBack = new Map<string, string>();
  #sequence = 0;

  constructor(adapter: GeometryDocumentAdapter, executors: readonly GeometryDerivedExecutor[]) {
    this.#adapter = adapter;
    this.#artifacts = createInMemoryArtifactRegistry({ resolveSource: (id) => {
      const current = this.source();
      return current.documentId === id ? current : null;
    } });
    this.#jobs = createInProcessScientificJobService({
      resolveSource: (id) => {
        const current = this.source();
        return current.documentId === id ? current : null;
      },
      adapters: executors.map((executor) => ({
        operationType: executor.operationType,
        execute: async (input, context) => {
          const computed = await executor.execute(input.payload, context);
          context.checkpoint();
          const handles: AnalysisArtifactHandle[] = [];
          for (const [index, artifact] of (computed.artifacts ?? []).entries()) {
            const handle: AnalysisArtifactHandle = { artifactId: `${input.jobId}/artifact/${index + 1}`, kind: artifact.kind, role: artifact.role };
            this.#artifacts.declare({ handle, source: input.source, ownerId: input.jobId, encoding: artifact.encoding });
            this.#artifacts.beginComputation(handle.artifactId, input.jobId, input.source);
            this.#artifacts.publish({ artifactId: handle.artifactId, ownerId: input.jobId, source: input.source, bytes: artifact.bytes });
            handles.push(handle);
          }
          return {
            status: computed.status,
            algorithm: computed.algorithm,
            algorithmVersion: computed.algorithmVersion,
            engine: computed.engine,
            elapsedMs: computed.elapsedMs,
            ...(computed.numericContext ? { numericContext: computed.numericContext } : {}),
            summary: computed.summary,
            warnings: computed.warnings ?? [],
            diagnostics: computed.diagnostics ?? [],
            artifacts: handles,
            ...(computed.promotedTarget ? { promotedTarget: computed.promotedTarget } : {}),
            ...(computed.locateBack ? { locateBack: computed.locateBack } : {}),
          } as CanonicalJsonValue;
        },
      })),
    });
  }

  source(): ScientificSourceGeneration {
    const identity = this.#adapter.document().identity;
    return { documentId: identity.id, revision: identity.revision, structuralHash: identity.structuralHash, generation: identity.revision };
  }

  artifactRegistry(): InMemoryArtifactRegistry { return this.#artifacts; }
  results(): readonly AnalysisResultEnvelope[] { return [...this.#results]; }
  relations(): readonly DocumentRelation[] { return [...this.#relations]; }
  locateGeometrySource(meshEntityId: string): string | null { return this.#locateBack.get(meshEntityId) ?? null; }

  async submit(
    operationType: string,
    parameters: Readonly<Record<string, CanonicalJsonValue>>,
    options: { limits?: ScientificJobLimits; resultId?: string } = {}
  ): Promise<GeometryDerivedOutcome> {
    this.#sequence += 1;
    const jobId = `geometry/job/${this.#sequence}`;
    const source = this.source();
    const job = createScientificJobRequest({ jobId, source, operation: { type: operationType, payload: parameters }, limits: options.limits ?? DEFAULT_LIMITS() });
    const outcome = await this.#jobs.submit(job);
    if (!outcome.ok) return outcome;
    const output = asRecord(outcome.output);
    const current = this.source();
    const result = createAnalysisResultFromScientificJob({
      resultId: options.resultId ?? `${jobId}/result`,
      status: output.status as AnalysisResultStatus,
      jobResult: outcome,
      currentSource: current,
      algorithm: output.algorithm as string,
      algorithmVersion: output.algorithmVersion as string,
      parameters,
      ...(output.numericContext ? { numericContext: output.numericContext as AnalysisNumericContext } : {}),
      engine: output.engine as AnalysisEngineProvenance,
      elapsedMs: output.elapsedMs as number,
      summary: output.summary as Record<string, CanonicalJsonValue>,
      warnings: output.warnings as string[],
      diagnostics: output.diagnostics as AnalysisDiagnostic[],
      artifacts: output.artifacts as AnalysisArtifactHandle[],
    });
    const produced: DocumentRelation[] = [createCurrentDocumentRelation({
      kind: "analysis-of", sources: [source], sourceOrder: "ordered",
      target: { type: "result", resultId: result.resultId, resultType: operationType },
      operation: operationType, parameters, producer: { jobId, resultIds: [result.resultId] },
      tool: { name: (output.engine as AnalysisEngineProvenance).name, version: (output.engine as AnalysisEngineProvenance).version },
    }, (id) => id === current.documentId ? current : null)];
    for (const handle of result.artifacts) produced.push(createCurrentDocumentRelation({
      kind: "generated-by", sources: [source], sourceOrder: "ordered",
      target: { type: "artifact", artifactId: handle.artifactId, artifactKind: handle.kind, role: handle.role },
      operation: operationType, parameters, producer: { jobId, resultIds: [result.resultId] },
    }, (id) => id === current.documentId ? current : null));
    if (output.promotedTarget) produced.push(createCurrentDocumentRelation({
      kind: "promoted-from", sources: [source], sourceOrder: "ordered",
      target: { type: "document", generation: output.promotedTarget as ScientificSourceGeneration },
      operation: operationType, parameters, producer: { jobId, resultIds: [result.resultId] },
    }, (id) => id === current.documentId ? current : null));
    for (const [meshId, geometryId] of Object.entries((output.locateBack ?? {}) as Record<string, string>)) this.#locateBack.set(meshId, geometryId);
    this.#results.push(result); this.#relations.push(...produced);
    return { result, relations: produced };
  }

  publishBoundedExactMeasurement(input: {
    resultId: string;
    operationType: "geometry.measure.distance" | "geometry.measure.angle" | "geometry.measure.area";
    algorithm: string;
    parameters: Readonly<Record<string, CanonicalJsonValue>>;
    summary: Readonly<Record<string, CanonicalJsonValue>>;
    elapsedMs: number;
  }): GeometryDerivedPublication {
    const source = this.source();
    const result = createAnalysisResultEnvelope({
      resultId: input.resultId, status: "exact",
      provenance: { source, operation: { type: input.operationType, algorithm: input.algorithm, algorithmVersion: "1", parameters: input.parameters }, engine: { name: "Math3D exact geometry core", version: "1" }, elapsedMs: input.elapsedMs },
      summary: { ...input.summary, authorityReason: "bounded exact O(1) operation; worker scheduling would dominate cost" }, warnings: [], diagnostics: [], artifacts: [],
    });
    const relation = createCurrentDocumentRelation({ kind: "analysis-of", sources: [source], sourceOrder: "ordered", target: { type: "result", resultId: result.resultId, resultType: input.operationType }, operation: input.operationType, parameters: input.parameters, tool: { name: "Math3D exact geometry core", version: "1" } }, (id) => id === source.documentId ? source : null);
    this.#results.push(result); this.#relations.push(relation);
    return { result, relations: [relation] };
  }

  isCurrent(result: AnalysisResultEnvelope): boolean { return matchesScientificSourceGeneration(result.provenance.source, this.source()); }
}
