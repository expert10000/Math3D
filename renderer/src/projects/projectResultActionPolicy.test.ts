import { describe, expect, it } from "vitest";
import type { AnalysisResultEnvelope } from "@math3d/core";
import type { ProjectDependencyInspection } from "./projectDependencies";
import { presentProjectResultCard } from "./projectResultCard";
import { projectResultActionPolicy } from "./projectResultActionPolicy";
import { presentProjectResultVerification } from "./projectResultVerification";

const result = { status: "numerical" } as AnalysisResultEnvelope;
const dependency = { sourceFreshness: "current", freshness: "current", missingArtifactIds: [] } as
  unknown as ProjectDependencyInspection["results"][number];
const link = { status: "current" as const, module: "graph2d" as const, reason: "Exact generation" };

describe("Project result action policy", () => {
  it("allows recorded values, current navigation and saved-byte Mesh inspection independently", () => {
    const card = presentProjectResultCard(result, dependency);
    const policy = projectResultActionPolicy({ card,
      verification: presentProjectResultVerification({ kind: "other" }), sourceLink: link,
      savedMeshChecked: true });
    expect(policy).toMatchObject({ summary: "recorded", openCurrentSource: true,
      openExactSavedMesh: true, createVerifiedReport: false, exportEvidence: true });
    expect(policy.reason).toMatch(/not inferred/);
  });

  it("requires a current external check before either report action", () => {
    const verification = presentProjectResultVerification({ kind: "field", sourceCurrent: true });
    const enabled = projectResultActionPolicy({ card: presentProjectResultCard(result, dependency,
      "source-current", true), verification, sourceLink: link,
      canCreateReport: true, canExportReport: true });
    expect(enabled).toMatchObject({ summary: "recorded", createVerifiedReport: true,
      exportVerifiedReport: true });
    for (const sourceState of ["checking", "changed", "missing", "error"] as const) {
      const card = presentProjectResultCard(result, dependency, sourceState, true);
      const policy = projectResultActionPolicy({ card, verification, sourceLink: link,
        canCreateReport: true, canExportReport: true });
      expect(policy).toMatchObject({ summary: "withheld", createVerifiedReport: false,
        exportVerifiedReport: false, exportEvidence: true });
    }
  });

  it("withholds current values for historical, missing, and incomplete records", () => {
    for (const card of [presentProjectResultCard(result, { ...dependency,
      sourceFreshness: "stale" }), presentProjectResultCard(result, undefined),
      presentProjectResultCard({ ...result, status: "failed" }, dependency)]) {
      const policy = projectResultActionPolicy({ card,
        verification: presentProjectResultVerification({ kind: "other" }),
        sourceLink: { status: "historical", module: "graph2d", reason: "Changed" } });
      expect(policy.summary).toBe("withheld");
      expect(policy.openCurrentSource).toBe(false);
    }
  });
});
