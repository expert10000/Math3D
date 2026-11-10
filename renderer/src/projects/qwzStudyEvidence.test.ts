import { describe, expect, it } from "vitest";
import { qwzStudyEvidenceCsv, qwzStudyPublication } from "./qwzStudyEvidence";

const source = { runId: "run-1", resultSha256: "b".repeat(64),
  bands: { documentId: "bands", revision: 2, sceneFingerprint: "a".repeat(64) },
  curvature: { documentId: "curvature", revision: 3, sceneFingerprint: "c".repeat(64) } };

describe("QWZ Study publication receipt", () => {
  it("keeps both exact source identities and limits the mathematical check", () => {
    const report = { projectId: "project", studyId: "study", source,
      verification: { status: "verified" as const,
        selection: { band: { energy: 2.5 }, curvature: { value: -0.25 } },
        invariants: [{ label: "Chern", value: 1 }] } };
    const publication = qwzStudyPublication(report);
    expect(publication).toMatchObject({ module: "study", resultId: "study",
      assessment: { status: "recorded", sourceStatus: "both scene bundles reverified" },
      summary: { source, selection: { band: { energy: 2.5 } } } });
    expect(publication.assessment.independentCheck).toMatch(/not independently proved/);
    const csv = qwzStudyEvidenceCsv(report);
    expect(csv).toContain('"bandsFingerprint"');
    expect(csv).toContain('"selection"');
  });

  it("omits every pinned numerical value when source verification fails", () => {
    const report = { projectId: "project", studyId: "study", source,
      verification: { status: "withheld" as const, reason: "changed bundle",
        selection: { band: { energy: 2.5 } }, invariants: [{ value: 1 }] } };
    const publication = qwzStudyPublication(report);
    expect(publication.summary).toBeNull();
    expect(publication.assessment).toMatchObject({ status: "withheld", reason: "changed bundle" });
    expect(JSON.stringify(publication)).not.toContain("2.5");
    expect(qwzStudyEvidenceCsv(report)).not.toContain("2.5");
    expect(qwzStudyEvidenceCsv(report)).toContain("band energy");
  });
});
