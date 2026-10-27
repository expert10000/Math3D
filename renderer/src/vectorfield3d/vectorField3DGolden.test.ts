import { describe, expect, it } from "vitest";
import { createVectorField3DDocument, defaultVectorField3DWorkspace,
  integrateVectorField3DTrajectories, reviseVectorField3DDocument,
  vectorField3DSeedPreset,
  parseVectorField3DDocument, serializeVectorField3DDocument,
  reviseVectorField3DWorkspace,
  sampleVectorField3DAnalyticLine, validGraph2DAnalyticFieldOrigin,
  analyzeVectorField3DDifferential, sampleVectorField3DDerivedSlice,
  sampleVectorField3DArrows, sampleVectorField3DProbe, sampleVectorField3DSlice,
  vectorField3DExpression, type VectorField3DSource } from "@math3d/core";

const axes = (["x", "y", "z"] as const).map(role =>
  ({ role, label: role, unit: "m", min: -4, max: 4 })) as VectorField3DSource["axes"];
const field = (components: readonly [string, string, string], seed: readonly [number, number, number]) =>
  createVectorField3DDocument({ axes, timeUnit: "s", field: { kind: "expressions",
    components: components.map(source => vectorField3DExpression(source, "m/s")) as
      unknown as Extract<VectorField3DSource["field"], { kind: "expressions" }>["components"] },
    seeds: [{ id: "oracle", position: seed }],
    display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
    solver: { absoluteTolerance: 1e-7, relativeTolerance: 1e-7,
      maxSteps: 1000, maxTime: 1, maxArcLength: 10 } }, { stableKey: components.join("|") });

