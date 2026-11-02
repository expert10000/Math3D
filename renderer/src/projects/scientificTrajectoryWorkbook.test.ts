import { describe, expect, it } from "vitest";
import { createVectorField3DDocument, createVectorField3DTrajectoryResult,
  createMath3DProject, createMixedWorkspaceDocument, vectorField3DRegionResultRelation,
  integrateVectorField3DTrajectories, reviseVectorField3DDocument,
  captureProjectResources, projectResourceInventory, upsertMath3DProjectWorkbook,
  parseMath3DProject, serializeMath3DProject,
  vectorField3DExpression, verifyVectorField3DTrajectoryResult,
  type AnalysisResultEnvelope, type VectorField3DSource } from "@math3d/core";
import { createScientificTrajectoryWorkbook, scientificTrajectoryReportMarkdown,
  verifyScientificTrajectoryReport } from "./scientificTrajectoryWorkbook";
import { createNotebookReference } from "@math3d/workbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "./projectWorkbookBinding";
import { createScientificSolverAuditExport } from "./scientificSolverAuditExport";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectResultsBrowser } from "../components/ProjectResultsBrowser";

const field = () => createVectorField3DDocument({
  axes: (["x", "y", "z"] as const).map(role => ({ role, label: role,
    unit: "m", min: -4, max: 4 })) as VectorField3DSource["axes"],
  timeUnit: "s", field: { kind: "expressions", components: ["1", "0", "0"].map(
    value => vectorField3DExpression(value, "m/s")) as Extract<
      VectorField3DSource["field"], { kind: "expressions" }>["components"] },
  seeds: [{ id: "oracle", position: [0, 0, 0] }],
  display: { density: [5, 5, 5], maxGlyphs: 512,
    magnitudeScale: 1, colorBy: "speed" },
  solver: { method: "rk45", absoluteTolerance: 1e-7,
    relativeTolerance: 1e-7, maxSteps: 1000, maxTime: 1,
    maxArcLength: 10 } }, { stableKey: "solver-report-oracle" });

describe("SCI-19 trajectory solver Workbook result", () => {
  it("saves real diagnostics without points and recomputes them before disclosure", () => {
    const source = field();
    const artifact = integrateVectorField3DTrajectories(source);
    const saved = createVectorField3DTrajectoryResult(source, artifact);
    expect(saved.summary.totalEvaluations).toBe(artifact.totalEvaluations);
    expect(saved.summary.trajectories).toMatchObject([{ stopReason: "time-limit",
      evaluations: artifact.trajectories[0]!.evaluations }]);
    expect(JSON.stringify(saved)).not.toContain('"points"');
    expect(verifyVectorField3DTrajectoryResult(saved, source)).toBe(saved);
    const markdown = scientificTrajectoryReportMarkdown(saved);
    expect(markdown).toContain("Accepted steps");
    expect(markdown).toContain("time-limit");
    const changed = { ...saved, summary: { ...saved.summary,
      totalEvaluations: artifact.totalEvaluations + 1 } } as AnalysisResultEnvelope;
    expect(() => verifyVectorField3DTrajectoryResult(changed, source)).toThrow(
      /differ from the verified source/);
    const revised = reviseVectorField3DDocument(source, { ...source.source,
      solver: { ...source.source.solver, maxTime: 2 } });
    expect(() => verifyVectorField3DTrajectoryResult(saved, revised)).toThrow();
    const backward = createVectorField3DTrajectoryResult(source,
      integrateVectorField3DTrajectories(source, { direction: "backward" }));
    expect(backward.provenance.operation.parameters.direction).toBe("backward");
    expect(verifyVectorField3DTrajectoryResult(backward, source)).toBe(backward);
  });

  it("reopens a source-linked Project Workbook without saved trajectory arrays", async () => {
    const source = field();
    const result = createVectorField3DTrajectoryResult(source,
      integrateVectorField3DTrajectories(source));
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "vector3d",
      checkpoint: source, expected: source.identity, replay: null }],
      activeDocumentIds: [source.identity.id], results: [result],
      relations: [vectorField3DRegionResultRelation(result)],
      constructions: [], artifacts: [], committedSelection: null });
    const project = parseMath3DProject(serializeMath3DProject(
      createMath3DProject(workspace, { stableKey: "trajectory-report" })));
    expect((await verifyScientificTrajectoryReport(project,
      createNotebookReference(project, "result", result.resultId))).summary)
      .toEqual(result.summary);
    const workbook = createScientificTrajectoryWorkbook(project, result,
      "solver-workbook", "solver-report");
    const reference = workbook.stages[1]!.blocks[0]!.notebookReference!;
    expect((await verifyScientificTrajectoryReport(project, reference)).resultId).toBe(result.resultId);
    expect((await verifyScientificTrajectoryReport(project,
      createNotebookReference(project, "result", result.resultId))).summary)
      .toEqual(result.summary);
    const prepared = prepareProjectWorkbook(project, workbook, "solver-report");
    const bound = upsertMath3DProjectWorkbook(project, prepared.reference);
    const resources = captureProjectResources(bound, item =>
      item.kind === "workbook-payload" ? prepared.bytes : null, true);
    const payload = projectResourceInventory(bound).find(item =>
      item.kind === "workbook-payload")!;
    const reopened = readProjectWorkbook(resources.bytes(payload)!, bound.workbooks![0]!);
    const reopenedReference = reopened.stages[1]!.blocks[0]!.notebookReference!;
    expect((await verifyScientificTrajectoryReport(bound, reopenedReference)).summary)
      .toEqual(result.summary);
    const audit = await createScientificSolverAuditExport(bound, reopenedReference,
      "trajectory", () => verifyScientificTrajectoryReport(bound, reopenedReference),
      () => new Date("2026-11-02T00:00:00.000Z"));
    expect(audit.verification).toMatchObject({ status: "verified",
      checkedAt: "2026-11-02T00:00:00.000Z" });
    if (audit.verification.status !== "verified") throw new Error("Expected verified audit");
    expect(audit.sourceHashes.document).toBe(result.provenance.source.structuralHash);
    expect(audit.settings).toEqual(result.summary.solver);
    expect(audit.figures).toEqual(result.summary);
    expect(audit.units).toMatchObject({ coordinates: ["m", "m", "m"],
      vector: ["m/s", "m/s", "m/s"], parameter: "s" });
    expect(JSON.stringify(audit)).not.toContain('"points"');
    const withheld = await createScientificSolverAuditExport(bound,
      reopenedReference, "trajectory", async () => {
        throw new TypeError("Saved solver figures changed");
      });
    expect(Object.keys(withheld).sort()).toEqual([
      "analysis", "kind", "projectId", "resultId", "schemaVersion", "verification"]);
    expect(withheld.verification).toMatchObject({ status: "withheld",
      reason: "Saved solver figures changed" });
    expect(JSON.stringify(withheld)).not.toContain('"figures"');
    const renderBrowser = (status: "changed" | "source-current") =>
      renderToStaticMarkup(React.createElement(ProjectResultsBrowser, {
        project: bound, inspection: null, titles: new Map(),
        canOpen: () => false, onOpen: () => {},
        regionResultStatuses: { [result.resultId]: status },
        onCreateScientificReport: () => {} }));
    expect(renderBrowser("changed")).toContain("Saved analysis values are withheld");
    expect(renderBrowser("changed")).not.toContain("totalEvaluations</dt>");
    expect(renderBrowser("source-current")).toContain("totalEvaluations</dt>");
  });
});
