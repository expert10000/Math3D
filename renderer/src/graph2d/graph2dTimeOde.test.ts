import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  getGraph2DPresetCatalog, inspectGraph2DCompatibility, instantiateGraph2DPreset,
  normalizeGraph2DDocument, parseGraph2DDocument, sampleGraph2DScene, sampleGraph2DTimeOde,
  selectionForGraph2DObject, serializeGraph2DDocument, type Graph2DTimeOdeArtifact,
  type Graph2DTimeOdeDraft } from "@math3d/core";
import { mobileGraphAdvancedGeometry } from "../../../apps/mobile/src/viewer/mobileGraphAdvancedProjection";
import { MOBILE_GRAPH_KINDS, mobileGraphKindAction, mobileGraphKindEditor } from "../../../apps/mobile/src/models/mobileGraphAdvancedAuthoring";
import { Graph2DPointTableStore } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const bounds = (min: number, max: number) => ({ min, max, includeMin: true, includeMax: true });
const style = { color: "#7c3aed", lineWidth: 2.5, lineStyle: "solid" as const, visible: true };
const draft = (expression: string, t = 0, x = 1): Graph2DTimeOdeDraft => ({ label: "solution", expression,
  domain: bounds(-2, 2), stateDomain: bounds(-100, 100), seed: { t, x }, style });
const documentFor = (source: Graph2DTimeOdeDraft) => {
  const base = createEmptyGraph2DDocument("time-ode-test");
  return createGraph2DDocument({ ...applyGraph2DAuthoring(base, { type: "create-time-ode", draft: source }),
    stableKey: "time-ode-test" });
};
const sample = (source: Graph2DTimeOdeDraft, maxSamples = 12000) => {
  const document = documentFor(source), object = document.source.objects[0]!;
  if (object.kind !== "time-ode") throw new Error("Expected a time-dependent ODE.");
  const artifact = sampleGraph2DTimeOde({ object, variables: {},
    viewport: { xMin: -2, xMax: 2, yMin: -10, yMax: 10, aspect: "free" }, maxSamples });
  return { document, artifact };
};

