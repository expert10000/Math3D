import { createScientificJobRequest, evaluateGraph2DExpression,
  graph2DParameterStudySourceFingerprint, isGraph2DParameterStudyResult,
  previewGraph2DParameterValues, structuralHash,
  type Graph2DDocument, type Graph2DParameterStudy, type Graph2DParameterStudyResult,
  type ScientificSourceGeneration, type StableDocumentId } from "@math3d/core";
import { createExecutionService } from "./executionService";
import { createInProcessScientificBackend, createScientificExecutionBroker,
  type ScientificBrokerOutcome } from "./scientificExecutionBroker";
import { createInProcessScientificJobService, type ScientificJobExecutionContext } from "./scientificJobService";

export const GRAPH2D_PARAMETER_STUDY_OPERATION = "graph2d.parameter-study" as const;
type Pending = Readonly<{ document: Graph2DDocument; study: Graph2DParameterStudy;
  studyHash: string; fingerprint: string; onProgress?: (done: number, total: number) => void }>;
export type Graph2DParameterStudyJobOutcome = Readonly<{ broker: ScientificBrokerOutcome;
  publication: "published" | "failed" | "stale-recipe" | "superseded";
  result: Graph2DParameterStudyResult | null }>;
export type Graph2DParameterStudyJobHandle = Readonly<{ jobId: string;
  promise: Promise<Graph2DParameterStudyJobOutcome>; cancel: () => boolean }>;
const generation = (document: Graph2DDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id, revision: document.identity.revision,
  structuralHash: document.identity.structuralHash, generation: document.identity.revision,
});
const MAX_INPUT_BYTES = 4096, MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_MEMORY_BYTES = 128 * 1024, MAX_WORK_UNITS = 256 * 256;

/** Bounded, cancellable Graph parameter sweep. Publication is guarded after broker completion. */
export class Graph2DParameterStudyJob {
  readonly #document: () => Graph2DDocument;
  readonly #yieldControl: (jobId: string) => Promise<void>;
  readonly #pending = new Map<string, Pending>();
  readonly #latest = new Map<string, string>();
  readonly #published = new Map<string, Graph2DParameterStudyResult>();
  readonly #service;
  readonly #broker;
  readonly #execution;

