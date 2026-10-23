import { describe, expect, it } from "vitest";
import { createVectorField3DDocument, integrateVectorField3DTrajectories,
  vectorField3DExpression, type VectorField3DSource } from "@math3d/core";

const make = (components: [string, string, string], overrides: Partial<VectorField3DSource> = {}) => {
  const source: VectorField3DSource = {
    axes: [{ role: "x", label: "x", unit: "m", min: -1, max: 1 },
      { role: "y", label: "y", unit: "m", min: -1, max: 1 },
      { role: "z", label: "z", unit: "m", min: -1, max: 1 }],
    timeUnit: "s", field: { kind: "expressions", components: components.map(component =>
      vectorField3DExpression(component, "m/s")) as
      [ReturnType<typeof vectorField3DExpression>, ReturnType<typeof vectorField3DExpression>,
        ReturnType<typeof vectorField3DExpression>] },
    seeds: [{ id: "origin", position: [0, 0, 0] }],
    display: { density: [3, 3, 3], maxGlyphs: 27, magnitudeScale: 1, colorBy: "speed" },
    solver: { absoluteTolerance: 1e-8, relativeTolerance: 1e-8,
      maxSteps: 200, maxTime: 5, maxArcLength: 100 },
    ...overrides,
  };
  return createVectorField3DDocument(source, { stableKey: ["trajectory-test", components] });
};