describe("GRA-11.8 time-dependent scalar ODE", () => {
  it("integrates both directions against exact references with absolute initial time", () => {
    for (const [expression, t0, x0, expected] of [
      ["0", 0.5, 2, (_t: number) => 2],
      ["t", 0.5, 1, (t: number) => 1 + (t * t - 0.25) / 2],
      ["x", 0.5, 1, (t: number) => Math.exp(t - 0.5)],
      ["t-x", 0, 1, (t: number) => t - 1 + 2 * Math.exp(-t)],
    ] as const) {
      const { artifact } = sample(draft(expression, t0, x0));
      expect(artifact.backward?.stop).toBe("time-boundary");
      expect(artifact.forward?.stop).toBe("time-boundary");
      expect(artifact.segments).toHaveLength(2);
      for (const segment of artifact.segments) for (const point of segment.points)
        expect(Math.abs(point.y - expected(point.x))).toBeLessThan(3e-5);
    }
  });

  it("reports each direction separately and preserves the seed at an endpoint", () => {
    const gallery = { ...draft("t-x"), domain: bounds(-2, 4), stateDomain: bounds(-1, 8) };
    const { artifact } = sample(gallery);
    expect(artifact.backward?.stop).toBe("state-boundary");
    expect(artifact.forward?.stop).toBe("time-boundary");
    expect(artifact.backward?.last.x).toBeLessThanOrEqual(8);
    expect(artifact.forward?.last.t).toBeCloseTo(4, 7);
    expect(artifact.samplesEvaluated).toBe((artifact.backward?.evaluations ?? 0) + (artifact.forward?.evaluations ?? 0));
    const mobileMid = sample(gallery, 1024).artifact;
    expect(mobileMid.backward?.stop).toBe("state-boundary");
    expect(mobileMid.forward?.stop).toBe("time-boundary");
    expect(mobileMid.samplesEvaluated).toBeLessThanOrEqual(1024);
    const endpoint = sample({ ...draft("0", -2, 1), domain: bounds(-2, 2) }).artifact;
    expect(endpoint.backward?.stop).toBe("time-boundary");
    expect(endpoint.backward?.acceptedSteps).toBe(0);
    expect(endpoint.forward?.stop).toBe("time-boundary");
  });

  it("keeps direction budgets independent and rejects invalid mathematical source", () => {
    const limited = sample(draft("t-x"), 48).artifact;
    expect(limited.samplesEvaluated).toBeLessThanOrEqual(48);
    expect(limited.backward?.evaluations).toBeLessThanOrEqual(24);
    expect(limited.forward?.evaluations).toBeLessThanOrEqual(24);
    expect(limited.backward?.stop).toBe("sample-limit");
    expect(limited.forward?.stop).toBe("sample-limit");
    expect(() => documentFor({ ...draft("t-x"), seed: { t: 4, x: 1 } })).toThrow(/Initial time/);
    expect(() => documentFor(draft("z-x"))).toThrow(/Unknown symbol/);
    expect(() => documentFor({ ...draft("t-x"), domain: bounds(-101, 2) })).toThrow(/100 units/);
    const singular = sample(draft("1/(t-0.5)")).artifact;
    expect(singular.forward?.stop).not.toBe("time-boundary");
    expect(singular.segments.every(segment => segment.points.every(point => Number.isFinite(point.y)))).toBe(true);
    expect(singular.forward?.stop).toBe("minimum-step");
    expect(sample(draft("sqrt(0.5-t)")).artifact.forward?.stop).toBe("evaluation-failure");
    expect(sample(draft("sin(1000*t)")).artifact.forward?.stop).toBe("step-limit");
    const expired = sample(draft("0"));
    const object = expired.document.source.objects[0]!;
    if (object.kind !== "time-ode") throw new Error("Expected a time-dependent ODE.");
    const deadline = sampleGraph2DTimeOde({ object, variables: {},
      viewport: { xMin: -2, xMax: 2, yMin: -2, yMax: 2, aspect: "free" },
      maxSamples: 12000, deadlineMs: Date.now() - 1 });
    expect(deadline.backward?.stop).toBe("deadline");
    expect(deadline.forward?.stop).toBe("deadline");
    const log = sampleGraph2DTimeOde({ object, variables: {},
      viewport: { xMin: 0.1, xMax: 2, yMin: 0.1, yMax: 2, aspect: "free", xScale: "log10" },
      maxSamples: 12000 });
    expect(log.backward).toBeNull();
    expect(log.diagnostics).toContainEqual({ code: "unsupported-scale", count: 1 });
  });

  it("uses a mobile authoring action and one reversible edit for the initial condition", () => {
    expect(MOBILE_GRAPH_KINDS).toContain("time-ode");
    const adapter = new Graph2DCommandAdapter(documentFor(draft("t-x")));
    const editor = mobileGraphKindEditor(adapter.document(), "time-ode", "time_ode_1");
    editor.draft.initialX = "0.5"; editor.draft.initialY = "2";
    const action = mobileGraphKindAction(editor, new Graph2DPointTableStore());
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), action), action.type);
    expect(adapter.history().undoDepth).toBe(1);
    expect(adapter.document().source.objects[0]?.kind === "time-ode" && adapter.document().source.objects[0].seed)
      .toEqual({ t: 0.5, x: 2 });
    adapter.undo();
    expect(adapter.document().source.objects[0]?.kind === "time-ode" && adapter.document().source.objects[0].seed)
      .toEqual({ t: 0, x: 1 });
  });

  it("persists the capability, blocks exact probes, projects the seed on mobile, and opens the Gallery example", () => {
    const { document } = sample(draft("t-x"));
    expect(document.requiredCapabilities).toContain("graph2d.time-ode.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(normalizeGraph2DDocument(document).ok).toBe(true);
    expect(parseGraph2DDocument(serializeGraph2DDocument(document))).toEqual(document);
    const series = sampleGraph2DScene({ document, viewport: document.display.viewport,
      width: 480, height: 320, interaction: false });
    expect(selectionForGraph2DObject(document, series, "time_ode_1")).toEqual({ objectId: "time_ode_1", probe: null });
    expect(mobileGraphAdvancedGeometry(series, document.display.viewport, { width: 480, height: 320 }).points.length).toBeGreaterThan(0);
    const preset = getGraph2DPresetCatalog().get("time-ode-driven")!;
    const opened = instantiateGraph2DPreset(preset, "time-ode-gallery").document;
    expect(opened.source.objects[0]?.kind).toBe("time-ode");
    const result = sampleGraph2DScene({ document: opened, viewport: opened.display.viewport,
      width: 480, height: 320, interaction: false, deterministic: true })[0]?.artifact as Graph2DTimeOdeArtifact;
    expect(result.backward?.stop).toBe("state-boundary");
    expect(result.forward?.stop).toBe("time-boundary");
  });
});
