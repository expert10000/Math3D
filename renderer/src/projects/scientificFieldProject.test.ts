import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildProjectExplorer, createGraph2DFieldReference, createMath3DProject,
  createMixedWorkspaceDocument, createScientificFieldDocument, normalizeScientificFieldDocument,
  parseMath3DProject, reviewScientificComplexField3DRelink, reviseScientificFieldDocument,
  serializeMath3DProject, sha256Checksum } from "@math3d/core";
import { inspectProjectCompatibility } from "./projectTransfer";

const manifest = readFileSync(fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/vortex-flow.sscene/manifest.json", import.meta.url)), "utf8");
const fingerprint = sha256Checksum(new TextEncoder().encode(manifest)).slice(7);
const reference = createGraph2DFieldReference(manifest, fingerprint,
  { kind: "preset", value: "vortex-flow" }, "field", "north");
const field = () => createScientificFieldDocument({ reference,
  quantity: { name: "Velocity", unit: "m/s" },
  display: { view: "plane", normalAxis: null, fixedIndex: null, transfer: { mode: "data" } } },
{ stableKey: reference.id, title: "Velocity · north" });

describe("scientific scalar field Project workspace", () => {
  it("round-trips a range setting and reference without storing field values", () => {
    const authored = reviseScientificFieldDocument(field(), { ...field().source,
      display: { view: "plane", normalAxis: null, fixedIndex: null,
        transfer: { mode: "manual", min: -2, max: 3 } } });
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "field", checkpoint: authored,
      expected: authored.identity, replay: null }], activeDocumentIds: [authored.identity.id],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] });
    const reopened = parseMath3DProject(serializeMath3DProject(createMath3DProject(workspace,
      { stableKey: "scientific-field-project" })));
    expect(reopened.workspace.entries[0]?.checkpoint).toEqual(authored);
    expect(buildProjectExplorer(reopened).groups.find(group => group.module === "field")?.documents)
      .toMatchObject([{ title: "Velocity · north" }]);
    expect(inspectProjectCompatibility(reopened)).toMatchObject({ canOpenWorkspace: true,
      documents: [{ module: "field", editable: true, replayVerified: true }] });
    expect(serializeMath3DProject(reopened)).not.toContain('"values"');
  });

  it("validates dimensional selection and manual color bounds", () => {
    const original = field();
    expect(normalizeScientificFieldDocument({ ...original, source: { ...original.source,
      display: { ...original.source.display, transfer: { mode: "manual", min: 2, max: 2 } } } }).ok).toBe(false);
    expect(normalizeScientificFieldDocument({ ...original, source: { ...original.source,
      display: { ...original.source.display, view: "volume" } } }).ok).toBe(false);
  });

  it("keeps distinct component workspaces separate in one Project", () => {
    const north = field();
    const eastReference = createGraph2DFieldReference(manifest, fingerprint,
      { kind: "preset", value: "vortex-flow" }, "field", "east");
    const east = createScientificFieldDocument({ ...north.source, reference: eastReference },
      { stableKey: eastReference.id, title: "Velocity · east" });
    const workspace = createMixedWorkspaceDocument({ entries: [north, east].map(checkpoint => ({
      module: "field" as const, checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [north.identity.id, east.identity.id], results: [], artifacts: [], relations: [],
    committedSelection: null, constructions: [] });
    const reopened = parseMath3DProject(serializeMath3DProject(createMath3DProject(workspace,
      { stableKey: "two-field-components" })));
    expect(buildProjectExplorer(reopened).groups.find(group => group.module === "field")?.documents.map(item => item.title))
      .toEqual(["Velocity · north", "Velocity · east"]);
  });

  it("retains a 3D component's exact plane or sampled overview selection", () => {
    const volumeManifest = readFileSync(fileURLToPath(new URL(
      "../../../tests/fixtures/scientific-scene/vortex-volume.sscene/manifest.json", import.meta.url)), "utf8");
    const volumeFingerprint = sha256Checksum(new TextEncoder().encode(volumeManifest)).slice(7);
    const volumeReference = createGraph2DFieldReference(volumeManifest, volumeFingerprint,
      { kind: "preset", value: "vortex-volume" }, "field", "north");
    const original = createScientificFieldDocument({ reference: volumeReference,
      quantity: { name: "Velocity", unit: "m/s" },
      display: { view: "plane", normalAxis: 2, fixedIndex: 1, transfer: { mode: "data" } } },
    { stableKey: volumeReference.id });
    const revised = reviseScientificFieldDocument(original, { ...original.source,
      display: { ...original.source.display, view: "volume", transfer: { mode: "percentile" } } });
    expect(revised.source.display).toMatchObject({ view: "volume", normalAxis: 2, fixedIndex: 1,
      transfer: { mode: "percentile" } });
    expect(normalizeScientificFieldDocument({ ...revised, source: { ...revised.source,
      display: { ...revised.source.display, fixedIndex: volumeReference.shape[2] } } }).ok).toBe(false);
  });
});

describe("saved 3D complex field pair", () => {
  const volumeManifest = readFileSync(fileURLToPath(new URL(
    "../../../tests/fixtures/scientific-scene/complex-wave-volume.sscene/manifest.json", import.meta.url)), "utf8");
  const volumeFingerprint = sha256Checksum(new TextEncoder().encode(volumeManifest)).slice(7);
  const locator = { kind: "preset" as const, value: "complexWaveVolume" };
  const real = createGraph2DFieldReference(volumeManifest, volumeFingerprint, locator, "field", "real");
  const imaginary = createGraph2DFieldReference(volumeManifest, volumeFingerprint, locator, "field", "imaginary");
  const original = createScientificFieldDocument({ reference: real,
    paired: { imaginary, line: { normalAxis: 2, planeFixedIndex: 8, varyingAxis: 0, fixedIndex: 20 } },
    quantity: { name: "Wave amplitude", unit: "1" },
    display: { view: "plane", normalAxis: 2, fixedIndex: 8, transfer: { mode: "data" } } },
  { stableKey: real.id, title: "Wave amplitude · 3D complex field" });

  it("reopens both checksums and the selected plane line from a Project", () => {
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "field", checkpoint: original,
      expected: original.identity, replay: null }], activeDocumentIds: [original.identity.id],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] });
    const reopened = parseMath3DProject(serializeMath3DProject(createMath3DProject(workspace,
      { stableKey: "paired-complex-field" })));
    expect(reopened.workspace.entries[0]?.checkpoint).toEqual(original);
    expect(reopened.workspace.entries[0]?.checkpoint).toMatchObject({ source: {
      reference: { component: "real", resourceSha256: real.resourceSha256 },
      paired: { imaginary: { component: "imaginary", resourceSha256: imaginary.resourceSha256 },
        line: { normalAxis: 2, planeFixedIndex: 8, varyingAxis: 0, fixedIndex: 20 } } } });
    expect(serializeMath3DProject(reopened)).not.toContain('"values"');
  });

  it("rejects a mismatched companion and invalid line, and preserves a revised selection", () => {
    expect(() => createScientificFieldDocument({ ...original.source,
      paired: { ...original.source.paired!, imaginary: { ...imaginary, shape: [40, 41, 17] } } },
    { stableKey: real.id })).toThrow(/Invalid scientific field document/);
    expect(() => createScientificFieldDocument({ ...original.source,
      paired: { ...original.source.paired!, line: { normalAxis: 2, planeFixedIndex: 8,
        varyingAxis: 2, fixedIndex: 20 } } }, { stableKey: real.id })).toThrow();
    const revised = reviseScientificFieldDocument(original, { ...original.source,
      paired: { imaginary, line: { normalAxis: 1, planeFixedIndex: 12, varyingAxis: 2, fixedIndex: 5 } },
      display: { ...original.source.display, normalAxis: 1, fixedIndex: 12 } });
    expect(revised.identity.revision).toBe(original.identity.revision + 1);
    expect(revised.source.paired?.line).toEqual({ normalAxis: 1, planeFixedIndex: 12,
      varyingAxis: 2, fixedIndex: 5 });
  });

  it("accepts only a moved bundle with both component hashes, axes, shape and saved coordinates", () => {
    const moved = { kind: "directory" as const, value: "C:\\moved\\complex-wave-volume.sscene" };
    const movedReal = createGraph2DFieldReference(volumeManifest, volumeFingerprint, moved, "field", "real");
    const movedImaginary = createGraph2DFieldReference(volumeManifest, volumeFingerprint, moved, "field", "imaginary");
    const matching = reviewScientificComplexField3DRelink(original, movedReal, movedImaginary);
    expect(matching.eligible).toBe(true);
    expect(matching.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "Real Resource SHA-256", matches: true, required: true }),
      expect.objectContaining({ field: "Imaginary Resource SHA-256", matches: true, required: true }),
      expect.objectContaining({ field: "Saved plane coordinate", saved: "z = 0 m (index 8)", matches: true }),
      expect.objectContaining({ field: "Saved line coordinate", saved: "y = 0 m (index 20)", matches: true }),
    ]));
    expect(reviewScientificComplexField3DRelink(original, movedReal,
      { ...movedImaginary, resourceSha256: "0".repeat(64) }).eligible).toBe(false);
    expect(reviewScientificComplexField3DRelink(original,
      { ...movedReal, shape: [40, 41, 17] }, movedImaginary).eligible).toBe(false);
    expect(reviewScientificComplexField3DRelink(original,
      { ...movedReal, axes: movedReal.axes.map((axis, index) => index === 1 ?
        { ...axis, origin: axis.origin + 1 } : axis) }, movedImaginary).eligible).toBe(false);
    expect(reviewScientificComplexField3DRelink(original, real, imaginary).eligible).toBe(false);
  });
});
