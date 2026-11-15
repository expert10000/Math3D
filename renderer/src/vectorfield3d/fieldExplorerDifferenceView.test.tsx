import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createScientificBundleProject, readPackagedScientificField, reviseFieldExplorerWorkflow,
  serializeVectorField3DDocument, parseVectorField3DDocument, reviseVectorField3DWorkspace,
  resolveFieldExplorerBaseline, checkpointProjectFieldExplorerDocument, reviseVectorField3DDocument,
  createMath3DProject, createMixedWorkspaceDocument,
  type VectorField3DDocument } from "@math3d/core";
import { browserScientificBundle } from "../../../tests/fixtures/graph-field/browserScientificBundle";
import { VerifiedProjectResources } from "../projects/projectResources";
import { fieldExplorerBaselineSlices } from "./fieldExplorerBaselineSlices";
import { fieldExplorerDifferenceSlice, fieldExplorerDifferenceProbe } from "./fieldExplorerDifferenceSlice";
import { FieldExplorerDifferenceView } from "./FieldExplorerDifferenceView";
import { FieldExplorerBaselineViews } from "./FieldExplorerBaselineViews";

function run(name: string, options: Parameters<typeof browserScientificBundle>[0] = {}) {
  const made = createScientificBundleProject(browserScientificBundle({ title: name, ...options }), name);
  const resources = new VerifiedProjectResources(made.project, made.resources.sidecars());
  const source = made.project.workspace.entries[0]!.checkpoint as VectorField3DDocument;
  const document = reviseVectorField3DWorkspace(source, { ...source.workspace!, selectedLayer: "xy", probe: [0, 0, 0] });
  return { document, transfer: readPackagedScientificField(document, item => resources.bytes(item)) };
}
const a = run("difference-A"), b = run("difference-B", { offset: .5 });
const pair = (channel: "magnitude" | "p" | "q" | "r" = "magnitude") =>
  fieldExplorerBaselineSlices(a.document, b.document, { a: a.transfer, b: b.transfer }, channel);

