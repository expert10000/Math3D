import { describe, expect, it } from "vitest";
import {
  canResumeMobileComputeJob,
  createMobileComputeJob,
  isMobileComputeJobTerminal,
  mergeMobileComputeJobSnapshot,
} from "../../apps/mobile/src/models/mobileComputeJobs";

const request = {
  jobId: "job-1",
  operation: "vtk.preview-implicit" as const,
  inputHash: "input-a",
  sceneId: "scene-a",
  sceneSchemaVersion: 1,
  parameters: {
    expr: "x*x+y*y+z*z-1",
    iso: 0,
    domain: { min: [-2, -2, -2] as [number, number, number], max: [2, 2, 2] as [number, number, number] },
    resolution: 72,
  },
};

describe("mobile compute jobs", () => {
  it("creates a persistent queued job and merges worker lifecycle updates", () => {
    const job = createMobileComputeJob({
      surfaceId: "surface-a",
      workerBaseUrl: "http://worker/api/worker",
      request,
      now: 100,
    });
    const running = mergeMobileComputeJobSnapshot(job, {
      ...request,
      status: "running",
      progress: 37.6,
      phase: "meshing",
      createdAt: 100,
      updatedAt: 200,
    });

    expect(running).toMatchObject({ status: "running", progress: 38, phase: "meshing" });
    expect(canResumeMobileComputeJob(running, "http://worker/api/worker", "input-a")).toBe(true);
  });

  it("does not resume a job for different inputs or worker and recognizes terminal states", () => {
    const job = createMobileComputeJob({ surfaceId: "surface-a", workerBaseUrl: "worker-a", request });
    expect(canResumeMobileComputeJob(job, "worker-a", "input-b")).toBe(false);
    expect(canResumeMobileComputeJob(job, "worker-b", "input-a")).toBe(false);
    expect(isMobileComputeJobTerminal("succeeded")).toBe(true);
    expect(isMobileComputeJobTerminal("failed")).toBe(true);
    expect(isMobileComputeJobTerminal("cancelled")).toBe(true);
    expect(isMobileComputeJobTerminal("running")).toBe(false);
  });
});