describe("GRA-14 bounded adaptive 3D trajectories", () => {
  it("marks an exact zero field stationary without inventing movement", () => {
    const result = integrateVectorField3DTrajectories(make(["0", "0", "0"]));
    expect(result.trajectories[0]).toMatchObject({ stopReason: "stationary", acceptedSteps: 0,
      rejectedSteps: 0, points: [{ position: [0, 0, 0], time: 0, arcLength: 0 }] });
  });

  it("reaches the finite boundary in a constant field and preserves direction", () => {
    const document = make(["1", "0", "0"]);
    const forward = integrateVectorField3DTrajectories(document).trajectories[0]!;
    const backward = integrateVectorField3DTrajectories(document, { direction: "backward" }).trajectories[0]!;
    expect(forward.stopReason).toBe("boundary");
    expect(forward.points.at(-1)?.position[0]).toBeCloseTo(1, 8);
    expect(forward.points.at(-1)?.arcLength).toBeCloseTo(1, 8);
    expect(backward.stopReason).toBe("boundary");
    expect(backward.points.at(-1)?.position[0]).toBeCloseTo(-1, 8);
    expect(backward.points.at(-1)?.time).toBeLessThan(0);
    expect(resultBounded(forward)).toBe(true);
  });

  it("stops at the first face of an asymmetric box without overshooting another axis", () => {
    const document = make(["2", "1", "-1"], {
      axes: [{ role: "x", label: "x", unit: "m", min: -2, max: 3 },
        { role: "y", label: "y", unit: "m", min: -4, max: 4 },
        { role: "z", label: "z", unit: "m", min: -1, max: 2 }],
      seeds: [{ id: "inside", position: [0, 0, 0] }],
      solver: { absoluteTolerance: 1e-8, relativeTolerance: 1e-8,
        maxSteps: 200, maxTime: 10, maxArcLength: 100 },
    });
    const forward = integrateVectorField3DTrajectories(document).trajectories[0]!;
    expect(forward.stopReason).toBe("boundary");
    expect(forward.points.at(-1)?.position).toEqual([2, 1, -1]);
    expect(forward.points.at(-1)?.time).toBeCloseTo(1, 8);
    expect(forward.points.at(-1)?.arcLength).toBeCloseTo(Math.sqrt(6), 8);
    expect(forward.points.every(point => point.position[0] <= 3 && point.position[2] >= -1)).toBe(true);
    const backward = integrateVectorField3DTrajectories(document, { direction: "backward" }).trajectories[0]!;
    expect(backward.stopReason).toBe("boundary");
    expect(backward.points.at(-1)?.position).toEqual([-2, -1, 1]);
    expect(backward.points.at(-1)?.time).toBeCloseTo(-1, 8);
  });

  it("reports an outward-facing boundary seed immediately and permits inward travel", () => {
    const document = make(["1", "0", "0"], {
      seeds: [{ id: "face", position: [1, 0, 0] }],
    });
    const outward = integrateVectorField3DTrajectories(document).trajectories[0]!;
    expect(outward).toMatchObject({ stopReason: "boundary", acceptedSteps: 0 });
    expect(outward.points).toHaveLength(1);
    const inward = integrateVectorField3DTrajectories(document, { direction: "backward" }).trajectories[0]!;
    expect(inward.stopReason).toBe("boundary");
    expect(inward.points.at(-1)?.position[0]).toBeCloseTo(-1, 8);
    expect(inward.points.at(-1)?.time).toBeCloseTo(-2, 8);
  });

  it("stops at an undefined singular seed and does not cross it", () => {
    const result = integrateVectorField3DTrajectories(make(["1/x", "0", "0"])).trajectories[0]!;
    expect(result.stopReason).toBe("undefined");
    expect(result.points).toHaveLength(1);
    const approach = integrateVectorField3DTrajectories(make(["-1/x", "0", "0"], {
      seeds: [{ id: "approach", position: [-.5, 0, 0] }],
      solver: { absoluteTolerance: 1e-8, relativeTolerance: 1e-8,
        maxSteps: 500, maxTime: 1, maxArcLength: 10 },
    })).trajectories[0]!;
    expect(approach.points.every(point => point.position[0] < 0)).toBe(true);
    expect(approach.stopReason).toMatch(/undefined|solver-failure|step-limit/);
    const sameSignPole = integrateVectorField3DTrajectories(make(["1/x^2", "0", "0"], {
      seeds: [{ id: "pole", position: [-.5, 0, 0] }],
      solver: { absoluteTolerance: 1e-8, relativeTolerance: 1e-8,
        maxSteps: 500, maxTime: 1, maxArcLength: 10 },
    })).trajectories[0]!;
    expect(sameSignPole.points.every(point => point.position[0] < 0)).toBe(true);
    expect(sameSignPole.stopReason).toMatch(/undefined|solver-failure|step-limit/);
  });

  it("never publishes points beyond a non-grid-aligned pole", () => {
    const pole = .13;
    const result = integrateVectorField3DTrajectories(make(["1/(x-0.13)^2", "0", "0"], {
      seeds: [{ id: "near-pole", position: [0, 0, 0] }],
      solver: { absoluteTolerance: 1e-9, relativeTolerance: 1e-9,
        maxSteps: 800, maxTime: .1, maxArcLength: 10 },
    })).trajectories[0]!;
    expect(result.points.length).toBeGreaterThan(1);
    expect(result.points.every(point => point.position[0] < pole)).toBe(true);
    expect(result.stopReason).toMatch(/undefined|solver-failure|step-limit/);
    expect(result.evaluations).toBeLessThanOrEqual(1 + 800 * 17);
  });

  it("reports step, time, length and cancellation limits separately", () => {
    const step = integrateVectorField3DTrajectories(make(["1", "0", "0"], {
      solver: { absoluteTolerance: 1e-8, relativeTolerance: 1e-8, maxSteps: 1, maxTime: 5 },
    })).trajectories[0]!;
    expect(step.stopReason).toBe("step-limit");
    expect(step.acceptedSteps).toBe(1);
    const time = integrateVectorField3DTrajectories(make(["1", "0", "0"], {
      axes: [{ role: "x", label: "x", unit: "m", min: -10, max: 10 },
        { role: "y", label: "y", unit: "m", min: -10, max: 10 },
        { role: "z", label: "z", unit: "m", min: -10, max: 10 }],
      solver: { absoluteTolerance: 1e-8, relativeTolerance: 1e-8, maxSteps: 200, maxTime: .1 },
    })).trajectories[0]!;
    expect(time.stopReason).toBe("time-limit");
    expect(time.points.at(-1)?.time).toBeCloseTo(.1, 8);
    const length = integrateVectorField3DTrajectories(make(["1", "0", "0"], {
      solver: { absoluteTolerance: 1e-8, relativeTolerance: 1e-8,
        maxSteps: 200, maxTime: 5, maxArcLength: .2 },
    })).trajectories[0]!;
    expect(length.stopReason).toBe("length-limit");
    expect(length.points.at(-1)?.arcLength).toBeCloseTo(.2, 8);
    const boundaryAndArc = integrateVectorField3DTrajectories(make(["1", "0", "0"], {
      solver: { absoluteTolerance: 1e-8, relativeTolerance: 1e-8,
        maxSteps: 200, maxTime: 20, maxArcLength: .8 },
    })).trajectories[0]!;
    expect(boundaryAndArc.stopReason).toBe("length-limit");
    expect(boundaryAndArc.points.at(-1)?.position[0]).toBeCloseTo(.8, 8);
    const cancelled = integrateVectorField3DTrajectories(make(["1", "0", "0"]),
      { shouldCancel: () => true }).trajectories[0]!;
    expect(cancelled.stopReason).toBe("cancelled");
  });

  it("tracks a rotational field with bounded local error and source identity", () => {
    const document = make(["-y", "x", "0"], { seeds: [{ id: "orbit", position: [.5, 0, 0] }],
      solver: { absoluteTolerance: 1e-7, relativeTolerance: 1e-7,
        maxSteps: 500, maxTime: Math.PI / 2, maxArcLength: 10 } });
    const artifact = integrateVectorField3DTrajectories(document);
    const trajectory = artifact.trajectories[0]!;
    expect(trajectory.stopReason).toBe("time-limit");
    expect(trajectory.points.at(-1)?.position[0]).toBeCloseTo(0, 4);
    expect(trajectory.points.at(-1)?.position[1]).toBeCloseTo(.5, 4);
    expect(artifact.source.structuralHash).toBe(document.identity.structuralHash);
    expect(artifact.solver.method).toBe("adaptive-rk4-step-doubling");
    expect(artifact.totalEvaluations).toBeLessThanOrEqual(artifact.solver.maxEvaluations);
  });
});

const resultBounded = (trajectory: ReturnType<typeof integrateVectorField3DTrajectories>["trajectories"][number]) =>
  trajectory.points.every(point => point.position.every(value => value >= -1 && value <= 1));
