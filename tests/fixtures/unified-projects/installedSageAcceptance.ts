import assert from "node:assert/strict";
import { acceptanceComplexDocument } from "./complexSource";
import corpus from "../topology-v1/canonical-regression-corpus.json";
import {
  canonicalizeFinite2DTopologyDocument, constructExactSparseBoundaryMatrices,
  createTopologyDocument, createStableDocumentId, createDocumentIdentity,
  viewerSourceFromDocument,
  createComplexSagePayload, createComplexSageJobRequest, publishComplexSageResult,
  createSageIntegerHomologyPayload, createSageIntegerHomologyJobRequest, publishSageIntegerHomologyResult,
  type ComplexSageOperation, type ScientificSourceGeneration,
  createMath3DProject, createMixedWorkspaceDocument, serializeMath3DProject, parseMath3DProject,
  type AnalysisResultEnvelope,
} from "@math3d/core";
import { createInProcessScientificJobService } from "@math3d/kernel";
import { createComplexSageJobAdapter } from "../../../renderer/src/math/complexSageJob";
import { createSageIntegerHomologyJobAdapter } from "../../../renderer/src/topology/sageIntegerHomologyJob";
import { canonicalizeFundamentalDiagramTopologyDocument } from "../../../renderer/src/topology/canonicalFinite2DAdapter";
import { createTopologyDocument as diagramDocument } from "../../../renderer/src/topology/documentFormat";
import { adaptCurrentTopologyDocument } from "../../../renderer/src/topology/topologyDocumentAdapter";
import { TOPOLOGY_PRESET_BY_ID } from "../../../renderer/src/topology/presets";
import type { SageRunRequest, SageRunResponse } from "../../../renderer/src/integrations/sage/sageSchemas";

const limits = (milliseconds = 45_000) => ({ deadlineAt: Date.now() + milliseconds, maxInputBytes: 1_000_000,
  maxOutputBytes: 1_000_000, maxMemoryBytes: 4_000_000, maxWorkUnits: 1_000_000 });
