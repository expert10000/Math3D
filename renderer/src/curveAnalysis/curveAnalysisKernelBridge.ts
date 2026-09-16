import {
  createAnalysisResultEnvelope, matchesScientificSourceGeneration, structuralHash,
  type AnalysisResultEnvelope, type CanonicalJsonValue, type ScientificSourceGeneration,
} from "@math3d/core";
import { createInMemoryArtifactRegistry } from "@math3d/kernel";
import type { CurveComputationArtifact, CurveWorkerRequest } from "./curveComputation";
import type { CurveDocumentAdapter } from "./curveDocumentAdapter";

/** Connects the existing cancellable Curve worker to F06/F07 source-bound publications. */
export class CurveAnalysisKernelBridge {
  readonly #adapter: () => CurveDocumentAdapter | null;
  readonly #artifacts = createInMemoryArtifactRegistry({
    resolveSource: (id) => {
      const current = this.source();
      return current?.documentId === id ? current : null;
    },
    maxArtifactBytes: 256 * 1024 * 1024,
  });
  readonly #results = new Map<string, AnalysisResultEnvelope>();

  constructor(adapter: () => CurveDocumentAdapter | null) { this.#adapter = adapter; }
  source(): ScientificSourceGeneration | null { return this.#adapter()?.sourceGeneration() ?? null; }
  artifacts() { return this.#artifacts; }
  results(): readonly AnalysisResultEnvelope[] { return [...this.#results.values()]; }

  invalidate(): void {
    const source = this.source();
    if (source) this.#artifacts.invalidateDocumentSource(source);
    for (const [id, result] of this.#results) {
      if (!source || !matchesScientificSourceGeneration(result.provenance.source, source)) this.#results.delete(id);
    }
  }

  publish(request: CurveWorkerRequest, artifact: CurveComputationArtifact, sourceAtSubmission: ScientificSourceGeneration): AnalysisResultEnvelope | null {
    const current = this.source();
    if (!current || !matchesScientificSourceGeneration(sourceAtSubmission, current) || artifact.state !== "ready" ||
        artifact.curveId !== request.curveId || artifact.curveRevision !== request.curveRevision) return null;
    const artifactId = `curve-field:${structuralHash({ source: current, operation: request.operation, cacheKey: artifact.cacheKey }).slice(7, 47)}`;
    const handle = { artifactId, kind: "binary" as const, role: `${request.operation}-field` };
    this.#artifacts.declare({ handle, source: current, ownerId: "curve-analysis", encoding: "math3d.float64-array.v1" });
    this.#artifacts.beginComputation(artifactId, "curve-analysis", current);
    this.#artifacts.publish({ artifactId, ownerId: "curve-analysis", source: current, bytes: new Uint8Array(artifact.output.buffer, artifact.output.byteOffset, artifact.output.byteLength) });
    const result = createAnalysisResultEnvelope({
      resultId: `curve-result:${structuralHash({ source: current, artifactId }).slice(7, 47)}`,
      status: request.operation === "spline-fit" ? "heuristic" : "numerical",
      provenance: {
        source: current,
        operation: {
          type: `curve.analyze.${request.operation}`,
          algorithm: request.operation,
          algorithmVersion: request.backendVersion,
          parameters: { tolerance: request.tolerance, targetCount: request.targetCount, workload: request.workload, ...(request.parameters ?? {}) } as Record<string, CanonicalJsonValue>,
        },
        numericContext: { tolerance: { absolute: request.tolerance } },
        engine: { name: "Math3D Curve Worker", version: request.backendVersion },
        elapsedMs: artifact.runtimeMs,
      },
      summary: { valueCount: artifact.output.length, backend: request.backendVersion },
      warnings: artifact.warnings,
      diagnostics: [],
      artifacts: [handle],
    });
    this.#results.set(result.resultId, result);
    return result;
  }
}
