import {
  createScientificJobRequest, currentProjectDerivedFieldResult,
  evaluateGraph2DExpression, matchesScientificSourceGeneration,
  normalizeDerivedFieldProfileResult, parseMath3DProject, reviewProjectDerivedField,
  serializeMath3DProject, type DerivedFieldDocument, type DerivedFieldProfileResult,
  type DerivedSourceVerification, type Math3DProject, type ScientificSourceGeneration,
  type StableDocumentId, type StructuralHash, type VectorField3DDocument,
} from "@math3d/core";
import { createExecutionService } from "./executionService";
import { createInProcessScientificBackend, createScientificExecutionBroker,
  type ScientificBrokerOutcome } from "./scientificExecutionBroker";
import { createInProcessScientificJobService,
  type ScientificJobExecutionContext, type ScientificJobListener } from "./scientificJobService";

export const DERIVED_PROFILE_OPERATION = "field.derived-profile" as const;
const MAX_INPUT_BYTES = 4096, MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_MEMORY_BYTES = 512 * 1024, MAX_WORK_UNITS = 2048 * 768;
type Chain = { magnitude: DerivedFieldDocument; plane: DerivedFieldDocument;
  profile: DerivedFieldDocument; source: VectorField3DDocument; cacheKey: StructuralHash };
type Pending = Chain & { projectId: string; jobId: string;
  onProgress?: (completed: number, total: number) => void };
export type DerivedProfileJobOutcome = Readonly<{
  broker: ScientificBrokerOutcome;
  publication: "published" | "failed" | "stale-recipe" | "superseded";
  result: DerivedFieldProfileResult | null;
}>;
export type DerivedProfileJobHandle = Readonly<{
  jobId: string; promise: Promise<DerivedProfileJobOutcome>; cancel: () => boolean;
}>;
export type DerivedFieldProfileJobOptions = Readonly<{
  project: () => Math3DProject;
  verifySource: DerivedSourceVerification;
  /** Cooperative yield seam; the default yields to the event loop after each 16 samples. */
  yieldControl?: (jobId: string) => Promise<void>;
}>;
const generation = (document: VectorField3DDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id, revision: document.identity.revision,
  structuralHash: document.identity.structuralHash, generation: document.identity.revision,
});
const sameIdentity = (left: VectorField3DDocument["identity"],
  right: VectorField3DDocument["identity"]) => left.id === right.id &&
  left.revision === right.revision && left.structuralHash === right.structuralHash;

/** Bounded, in-process GF-03 executor. Results remain cache artifacts, not Project source. */
export class DerivedFieldProfileJob {
  readonly #project: DerivedFieldProfileJobOptions["project"];
  readonly #verifySource: DerivedSourceVerification;
  readonly #yieldControl: (jobId: string) => Promise<void>;
  readonly #pending = new Map<string, Pending>();
  readonly #latest = new Map<string, string>();
  readonly #published = new Map<string, DerivedFieldProfileResult>();
  readonly #service;
  readonly #broker;
  readonly #execution;

