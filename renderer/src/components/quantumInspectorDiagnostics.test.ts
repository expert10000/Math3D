import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { nextQuantumInspectorTab, QuantumInspectorSummary } from "./QuantumInspectorSummary";
import { QuantumViewerTrace } from "./quantumViewerTrace";

describe("QI-37/38 quantum inspector and support diagnostics", () => {
  it("wraps arrow navigation and supports Home/End", () => {
    expect(nextQuantumInspectorTab("View", "ArrowLeft")).toBe("Provenance");
    expect(nextQuantumInspectorTab("Provenance", "ArrowRight")).toBe("View");
    expect(nextQuantumInspectorTab("Data", "End")).toBe("Provenance");
    expect(nextQuantumInspectorTab("Science", "Home")).toBe("View");
    expect(nextQuantumInspectorTab("Science", "Enter")).toBe("Science");
  });
  it("labels producer claims and withholds preview counts until source qualification", () => {
    const data = { view: "geometry", mapped: 9, deferred: 3,
      datasets: [{ id: "energies", count: 25, components: 2, unit: "eV" }],
      invariants: [{ id: "chern", label: "Chern", value: 1, status: "producer-computed", method: "lattice" }],
      limitations: ["Bounded grid"], provenance: { schema: "quantum-scene/v2", model: "qwz",
        runId: "run-1", resultSha256: "b".repeat(64), fingerprint: "a".repeat(64),
        engine: "theory-lab", engineVersion: "1", kind: "numerical-result" as const } };
    const current = renderToStaticMarkup(createElement(QuantumInspectorSummary,
      { data, sourceStatus: "current", onExportSupport: () => {} }));
    expect(current).toContain('data-qualification="current"');
    expect(current).toContain("9 rendered objects");
    expect(current).toContain("not independently proved");
    const checking = renderToStaticMarkup(createElement(QuantumInspectorSummary,
      { data, sourceStatus: "checking", onExportSupport: () => {} }));
    expect(checking).toContain('data-qualification="checking"');
    expect(checking).toContain("object counts withheld");
    expect(checking).not.toContain("9 rendered objects");
  });
  it("bounds trace events and exports only fixed event names, source IDs and measured numbers", () => {
    let now = 0;
    const trace = new QuantumViewerTrace({ runId: "run-1", resultSha256: "a".repeat(64),
      sceneFingerprint: "b".repeat(64), model: "qwz" }, () => now);
    trace.measure("importMs", 23.7); trace.measure("datasetBytes", 128);
    trace.measure("firstFrameMs", Number.POSITIVE_INFINITY);
    for (let index = 0; index < 70; index++) { now += 2; trace.record(index % 2 ? "view" : "sample"); }
    const bundle = trace.supportBundle();
    expect(bundle.events).toHaveLength(64);
    expect(bundle.events[0].elapsedMs).toBe(14);
    expect(bundle.metrics).toEqual({ importMs: 24, datasetBytes: 128 });
    expect(bundle.correlation.jobId).toBeNull();
    expect(JSON.stringify(bundle)).not.toMatch(/directory|path|parameter|sampleValue|token/i);
    const unsafe = new QuantumViewerTrace({ runId: "C:\\private\\run", resultSha256: "x", sceneFingerprint: "y", model: "../model" }, () => 0);
    expect(JSON.stringify(unsafe.supportBundle())).not.toMatch(/private|\.\.\/|C:\\/);
  });
});