  constructor(options: { document: () => Graph2DDocument;
    yieldControl?: (jobId: string) => Promise<void> }) {
    this.#document = options.document;
    this.#yieldControl = options.yieldControl ?? (() => new Promise(resolve => setTimeout(resolve, 0)));
    const resolveSource = (id: StableDocumentId) => {
      try { const current = this.#document(); return current.identity.id === id ? generation(current) : null; }
      catch { return null; }
    };
    this.#service = createInProcessScientificJobService({ resolveSource,
      adapters: [{ operationType: GRAPH2D_PARAMETER_STUDY_OPERATION,
        execute: (input, context) => this.#execute(input.jobId, context) }] });
    this.#broker = createScientificExecutionBroker({ resolveSource,
      backends: [createInProcessScientificBackend({ backendId: "graph-parameter-study-js",
        backendVersion: "1", priority: 100,
        operations: [{ operationType: GRAPH2D_PARAMETER_STUDY_OPERATION, retrySafety: "never",
          maxInputBytes: MAX_INPUT_BYTES, maxOutputBytes: MAX_OUTPUT_BYTES,
          maxMemoryBytes: MAX_MEMORY_BYTES, maxWorkUnits: MAX_WORK_UNITS }],
        service: this.#service })] });
    this.#execution = createExecutionService(this.#broker);
  }

  cancel(jobId: string) { return this.#execution.cancel(jobId); }
  dispose() { for (const id of this.#pending.keys()) this.cancel(id);
    this.#pending.clear(); this.#latest.clear(); this.#published.clear(); }
  read(studyId: string): Graph2DParameterStudyResult | null {
    const document = this.#document(), study = document.source.parameterStudies?.find(item => item.id === studyId);
    const result = this.#published.get(`${document.identity.id}:${studyId}`);
    return study && result && result.studyHash === structuralHash(study) &&
      result.sourceFingerprint === graph2DParameterStudySourceFingerprint(document, study) ? result : null;
  }

  submit(studyId: string, options: { jobId?: string; timeoutMs?: number;
    onProgress?: Pending["onProgress"] } = {}): Graph2DParameterStudyJobHandle {
    const document = this.#document(), study = document.source.parameterStudies?.find(item => item.id === studyId);
    if (!study) throw new TypeError("Save a parameter study first.");
    const source = document.source.objects.find(item => item.id === study.sourceObjectId);
    const variable = document.source.variables.find(item => item.name === study.parameterName);
    if (source?.kind !== "explicit-cartesian" || !variable?.control ||
        study.measurement.x < source.domain.min || study.measurement.x > source.domain.max ||
        study.measurement.x === source.domain.min && !source.domain.includeMin ||
        study.measurement.x === source.domain.max && !source.domain.includeMax)
      throw new TypeError("The study source, parameter or physical measurement point is unavailable.");
    if (study.range.min < variable.control.min || study.range.max > variable.control.max)
      throw new RangeError("Study range exceeds the saved parameter control.");
    const timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000)
      throw new RangeError("Study deadline must be 100–30000 ms.");
    const jobId = options.jobId ?? crypto.randomUUID();
    if (this.#pending.has(jobId)) throw new TypeError("Study job ID is already active.");
    const studyHash = structuralHash(study), fingerprint = graph2DParameterStudySourceFingerprint(document, study)!;
    const key = `${document.identity.id}:${studyId}`;
    this.#pending.set(jobId, { document, study, studyHash, fingerprint, onProgress: options.onProgress });
    this.#latest.set(key, jobId);
    const request = createScientificJobRequest({ jobId, source: generation(document),
      operation: { type: GRAPH2D_PARAMETER_STUDY_OPERATION,
        payload: { studyId, studyHash, fingerprint } },
      limits: { deadlineAt: Date.now() + timeoutMs, maxInputBytes: MAX_INPUT_BYTES,
        maxOutputBytes: MAX_OUTPUT_BYTES, maxMemoryBytes: MAX_MEMORY_BYTES,
        maxWorkUnits: study.range.samples * 256 } });
    const promise = this.#execution.submit(request).then((broker): Graph2DParameterStudyJobOutcome => {
      if (!broker.ok) return { broker, publication: "failed", result: null };
      if (this.#latest.get(key) !== jobId)
        return { broker, publication: "superseded", result: null };
      const result = broker.result.output;
      if (!isGraph2DParameterStudyResult(result) || result.studyId !== studyId ||
          result.studyHash !== studyHash || result.sourceFingerprint !== fingerprint ||
          result.rows.length !== study.range.samples)
        return { broker, publication: "stale-recipe", result: null };
      const current = this.#document(), currentStudy = current.source.parameterStudies?.find(item => item.id === studyId);
      if (current.identity.id !== document.identity.id || !currentStudy ||
          structuralHash(currentStudy) !== studyHash ||
          graph2DParameterStudySourceFingerprint(current, currentStudy) !== fingerprint)
        return { broker, publication: "stale-recipe", result: null };
      this.#published.set(key, result);
      if (this.#published.size > 64) this.#published.delete(this.#published.keys().next().value!);
      return { broker, publication: "published", result };
    }).finally(() => this.#pending.delete(jobId));
    return { jobId, promise, cancel: () => this.cancel(jobId) };
  }

  async #execute(jobId: string, context: ScientificJobExecutionContext): Promise<Graph2DParameterStudyResult> {
    const pending = this.#pending.get(jobId);
    if (!pending) throw new TypeError("Study job input is unavailable.");
    const { document, study } = pending;
    const object = document.source.objects.find(item => item.id === study.sourceObjectId);
    if (object?.kind !== "explicit-cartesian") throw new TypeError("Study function is unavailable.");
    const count = study.range.samples, memory = count * 64;
    context.reserveMemory(memory);
    try {
      const rows: { x: number; y: number }[] = [];
      for (let index = 0; index < count; index++) {
        context.consumeWork(256);
        const x = index === 0 ? study.range.min : index === count - 1 ? study.range.max :
          study.range.min + (study.range.max - study.range.min) * index / (count - 1);
        const frame = previewGraph2DParameterValues(document, { [study.parameterName]: x });
        const variables = Object.fromEntries(frame.source.variables.map(item => [item.name, item.value]));
        const measured = evaluateGraph2DExpression(object.expression.ast,
          { ...variables, x: study.measurement.x }, { maxEvaluations: 256 });
        if (!measured.ok || !Number.isFinite(measured.value))
          throw new RangeError(`Study measurement is undefined at sample ${index + 1}.`);
        rows.push({ x, y: measured.value });
        if ((index + 1) % 8 === 0 || index + 1 === count) {
          context.reportProgress({ completed: index + 1, total: count,
            message: "Measuring Graph parameter study" });
          pending.onProgress?.(index + 1, count);
          if (index + 1 < count) { await this.#yieldControl(jobId); context.checkpoint(); }
        }
      }
      const result = { studyId: study.id, studyHash: pending.studyHash,
        sourceFingerprint: pending.fingerprint, rows };
      if (!isGraph2DParameterStudyResult(result)) throw new TypeError("Invalid study result.");
      context.checkpoint();
      return result;
    } finally { context.releaseMemory(memory); }
  }
}

export const createGraph2DParameterStudyJob = (options: ConstructorParameters<typeof Graph2DParameterStudyJob>[0]) =>
  new Graph2DParameterStudyJob(options);
