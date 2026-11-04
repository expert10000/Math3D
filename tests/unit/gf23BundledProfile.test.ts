import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createMixedWorkspaceDocument, deriveFieldOutput, parseMath3DProject,
  replaceMath3DProjectWorkspace, reviewProjectDerivedField, reviseVectorField3DDocument,
  scientificAxisCoordinate, serializeMath3DProject,
  verifiedVectorFieldSampler } from "@math3d/core";
import { createDerivedFieldProfileJob } from "@math3d/kernel";
import { createGf23Project, gf23Ids, gf23Transfer } from
  "../fixtures/graph-field/gf23Bundle";

describe("GF-23 verified bundled foundation profile", () => {
  it("rejects unsupported nonuniform coordinates, incompatible units and oversized transfers", () => {
    expect(() => scientificAxisCoordinate({ name: "x", unit: "m", origin: 0,
      spacing: 1, count: 3, coordinates: [0, 0.5, 2] }, 1)).toThrow(/Nonuniform/);
    expect(() => deriveFieldOutput({ kind: "vector", axes: [0, 1, 2].map(index =>
      ({ index: index as 0 | 1 | 2, name: ["x", "y", "z"][index]!, unit: "m",
        min: -1, max: 1 })), unit: "m/s", componentUnits: ["m/s", "cm/s", "m/s"] },
    { kind: "vector-magnitude" })).toThrow(/compatible units/);
    const source = createGf23Project().workspace.entries[0]!.checkpoint;
    if (source.format !== "math3d.vector-field3d-document") throw new Error("Wrong fixture.");
    const transfer = gf23Transfer();
    expect(() => verifiedVectorFieldSampler(source, { ...transfer,
      volumes: [{ ...transfer.volumes[0], sampleShape: [33, 21, 17] },
        transfer.volumes[1], transfer.volumes[2]] })).toThrow();
  });
  it("runs the saved chain through the broker and withholds after reopen until verification", async () => {
    const raw = readFileSync(new URL("../fixtures/graph-field/gf23-bundled-profile.math3d",
      import.meta.url), "utf8");
    expect(raw.trimEnd()).toBe(serializeMath3DProject(createGf23Project()));
    let project = parseMath3DProject(raw), verified = true;
    const transfer = gf23Transfer();
    const source = project.workspace.entries[0]!.checkpoint;
    if (source.format !== "math3d.vector-field3d-document") throw new Error("Wrong fixture.");
    const sampler = verifiedVectorFieldSampler(source, transfer);
    expect(sampler.sample([-4, 0, 0])).not.toBeNull();
    expect(sampler.sample([4, 0, 0])).not.toBeNull();
    expect(sampler.sample([4.001, 0, 0])).toBeNull();
    expect(() => verifiedVectorFieldSampler(source, { ...transfer,
      volumes: [transfer.volumes[0], transfer.volumes[1], { ...transfer.volumes[2],
        values: transfer.volumes[2].values.map((value, i) => i ? value : value + 1) }] }))
      .toThrow(/checksum|changed|verified/i);
    const progress: number[] = [];
    const job = createDerivedFieldProfileJob({ project: () => project,
      verifySource: () => verified, loadBundle: async () => transfer });
    const result = (await job.submit(gf23Ids.profile, { onProgress: done =>
      progress.push(done) }).promise).result!;
    expect(result.method).toBe("verified-volume-trilinear");
    expect(result.rows).toHaveLength(21);
    expect(result.verifiedSamples).toHaveLength(3);
    expect(result.rows.every(row => row.y !== null)).toBe(true);
    expect(progress.at(-1)).toBe(21);
    project = parseMath3DProject(serializeMath3DProject(project));
    verified = false;
    expect(job.read(gf23Ids.profile)).toBeNull();
    expect(reviewProjectDerivedField(project, gf23Ids.profile, () => false).status)
      .toBe("unverified");
    verified = true;
    expect(job.read(gf23Ids.profile)).toEqual(result);
    const changed = reviseVectorField3DDocument(source, { ...source.source,
      display: { ...source.source.display, magnitudeScale: 2 } });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: project.workspace.entries.map(entry =>
        entry.expected.id === source.identity.id ? { ...entry, checkpoint: changed,
          expected: changed.identity } : entry) }));
    expect(job.read(gf23Ids.profile)).toBeNull();
    job.dispose();
  });

  it("cancels an older bundled job before it can replace a current result", async () => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const job = createDerivedFieldProfileJob({ project: createGf23Project,
      verifySource: () => true, loadBundle: async () => gf23Transfer(),
      yieldControl: async id => { if (id === "old") { entered(); await gate; } } });
    const old = job.submit(gf23Ids.profile, { jobId: "old" });
    await ready;
    const fresh = await job.submit(gf23Ids.profile, { jobId: "fresh" }).promise;
    expect(fresh.publication).toBe("published");
    expect(old.cancel()).toBe(true);
    release();
    expect((await old.promise).result).toBeNull();
    expect(job.read(gf23Ids.profile)).toEqual(fresh.result);
    job.dispose();
  });
});
