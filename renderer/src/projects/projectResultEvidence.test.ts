import { describe, expect, it } from "vitest";
import type { AnalysisResultEnvelope } from "@math3d/core";
import type { ProjectDependencyInspection } from "./projectDependencies";
import { presentProjectResultCard } from "./projectResultCard";
import { createProjectResultEvidence } from "./projectResultEvidence";

const result = { resultId: "saved", status: "numerical",
  provenance: { source: { documentId: "source", revision: 1 },
    operation: { type: "sample" }, engine: { name: "worker" } },
  summary: { mean: 42 }, artifacts: [], warnings: [], diagnostics: [],
} as unknown as AnalysisResultEnvelope;
const dependency = { sourceFreshness: "current", freshness: "current",
  missingArtifactIds: [] } as unknown as ProjectDependencyInspection["results"][number];

describe("Project result evidence", () => {
  it("labels matching Project generations as recorded, without claiming independent verification", () => {
    const evidence = createProjectResultEvidence(result, presentProjectResultCard(result, dependency), dependency);
    expect(evidence).toMatchObject({ schema: "math3d.project-result-evidence/v1",
      assessment: { status: "recorded-only", mathematics: "Recorded numerical" },
      summary: { mean: 42 } });
  });
  it("withholds values for changed external bytes, stale generations and missing artifacts", () => {
    for (const [state, inspection] of [
      ["changed", dependency],
      ["source-current", { ...dependency, sourceFreshness: "stale", freshness: "stale" }],
      ["source-current", { ...dependency, freshness: "unavailable", missingArtifactIds: ["gone"] }],
    ] as const) {
      const card = presentProjectResultCard(result, inspection, state, true);
      const evidence = createProjectResultEvidence(result, card, inspection);
      expect(evidence.assessment.status).toBe("withheld");
      expect(evidence.summary).toBeNull();
      expect(evidence.assessment.omissions).toContain("summary values");
    }
  });
  it("does not present a prior source check as a new export-time verification", () => {
    const card = presentProjectResultCard(result, dependency, "source-current", true);
    const evidence = createProjectResultEvidence(result, card, dependency);
    expect(evidence.assessment).toMatchObject({ status: "recorded-only",
      mathematics: "Recorded numerical" });
    expect(evidence.assessment.explanation).toContain("did not reopen");
  });
});
