import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mobileWithheldScientificRows } from
  "../../apps/mobile/src/models/mobileScientificGraphRows";
import { computeVectorField3DBasinMap, computeVectorField3DPoincareSection,
  applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  createMixedWorkspaceDocument, createPoincareGraphOrigin,
  Graph2DPointTableStore, poincareGraphRows, projectPoincareGraphStatus,
  parseMath3DProject,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeMath3DProject, upsertProjectVectorField3DTopologyStudy,
  projectVectorField3DTopologyStatus, isVectorField3DTopologyPublicationCurrent, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";

const base = () => {
  const project = parseMath3DProject(readFileSync(new URL(
    "../fixtures/derived-field/gf03-magnitude-slice-profile.math3d",
    import.meta.url), "utf8"));
  const source = project.workspace.entries.find(item => item.module === "vector3d")!
    .checkpoint as VectorField3DDocument;
  const withField = (components: readonly [string, string, string]) => {
    const document = reviseVectorField3DDocument(source, { ...source.source,
      field: { kind: "expressions", components: components.map(expression =>
        vectorField3DExpression(expression, "m/s")) as unknown as
        typeof source.source.field & { kind: "expressions" } } });
    const current = replaceMath3DProjectWorkspace(project,
      createMixedWorkspaceDocument({ ...project.workspace, entries:
        project.workspace.entries.map(item => item.expected.id === source.identity.id ?
          { ...item, checkpoint: document, expected: document.identity } : item),
        derivedFields: [] }));
    return { current, document };
  };
  return withField;
};
const solver = { method: "rk4-step-doubling" as const, maxSteps: 256,
  maxTime: 20, absoluteTolerance: 1e-5, relativeTolerance: 1e-5 };

describe("GF-41 bounded basin map", () => {
  it("labels known double-well basins, separatrix and nonconvergence without claiming a global basin", () => {
    const { current, document } = base()(["x-x^3", "-y", "0"]);
    const recipe = { planeZ: 0, x: [-1.5, 1.5] as const,
      y: [-.5, .5] as const, columns: 7, rows: 3,
      attractors: [{ id: "left", position: [-1, 0, 0] as const },
        { id: "right", position: [1, 0, 0] as const }],
      captureRadius: .15, solver };
    const study = computeVectorField3DBasinMap(document, recipe);
    expect(study.cells).toHaveLength(21);
    expect(study.cells[7]!.attractorId).toBe("left");
    expect(study.cells[13]!.attractorId).toBe("right");
    expect(study.cells.filter(item => item.x === 0)).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: "inconclusive" })]));
    expect(study.totalEvaluations).toBeLessThanOrEqual(250_000);
    const even = computeVectorField3DBasinMap(document,
      { ...recipe, columns: 6 });
    expect(even.cells.some(item => item.reason === "boundary" &&
      item.state === "inconclusive")).toBe(true);
    expect(() => computeVectorField3DBasinMap(document, recipe, () => true))
      .toThrow(/cancelled/);
    const saved = upsertProjectVectorField3DTopologyStudy(current,
      study.publication);
    const reopened = parseMath3DProject(serializeMath3DProject(saved));
    const result = reopened.workspace.results.find(item =>
      item.resultId === study.publication.resultId)!;
    expect(result.provenance.operation.parameters.recipe).toEqual(recipe);
    expect(projectVectorField3DTopologyStatus(reopened, result).status)
      .toBe("current");
    expect(isVectorField3DTopologyPublicationCurrent(result, document)).toBe(true);
    const changed = reviseVectorField3DDocument(document, { ...document.source,
      display: { ...document.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(reopened,
      createMixedWorkspaceDocument({ ...reopened.workspace, entries:
        reopened.workspace.entries.map(item => item.expected.id === document.identity.id ?
          { ...item, checkpoint: changed, expected: changed.identity } : item) }));
    expect(projectVectorField3DTopologyStatus(stale, result))
      .toMatchObject({ status: "withheld", reason: "source-changed" });
    expect(isVectorField3DTopologyPublicationCurrent(result, changed)).toBe(false);
    expect(projectVectorField3DTopologyStatus(reopened, result, changed))
      .toMatchObject({ status: "withheld", reason: "source-changed" });
  });
});

