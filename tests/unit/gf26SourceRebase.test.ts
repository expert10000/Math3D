import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, parseMath3DProject,
  rebaseProjectDerivedSource, reviewProjectDerivedField,
  reviseVectorField3DDocument, serializeMath3DProject,
  verifiedVectorFieldSampler, type VectorField3DVolumes } from "@math3d/core";
import { createDerivedFieldProfileJob } from "@math3d/kernel";
import { createGf23Project, gf23Ids, gf23Transfer } from
  "../fixtures/graph-field/gf23Bundle";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("GF-26 explicit source and recipe rebase", () => {
  it("repins the verified replacement generation without moving the selection", async () => {
    let project = createGf23Project();
    const source = project.workspace.entries[0]!.checkpoint;
    if (source.format !== "math3d.vector-field3d-document" ||
        source.source.field.kind !== "scientific-bundle") throw new Error("Wrong fixture.");
    const oldSelection = project.workspace.scientificSelections![0]!;
    const oldProfile = project.workspace.derivedFields!.find(item =>
      item.identity.id === gf23Ids.profile)!;
    const original = gf23Transfer();
    const manifest = JSON.parse(original.manifestJson) as { resources: { id: string;
      sha256: string }[]; source: { sourceId: string } };
    manifest.source.sourceId = "vortex-volume-rebased";
    const values = original.volumes[0].values.map(value => value + .125);
    const bytes = Buffer.alloc(values.length * 8);
    values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
    const changedSha = sha(bytes);
    manifest.resources.find(item => item.id === "east")!.sha256 = changedSha;
    const manifestJson = JSON.stringify(manifest);
    const fingerprint = sha(new TextEncoder().encode(manifestJson));
    const references = source.source.field.references.map(ref =>
      createGraph2DFieldReference(manifestJson, fingerprint, ref.locator,
        ref.datasetId, ref.component)) as typeof source.source.field.references;
    const replacement = reviseVectorField3DDocument(source, { ...source.source,
      field: { ...source.source.field, references } });
    const transfer = { manifestJson, fingerprint,
      volumes: original.volumes.map((part, index) => ({ ...part, fingerprint,
        resourceSha256: index === 0 ? changedSha : part.resourceSha256,
        sampleSha256: index === 0 ? changedSha : part.sampleSha256,
        values: index === 0 ? values : part.values })) as unknown as VectorField3DVolumes };
    const verify = () => { verifiedVectorFieldSampler(replacement, transfer); return true; };
    project = rebaseProjectDerivedSource(project, replacement, verify);
    project = parseMath3DProject(serializeMath3DProject(project));
    const newProfile = project.workspace.derivedFields!.find(item =>
      item.identity.id === gf23Ids.profile)!;
    expect(newProfile.identity.id).toBe(oldProfile.identity.id);
    expect(newProfile.identity.revision).toBe(oldProfile.identity.revision + 1);
    expect(newProfile.operation).toEqual(oldProfile.operation);
    expect(project.workspace.scientificSelections![0]!.geometry).toEqual(oldSelection.geometry);
    expect(project.workspace.scientificSelections![0]!.identity).toEqual(oldSelection.identity);
    expect(reviewProjectDerivedField(project, gf23Ids.profile, verify).status).toBe("current");
    expect(reviewProjectDerivedField(project, gf23Ids.profile, () => false).status)
      .toBe("unverified");
    const job = createDerivedFieldProfileJob({ project: () => project,
      verifySource: verify, loadBundle: async () => transfer });
    const result = await job.submit(gf23Ids.profile).promise;
    expect(result.publication).toBe("published");
    expect(result.result?.rows).toHaveLength(21);
    job.dispose();
    expect(() => rebaseProjectDerivedSource(createGf23Project(), replacement,
      () => false)).toThrow(/verified/);
  });
});