describe("verified native A−B difference view", () => {
  it("renders exact zero for independently identified identical runs", () => {
    const same = run("another-identical-run");
    expect(same.document.identity.id).not.toBe(a.document.identity.id);
    const slices = fieldExplorerBaselineSlices(a.document, same.document,
      { a: a.transfer, b: same.transfer }, "magnitude");
    const delta = fieldExplorerDifferenceSlice(slices.a, slices.b, "magnitude");
    expect(delta.values.every(value => value === 0)).toBe(true);
    expect(delta.min).toBe(0); expect(delta.max).toBe(0);
    expect(delta.sources).toEqual([slices.a.source, slices.b.source]);
  });
  it.each(["xy", "xz", "yz"] as const)("shows 0.5 vector difference on the %s plane without modifying sources", layer => {
    const before = [serializeVectorField3DDocument(a.document), serializeVectorField3DDocument(b.document)];
    const document = reviseVectorField3DWorkspace(a.document, { ...a.document.workspace!, selectedLayer: layer });
    const slices = fieldExplorerBaselineSlices(document, b.document, { a: a.transfer, b: b.transfer }, "magnitude");
    const delta = fieldExplorerDifferenceSlice(slices.a, slices.b, "magnitude");
    expect(delta.values.length).toBe(slices.a.shape[0] * slices.a.shape[1]);
    for (const value of delta.values) expect(value).toBeCloseTo(.5, 10);
    expect(delta.unit).toBe("m/s");
    expect([serializeVectorField3DDocument(a.document), serializeVectorField3DDocument(b.document)]).toEqual(before);
  });
  it("uses A−B for signed components and preserves sign when swapping the pair", () => {
    const slices = pair("p");
    const delta = fieldExplorerDifferenceSlice(slices.a, slices.b, "p");
    const reversed = fieldExplorerDifferenceSlice(slices.b, slices.a, "p");
    for (const value of delta.values) expect(value).toBeCloseTo(-.5, 10);
    for (const value of reversed.values) expect(value).toBeCloseTo(.5, 10);
    for (const channel of ["q", "r"] as const)
      expect(fieldExplorerDifferenceSlice(slices.a, slices.b, channel).values.every(value => value === 0)).toBe(true);
  });
  it("links exact native probe vectors and withholds off-plane or off-lattice points", () => {
    const slices = pair(), delta = fieldExplorerDifferenceSlice(slices.a, slices.b, "magnitude");
    const probe = fieldExplorerDifferenceProbe(delta, slices.a, slices.b, [0, 0, 0])!;
    expect(probe).not.toBeNull(); expect(probe.delta).toEqual([-.5, 0, 0]);
    expect(probe.a.map(Math.abs)).toEqual([0, 0, 0]); expect(probe.b).toEqual([.5, 0, 0]);
    expect(probe.value).toBe(.5);
    expect(fieldExplorerDifferenceProbe(delta, slices.a, slices.b, [0, 0, .123])).toBeNull();
    expect(fieldExplorerDifferenceProbe(delta, slices.a, slices.b, [.123, 0, 0])).toBeNull();
  });
  it("keeps optional display settings source-neutral and validates the serialized contract", () => {
    const legacy = serializeVectorField3DDocument(a.document);
    expect(legacy).not.toContain('"differenceView"');
    expect(serializeVectorField3DDocument(parseVectorField3DDocument(legacy))).toBe(legacy);
    const document = reviseFieldExplorerWorkflow(a.document, { differenceView: { visible: true, channel: "p" } });
    expect(document.identity).toEqual(a.document.identity);
    expect(document.source).toEqual(a.document.source);
    expect(parseVectorField3DDocument(serializeVectorField3DDocument(document)).workspace?.explorer?.differenceView)
      .toEqual({ visible: true, channel: "p" });
    for (const bad of [null, { visible: "yes", channel: "p" }, { visible: true, channel: "speed" },
      { visible: true, channel: "p", unverified: true }])
      expect(() => reviseFieldExplorerWorkflow(a.document, { differenceView: bad } as never)).toThrow();
  });
  it.each([{ unit: "cm" }, { axisName: "other-axis" }, { origin: -3 }])("retains existing compatibility refusal: %j", options => {
    const other = run("incompatible-difference", options);
    expect(() => fieldExplorerBaselineSlices(a.document, other.document,
      { a: a.transfer, b: other.transfer }, "magnitude")).toThrow(/identical Cartesian|matching sample lattices/);
  });
  it("rejects unavailable/corrupted source bytes and incomplete vector coverage", () => {
    expect(() => fieldExplorerBaselineSlices(a.document, b.document, {}, "magnitude")).toThrow(/Reverify/);
    const damaged = { ...b.transfer, volumes: b.transfer.volumes.map((volume, i) => i ? volume :
      { ...volume, values: volume.values.map((value, j) => j ? value : value + 1) }) as typeof b.transfer.volumes };
    expect(() => fieldExplorerBaselineSlices(a.document, b.document, { a: a.transfer, b: damaged }, "magnitude")).toThrow();
    const slices = pair();
    expect(() => fieldExplorerDifferenceSlice(slices.a, { ...slices.b, vectors: [null, ...slices.b.vectors!.slice(1)] }, "magnitude"))
      .toThrow(/unavailable/);
    expect(() => fieldExplorerDifferenceSlice(slices.a, { ...slices.b, unit: "cm/s" }, "magnitude")).toThrow(/units/);
  });
  it("labels pair provenance and a zero-centered signed legend without fabricating a source document", () => {
    const slices = pair("p"), delta = fieldExplorerDifferenceSlice(slices.a, slices.b, "p");
    const html = renderToStaticMarkup(<FieldExplorerDifferenceView document={a.document} slice={delta}
      probe={[0, 0, 0]} clipBounds={a.document.workspace!.clipBounds} onProbeSelect={() => {}} />);
    expect(html).toContain('aria-label="Difference A−B"');
    expect(html).toContain("-0.5000 to 0.5000 m/s");
    expect(html).toContain(a.document.identity.id); expect(html).toContain(b.document.identity.id);
    expect(html).toContain('data-testid="field-difference-probe"');
    expect(html).toContain("no cross-grid interpolation");
  });
  it("withholds the difference and probe for missing or stale pinned generations", () => {
    const document = reviseFieldExplorerWorkflow(a.document, { comparisonSource: b.document.identity,
      differenceView: { visible: true, channel: "p" } });
    const project = createMath3DProject(createMixedWorkspaceDocument({
      entries: [document, b.document].map(checkpoint => ({ module: "vector3d" as const,
        checkpoint, expected: checkpoint.identity, replay: null })),
      activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [],
      constructions: [], committedSelection: null }), { stableKey: "stale-difference-project" });
    const stale = checkpointProjectFieldExplorerDocument(project, reviseVectorField3DDocument(b.document,
      { ...b.document.source, display: { ...b.document.source.display, magnitudeScale: b.document.source.display.magnitudeScale + 1 } }));
    expect(resolveFieldExplorerBaseline(stale, document)).toBeNull();
    const html = renderToStaticMarkup(<FieldExplorerBaselineViews document={document} baseline={null}
      project={stale} onClose={() => {}} onProbeSelect={() => {}} />);
    expect(html).toContain("Values are withheld");
    expect(html).not.toContain('data-testid="field-difference-view"');
    expect(html).not.toContain('aria-label="A/B difference probe"');
  });
});
