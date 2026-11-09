import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeVectorField3DLineIntegral, analyzeVectorField3DTheorem,
  createMixedWorkspaceDocument, createOrientedPolylineSelection, createOrientedRegionSelection,
  createVectorField3DLineIntegralResult, createVectorField3DRegionIntegralResult,
  parseMath3DProject, replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  upsertProjectLineIntegralResult, upsertProjectRegionResult, upsertProjectScientificSelection,
  vectorField3DExpression, type Math3DProject, type VectorField3DDocument } from "@math3d/core";
import { vectorField3DResultEvidence, vectorField3DResultEvidenceCsv,
  vectorField3DResultEvidenceJson } from "./vectorField3DResultEvidence";
import { VectorField3DResultEvidenceCard } from "./VectorField3DResultEvidenceCard";

const fixture = new URL("../../../tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const source = (project: Math3DProject) => project.workspace.entries.find(item =>
  item.module === "vector3d")!.checkpoint as VectorField3DDocument;
const setup = () => {
  const project = parseMath3DProject(readFileSync(fixture, "utf8"));
  const old = source(project);
  const document = reviseVectorField3DDocument(old, { ...old.source,
    field: { kind: "expressions", components: [vectorField3DExpression("-y", "m/s"),
      vectorField3DExpression("x", "m/s"), vectorField3DExpression("z", "m/s")] } });
  const updated = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
    entries: project.workspace.entries.map(item => item.expected.id === old.identity.id ?
      { ...item, checkpoint: document, expected: document.identity } : item) }));
  return { project: updated, document };
};

describe("Field result evidence", () => {
  it("exports only a current path integral with source, method, units and check scope", () => {
    let { project, document } = setup();
    const selection = createOrientedPolylineSelection(document,
      [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], true, "forward", "field-evidence-path");
    project = upsertProjectScientificSelection(project, selection);
    const result = createVectorField3DLineIntegralResult(document, selection,
      analyzeVectorField3DLineIntegral(document, selection, "circulation"));
    project = upsertProjectLineIntegralResult(project, result);
    const evidence = vectorField3DResultEvidence(project, result, document);
    expect(evidence.qualification).toBe("current");
    expect(evidence.values?.value).toBeCloseTo(2, 10);
    const json = JSON.parse(vectorField3DResultEvidenceJson(evidence));
    expect(json.source.structuralHash).toBe(document.identity.structuralHash);
    expect(json.checkScope).toMatch(/No independent mathematical check/);
    expect(vectorField3DResultEvidenceCsv(evidence)).toContain("value,2");
    const card = renderToStaticMarkup(createElement(VectorField3DResultEvidenceCard,
      { evidence, label: "Circulation", testId: "gf10-saved-result" }));
    expect(card).toContain("2 m/s·m");
    expect(card).toContain("Export evidence JSON");
    expect(card).toContain("Export evidence CSV");
    expect(card).toContain("No independent mathematical check");
    const revised = reviseVectorField3DDocument(document, { ...document.source,
      field: { kind: "expressions", components: [vectorField3DExpression("x", "m/s"),
        vectorField3DExpression("x", "m/s"), vectorField3DExpression("z", "m/s")] } });
    const historical = vectorField3DResultEvidence(project, result, revised);
    expect(historical).toMatchObject({ qualification: "withheld", reason: "source-changed", values: null });
    expect(() => vectorField3DResultEvidenceJson(historical)).toThrow(/withheld/);
    expect(() => vectorField3DResultEvidenceCsv(historical)).toThrow(/withheld/);
    const staleCard = renderToStaticMarkup(createElement(VectorField3DResultEvidenceCard,
      { evidence: historical, label: "Circulation", testId: "gf10-saved-result" }));
    expect(staleCard).toContain("Value withheld: source-changed");
    expect(staleCard).not.toContain("2 m/s·m");
    expect(staleCard).not.toContain("Export evidence JSON");
  });

  it("distinguishes numerical theorem comparison from an independent proof", () => {
    let { project, document } = setup();
    const selection = createOrientedRegionSelection(document, { kind: "oriented-plane-region",
      normalAxis: 2, coordinate: 0, bounds: [[0, 1], [0, 1]],
      normalSign: 1, boundary: "right-hand" }, "field-evidence-region");
    project = upsertProjectScientificSelection(project, selection);
    const result = createVectorField3DRegionIntegralResult(document, selection,
      analyzeVectorField3DTheorem(document, selection, "stokes", 8));
    project = upsertProjectRegionResult(project, result);
    const evidence = vectorField3DResultEvidence(project, result, document);
    expect(evidence.qualification).toBe("current");
    expect(evidence.claim).toBe("Numerical theorem agreement");
    expect(evidence.checkScope).toMatch(/not a symbolic theorem proof/);
    expect(evidence.values).toHaveProperty("absoluteResidual");
    expect(vectorField3DResultEvidenceCsv(evidence)).toContain("absoluteResidual");
  });
});
