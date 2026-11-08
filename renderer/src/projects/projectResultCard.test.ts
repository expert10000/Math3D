import { describe, expect, it } from "vitest";
import type { AnalysisResultEnvelope } from "@math3d/core";
import type { ProjectDependencyInspection } from "./projectDependencies";
import { presentProjectResultCard } from "./projectResultCard";

const result = { status: "numerical" } as AnalysisResultEnvelope;
const dependency = { sourceFreshness: "current", freshness: "current",
  missingArtifactIds: [] } as unknown as ProjectDependencyInspection["results"][number];

describe("Project result card authority", () => {
  it("does not promote a successful numerical result to mathematical certification", () => {
    const card = presentProjectResultCard(result, dependency);
    expect(card).toMatchObject({ execution: { label: "Completed" },
      integrity: { label: "Snapshot current" }, mathematics: { label: "Recorded numerical" } });
    expect(card.integrity.detail).toContain("not independently checked");
  });
  it("requires external bytes for scientific source verification", () => {
    expect(presentProjectResultCard(result, dependency, undefined, true).integrity.label)
      .toBe("Checking sources");
    expect(presentProjectResultCard(result, dependency, "source-current", true).integrity.label)
      .toBe("Source verified");
    expect(presentProjectResultCard(result, dependency, {
      kind: "combined", vector: "source-current", scalar: "source-current",
      complex: "source-current", curlMagnitude: "changed",
    }, true).integrity.label).toBe("Changed source");
  });
  it("keeps changed generations and missing artifacts ahead of a successful byte check", () => {
    expect(presentProjectResultCard(result, { ...dependency,
      sourceFreshness: "stale", freshness: "stale" }, "source-current", true).integrity.label)
      .toBe("Historical source");
    expect(presentProjectResultCard(result, { ...dependency,
      freshness: "unavailable", missingArtifactIds: ["missing"] }, "source-current", true).integrity.label)
      .toBe("Source unavailable");
  });
  it("preserves failed and cancelled execution independently from integrity", () => {
    expect(presentProjectResultCard({ ...result, status: "failed" }, dependency).execution.label)
      .toBe("Failed");
    expect(presentProjectResultCard({ ...result, status: "cancelled" }, dependency).mathematics.label)
      .toBe("No result");
  });
});
