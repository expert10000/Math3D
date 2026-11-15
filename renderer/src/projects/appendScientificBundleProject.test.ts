import { describe, expect, it } from "vitest";
import { compareVectorField3D, createScientificBundleProject, readPackagedScientificField,
  serializeMath3DProject, pinProjectFieldExplorerBaseline, createMixedWorkspaceDocument,
  replaceMath3DProjectWorkspace, createVectorField3DComparisonResult,
  type VectorField3DDocument } from "@math3d/core";
import { browserScientificBundle } from "../../../tests/fixtures/graph-field/browserScientificBundle";
import { portableScientificProjectFixture } from "../../../tests/fixtures/graph-field/portableScientificProject";
import { appendScientificBundleProject } from "./appendScientificBundleProject";
import { exportProjectPackage, parseProjectPackage, VerifiedProjectResources } from "./projectResources";

const incoming = (key = "run-b", options = {}) => {
  const made = createScientificBundleProject(browserScientificBundle({ offset: 0.5, title: "Run B", ...options }), key);
  return { project: made.project, resources: new VerifiedProjectResources(made.project, made.resources.sidecars()) };
};
const policy = { frame: "cartesian-identical", grid: [5, 5, 5], units: "identical",
  interpolation: "verified-volume-trilinear", coverage: "complete-or-withhold" } as const;

describe("adding scientific bundles to an existing Project", () => {
  it("keeps the owner, source identity, probe and authored selection; deduplicates shared components", () => {
    const a = portableScientificProjectFixture(), b = incoming();
    const before = serializeMath3DProject(a.project), bytes = a.resources.sidecars();
    const combined = appendScientificBundleProject(a.project, b, a.read);
    expect(combined.project.identity.id).toBe(a.project.identity.id);
    expect(combined.project.identity.revision).toBeGreaterThan(a.project.identity.revision);
    expect(combined.project.identity.structuralHash).not.toBe(a.project.identity.structuralHash);
    expect(combined.project.metadata).toEqual(a.project.metadata);
    expect(combined.project.workspace.entries[0]).toEqual(a.project.workspace.entries[0]);
    expect(combined.project.workspace.scientificSelections).toEqual(a.project.workspace.scientificSelections);
    expect(combined.project.workspace.activeDocumentIds).toEqual(a.project.workspace.activeDocumentIds);
    expect(combined.project.workspace.entries[1]).toEqual(b.project.workspace.entries[0]);
    expect(combined.resources.sidecars()).toHaveLength(6); // two manifests, four component arrays
    expect(combined.resources.sidecars().filter(item => item.owners.length === 2)).toHaveLength(2);
    expect(serializeMath3DProject(a.project)).toBe(before);
    expect(a.resources.sidecars()).toEqual(bytes);
    const reopened = parseProjectPackage(exportProjectPackage(combined.project, combined.resources));
    expect(reopened.project).toEqual(combined.project);
    expect(reopened.resources.sidecars()).toEqual(combined.resources.sidecars());
  });
  it("compares distinct original fingerprints and produces the known nonzero vector difference", () => {
    const a = portableScientificProjectFixture(), combined = appendScientificBundleProject(a.project, incoming(), a.read);
    const [first, second] = combined.project.workspace.entries.map(entry => entry.checkpoint as VectorField3DDocument);
    const read = (item: { kind: string; id: string }) => combined.resources.bytes(item);
    const transfers = { a: readPackagedScientificField(first!, read), b: readPackagedScientificField(second!, read) };
    expect(transfers.a.fingerprint).not.toBe(transfers.b.fingerprint);
    const result = compareVectorField3D(first!, second!, policy, transfers);
    expect(result.valid).toBe(125);
    expect(result.vectorDifference.rms).toBeCloseTo(0.5, 10);
    expect(result.vectorDifference.max).toBeCloseTo(0.5, 10);
  });
  it("preserves an already pinned baseline, saved comparison and selections while adding another run", () => {
    const a = portableScientificProjectFixture();
    const pinned = pinProjectFieldExplorerBaseline(a.project, a.document, "earlier-baseline");
    const result = createVectorField3DComparisonResult(compareVectorField3D(pinned.document, pinned.baseline, policy, {
      a: readPackagedScientificField(pinned.document, a.read), b: readPackagedScientificField(pinned.baseline, a.read) }));
    const current = replaceMath3DProjectWorkspace(pinned.project,
      createMixedWorkspaceDocument({ ...pinned.project.workspace, results: [result] }));
    const combined = appendScientificBundleProject(current, incoming(), a.read);
    expect(combined.project.workspace.entries.slice(0, 2)).toEqual(current.workspace.entries);
    expect(combined.project.workspace.results).toEqual(current.workspace.results);
    expect(combined.project.workspace.scientificSelections).toEqual(current.workspace.scientificSelections);
    expect(combined.resources.sidecars()).toHaveLength(6);
    const restored = parseProjectPackage(exportProjectPackage(combined.project, combined.resources));
    expect(restored.project).toEqual(combined.project);
  });
  it.each([{ axisName: "other-axis" }, { unit: "cm" }, { origin: -3 }])(
    "uses the existing comparison refusal for incompatible frames, units or grids: %j", options => {
      const a = portableScientificProjectFixture(), combined = appendScientificBundleProject(a.project, incoming("incompatible", options), a.read);
      const [first, second] = combined.project.workspace.entries.map(entry => entry.checkpoint as VectorField3DDocument);
      const read = (item: { kind: string; id: string }) => combined.resources.bytes(item);
      expect(() => compareVectorField3D(first!, second!, policy, {
        a: readPackagedScientificField(first!, read), b: readPackagedScientificField(second!, read) }))
        .toThrow(/aligned Cartesian|identical/i);
    });
  it("rejects duplicate document identities and deduplicates a separately imported identical bundle", () => {
    const a = portableScientificProjectFixture(), b = incoming();
    const first = appendScientificBundleProject(a.project, b, a.read);
    expect(() => appendScientificBundleProject(first.project, b, item => first.resources.bytes(item))).toThrow(/identity/i);
    const second = appendScientificBundleProject(first.project, incoming("another-b"), item => first.resources.bytes(item));
    expect(second.project.workspace.entries).toHaveLength(3);
    expect(second.resources.sidecars()).toHaveLength(6);
    expect(second.resources.sidecars().filter(item => item.owners.length === 3)).toHaveLength(2);
  });
  it.each(["missing", "corrupt"])("refuses %s existing bytes even when the new bundle shares them", mode => {
    const a = portableScientificProjectFixture(), before = serializeMath3DProject(a.project);
    const read = (item: { kind: string; id: string }) => {
      const bytes = a.read(item);
      if (item.kind !== "scientific-component" || !bytes) return bytes;
      if (mode === "missing") return null;
      bytes[0] ^= 1; return bytes;
    };
    expect(() => appendScientificBundleProject(a.project, incoming(), read)).toThrow(/missing|checksum/i);
    expect(serializeMath3DProject(a.project)).toBe(before);
  });
});
