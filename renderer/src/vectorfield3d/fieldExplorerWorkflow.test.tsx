import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, parseMath3DProject, serializeMath3DProject,
  parseVectorField3DDocument, serializeVectorField3DDocument, reviseVectorField3DDocument,
  pinProjectFieldExplorerBaseline, checkpointProjectFieldExplorerDocument,
  reviseFieldExplorerWorkflow, resolveFieldExplorerBaseline, fieldExplorerWorkflow,
  vectorField3DExpression, createVectorField3DDocument, defaultVectorField3DWorkspace,
  compareVectorField3D, createVectorField3DComparisonResult, upsertProjectVectorField3DComparison,
  projectVectorField3DComparisonStatus, type VectorField3DDocument,
} from "@math3d/core";
import { fieldExplorerBaselineSlices } from "./fieldExplorerBaselineSlices";
import { FieldExplorerBaselineViews } from "./FieldExplorerBaselineViews";
import { renderToStaticMarkup } from "react-dom/server";
const fixture = parseMath3DProject(readFileSync(new URL(
  "../../../tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url), "utf8"));
const original = fixture.workspace.entries.find(e => e.module === "vector3d")!.checkpoint as VectorField3DDocument;
const initial = createVectorField3DDocument({ ...original.source, field: { kind: "expressions",
  components: ["-y", "x", "0"].map(p => vectorField3DExpression(p, "m/s")) as never } },
  { stableKey: "explorer-workflow-A", workspace: { ...defaultVectorField3DWorkspace(original.source),
    selectedLayer: "xy", probe: [1, 1, 0],
    linkedLineProfile: { normalAxis: 2, varyingAxis: 0, point: [1, 1, 0],
      vectorChannel: "speed", visible: true } } });
const project = () => createMath3DProject(createMixedWorkspaceDocument({
  entries: [{ module: "vector3d", checkpoint: initial, expected: initial.identity, replay: null }],
  activeDocumentIds: [initial.identity.id], results: [], artifacts: [], relations: [],
  committedSelection: null, constructions: [] }), { stableKey: "explorer-workflow-project" });
const changed = (document: VectorField3DDocument) => reviseVectorField3DDocument(document, {
  ...document.source, field: { kind: "expressions", components: ["-2*y", "2*x", "0"].map(p =>
    vectorField3DExpression(p, "m/s")) as never } });
const policy = { frame: "cartesian-identical" as const, grid: [5, 5, 5] as const,
  units: "identical" as const, interpolation: "analytic-direct" as const,
  coverage: "complete-or-withhold" as const };

describe("native Field Explorer workflow", () => {
  it("leaves optional workflow data out of legacy canonical documents", () => {
    const bytes = serializeVectorField3DDocument(original);
    expect(bytes).not.toContain('"explorer"');
    expect(serializeVectorField3DDocument(parseVectorField3DDocument(bytes))).toBe(bytes);
    expect(fieldExplorerWorkflow(original).inspectorSection).toBe("all");
  });
  it("persists inspector controls without revising the scientific source", () => {
    const document = reviseFieldExplorerWorkflow(initial, { inspectorSection: "probe", comparisonResolution: 13 });
    expect(document.identity).toEqual(initial.identity);
    expect(fieldExplorerWorkflow(parseVectorField3DDocument(serializeVectorField3DDocument(document))))
      .toMatchObject({ inspectorSection: "probe", comparisonResolution: 13 });
    for (const bad of [{ comparisonResolution: 100 }, { inspectorSection: "invalid" },
      { comparisonSource: initial.identity }, { comparisonVisible: "yes" }, { extra: true }])
      expect(() => reviseFieldExplorerWorkflow(document, bad as never)).toThrow();
  });
  it("pins a detached native document and a source-bound snapshot relation", () => {
    const pin = pinProjectFieldExplorerBaseline(project(), initial, "frozen-B");
    expect(pin.document.identity).toEqual(initial.identity);
    expect(pin.baseline.identity.id).not.toBe(initial.identity.id);
    expect(pin.baseline.source).toEqual(initial.source);
    expect(pin.baseline.source).not.toBe(initial.source);
    expect(pin.project.workspace.entries).toHaveLength(2);
    expect(pin.project.workspace.relations[0]).toMatchObject({ kind: "snapshot-of",
      operation: "vector3d.pin-baseline", sources: [{ documentId: initial.identity.id }] });
    expect(pin.baseline.workspace?.explorer).toBeUndefined();
    expect(() => pinProjectFieldExplorerBaseline(pin.project, initial, "frozen-B")).toThrow(/unused/);
    expect(() => pinProjectFieldExplorerBaseline(project(), initial, "explorer-workflow-A")).toThrow(/unused/);
  });
  it("configures, probes, compares, saves and cold-parses a Project with exact A/B identities", () => {
    const pin = pinProjectFieldExplorerBaseline(project(), initial, "roundtrip-B");
    const document = reviseFieldExplorerWorkflow(changed(pin.document), { inspectorSection: "analyze",
      comparisonResolution: 5 });
    const checkpoint = checkpointProjectFieldExplorerDocument(pin.project, document);
    const result = createVectorField3DComparisonResult(compareVectorField3D(document, pin.baseline, policy));
    expect(result.summary.valid).toBe(125);
    expect((result.summary.vectorDifference as { rms: number }).rms).toBeGreaterThan(0);
    const reopened = parseMath3DProject(serializeMath3DProject(
      upsertProjectVectorField3DComparison(checkpoint, result)));
    const active = reopened.workspace.entries.find(e => e.expected.id === document.identity.id)!
      .checkpoint as VectorField3DDocument;
    expect(active).toEqual(document);
    expect(active.workspace?.probe).toEqual([1, 1, 0]);
    expect(active.workspace?.linkedLineProfile).toEqual(initial.workspace?.linkedLineProfile);
    expect(resolveFieldExplorerBaseline(reopened, active)).toEqual(pin.baseline);
    expect(projectVectorField3DComparisonStatus(reopened, reopened.workspace.results[0]!)).toEqual({
      status: "current", reason: null });
    // A different source, rather than display controls, invalidates the result.
    const edited = reviseVectorField3DDocument(active, { ...active.source,
      field: { kind: "expressions", components: ["1", "2", "3"].map(p =>
        vectorField3DExpression(p, "m/s")) as never } });
    expect(projectVectorField3DComparisonStatus(checkpointProjectFieldExplorerDocument(reopened, edited), result))
      .toMatchObject({ status: "withheld", reason: "source-1-changed" });
  });
  it("withholds missing or changed B instead of binding to its latest revision", () => {
    const pin = pinProjectFieldExplorerBaseline(project(), initial, "withhold-B");
    expect(resolveFieldExplorerBaseline(project(), pin.document)).toBeNull();
    expect(resolveFieldExplorerBaseline(checkpointProjectFieldExplorerDocument(pin.project,
      changed(pin.baseline)), pin.document)).toBeNull();
    const html = renderToStaticMarkup(<FieldExplorerBaselineViews document={pin.document}
      baseline={null} onProbeSelect={() => {}} onClose={() => {}} />);
    expect(html).toContain("Values are withheld");
    expect(html).not.toContain("Color legend");
  });
  it("reuses native slices with a common range, plane and selectable sample grid", () => {
    const pin = pinProjectFieldExplorerBaseline(project(), initial, "slice-B");
    const document = changed(pin.document), slices = fieldExplorerBaselineSlices(document, pin.baseline);
    expect(slices.a.coordinates).toEqual(slices.b.coordinates);
    expect(slices.a.fixedCoordinate).toBe(slices.b.fixedCoordinate);
    expect(slices.range.max).toBe(slices.a.max);
    expect(slices.a.max).toBeCloseTo(2 * slices.b.max);
    const html = renderToStaticMarkup(<FieldExplorerBaselineViews document={document}
      baseline={pin.baseline} onProbeSelect={() => {}} onClose={() => {}} />);
    expect(html).toContain('aria-label="Live field A"');
    expect(html).toContain('aria-label="Pinned baseline B"');
    expect(html.match(/Color legend/g)).toHaveLength(2);
    expect(html).toContain("Shared physical plane, probe and color range");
    const qField = reviseVectorField3DDocument(document, { ...document.source,
      display: { ...document.source.display, colorBy: "q" } });
    const qSlices = fieldExplorerBaselineSlices(qField, pin.baseline);
    expect(qSlices.a.channel).toBe("q"); expect(qSlices.b.channel).toBe("q");
    expect(qSlices.b.source.structuralHash).toBe(pin.baseline.identity.structuralHash);
    const incompatible = reviseVectorField3DDocument(pin.baseline, { ...pin.baseline.source,
      axes: pin.baseline.source.axes.map(a => ({ ...a, max: a.max + 1 })) as never });
    expect(() => fieldExplorerBaselineSlices(document, incompatible)).toThrow(/identical Cartesian/);
  });
});
