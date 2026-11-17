import { describe, expect, it } from "vitest";
import { meshOperationRunBlocker } from "./MeshOperationsPanel";

const ready = {
  operation: "smooth" as const, meshReady: true, implicitAvailable: true, workerReady: true,
  workerStatusText: "available", cgalReady: true, cgalStatusText: "available",
  booleanStrategy: "fast" as const, booleanOperandObjectId: "mesh-b", operationBusy: false,
};

describe("Mesh Run availability", () => {
  it("separates missing sources from runtime setup", () => {
    expect(meshOperationRunBlocker({ ...ready, meshReady: false, workerReady: false })).toEqual({
      reason: "Choose a Mesh source first.", runtime: false,
    });
    expect(meshOperationRunBlocker({ ...ready, operation: "implicit-preview", implicitAvailable: false })).toEqual({
      reason: "Open an implicit Surface source first.", runtime: false,
    });
    expect(meshOperationRunBlocker({ ...ready, operation: "boolean-union", booleanOperandObjectId: null })).toEqual({
      reason: "Choose a second Mesh operand.", runtime: false,
    });
  });

  it("identifies the required worker and keeps ready operations runnable", () => {
    expect(meshOperationRunBlocker({ ...ready, workerReady: false, workerStatusText: "bridge unavailable" })).toEqual({
      reason: "Mesh worker unavailable: bridge unavailable.", runtime: true,
    });
    expect(meshOperationRunBlocker({ ...ready, operation: "cgal-remesh", cgalReady: false, cgalStatusText: "unavailable" })).toEqual({
      reason: "CGAL runtime unavailable: unavailable.", runtime: true,
    });
    expect(meshOperationRunBlocker({ ...ready })).toBeNull();
  });
});