/** Installed engine output crosses the real F05 adapter and F06 publication boundary. */
export async function runInstalledSageAcceptance(baseUrl: string) {
  const checks: { name: string; engineVersion?: string; result?: unknown }[] = [];
  const documents: Array<Parameters<typeof createMixedWorkspaceDocument>[0]["entries"][number]> = [];
  const results: AnalysisResultEnvelope[] = [];
  const execute = async (request: SageRunRequest): Promise<SageRunResponse> => {
    const response = await fetch(`${baseUrl}/run`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request), signal: AbortSignal.timeout(45_000) });
    assert.equal(response.status, 200);
    return await response.json() as SageRunResponse;
  };
  const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10_000) }).then((response) => response.json()) as any;
  assert.equal(health.available, true);
  for (const operation of ["sage.complex.analyze", "sage.topology.integer_homology"]) assert.ok(health.operations.includes(operation));
  const cases: { operation: ComplexSageOperation; expression: string; verify: (output: any) => void }[] = [
    { operation: "derivative", expression: "z*z", verify: (output) => assert.equal(output.value.replace(/\s/g, ""), "2*z") },
    { operation: "limit", expression: "sin(z)/z", verify: (output) => assert.equal(output.value, "1") },
    { operation: "residue", expression: "1/z", verify: (output) => assert.equal(output.value, "1") },
    { operation: "poles", expression: "1/(z*z)", verify: (output) => assert.deepEqual(output.points, [{ value: "0", order: 2, classification: "pole" }]) },
    { operation: "series", expression: "exp(z)", verify: (output) => assert.deepEqual(output.series,
      [{ power: 0, coefficient: "1" }, { power: 1, coefficient: "1" }, { power: 2, coefficient: "1/2" }, { power: 3, coefficient: "1/6" }]) },
  ];
  for (const entry of cases) {
    const document = acceptanceComplexDocument(entry.expression), source = viewerSourceFromDocument(document);
    const payload = createComplexSagePayload({ document, operation: entry.operation,
      ...(["limit", "residue", "series"].includes(entry.operation) ? { point: { re: 0, im: 0 } } : {}), ...(entry.operation === "series" ? { order: 4 } : {}) });
    const service = createInProcessScientificJobService({ adapters: [createComplexSageJobAdapter(execute)], resolveSource: () => source });
    const outcome = await service.submit(createComplexSageJobRequest({ jobId: `installed-${entry.operation}`, source, payload, limits: limits() }));
    assert.ok(outcome.ok, JSON.stringify(outcome));
    entry.verify(outcome.output);
    const published = publishComplexSageResult({ jobResult: outcome, currentSource: source, expectedPayload: payload });
    assert.equal(published.status, "exact"); assert.equal(published.provenance.engine.name, "SageMath");
    documents.push({ module: "complex", checkpoint: document, expected: document.identity, replay: null });
    results.push(published);
    checks.push({ name: `complex/${entry.operation}`, engineVersion: published.provenance.engine.version, result: outcome.output });
    console.log(`PASS installed Sage complex/${entry.operation}`);
  }
  for (const entry of corpus.entries.filter((entry) => entry.expected.homology.status === "exact")) {
    let document: any, canonical: any;
    if (entry.source.kind === "cw-complex") {
      const id = createStableDocumentId("topology", { installedSage: entry.id });
      const source = { sourceId: `${id}/source`, kind: "cw-complex" as const, model: entry.source.value! };
      document = createTopologyDocument({ identity: createDocumentIdentity(id, source), source, canonicalComplex: null, results: [], displayRealizations: [],
        provenance: { origin: "native", sourceFormat: "installed-sage-acceptance", sourceVersion: 1, diagnostics: [] } });
      canonical = canonicalizeFinite2DTopologyDocument(document);
    } else {
      document = adaptCurrentTopologyDocument(diagramDocument(TOPOLOGY_PRESET_BY_ID.get(entry.source.presetId!)!.buildDiagram())).document;
      canonical = canonicalizeFundamentalDiagramTopologyDocument(document);
    }
    assert.equal(canonical.status, "canonicalized", entry.id);
    const boundary = constructExactSparseBoundaryMatrices(canonical, document);
    assert.equal(boundary.status, "exact", entry.id); if (boundary.status !== "exact") throw new Error(entry.id);
    const payload = createSageIntegerHomologyPayload({ boundaryMatrices: boundary.payload, boundaryMatrixHandle: boundary.handle, currentSource: canonical.source });
    const service = createInProcessScientificJobService({ adapters: [createSageIntegerHomologyJobAdapter(execute)], resolveSource: () => canonical.source });
    const outcome = await service.submit(createSageIntegerHomologyJobRequest({ jobId: `installed-${entry.id}`, source: canonical.source, payload, limits: limits() }));
    assert.ok(outcome.ok, JSON.stringify(outcome));
    const published = publishSageIntegerHomologyResult({ jobResult: outcome, currentSource: canonical.source, expectedPayload: payload, boundaryMatrixHandle: boundary.handle });
    assert.equal(published.status, "exact");
    assert.deepEqual((outcome.output as any).groups.map((group: any) => group.notation), entry.expected.homology.integerGroups, entry.id);
    documents.push({ module: "topology", checkpoint: document, expected: document.identity, replay: null });
    results.push(published);
    checks.push({ name: `topology/${entry.id}`, engineVersion: published.provenance.engine.version, result: outcome.output });
    console.log(`PASS installed Sage topology/${entry.id}`);
  }
  // Real requests still finish after cancellation/deadline/stale source; F05 withholds their output.
  const document = acceptanceComplexDocument(), source = viewerSourceFromDocument(document), payload = createComplexSagePayload({ document, operation: "derivative" });
  for (const mode of ["cancelled", "deadline-exceeded", "stale-source"] as const) {
    let current: ScientificSourceGeneration = source, started!: () => void, finished!: () => void;
    const didStart = new Promise<void>((resolve) => { started = resolve; }), didFinish = new Promise<void>((resolve) => { finished = resolve; });
    const service = createInProcessScientificJobService({ adapters: [createComplexSageJobAdapter(async (request) => {
      started(); try {
        const result = await execute(request);
        // Exercise a real engine reply that arrives after the publication deadline.
        if (mode === "deadline-exceeded") await new Promise((resolve) => setTimeout(resolve, 250));
        return result;
      } finally { finished(); }
    })], resolveSource: () => current });
    const request = createComplexSageJobRequest({ jobId: `installed-${mode}`, source, payload, limits: limits(mode === "deadline-exceeded" ? 100 : 45_000) });
    const pending = service.submit(request); await didStart;
    if (mode === "cancelled") assert.equal(service.cancel(request.jobId), true);
    if (mode === "stale-source") current = { ...source, revision: source.revision + 1, generation: source.generation + 1 };
    const outcome = await pending; assert.equal(outcome.ok, false); if (!outcome.ok) assert.equal(outcome.code, mode);
    await didFinish;
    checks.push({ name: `publication/${mode}`, result: outcome });
  }
  const invalid = await execute({ operation: "sage.complex.analyze", params: { ...payload, script: "unsupported" } });
  assert.equal(invalid.success, false); checks.push({ name: "invalid-payload-rejected" });
  const project = createMath3DProject(createMixedWorkspaceDocument({ entries: documents,
    activeDocumentIds: documents.map((entry) => entry.expected.id), results, relations: [], artifacts: [], constructions: [], committedSelection: null }),
    { title: "Installed Sage acceptance results", stableKey: "prj17-installed-sage-results" });
  const projectJson = serializeMath3DProject(project), reopened = parseMath3DProject(projectJson);
  assert.deepEqual(reopened.workspace.results, results);
  assert.equal(reopened.workspace.results.length, cases.length + corpus.entries.filter((entry) => entry.expected.homology.status === "exact").length);
  checks.push({ name: "published-results-project-round-trip", result: { projectId: reopened.identity.id, resultCount: results.length } });
  return { format: "math3d.projects-installed-sage-evidence.v1", checks, projectJson,
    engineVersions: [...new Set(checks.flatMap((check) => check.engineVersion ? [check.engineVersion] : []))] };
}