describe("GF-42 oriented Poincaré section", () => {
  it("saves bounded negative crossings of a circular orbit with physical units", () => {
    const { current, document } = base()(["-y", "x", "0"]);
    const recipe = { seed: [1, 0, 0] as const,
      section: { start: [0, 0, 0] as const, end: [0, 2, 0] as const,
        normal: [1, 0] as const, direction: "negative" as const },
      solver, maxCrossings: 4, tangencyTolerance: 1e-4 };
    const study = computeVectorField3DPoincareSection(document, recipe);
    expect(study.crossings.length).toBeGreaterThanOrEqual(2);
    expect(study.crossings.length).toBeLessThanOrEqual(4);
    expect(study.crossings[0]!.time).toBeCloseTo(Math.PI / 2, 1);
    expect(study.crossings[0]!.position[1]).toBeCloseTo(1, 1);
    expect(study.crossings.every(item => item.normalSpeed < 0)).toBe(true);
    expect(study.publication.summary).toMatchObject({ coordinateUnit: "m",
      timeUnit: "s" });
    const positive = computeVectorField3DPoincareSection(document,
      { ...recipe, section: { ...recipe.section, direction: "positive" } });
    expect(positive.crossings).toHaveLength(0);
    const tangent = computeVectorField3DPoincareSection(document,
      { ...recipe, section: { ...recipe.section,
        start: [-1, 1, 0], end: [1, 1, 0], normal: [0, 1],
        direction: "positive" } });
    expect(tangent.crossings).toHaveLength(0);
    const coarse = computeVectorField3DPoincareSection(document,
      { ...recipe, solver: { ...solver, absoluteTolerance: 1e-3,
        relativeTolerance: 1e-3 } });
    expect(Math.abs(coarse.crossings[0]!.time - study.crossings[0]!.time))
      .toBeLessThan(.05);
    const saved = upsertProjectVectorField3DTopologyStudy(current,
      study.publication);
    expect(isVectorField3DTopologyPublicationCurrent(study.publication, document)).toBe(true);
    const rows = poincareGraphRows(study);
    const origin = createPoincareGraphOrigin(saved, study);
    const tables = new Graph2DPointTableStore();
    const graph = createEmptyGraph2DDocument("gf42-graph");
    const authored = createGraph2DDocument({ ...applyGraph2DAuthoring(graph,
      { type: "create-point-series", draft: { label: "Section crossings",
        table: tables.publish(rows), mode: "points",
        domain: { min: 0, max: recipe.solver.maxTime,
          includeMin: true, includeMax: true }, poincareOrigin: origin,
        style: { color: "#2563eb", lineWidth: 2,
          lineStyle: "solid", visible: true } } }), stableKey: "gf42-graph" });
    const graphProject = replaceMath3DProjectWorkspace(saved,
      createMixedWorkspaceDocument({ ...saved.workspace,
        entries: [...saved.workspace.entries, { module: "graph2d",
          checkpoint: authored, expected: authored.identity, replay: null }] }));
    expect(projectPoincareGraphStatus(graphProject, origin, rows).status)
      .toBe("current");
    expect(projectPoincareGraphStatus(graphProject, origin,
      rows.map((row, i) => i ? row : { ...row, y: row.y! + 1 })).reason)
      .toBe("crossings-missing-or-changed");
    const reopened = parseMath3DProject(serializeMath3DProject(graphProject));
    expect(projectVectorField3DTopologyStatus(reopened,
      reopened.workspace.results.at(-1)!).status).toBe("current");
    const graphRow = reopened.workspace.entries.find(item => item.module === "graph2d" &&
      item.expected.id === authored.identity.id)!.checkpoint;
    if (graphRow.format !== "math3d.graph2d-document")
      throw new Error("Saved Graph is missing.");
    expect(graphRow.source.objects.find(item => item.kind === "point-series" &&
      item.poincareOrigin?.resultId === origin.resultId))
      .toMatchObject({ poincareOrigin: origin });
    expect(mobileWithheldScientificRows(graphRow).map(item => item.id))
      .toContain(authored.source.objects.find(item => item.kind === "point-series")!.id);
    const changed = reviseVectorField3DDocument(document, { ...document.source,
      display: { ...document.source.display, magnitudeScale: 2 } });
    expect(isVectorField3DTopologyPublicationCurrent(study.publication, changed)).toBe(false);
    expect(projectVectorField3DTopologyStatus(reopened, study.publication, changed))
      .toMatchObject({ status: "withheld", reason: "source-changed" });
    const stale = replaceMath3DProjectWorkspace(reopened,
      createMixedWorkspaceDocument({ ...reopened.workspace,
        entries: reopened.workspace.entries.map(item => item.expected.id ===
          document.identity.id ? { ...item, checkpoint: changed,
          expected: changed.identity } : item) }));
    expect(projectPoincareGraphStatus(stale, origin, rows))
      .toMatchObject({ status: "withheld", reason: "source-changed" });
    expect(() => computeVectorField3DPoincareSection(document,
      { ...recipe, section: { ...recipe.section,
        normal: [0, 1] as const } })).toThrow(/orientation/);
  });
});
