import { createScientificJobRequest, createStableDocumentId,
  type ScientificJobOutcome, type ScientificSourceGeneration } from "@math3d/core";
import { createInProcessScientificJobService } from "@math3d/kernel";
import type { ScientificSceneOpenResponse } from "../components/ScientificScenePreview";

export const PYTHON_SCENE_OPERATION = "scientific.publish-python";
export type PreparedPythonPublisher = Extract<Awaited<ReturnType<NonNullable<Window["scientificScenes"]>["preparePublisher"]>>,
  { ok: true }>;
export type PythonPublisherJobResult = Readonly<{
  outcome: ScientificJobOutcome;
  scene: Extract<ScientificSceneOpenResponse, { ok: true }>["scene"] | null;
}>;

/** Existing revision-safe job service around one explicit Electron-managed process. */
export class PythonPublisherJob {
  readonly #prepared: PreparedPythonPublisher;
  readonly #source: ScientificSourceGeneration;
  readonly #service;
  #scene: PythonPublisherJobResult["scene"] = null;
  #jobId: string | null = null;
  #bridgePromise: Promise<Awaited<ReturnType<NonNullable<Window["scientificScenes"]>["runPublisher"]>>> | null = null;

  constructor(prepared: PreparedPythonPublisher) {
    this.#prepared = prepared;
    this.#source = { documentId: createStableDocumentId("scientific-publisher", prepared.sessionId),
      revision: 1, structuralHash: `sha256:${prepared.sourceHash}`, generation: 1 } as ScientificSourceGeneration;
    this.#service = createInProcessScientificJobService({
      resolveSource: id => id === this.#source.documentId ? this.#source : null,
      adapters: [{ operationType: PYTHON_SCENE_OPERATION, execute: async (input, context) => {
        context.consumeWork(1);
        context.reserveMemory(48 * 1024 * 1024);
        try {
          if (!window.scientificScenes?.runPublisher) throw new Error("Desktop Python publisher bridge unavailable");
          const bridge = window.scientificScenes.runPublisher({ sessionId: prepared.sessionId,
            sourceHash: prepared.sourceHash, jobId: input.jobId });
          this.#bridgePromise = bridge;
          const result = await bridge;
          context.checkpoint();
          if (!result.ok) throw new Error(result.canceled ? "Python publication cancelled" : result.error);
          this.#scene = result.scene;
          return { manifestSha256: result.scene.fingerprint, sceneId: result.scene.manifest.sceneId };
        } finally { context.releaseMemory(48 * 1024 * 1024); }
      } }],
    });
  }

  submit(): { jobId: string; promise: Promise<PythonPublisherJobResult>; cancel: () => Promise<boolean> } {
    if (this.#jobId) throw new Error("Python publisher session can run only once");
    const jobId = crypto.randomUUID();
    this.#jobId = jobId;
    const request = createScientificJobRequest({ jobId, source: this.#source,
      operation: { type: PYTHON_SCENE_OPERATION, payload: { sessionId: this.#prepared.sessionId } },
      limits: { deadlineAt: Date.now() + 60_000, maxInputBytes: 4096, maxOutputBytes: 4096,
        maxMemoryBytes: 48 * 1024 * 1024, maxWorkUnits: 1 } });
    const promise = this.#service.submit(request).then(async outcome => {
      // The service may resolve cancellation before Electron finishes stopping the child.
      if (this.#bridgePromise) await this.#bridgePromise.catch(() => null);
      return { outcome, scene: outcome.ok ? this.#scene : null };
    });
    const cancel = async () => {
      const stopped = await window.scientificScenes?.cancelPublisher(jobId) ?? false;
      if (stopped) this.#service.cancel(jobId);
      return stopped;
    };
    return { jobId, promise, cancel };
  }
}
