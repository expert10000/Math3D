import { describe, expect, it, vi } from "vitest";
import { captureScientificFieldBytes, compareVectorField3D, createMixedWorkspaceDocument,
  createVectorField3DComparisonResult, exportProjectPackage, parseProjectPackage,
  pinProjectFieldExplorerBaseline, projectResourceInventory, readPackagedScientificField,
  replaceMath3DProjectWorkspace, resolveFieldExplorerBaseline, sha256Checksum } from "@math3d/core";
import { portableScientificProjectFixture } from "../../../tests/fixtures/graph-field/portableScientificProject";
import { fieldExplorerBaselineSlices } from "./fieldExplorerBaselineSlices";
import { loadVerifiedVectorFieldTransfer } from "./loadVerifiedVectorFieldTransfer";
import { capturePortableProjectResources } from "../projects/scientificProjectPackage";
import { exportProjectPackage as exportRendererPackage, parseProjectPackage as parseRendererPackage,
  VerifiedProjectResources } from "../projects/projectResources";

describe("self-contained scientific Project packages", () => {
  it("deduplicates source bytes for A/B and retains exact source/result identities", () => {
    const fixture = portableScientificProjectFixture();
    const pinned = pinProjectFieldExplorerBaseline(fixture.project, fixture.document, "portable-baseline-B");
    const transfers = { a: readPackagedScientificField(pinned.document, fixture.read),
      b: readPackagedScientificField(pinned.baseline, fixture.read) };
    const result = createVectorField3DComparisonResult(compareVectorField3D(pinned.document, pinned.baseline,
      { frame: "cartesian-identical", grid: [5, 5, 5], units: "identical",
        interpolation: "verified-volume-trilinear", coverage: "complete-or-withhold" }, transfers));
    const project = replaceMath3DProjectWorkspace(pinned.project,
      createMixedWorkspaceDocument({ ...pinned.project.workspace, results: [result] }));
    const resources = fixture.resourcesFor(project), raw = exportProjectPackage(project, resources);
    expect(JSON.parse(raw).schemaVersion).toBe(2);
    expect(resources.sidecars()).toHaveLength(4);
    expect(projectResourceInventory(project).every(item => item.owners.length === 2)).toBe(true);
    const imported = parseProjectPackage(raw);
    expect(imported.project).toEqual(project);
    expect(resolveFieldExplorerBaseline(imported.project, pinned.document)).toEqual(pinned.baseline);
    expect(imported.project.workspace.results[0]).toEqual(result);
    const a = readPackagedScientificField(pinned.document, item => imported.resources.bytes(item));
    const b = readPackagedScientificField(pinned.baseline, item => imported.resources.bytes(item));
    expect(a).toEqual(transfers.a);
    expect(fieldExplorerBaselineSlices(pinned.document, pinned.baseline, { a, b }).a.values)
      .toEqual(fieldExplorerBaselineSlices(pinned.document, pinned.baseline, { a, b }).b.values);
    expect(pinned.document.source).toEqual(fixture.document.source);
  });

  it("rejects missing and tampered sources even when an attacker replaces the sidecar checksum", () => {
    const fixture = portableScientificProjectFixture();
    for (const kind of ["scientific-manifest", "scientific-component"]) {
      const missing = JSON.parse(fixture.raw);
      missing.resources.splice(missing.resources.findIndex((item: { kind: string }) => item.kind === kind), 1);
      expect(() => parseProjectPackage(JSON.stringify(missing))).toThrow(/missing/i);
      expect(() => parseRendererPackage(JSON.stringify(missing))).toThrow(/missing/i);
      const corrupt = JSON.parse(fixture.raw), resource = corrupt.resources.find((item: { kind: string }) => item.kind === kind);
      const bytes = Uint8Array.from(Buffer.from(resource.data, "base64")); bytes[0] ^= 1;
      resource.data = Buffer.from(bytes).toString("base64"); resource.checksum = sha256Checksum(bytes);
      expect(() => parseProjectPackage(JSON.stringify(corrupt))).toThrow(/checksum|source/i);
    }
    const empty = JSON.parse(fixture.raw); empty.resources = [];
    expect(() => parseProjectPackage(JSON.stringify(empty))).toThrow(/manifest.*missing/i);
  });

  it("uses packaged bytes without a native bridge and exports the same complete sources again", async () => {
    const fixture = portableScientificProjectFixture();
    const imported = parseRendererPackage(fixture.raw);
    const context = { project: imported.project, resources: (item: { kind: string; id: string }) => imported.resources.bytes(item) };
    const transfer = await loadVerifiedVectorFieldTransfer(fixture.document, undefined, context);
    expect(transfer).toEqual(readPackagedScientificField(fixture.document, fixture.read));
    const captured = await capturePortableProjectResources(imported.project, item => imported.resources.bytes(item));
    expect(parseProjectPackage(exportRendererPackage(imported.project, captured)).project).toEqual(fixture.project);
    expect(captured.sidecars()).toEqual(fixture.resources.sidecars());
  });

  it("does not fall back to native files when packaged data is incomplete", async () => {
    const fixture = portableScientificProjectFixture(), native = {
      openGraphDatasetReference: vi.fn(), previewVectorVolume: vi.fn(), closeGraphDataset: vi.fn(),
    };
    await expect(loadVerifiedVectorFieldTransfer(fixture.document, native, { project: fixture.project,
      resources: item => item.kind === "scientific-component" ? null : fixture.read(item) })).rejects.toThrow(/component.*missing/i);
    expect(native.openGraphDatasetReference).not.toHaveBeenCalled();
  });

  it("never exports decimated samples as full source bytes and retains legacy v1 reading", () => {
    const fixture = portableScientificProjectFixture();
    const preview = readPackagedScientificField(fixture.document, fixture.read, 8);
    expect(() => captureScientificFieldBytes(fixture.document, preview)).toThrow(/complete.*source/i);
    const legacy = JSON.stringify({ format: "math3d.project-package", schemaVersion: 1,
      project: fixture.project, resources: [] });
    expect(parseProjectPackage(legacy).project).toEqual(fixture.project);
    expect(() => exportProjectPackage(fixture.project,
      new VerifiedProjectResources(fixture.project))).toThrow(/manifest.*missing/i);
  });
});
