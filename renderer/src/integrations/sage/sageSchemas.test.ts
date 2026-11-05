import { describe, expect, it } from "vitest";
import { normalizeSageHealth, normalizeSageRunResponse } from "./sageSchemas";

describe("Sage schemas", () => {
  it("normalizes health and filters unknown operations", () => {
    expect(
      normalizeSageHealth({
        status: "ok",
        engine: "sagemath",
        available: true,
        operations: ["sage.symbolic.simplify", "sage.topology.integer_homology", "sage.unsafe.eval"],
      })
    ).toEqual({
      status: "ok",
      engine: "sagemath",
      available: true,
      operations: ["sage.symbolic.simplify", "sage.topology.integer_homology"],
    });
  });

  it("retains a reported SageMath runtime version", () => {
    expect(normalizeSageHealth({ status: "ok", engine: "sagemath", engineVersion: "10.6",
      available: true, operations: ["sage.symbolic.simplify"] }).engineVersion).toBe("10.6");
  });

  it("retains a validated worker queue policy", () => {
    const workerPolicy = { schemaVersion: 1, maxRunning: 2, maxQueued: 4, queueWaitMs: 10000,
      wallTimeMs: 30000, cpuTimeSeconds: 30, maxMemoryBytes: 4294967296,
      maxInputBytes: 65536, maxOutputBytes: 262144 };
    const health = { status: "ok", engine: "sagemath", available: true, operations: [], workerPolicy };
    expect(normalizeSageHealth(health).workerPolicy).toEqual(workerPolicy);
    expect(normalizeSageHealth({ ...health, workerPolicy: { ...workerPolicy, maxQueued: "many" } }).workerPolicy)
      .toBeUndefined();
  });

  it("normalizes successful run responses", () => {
    expect(
      normalizeSageRunResponse({
        engine: "sagemath",
        operation: "sage.symbolic.simplify",
        success: true,
        latex: "1",
        result: { text: "1" },
        warnings: [],
        elapsedMs: 12.4,
      })
    ).toEqual({
      engine: "sagemath",
      operation: "sage.symbolic.simplify",
      success: true,
      latex: "1",
      result: { text: "1" },
      warnings: [],
      elapsedMs: 12,
      error: undefined,
    });
  });

  it("preserves failure messages", () => {
    expect(
      normalizeSageRunResponse({
        engine: "sagemath",
        operation: "sage.symbolic.simplify",
        success: false,
        result: {},
        error: "Unsupported expression",
      })
    ).toMatchObject({
      success: false,
      error: "Unsupported expression",
      warnings: [],
    });
  });
});
