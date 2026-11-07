import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMobileProjectExplorer } from
  "../../apps/mobile/src/models/mobileProjectExplorer";
import { createGf23Project, gf23Ids, gf23Transfer } from
  "../fixtures/graph-field/gf23Bundle";
import { appendProjectDerivedField, computeProjectTensorGlyphs,
  applyGraph2DAuthoring, computeVectorField3DPoincareReturnMap,
  computeVectorField3DPoincareSection, createEmptyGraph2DDocument,
  createGraph2DDocument, createPoincareReturnGraphOrigin,
  Graph2DPointTableStore, poincareReturnGraphRows,
  principalSymmetricDirection, projectTensorGlyphStatus,
  upsertProjectTensorGlyphs, createMixedWorkspaceDocument,
  parseMath3DProject, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, serializeMath3DProject,
  upsertProjectPoincareReturnMap, upsertProjectVectorField3DTopologyStudy,
  vectorField3DExpression, type VectorField3DDocument } from "@math3d/core";

const fixture = parseMath3DProject(readFileSync(new URL(
  "../fixtures/derived-field/gf03-magnitude-slice-profile.math3d",
  import.meta.url), "utf8"));
const original = fixture.workspace.entries.find(item => item.module === "vector3d")!
  .checkpoint as VectorField3DDocument;
const source = reviseVectorField3DDocument(original, { ...original.source,
  field: { kind: "expressions", components: [
    vectorField3DExpression("2*x", "m/s"),
    vectorField3DExpression("y", "m/s"),
    vectorField3DExpression("0.5*z", "m/s") ] } });
const base = replaceMath3DProjectWorkspace(fixture,
  createMixedWorkspaceDocument({ ...fixture.workspace,
    entries: fixture.workspace.entries.map(entry => entry.expected.id === source.identity.id ?
      { ...entry, checkpoint: source, expected: source.identity } : entry),
    derivedFields: [], results: [] }));