describe("SCI-12 analytic vector-field numerical oracles", () => {
  it("compares bounded RK45 with constant and vortex oracles and reports stops", () => {
    const rk45 = (document: ReturnType<typeof field>) => reviseVectorField3DDocument(document,
      { ...document.source, solver: { ...document.source.solver, method: "rk45" } });
    const constant = integrateVectorField3DTrajectories(rk45(field(["1", "0", "0"], [0, 0, 0])));
    expect(constant.solver.method).toBe("adaptive-rk45");
    expect(constant.trajectories[0]!.stopReason).toBe("time-limit");
    expect(constant.trajectories[0]!.points.at(-1)!.position[0]).toBeCloseTo(1, 6);
    expect(constant.trajectories[0]!.maxEstimatedLocalError).toBeLessThan(1e-6);
    const vortex = integrateVectorField3DTrajectories(rk45(field(["-y", "x", "0"], [1, 0, 0])));
    const end = vortex.trajectories[0]!.points.at(-1)!;
    expect(end.position[0]).toBeCloseTo(Math.cos(end.time), 4);
    expect(end.position[1]).toBeCloseTo(Math.sin(end.time), 4);
    expect(vortex.trajectories[0]!.stopDetail).toMatch(/integration time/);
    expect(integrateVectorField3DTrajectories(rk45(field(["0", "0", "0"], [0, 0, 0])))
      .trajectories[0]!.stopReason).toBe("stationary");
    expect(integrateVectorField3DTrajectories(rk45(field(["1", "0", "0"], [4, 0, 0])))
      .trajectories[0]!.stopReason).toBe("boundary");
    expect(integrateVectorField3DTrajectories(rk45(field(["1", "0", "0"], [0, 0, 0])),
      { shouldCancel: () => true }).trajectories[0]!.stopReason).toBe("cancelled");
  });

  it("distinguishes physical-time paths from normalized field lines and reports seed progress", () => {
    const base = field(["2", "0", "0"], [0, 0, 0]);
    const time = integrateVectorField3DTrajectories(reviseVectorField3DDocument(base,
      { ...base.source, solver: { ...base.source.solver, method: "rk45",
        mode: "time-trajectory" } }));
    expect(time.trajectories[0]!.points.at(-1)!.position[0]).toBeCloseTo(2, 6);
    expect(time.solver.parameterUnit).toBe("s");
    const lineDocument = reviseVectorField3DDocument(base,
      { ...base.source, solver: { ...base.source.solver, method: "rk45",
        mode: "normalized-field-line", maxLineLength: 1 } });
    const line = integrateVectorField3DTrajectories(lineDocument);
    expect(line.trajectories[0]!.stopReason).toBe("line-limit");
    expect(line.trajectories[0]!.points.at(-1)!.position[0]).toBeCloseTo(1, 6);
    expect(line.solver.parameterUnit).toBe("m");
    const vortexBase = field(["-y", "x", "0"], [2, 0, 0]);
    const vortexLine = reviseVectorField3DDocument(vortexBase,
      { ...vortexBase.source, solver: { ...vortexBase.source.solver, method: "rk45",
        mode: "normalized-field-line", maxLineLength: 2 } });
    const vortexTrace = integrateVectorField3DTrajectories(vortexLine).trajectories[0]!;
    expect(vortexTrace.stopReason).toBe("line-limit");
    expect(vortexTrace.points.at(-1)!.position[0]).toBeCloseTo(2 * Math.cos(1), 4);
    expect(vortexTrace.points.at(-1)!.position[1]).toBeCloseTo(2 * Math.sin(1), 4);
    expect(Math.abs(vortexTrace.points.at(-1)!.arcLength - 2)).toBeLessThan(0.01);
    const zero = field(["0", "0", "0"], [0, 0, 0]);
    expect(integrateVectorField3DTrajectories(reviseVectorField3DDocument(zero,
      { ...zero.source, solver: { ...zero.source.solver,
        mode: "normalized-field-line", maxLineLength: 1 } }))
      .trajectories[0]!.stopReason).toBe("stationary");
    const boundary = field(["1", "0", "0"], [4, 0, 0]);
    const normalizedBoundary = reviseVectorField3DDocument(boundary,
      { ...boundary.source, solver: { ...boundary.source.solver,
        mode: "normalized-field-line", maxLineLength: 2 } });
    expect(integrateVectorField3DTrajectories(normalizedBoundary).trajectories[0]!.stopReason)
      .toBe("boundary");
    expect(integrateVectorField3DTrajectories(vortexLine,
      { shouldCancel: () => true }).trajectories[0]!.stopReason).toBe("cancelled");
    const progress: number[] = [];
    const ring = vectorField3DSeedPreset(base.source, "ring-8");
    const seedLine = vectorField3DSeedPreset(base.source, "line-5");
    const grid = vectorField3DSeedPreset(base.source, "plane-9");
    expect(ring).toHaveLength(8);
    expect(seedLine).toEqual([[-2, 0, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]]);
    expect(grid).toHaveLength(9);
    const batch = reviseVectorField3DDocument(base, { ...base.source,
      seeds: ring.map((position, index) => ({ id: `seed-${index + 1}`, position })),
      solver: { ...base.source.solver, mode: "normalized-field-line", maxLineLength: 1 } });
    integrateVectorField3DTrajectories(batch, { onProgress: (completed, total) => {
      expect(total).toBe(8); progress.push(completed);
    } });
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("persists seed groups and view-only visibility through document reopen", () => {
    const base = field(["-y", "x", "0"], [1, 0, 0]);
    const grouped = reviseVectorField3DDocument(base, { ...base.source,
      seeds: vectorField3DSeedPreset(base.source, "line-5").map((position, index) =>
        ({ id: `line-${index}`, position, group: "line-1" })) });
    const hidden = reviseVectorField3DWorkspace(grouped, {
      ...grouped.workspace!, hiddenSeedGroups: ["line-1"],
      seedGroupStyles: [{ id: "line-1", name: "Vortex line", color: "#ff3366" }] });
    expect(hidden.identity.structuralHash).toBe(grouped.identity.structuralHash);
    const reopened = parseVectorField3DDocument(serializeVectorField3DDocument(hidden));
    expect(reopened.source.seeds.map(seed => seed.group)).toEqual(Array(5).fill("line-1"));
    expect(reopened.workspace?.hiddenSeedGroups).toEqual(["line-1"]);
    expect(reopened.workspace?.seedGroupStyles).toEqual([
      { id: "line-1", name: "Vortex line", color: "#ff3366" }]);
    const invalidColor = JSON.parse(serializeVectorField3DDocument(hidden));
    invalidColor.workspace.seedGroupStyles[0].color = "url(#bad)";
    expect(() => parseVectorField3DDocument(JSON.stringify(invalidColor))).toThrow();
    const traces = integrateVectorField3DTrajectories(reopened);
    expect(traces.trajectories).toHaveLength(5);
    expect(traces.trajectories.map(path => path.seedId)).toEqual(
      ["line-0", "line-1", "line-2", "line-3", "line-4"]);
  });

  it("reports a numerical failure for one seed while continuing the batch", () => {
    const base = field(["1/x", "0", "0"], [0, 0, 0]);
    const batch = reviseVectorField3DDocument(base, { ...base.source,
      seeds: [{ id: "pole", position: [0, 0, 0], group: "line-1" },
        { id: "regular", position: [1, 0, 0], group: "line-1" }] });
    const result = integrateVectorField3DTrajectories(batch);
    expect(result.trajectories.map(path => path.seedId)).toEqual(["pole", "regular"]);
    expect(result.trajectories[0]!.stopReason).toBe("undefined");
    expect(result.trajectories[1]!.stopReason).toBe("time-limit");
    expect(result.trajectories[1]!.points.at(-1)!.position[0]).toBeCloseTo(Math.sqrt(3), 3);
    const selected = integrateVectorField3DTrajectories(batch, { seedIds: ["regular"] });
    expect(selected.trajectories.map(path => path.seedId)).toEqual(["regular"]);
    expect(selected.source.structuralHash).toBe(batch.identity.structuralHash);
    expect(() => integrateVectorField3DTrajectories(batch, { seedIds: ["missing"] }))
      .toThrow(/seed selection/);
  });

  it("reports Jacobian structure and bounded gradient/Laplacian of field magnitude", () => {
    const constant = analyzeVectorField3DDifferential(field(["1", "0", "0"], [0, 0, 0]), [1, 0, 0]);
    expect(constant.localStructure).toBe("balanced");
    expect(constant.magnitudeGradient).toEqual([0, 0, 0]);
    expect(constant.magnitudeLaplacian).toBeCloseTo(0, 5);
    const vortexDocument = field(["-y", "x", "0"], [1, 0, 0]);
    const vortex = analyzeVectorField3DDifferential(vortexDocument, [1, 0, 0]);
    expect(vortex.localStructure).toBe("rotation-dominated");
    expect(vortex.jacobian?.[0]?.[1]).toBeCloseTo(-1, 7);
    expect(vortex.jacobian?.[1]?.[0]).toBeCloseTo(1, 7);
    expect(vortex.magnitudeGradient?.[0]).toBeCloseTo(1, 5);
    expect(vortex.magnitudeLaplacian).toBeCloseTo(1, 2);
    const origin = analyzeVectorField3DDifferential(vortexDocument, [0, 0, 0]);
    expect(origin.magnitudeGradient).toBeNull();
    expect(origin.diagnostics.join(" ")).toMatch(/differentiability is not assumed/);
    const gradient = sampleVectorField3DDerivedSlice(vortexDocument, 2, 0, "grad-speed-x");
    const laplacian = sampleVectorField3DDerivedSlice(vortexDocument, 2, 0, "laplacian-speed");
    expect(gradient.values[15 * 25 + 12]).toBeCloseTo(1, 4);
    expect(laplacian.values[15 * 25 + 12]).toBeCloseTo(1, 2);
    expect(laplacian.values[12 * 25 + 12]).toBeNull();
  });

  it("maps approximate divergence and curl magnitude across a vortex slice", () => {
    const document = field(["-y", "x", "0"], [1, 0, 0]);
    const divergence = sampleVectorField3DDerivedSlice(document, 2, 0, "divergence");
    const curls = ([0, 1, 2] as const).map(axis =>
      sampleVectorField3DDerivedSlice(document, axis, 0, "curl-magnitude"));
    expect(divergence.unit).toBe("1/s");
    expect(divergence.method).toBe("bounded-finite-difference");
    expect(divergence.boundarySamples).toBeGreaterThan(0);
    expect(Math.max(...divergence.values.filter((value): value is number => value !== null)
      .map(Math.abs))).toBeLessThan(1e-8);
    for (const curl of curls) {
      expect(curl.values[12 * 25 + 12]).toBeCloseTo(2, 7);
      expect(curl.evaluated).toBeLessThanOrEqual(1024);
    }
    expect(sampleVectorField3DDerivedSlice(document, 2, 0, "curl-z")
      .values[12 * 25 + 12]).toBeCloseTo(2, 7);
    expect(sampleVectorField3DDerivedSlice(document, 2, 0, "curl-x")
      .values[12 * 25 + 12]).toBeCloseTo(0, 7);
  });
  it("keeps exact constant-field values and a bounded straight trajectory", () => {
    const document = field(["1", "0", "0"], [0, 0, 0]);
    expect(sampleVectorField3DProbe(document, [2, -1, 3]).vector).toEqual([1, 0, 0]);
    const trace = integrateVectorField3DTrajectories(document).trajectories[0]!;
    expect(trace.stopReason).toBe("time-limit");
    const last = trace.points.at(-1)!;
    expect(last.time).toBeCloseTo(1, 7);
    expect(last.position[0]).toBeCloseTo(1, 5);
    expect(last.position[1]).toBeCloseTo(0, 7);
    expect(last.position[2]).toBeCloseTo(0, 7);
  });

  it("matches the circular vortex at the probe and along its trajectory", () => {
    const document = field(["-y", "x", "0"], [1, 0, 0]);
    const probe = sampleVectorField3DProbe(document, [1, 0, 0]);
    expect(probe.vector[0]).toBeCloseTo(0, 7);
    expect(probe.vector[1]).toBe(1);
    expect(probe.vector[2]).toBe(0);
    expect(probe.magnitude).toBe(1);
    const trace = integrateVectorField3DTrajectories(document).trajectories[0]!;
    expect(trace.stopReason).toBe("time-limit");
    const last = trace.points.at(-1)!;
    expect(last.position[0]).toBeCloseTo(Math.cos(last.time), 3);
    expect(last.position[1]).toBeCloseTo(Math.sin(last.time), 3);
    expect(last.position[2]).toBeCloseTo(0, 6);
  });

  it("matches a saddle oracle within explicit tolerance and rejects a singular probe", () => {
    const document = field(["x", "-y", "0"], [1, 1, 0]);
    const trace = integrateVectorField3DTrajectories(document).trajectories[0]!;
    const last = trace.points.at(-1)!;
    expect(Math.abs(last.position[0] - Math.exp(last.time))).toBeLessThan(0.005);
    expect(Math.abs(last.position[1] - Math.exp(-last.time))).toBeLessThan(0.005);
    expect(() => sampleVectorField3DProbe(field(["1/x", "0", "0"], [1, 0, 0]),
      [0, 0, 0])).toThrow(/undefined/);
  });

  it("keeps numerical arrows and slices identical when display clipping or camera changes", () => {
    const document = field(["-y", "x", "0"], [1, 0, 0]);
    const unclippedArrows = sampleVectorField3DArrows(document);
    const unclippedSlice = sampleVectorField3DSlice(document, 2, 0);
    const clipped = reviseVectorField3DWorkspace(document, {
      ...defaultVectorField3DWorkspace(document.source), layout: "quad",
      cameraPreset: "xz", probe: [1, 0, 0], clipBounds: [[-1, 1], [-2, 2], [-1, 1]],
    });
    expect(sampleVectorField3DArrows(clipped).arrows).toEqual(unclippedArrows.arrows);
    expect(sampleVectorField3DSlice(clipped, 2, 0).values).toEqual(unclippedSlice.values);
    expect(sampleVectorField3DProbe(clipped, [1, 0, 0]).magnitude).toBe(1);
    expect(unclippedArrows.evaluated).toBeLessThanOrEqual(512);
    expect(unclippedSlice.evaluated).toBeLessThanOrEqual(1024);
  });

  it("sends a bounded analytic line with physical fixed coordinates and source provenance", () => {
    const document = field(["-y", "x", "0"], [1, 0, 0]);
    const line = sampleVectorField3DAnalyticLine(document, "q", 0, [1, 2, 3]);
    expect(line.rows).toHaveLength(129);
    expect(line.rows[0]).toMatchObject({ x: -4, y: -4 });
    expect(line.rows[64]).toMatchObject({ x: 0, y: 0 });
    expect(line.rows.at(-1)).toMatchObject({ x: 4, y: 4 });
    expect(line.origin).toMatchObject({ component: "q", varyingAxis: 0,
      fixedCoordinates: [null, 2, 3], revision: document.identity.revision,
      structuralHash: document.identity.structuralHash, expressions: ["-y", "x", "0"] });
    expect(validGraph2DAnalyticFieldOrigin(line.origin)).toBe(true);
    expect(sampleVectorField3DAnalyticLine(document, "p", 2, [1, 2, 3]).rows[64]?.y).toBe(-2);
    expect(sampleVectorField3DAnalyticLine(document, "speed", 0, [1, 2, 3]).rows[64]?.y).toBe(2);
    expect(() => sampleVectorField3DAnalyticLine(document, "q", 0, [1, 20, 3]))
      .toThrow(/domain/);
  });

  it("reports local divergence and curl with units and honest boundary stencils", () => {
    const vortex = field(["-y", "x", "0"], [1, 0, 0]);
    const center = analyzeVectorField3DDifferential(vortex, [0, 0, 0]);
    expect(center).toMatchObject({ status: "ready", quality: "approximate",
      divergenceUnit: "1/s", curlUnit: "1/s", divergence: 0 });
    expect(center.curl![0]).toBeCloseTo(0, 10);
    expect(center.curl![1]).toBeCloseTo(0, 10);
    expect(center.curl![2]).toBeCloseTo(2, 10);
    expect(center.evaluations).toBeLessThanOrEqual(9);
    expect(center.stencils.every(item => item.method === "centered-three-point")).toBe(true);
    const edge = analyzeVectorField3DDifferential(vortex, [4, 0, 0]);
    expect(edge.status).toBe("ready");
    expect(edge.stencils[0]).toMatchObject({ axis: "x", method: "one-sided-three-point",
      boundary: true });
    expect(edge.diagnostics.join(" ")).toMatch(/boundary.*accuracy is reduced/i);
    const source = field(["x", "y", "z"], [0, 0, 0]);
    expect(analyzeVectorField3DDifferential(source, [1, 2, 3]).divergence).toBeCloseTo(3, 10);
    const singular = analyzeVectorField3DDifferential(field(["1/x", "0", "0"], [1, 0, 0]),
      [0, 0, 0]);
    expect(singular.status).toBe("unavailable");
    expect(singular.divergence).toBeNull();
    expect(singular.diagnostics.join(" ")).toMatch(/undefined/);
    const mixed = createVectorField3DDocument({ ...vortex.source,
      axes: [{ ...axes[0] }, { ...axes[1], unit: "cm" }, { ...axes[2] }],
      field: { kind: "expressions", components: [
        vectorField3DExpression("0", "m/s"), vectorField3DExpression("0", "cm/s"),
        vectorField3DExpression("0", "m/s")] } }, { stableKey: "mixed-curl-units" });
    const mixedResult = analyzeVectorField3DDifferential(mixed, [0, 0, 0]);
    expect(mixedResult.divergence).toBe(0);
    expect(mixedResult.curl).toBeNull();
    expect(mixedResult.diagnostics.join(" ")).toMatch(/matching physical coordinate units/);
  });
});
