import { describe, expect, it } from "vitest";
import type { AnalysisResultEnvelope } from "@math3d/core";
import type { ProjectDependencyInspection } from "./projectDependencies";
import { presentProjectResultCard } from "./projectResultCard";
import { createProjectResultEvidence, createProjectResultEvidenceCsv } from "./projectResultEvidence";

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
      publication: { schema: "math3d.result-publication/v1", module: "project",
        assessment: { status: "recorded", recordedClaim: "Recorded numerical" } },
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
      expect(evidence.publication.summary).toBeNull();
      expect(evidence.publication.assessment.status).toBe("withheld");
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

  it("exports the qualified record as CSV without leaking withheld values", () => {
    const safe = createProjectResultEvidence(result,
      presentProjectResultCard(result, dependency), dependency);
    const recorded = createProjectResultEvidenceCsv(safe);
    expect(recorded).toContain('"summary","{""mean"":42}"');
    expect(recorded).toContain('"assessment.status","recorded-only"');
    expect(recorded).toContain('"publication.status","recorded"');
    const withheld = createProjectResultEvidenceCsv(createProjectResultEvidence(result,
      presentProjectResultCard(result, { ...dependency, sourceFreshness: "stale" }), dependency));
    expect(withheld).toContain('"summary",""');
    expect(withheld).toContain('"assessment.status","withheld"');
    expect(withheld).toContain('"publication.status","withheld"');
    expect(withheld).not.toContain("42");
  });

  it("quotes CSV fields and neutralizes spreadsheet formulas", () => {
    const malicious = { ...result, warnings: ['=HYPERLINK("https://example.invalid")', "line\nbreak"] };
    const csv = createProjectResultEvidenceCsv(createProjectResultEvidence(malicious,
      presentProjectResultCard(malicious, dependency), dependency));
    expect(csv).toContain('"warnings","[""=HYPERLINK(');
    const formula = { ...result, provenance: { ...result.provenance,
      source: { ...result.provenance.source, documentId: "=1+1" } } };
    expect(createProjectResultEvidenceCsv(createProjectResultEvidence(formula,
      presentProjectResultCard(formula, dependency), dependency))).toContain('"source.documentId","\'=1+1"');
  });
});