describe("GF-47 verified tensor glyphs", () => {
  it("samples a bounded symmetric tensor and guards its saved display through reopen", () => {
    const project = appendProjectDerivedField(base, source.identity.id,
      { kind: "jacobian-symmetric" }, { stableKey: "gf47", title: "Symmetric Jacobian" },
      () => true);
    const id = project.workspace.derivedFields![0]!.identity.id;
    const study = computeProjectTensorGlyphs(project,
      { derivedFieldId: id, normalAxis: 2, coordinate: 0, density: [3, 3] });
    expect(study.status).toBe("ready");
    expect(study.glyphs).toHaveLength(9);
    expect(study.glyphs[0]!.eigenvalue).toBeCloseTo(2, 5);
    expect(Math.abs(study.glyphs[0]!.direction[0])).toBeCloseTo(1, 5);
    expect(study.evaluations).toBeLessThanOrEqual(8192);
    const saved = parseMath3DProject(serializeMath3DProject(
      upsertProjectTensorGlyphs(project, study)));
    expect(projectTensorGlyphStatus(saved, study.publication!).status).toBe("current");
    const changed = reviseVectorField3DDocument(source, { ...source.source,
      display: { ...source.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(saved,
      createMixedWorkspaceDocument({ ...saved.workspace,
        entries: saved.workspace.entries.map(entry => entry.expected.id === source.identity.id ?
          { ...entry, checkpoint: changed, expected: changed.identity } : entry) }));
    expect(projectTensorGlyphStatus(stale, study.publication!)).toMatchObject({
      status: "withheld", reason: "source-missing-or-changed" });
    expect(computeProjectTensorGlyphs(stale, { derivedFieldId: id,
      normalAxis: 2, coordinate: 0, density: [3, 3] }).status).toBe("unavailable");
  });

  it("rejects ambiguous eigenvectors, invalid budgets and unverified bundle bytes", () => {
    const rotated = principalSymmetricDirection([[2, 1, 0], [1, 2, 0], [0, 0, .2]]);
    expect(rotated?.eigenvalue).toBeCloseTo(3, 10);
    expect(Math.abs(rotated!.direction[0])).toBeCloseTo(Math.SQRT1_2, 10);
    expect(Math.abs(rotated!.direction[1])).toBeCloseTo(Math.SQRT1_2, 10);
    expect(principalSymmetricDirection([[3e-9, 0, 0], [0, 2e-9, 0],
      [0, 0, 1e-9]])?.eigenvalue).toBeCloseTo(3e-9, 14);
    expect(principalSymmetricDirection([[1, 0, 0], [0, 1, 0], [0, 0, 1]]))
      .toBeNull();
    expect(principalSymmetricDirection([[2, 1, 0], [0, 1, 0], [0, 0, .5]]))
      .toBeNull();
    const project = appendProjectDerivedField(base, source.identity.id,
      { kind: "jacobian-symmetric" }, { stableKey: "gf47-b", title: "Symmetric Jacobian" },
      () => true);
    expect(() => computeProjectTensorGlyphs(project, { derivedFieldId:
      project.workspace.derivedFields![0]!.identity.id, normalAxis: 2,
      coordinate: 0, density: [9, 9] })).toThrow(/64-glyph cap/);
    const bundledFixture = parseMath3DProject(readFileSync(new URL(
      "../fixtures/graph-field/gf23-bundled-profile.math3d", import.meta.url), "utf8"));
    const bundledSource = bundledFixture.workspace.entries.find(item =>
      item.module === "vector3d")!.checkpoint as VectorField3DDocument;
    const bundle = appendProjectDerivedField(bundledFixture, bundledSource.identity.id,
      { kind: "jacobian-symmetric" }, { stableKey: "gf47-bundle", title: "Bundle tensor" },
      () => true);
    expect(computeProjectTensorGlyphs(bundle, { derivedFieldId:
      bundle.workspace.derivedFields!.at(-1)!.identity.id,
      normalAxis: 2, coordinate: (bundledSource.source.axes[2].min +
        bundledSource.source.axes[2].max) / 2, density: [2, 2] }).reason)
      .toContain("unverified");
  });

  it("uses verified bundle bytes for a saved symmetric Hessian", () => {
    const base = createGf23Project();
    const source = base.workspace.entries.find(item => item.module === "vector3d")!
      .checkpoint as VectorField3DDocument;
    const project = appendProjectDerivedField(base, gf23Ids.magnitude,
      { kind: "scalar-hessian" }, { stableKey: "gf47-bundle-hessian",
        title: "Speed Hessian" }, () => true);
    const id = project.workspace.derivedFields!.at(-1)!.identity.id;
    const transfers = new Map([[source.identity.id, gf23Transfer()]]);
    const study = computeProjectTensorGlyphs(project, { derivedFieldId: id,
      normalAxis: 2, coordinate: 0, density: [2, 2] }, transfers);
    expect(study.status, study.reason ?? "").toBe("ready");
    expect(study.glyphs).toHaveLength(4);
    const reopened = parseMath3DProject(serializeMath3DProject(
      upsertProjectTensorGlyphs(project, study, transfers)));
    expect(projectTensorGlyphStatus(reopened, study.publication!).status)
      .toBe("withheld");
    expect(projectTensorGlyphStatus(reopened, study.publication!, transfers).status)
      .toBe("current");
  });
});

describe("GF-48 mobile scientific accessibility model", () => {
  it("exposes selection units, provenance and withheld tensor status for speech", () => {
    const project = appendProjectDerivedField(base, source.identity.id,
      { kind: "jacobian-symmetric" }, { stableKey: "gf48", title: "Symmetric Jacobian" },
      () => true);
    const id = project.workspace.derivedFields![0]!.identity.id;
    const study = computeProjectTensorGlyphs(project,
      { derivedFieldId: id, normalAxis: 2, coordinate: 0, density: [2, 2] });
    const saved = upsertProjectTensorGlyphs(project, study);
    const mobile = buildMobileProjectExplorer(serializeMath3DProject(saved));
    const glyph = mobile.scientificContracts.find(item => item.kind ===
      "Saved tensor display recipe")!;
    expect(glyph.spoken).toContain("Unit m/s/m");
    expect(glyph.spoken).toContain(source.identity.structuralHash);
    expect(glyph.spokenSummary).toContain("metres per second per metre");
    expect(glyph.spokenSummary).toContain("Source revision");
    expect(glyph.spokenSummary).toContain("Values require verification");
    expect(glyph.spokenSummary).not.toContain(source.identity.structuralHash);
    const result = mobile.results.find(item => item.operation === "vector3d.tensor-glyphs")!;
    expect(result.sourceHash).toBe(source.identity.structuralHash);
    const selection = mobile.scientificContracts.find(item => item.kind ===
      "Scientific selection");
    expect(selection?.spoken).toContain("coordinate units");
    const changed = reviseVectorField3DDocument(source, { ...source.source,
      display: { ...source.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(saved,
      createMixedWorkspaceDocument({ ...saved.workspace,
        entries: saved.workspace.entries.map(entry => entry.expected.id === source.identity.id ?
          { ...entry, checkpoint: changed, expected: changed.identity } : entry) }));
    expect(buildMobileProjectExplorer(serializeMath3DProject(stale)).scientificContracts
      .find(item => item.kind === "Saved tensor display recipe")?.spoken)
      .toContain("Values withheld: source-missing-or-changed");
    expect(buildMobileProjectExplorer(serializeMath3DProject(stale)).scientificContracts
      .find(item => item.kind === "Saved tensor display recipe")?.spokenSummary)
      .toContain("Values withheld because source missing or changed");
    const bundled = buildMobileProjectExplorer(serializeMath3DProject(createGf23Project()));
    expect(bundled.scientificContracts.find(item => item.kind ===
      "Scientific selection")?.spoken).toContain("Status unverified");
  });

  it("speaks Graph return-row units and source lineage while withholding its values", () => {
    const rotation = reviseVectorField3DDocument(original, { ...original.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("-y", "m/s"),
        vectorField3DExpression("x", "m/s"),
        vectorField3DExpression("0", "m/s") ] } });
    const project = replaceMath3DProjectWorkspace(fixture,
      createMixedWorkspaceDocument({ ...fixture.workspace,
        entries: fixture.workspace.entries.map(entry => entry.expected.id === rotation.identity.id ?
          { ...entry, checkpoint: rotation, expected: rotation.identity } : entry),
        derivedFields: [], results: [] }));
    const section = computeVectorField3DPoincareSection(rotation, {
      seed: [1, 0, 0], section: { start: [0, 0, 0], end: [0, 2, 0],
        normal: [1, 0], direction: "negative" },
      solver: { method: "rk4-step-doubling", maxSteps: 256,
        maxTime: 20, absoluteTolerance: 1e-5, relativeTolerance: 1e-5 },
      maxCrossings: 8, tangencyTolerance: 1e-4 });
    const withSection = upsertProjectVectorField3DTopologyStudy(project,
      section.publication);
    const returns = computeVectorField3DPoincareReturnMap(withSection,
      section.publication.resultId);
    expect(returns.status).toBe("ready");
    const saved = upsertProjectPoincareReturnMap(withSection, returns);
    const origin = createPoincareReturnGraphOrigin(saved, returns);
    const tables = new Graph2DPointTableStore();
    const graph = createEmptyGraph2DDocument("gf48-return-graph");
    const authored = createGraph2DDocument({ ...applyGraph2DAuthoring(graph,
      { type: "create-point-series", draft: { label: "Return map",
        table: tables.publish(poincareReturnGraphRows(returns)), mode: "points",
        domain: { min: 0, max: 2, includeMin: true, includeMax: true },
        poincareOrigin: origin,
        style: { color: "#2563eb", lineWidth: 2,
          lineStyle: "solid", visible: true } } }), stableKey: "gf48-return-graph" });
    const withGraph = replaceMath3DProjectWorkspace(saved,
      createMixedWorkspaceDocument({ ...saved.workspace,
        entries: [...saved.workspace.entries, { module: "graph2d",
          checkpoint: authored, expected: authored.identity, replay: null }] }));
    const mobile = buildMobileProjectExplorer(serializeMath3DProject(withGraph));
    const row = mobile.scientificContracts.find(item => item.kind ===
      "Poincaré Graph row")!;
    expect(row.spoken).toContain("axis unit m");
    expect(row.spoken).toContain(`result ${returns.publication!.resultId}`);
    expect(row.spoken).toContain("Values withheld");
    const changed = reviseVectorField3DDocument(rotation, { ...rotation.source,
      display: { ...rotation.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(withGraph,
      createMixedWorkspaceDocument({ ...withGraph.workspace,
        entries: withGraph.workspace.entries.map(entry =>
          entry.expected.id === rotation.identity.id ?
            { ...entry, checkpoint: changed, expected: changed.identity } : entry) }));
    expect(buildMobileProjectExplorer(serializeMath3DProject(stale))
      .scientificContracts.find(item => item.kind === "Poincaré Graph row")?.spoken)
      .toContain("Values withheld: source-changed");
    if (process.env.MATH3D_GF49_FIXTURE_DIR) {
      const dir = resolve(process.env.MATH3D_GF49_FIXTURE_DIR);
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "gf49-return-graph.math3d.project.json"),
        serializeMath3DProject(withGraph));
    }
  });
});
