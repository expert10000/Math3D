import { describe, expect, it, vi } from "vitest";
import { captureProjectResources, exportProjectPackage, parseProjectPackage,
  pinProjectFieldExplorerBaseline, resolveFieldExplorerBaseline, reviseVectorField3DWorkspace,
  defaultVectorField3DWorkspace, createVectorField3DDocument,
  type VectorField3DDocument } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../../../tests/fixtures/graph-field/gf23Bundle";
import { gf34CoarseBundle } from "../../../tests/fixtures/graph-field/gf34CoarseBundle";
import { fieldExplorerBaselineSlices } from "./fieldExplorerBaselineSlices";
import { verifyProjectVectorFieldSources } from "../projects/scientificFieldAdmission";

const fixture = () => {
  const project = createGf23Project();
  const field = project.workspace.entries[0]!.checkpoint as VectorField3DDocument;
  const document = reviseVectorField3DWorkspace(field, { ...defaultVectorField3DWorkspace(field.source),
    selectedLayer: "xy", probe: [0, 0, 0] });
  return pinProjectFieldExplorerBaseline(project, document, "verified-workflow-B");
};
const bridge = (transfer = gf23Transfer()) => ({
  openGraphDatasetReference: vi.fn(async () => ({ ok: true,
    source: { manifestJson: transfer.manifestJson, fingerprint: transfer.fingerprint } })),
  previewVectorVolume: vi.fn(async () => transfer.volumes),
  closeGraphDataset: vi.fn(async () => true),
});

describe("verified scientific Field Explorer workflow", () => {
  it("reuses checked native slices with a shared plane, channel and range", () => {
    const { document, baseline } = fixture(), transfer = gf23Transfer();
    const pair = fieldExplorerBaselineSlices(document, baseline, { a: transfer, b: transfer });
    expect(pair.a.coordinates).toEqual(pair.b.coordinates);
    expect(pair.a.values).toEqual(pair.b.values);
    expect(pair.a.verifiedSamples).toHaveLength(3);
    expect(pair.range).toEqual({ min: pair.a.min, max: pair.a.max });
    expect(() => fieldExplorerBaselineSlices(document, baseline)).toThrow(/Reverify/);
    const corrupt = { ...transfer, volumes: transfer.volumes.map((volume, index) => index ? volume :
      { ...volume, values: volume.values.map((value, i) => i ? value : value + 1) }) as typeof transfer.volumes };
    expect(() => fieldExplorerBaselineSlices(document, baseline, { a: transfer, b: corrupt })).toThrow();
    const coarse = gf34CoarseBundle();
    if (baseline.source.field.kind !== "scientific-bundle") throw new Error("Wrong source");
    const other = createVectorField3DDocument({ ...baseline.source,
      field: { ...baseline.source.field, references: coarse.references } }, { stableKey: "coarse-linked-view" });
    expect(() => fieldExplorerBaselineSlices(document, other, { a: transfer, b: coarse.transfer }))
      .toThrow(/matching sample lattices/);
  });

  it("packages exact checkpoints and selections, then freshly verifies both sources after import", async () => {
    const pinned = fixture();
    const resources = captureProjectResources(pinned.project, () => null);
    const imported = parseProjectPackage(exportProjectPackage(pinned.project, resources));
    expect(imported.project).toEqual(pinned.project);
    expect(imported.project.workspace.scientificSelections).toEqual(pinned.project.workspace.scientificSelections);
    expect(resolveFieldExplorerBaseline(imported.project, pinned.document)).toEqual(pinned.baseline);
    const verifier = bridge();
    await verifyProjectVectorFieldSources(imported.project, verifier as never);
    expect(verifier.previewVectorVolume).toHaveBeenCalledTimes(2);
    expect(verifier.closeGraphDataset).toHaveBeenCalledTimes(2);
    const failed = bridge();
    failed.previewVectorVolume.mockRejectedValue(new Error("Required component missing"));
    await expect(verifyProjectVectorFieldSources(imported.project, failed as never)).rejects.toThrow(/Project scientific field unavailable/);
    expect(failed.closeGraphDataset).toHaveBeenCalledTimes(1);
    await expect(verifyProjectVectorFieldSources(imported.project, {} as never)).rejects.toThrow(/verifier is unavailable/);
    await expect(verifyProjectVectorFieldSources(imported.project, bridge() as never)).resolves.toBeUndefined();
  });
});
