import { describe, expect, it } from "vitest";
import { normalizeCurveDocument, replaceCurveDocumentSource } from "@math3d/core";
import { adaptCurveDefinition } from "./infrastructure";
import { CurveDocumentAdapter, curveDocumentFromLegacyDefinition } from "./curveDocumentAdapter";
import { CurveAnalysisKernelBridge } from "./curveAnalysisKernelBridge";
import { CurveWorkerCoordinator } from "./curveWorkerCoordinator";
import {
  createCurveConstructionRecord, curveConstructionSourceStatus, locateCurveConstructionSource, parseCurveConstruction, promoteCurveConstruction,
  serializeCurveConstruction,
} from "./curveConstructionKernel";
import { CurveConstructionRealizer, locateCurveConstructionVertex, runtimeCurveFromDocument } from "./curveConstructionGeometry";
import { createCurveToSurfaceRequest, openEvaluatorCurveInCurves, openSampledCurvesInCurves, polylineCurve } from "./curveInteroperability";
import { createCurveAnalysisWorkspaceDocument, parseCurveAnalysisWorkspace, serializeCurveAnalysisWorkspace } from "./persistence";

const definition = adaptCurveDefinition({
  id: "nurbs-gk12", revision: 2, label: "NURBS", representation: "nurbs", dimension: 2,
  domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false },
  controlPoints: [[0, 0], [1, 2], [2, 0]], degree: 2,
  knots: [0, 0, 0, 1, 1, 1], weights: [1, 0.7, 1],
});