  constructor(options: DerivedFieldProfileJobOptions) {
    this.#project = options.project;
    this.#verifySource = options.verifySource;
    this.#yieldControl = options.yieldControl ?? (() => new Promise(resolve => setTimeout(resolve, 0)));
    const resolveSource = (id: StableDocumentId): ScientificSourceGeneration | null => {
      try {
        const project = parseMath3DProject(serializeMath3DProject(this.#project()));
        const entry = project.workspace.entries.find(item => item.module === "vector3d" &&
          item.expected.id === id);
        if (!entry || entry.replay !== null ||
            entry.checkpoint.format !== "math3d.vector-field3d-document" ||
            !sameIdentity(entry.expected, entry.checkpoint.identity) ||
            !this.#verifySource(entry.checkpoint)) return null;
        return generation(entry.checkpoint);
      } catch { return null; }
    };
    this.#service = createInProcessScientificJobService({ resolveSource,
      adapters: [{ operationType: DERIVED_PROFILE_OPERATION,
        execute: (input, context) => this.#execute(input.jobId, context) }] });
    this.#broker = createScientificExecutionBroker({ resolveSource,
      backends: [createInProcessScientificBackend({
        backendId: "derived-profile-js", backendVersion: "1", priority: 100,
        operations: [{ operationType: DERIVED_PROFILE_OPERATION, retrySafety: "never",
          maxInputBytes: MAX_INPUT_BYTES, maxOutputBytes: MAX_OUTPUT_BYTES,
          maxMemoryBytes: MAX_MEMORY_BYTES, maxWorkUnits: MAX_WORK_UNITS }],
        service: this.#service,
      })] });
    this.#execution = createExecutionService(this.#broker);
  }

  subscribe(listener: ScientificJobListener) { return this.#service.subscribe(listener); }
  capabilities() { return this.#execution.discoverCapabilities(); }
  cancel(jobId: string): boolean { return this.#execution.cancel(jobId); }
  dispose(): void {
    for (const jobId of this.#pending.keys()) this.cancel(jobId);
    this.#pending.clear(); this.#published.clear(); this.#latest.clear();
  }

  /** The same guarded record can be consumed by Explorer and Graphs. */
  read(profileId: string): DerivedFieldProfileResult | null {
    try {
      const project = this.#project(), result = this.#published.get(`${project.identity.id}:${profileId}`);
      if (!result) return null;
      return currentProjectDerivedFieldResult(project, profileId,
        { cacheKey: result.cacheKey, value: result }, this.#verifySource);
    } catch { return null; }
  }

  submit(profileId: string, options: { jobId?: string; timeoutMs?: number;
    onProgress?: Pending["onProgress"] } = {}): DerivedProfileJobHandle {
    const project = parseMath3DProject(serializeMath3DProject(this.#project()));
    const chain = this.#chain(project, profileId);
    const jobId = options.jobId ?? crypto.randomUUID();
    const timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000)
      throw new RangeError("Profile deadline must be 100–30000 ms.");
    if (this.#pending.has(jobId)) throw new TypeError("Derived profile job ID is already active.");
    const samples = chain.profile.operation.kind === "line-profile" ? chain.profile.operation.samples : 0;
    const key = `${project.identity.id}:${profileId}`;
    const pending: Pending = { ...chain, projectId: project.identity.id, jobId,
      onProgress: options.onProgress };
    this.#pending.set(jobId, pending);
    this.#latest.set(key, jobId);
    const request = createScientificJobRequest({ jobId, source: generation(chain.source),
      operation: { type: DERIVED_PROFILE_OPERATION,
        payload: { projectId: project.identity.id, profileId, cacheKey: chain.cacheKey } },
      limits: { deadlineAt: Date.now() + timeoutMs, maxInputBytes: MAX_INPUT_BYTES,
        maxOutputBytes: MAX_OUTPUT_BYTES, maxMemoryBytes: MAX_MEMORY_BYTES,
        maxWorkUnits: samples * 768 } });
    const promise = this.#execution.submit(request).then((broker): DerivedProfileJobOutcome => {
      if (!broker.ok) return { broker, publication: "failed", result: null };
      if (this.#latest.get(key) !== jobId)
        return { broker, publication: "superseded", result: null };
      const checked = normalizeDerivedFieldProfileResult(broker.result.output);
      const axis = chain.profile.output.axes[0];
      const operation = chain.profile.operation;
      if (!checked.ok || checked.value.profileId !== profileId ||
          checked.value.cacheKey !== chain.cacheKey ||
          !matchesScientificSourceGeneration(checked.value.source, generation(chain.source)) ||
          !axis || operation.kind !== "line-profile" ||
          checked.value.axis.name !== axis.name || checked.value.axis.unit !== axis.unit ||
          checked.value.axis.min !== axis.min || checked.value.axis.max !== axis.max ||
          checked.value.unit !== chain.profile.output.unit ||
          checked.value.rows.length !== operation.samples)
        return { broker, publication: "stale-recipe", result: null };
      try {
        const current = this.#project();
        if (current.identity.id !== pending.projectId ||
            reviewProjectDerivedField(current, profileId, this.#verifySource).cacheKey !== chain.cacheKey)
          return { broker, publication: "stale-recipe", result: null };
      } catch { return { broker, publication: "stale-recipe", result: null }; }
      this.#published.set(key, checked.value);
      if (this.#published.size > 64) this.#published.delete(this.#published.keys().next().value!);
      return { broker, publication: "published", result: checked.value };
    }).finally(() => { this.#pending.delete(jobId); });
    return { jobId, promise, cancel: () => this.cancel(jobId) };
  }

  #chain(project: Math3DProject, profileId: string): Chain {
    const review = reviewProjectDerivedField(project, profileId, this.#verifySource);
    if (review.status !== "current" || !review.cacheKey)
      throw new TypeError("Derived profile source and recipe must be current and verified.");
    const fields = new Map<string, DerivedFieldDocument>((project.workspace.derivedFields ?? [])
      .map(item => [item.identity.id, item]));
    const profile = fields.get(profileId);
    const plane = profile?.input.kind === "derived" ? fields.get(profile.input.documentId) : null;
    const magnitude = plane?.input.kind === "derived" ? fields.get(plane.input.documentId) : null;
    if (!profile || profile.operation.kind !== "line-profile" ||
        !plane || plane.operation.kind !== "plane-slice" ||
        !magnitude || magnitude.operation.kind !== "vector-magnitude" ||
        magnitude.input.kind !== "vector3d")
      throw new TypeError("GF-04 requires a vector magnitude, plane slice and line profile chain.");
    const entry = project.workspace.entries.find(item => item.module === "vector3d" &&
      item.expected.id === magnitude.input.documentId);
    if (!entry || entry.replay !== null || entry.checkpoint.format !== "math3d.vector-field3d-document" ||
        entry.checkpoint.source.field.kind !== "expressions")
      throw new TypeError("GF-04 currently samples verified analytic vector fields.");
    return { magnitude, plane, profile, source: entry.checkpoint,
      cacheKey: review.cacheKey };
  }

  async #execute(jobId: string, context: ScientificJobExecutionContext): Promise<DerivedFieldProfileResult> {
    const pending = this.#pending.get(jobId);
    if (!pending) throw new TypeError("Derived profile job input is unavailable.");
    const { source, plane, profile } = pending;
    if (source.source.field.kind !== "expressions" ||
        plane.operation.kind !== "plane-slice" || profile.operation.kind !== "line-profile")
      throw new TypeError("Unsupported derived profile recipe.");
    const operation = profile.operation, normal = plane.operation.normalAxis;
    const varying = operation.varyingAxis;
    const fixed = [0, 1, 2].find(axis => axis !== normal && axis !== varying);
    if (fixed === undefined) throw new TypeError("Line axis is outside the selected plane.");
    const axis = source.source.axes[varying], count = operation.samples;
    const memory = count * 128;
    context.reserveMemory(memory);
    try {
      const rows: { x: number; y: number | null }[] = [];
      for (let index = 0; index < count; index++) {
        context.consumeWork(768);
        const x = index === 0 ? operation.extent[0] : index === count - 1 ?
          operation.extent[1] : operation.extent[0] +
          (operation.extent[1] - operation.extent[0]) * index / (count - 1);
        const point = [0, 0, 0];
        point[normal] = plane.operation.coordinate;
        point[fixed] = operation.fixedCoordinate;
        point[varying] = x;
        const variables = { x: point[0]!, y: point[1]!, z: point[2]! };
        const values = source.source.field.components.map(component =>
          evaluateGraph2DExpression(component.ast, variables, { maxEvaluations: 256 }));
        const magnitude = values.every(value => value.ok) ?
          Math.hypot(...values.map(value => value.ok ? value.value : NaN)) : NaN;
        rows.push({ x, y: Number.isFinite(magnitude) ? magnitude : null });
        if ((index + 1) % 16 === 0 || index + 1 === count) {
          context.reportProgress({ completed: index + 1, total: count,
            message: "Sampling derived magnitude profile" });
          pending.onProgress?.(index + 1, count);
          if (index + 1 < count) { await this.#yieldControl(jobId); context.checkpoint(); }
        }
      }
      if (rows.filter(row => row.y !== null).length < 2)
        throw new RangeError("Derived profile has fewer than two finite samples.");
      const result: DerivedFieldProfileResult = {
        profileId: profile.identity.id, cacheKey: pending.cacheKey,
        source: generation(source), method: "analytic-expression",
        axis: { name: axis.label, unit: axis.unit,
          min: operation.extent[0], max: operation.extent[1] },
        unit: profile.output.unit, rows,
      };
      const checked = normalizeDerivedFieldProfileResult(result);
      if (!checked.ok) throw new TypeError(checked.errors.join(" "));
      context.checkpoint();
      return checked.value;
    } finally { context.releaseMemory(memory); }
  }
}

export const createDerivedFieldProfileJob = (options: DerivedFieldProfileJobOptions) =>
  new DerivedFieldProfileJob(options);
