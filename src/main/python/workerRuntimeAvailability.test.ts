import { describe, expect, it } from "vitest";
import { workerRuntimeAvailability } from "./workerRuntimeAvailability";

describe("Python worker runtime state", () => {
  it("invalidates the startup handshake on process loss and blocked restart", () => {
    for (const event of ["worker-exit", "startup-rejected", "restart-blocked"] as const)
      expect(workerRuntimeAvailability(event)).toMatchObject({ available: false });
  });
  it("keeps worker health separate from admission pressure and job activity", () => {
    for (const event of ["admission-rejected", "job-start", "job-finish"] as const)
      expect(workerRuntimeAvailability(event)).toBeNull();
  });
});