const opened = (id: string) => openEvaluatorCurveInCurves({
  source: { module: "geometry", kind: "analytic-curve", objectId: id, revision: 1, label: id },
  curve: polylineCurve({ id, name: id, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
  exact: true,
}).branches[0];
const sampled = (id: string, offset = 0) => openSampledCurvesInCurves({
  source: { module: "geometry", kind: "construction-path", objectId: id, revision: 1, label: id },
  branches: [[{ x: 1 + offset, y: 0 }, { x: 1 + offset, y: 1 }]], tolerance: 0.001,
}).branches[0];

describe("GK12 Curve kernel document", () => {
  it("owns structural controls, knots and weights but excludes sampled buffers", () => {
    const doc = curveDocumentFromLegacyDefinition(definition);
    expect(doc.source.definition).toMatchObject({ controlPoints: [[0, 0], [1, 2], [2, 0]], knots: [0, 0, 0, 1, 1, 1], weights: [1, 0.7, 1] });
    expect(JSON.stringify(doc)).not.toContain("sampleCount");
    expect(normalizeCurveDocument(doc).ok).toBe(true);
    expect(normalizeCurveDocument({ ...doc, source: { ...doc.source, definition: { ...doc.source.definition, weights: [1, -1, 1] } } }).ok).toBe(false);
  });

  it("keeps drag preview out of history and replays edits, selection and settings", () => {
    const adapter = new CurveDocumentAdapter(curveDocumentFromLegacyDefinition(definition));
    const original = adapter.sourceGeneration();
    const preview = adapter.previewSource({ ...adapter.document().source, definition: { ...adapter.document().source.definition, controlPoints: [[0, 0], [1, 3], [2, 0]] } });
    expect(preview.definition.controlPoints?.[1][1]).toBe(3);
    expect(adapter.sourceGeneration()).toEqual(original);
    adapter.commitControlPoints([[0, 0], [1, 3], [2, 0]]);
    const edited = adapter.sourceGeneration();
    expect(edited.revision).toBe(original.revision + 1);
    adapter.commitSelection(["control:1"]);
    adapter.setAnalysisSettings({ strategy: "adaptive", tolerance: 0.001 });
    expect(adapter.sourceGeneration()).toEqual(edited);
    expect(adapter.document().selection.controlIds).toEqual(["control:1"]);
    expect(CurveDocumentAdapter.fromReplayBundle(adapter.replayBundle()).document()).toEqual(adapter.document());
    expect(CurveDocumentAdapter.parse(adapter.serialize()).document()).toEqual(adapter.document());
    const savedWorkspace = createCurveAnalysisWorkspaceDocument({ kernelDocuments: [adapter.document()] });
    expect(parseCurveAnalysisWorkspace(serializeCurveAnalysisWorkspace(savedWorkspace)).kernelDocuments).toEqual([adapter.document()]);
    adapter.undo();
    expect(adapter.document().metadata.analysisSettings).not.toEqual({ strategy: "adaptive", tolerance: 0.001 });
    adapter.redo();
    expect(adapter.document().metadata.analysisSettings).toEqual({ strategy: "adaptive", tolerance: 0.001 });
  });

  it("publishes dense worker output as a source-bound artifact, not history metadata", () => {
    const adapter = new CurveDocumentAdapter(curveDocumentFromLegacyDefinition(definition));
    const bridge = new CurveAnalysisKernelBridge(() => adapter);
    const coordinator = new CurveWorkerCoordinator(() => { throw new Error("No worker needed for request creation."); });
    const request = coordinator.createRequest({ definition, operation: "differential-field", positions: new Float64Array([0, 0, 0, 1, 1, 0]) });
    const source = adapter.sourceGeneration();
    const result = bridge.publish(request, {
      artifactId: "legacy-artifact", cacheKey: "legacy-key", state: "ready", operation: request.operation,
      curveId: request.curveId, curveRevision: request.curveRevision, output: new Float64Array([1, 2, 3]),
      statistics: {}, warnings: [], runtimeMs: 5, consumers: request.consumers, createdAt: 1,
    }, source);
    expect(result?.status).toBe("numerical");
    expect(result?.artifacts).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("[1,2,3]");
    expect(bridge.artifacts().resolve(result!.artifacts[0], source).ok).toBe(true);
    adapter.commitControlPoints([[0, 0], [1, 4], [2, 0]]);
    bridge.invalidate();
    expect(bridge.results()).toHaveLength(0);
    expect(bridge.artifacts().resolve(result!.artifacts[0], source).ok).toBe(false);
  });
});

describe("GK13 Curve construction lineage", () => {
  it("requires distinct curves for multi-source construction", () => {
    const a = opened("a");
    expect(() => createCurveToSurfaceRequest("loft", [a, a])).toThrow(/distinct Curve inputs/);
    expect(() => createCurveToSurfaceRequest("loft", [a])).toThrow(/requires at least 2/);
  });

  it("retains ordered exact sources and parameters across workspace save/reopen", () => {
    const a = opened("a"); const b = opened("b");
    const record = createCurveConstructionRecord("loft", [a, b], { tolerance: 0.002 });
    expect(record.target.source.definition.sourceIds).toEqual(record.sourceGenerations.map((source) => source.documentId));
    expect(record.relation.sources).toEqual(record.sourceGenerations);
    expect(record.relation.sourceOrder).toBe("ordered");
    expect(record.relation.parameters).toMatchObject({ tolerance: 0.002 });
    expect(locateCurveConstructionSource(record, 0, 0.5)).toMatchObject({ state: "mapped", sourceParameter: 0.5, sourceEntityId: "a" });
    expect(parseCurveConstruction(serializeCurveConstruction(record))).toEqual(record);
    const frozen = promoteCurveConstruction(record);
    expect(frozen.promoted).toBe(true);
    expect(frozen.target).toEqual(record.target);
    const workspace = createCurveAnalysisWorkspaceDocument({ constructions: [frozen] });
    expect(parseCurveAnalysisWorkspace(serializeCurveAnalysisWorkspace(workspace)).constructions).toEqual([frozen]);
    expect(createCurveConstructionRecord("loft", [b, a], { tolerance: 0.002 }).relation.relationId).not.toBe(record.relation.relationId);
  });

  it("uses the actual committed Curve generation rather than restarting its revision", () => {
    const exchange = opened("committed");
    const initial = curveDocumentFromLegacyDefinition(exchange.definition);
    const advanced = replaceCurveDocumentSource(initial, initial.source);
    const record = createCurveConstructionRecord("extrusion", [exchange], {}, [advanced]);
    expect(record.sourceGenerations[0].revision).toBe(advanced.identity.revision);
    expect(record.relation.sources[0]).toEqual(record.sourceGenerations[0]);
    expect(() => createCurveConstructionRecord("extrusion", [opened("other")], {}, [advanced])).toThrow(/no longer matches/);
    expect(curveConstructionSourceStatus(record, () => advanced)).toBe("current");
    const changed = replaceCurveDocumentSource(advanced, { ...advanced.source, definition: { ...advanced.source.definition, familyId: "changed" } });
    expect(curveConstructionSourceStatus(record, () => changed)).toBe("stale");
    expect(curveConstructionSourceStatus(promoteCurveConstruction(record), () => changed)).toBe("snapshot");
  });

  it("replays constructed Surface tessellation and artifact lineage from saved sources", () => {
    const source = sampled("profile");
    for (const kind of ["extrusion", "revolution", "sweep", "tube-surface"] as const) {
      const record = createCurveConstructionRecord(kind, [source], { uSegments: 12, vSegments: 8, radius: 0.2 });
      const realizer = new CurveConstructionRealizer();
      const realized = realizer.realize(record);
      expect(realized.geometry.mesh.indices!.length).toBeGreaterThan(0);
      expect(Array.from(realized.geometry.mesh.positions).every(Number.isFinite)).toBe(true);
      expect(realized.result.artifacts).toHaveLength(1);
      expect(realized.artifactRelation.sources).toEqual(record.sourceGenerations);
      expect(realizer.artifacts().resolve(realized.result.artifacts[0], realized.result.provenance.source).ok).toBe(true);
      expect(locateCurveConstructionVertex(record, realized.geometry, 0).source).toEqual(record.sourceGenerations[0]);
      const reopened = parseCurveConstruction(serializeCurveConstruction(record));
      expect(new CurveConstructionRealizer().realize(reopened).geometry.mesh.positions).toEqual(realized.geometry.mesh.positions);
    }
  });

  it("tessellates ruled and multi-source lofts in committed source order", () => {
    const a = sampled("a", 0), b = sampled("b", 1), c = sampled("c", 2);
    for (const kind of ["ruled-surface", "loft"] as const) {
      const sources = kind === "loft" ? [a, b, c] : [a, b];
      const record = createCurveConstructionRecord(kind, sources, { uSegments: 8, vSegments: 8 });
      const realized = new CurveConstructionRealizer().realize(record);
      const vertices = realized.geometry.mesh.positions;
      const rowSize = 9 * 3;
      expect(vertices[0]).toBeCloseTo(1);
      expect(vertices[vertices.length - rowSize]).toBeCloseTo(sources.length);
      expect(locateCurveConstructionVertex(record, realized.geometry, realized.geometry.sourceSlots.length - 1).source).toEqual(record.sourceGenerations[sources.length - 1]);
    }
  });

  it("retains Surface chart correspondence through construction save and reopen", () => {
    const exchange = openSampledCurvesInCurves({
      source: { module: "surfaces", kind: "geodesic", objectId: "surface-path", revision: 3, label: "path" },
      branches: [[{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }]],
      parameterBranches: [[[0, 0], [0.5, 0.25], [1, 0.5]]], tolerance: 0.001,
    }).branches[0];
    const record = parseCurveConstruction(serializeCurveConstruction(createCurveConstructionRecord("extrusion", [exchange])));
    expect(locateCurveConstructionSource(record, 0, 0.5)).toMatchObject({ state: "mapped", sourceEntityId: "surface-path", sampleIndex: 1, chart: [0.5, 0.25] });
  });

  it("reconstructs a NURBS evaluator from its committed controls, knots and weights", () => {
    const document = curveDocumentFromLegacyDefinition(definition);
    const runtime = runtimeCurveFromDocument(document);
    expect(runtime.eval(0).x).toBeCloseTo(0);
    expect(runtime.eval(1).x).toBeCloseTo(2);
  });
});
