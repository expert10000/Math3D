import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { advanceDocumentIdentity, appendProjectDerivedField, buildDerivedProfileProvenance,
  createGraph2DFieldReference, createVectorField3DDocument, defaultVectorField3DWorkspace,
  createMixedWorkspaceDocument,
  parseMath3DProject, replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  sampleVectorField3DSlice, serializeMath3DProject, sha256Checksum, vectorField3DExpression,
  type Math3DProject, type Graph2DFieldReference, type VectorField3DVolumes } from "@math3d/core";
import { createDerivedFieldProfileJob } from "@math3d/kernel";
import { DerivedProfileProvenanceCard } from "../shared/DerivedProfileProvenanceCard";

const fixture = new URL("../../../tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));
const profileId = load().workspace.derivedFields![2]!.identity.id;
const verified = (source: import("@math3d/core").VectorField3DDocument) =>
  source.source.field.kind === "expressions";
const sourceChange = (project: Math3DProject) => replaceMath3DProjectWorkspace(project,
  createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(entry => {
    if (entry.module !== "vector3d" || entry.checkpoint.format !== "math3d.vector-field3d-document") return entry;
    const source = entry.checkpoint.source, field = source.field;
    if (field.kind !== "expressions") throw new TypeError("Expected analytic fixture.");
    const changed = reviseVectorField3DDocument(entry.checkpoint, { ...source,
      field: { ...field, components: [vectorField3DExpression("2*x", "m/s"),
        field.components[1], field.components[2]] } });
    return { ...entry, checkpoint: changed, expected: changed.identity };
  }) }));

describe("GF-05 shared derived profile provenance", () => {
  it("projects a real GF-04 result into both views and withholds it on reopen or source change", async () => {
    let project = load();
    const job = createDerivedFieldProfileJob({ project: () => project, verifySource: verified });
    const result = (await job.submit(profileId).promise).result!;
    expect(result.rows).toHaveLength(17);
    const read = () => buildDerivedProfileProvenance(project, profileId,
      { verifySource: verified, result: job.read(profileId) });
    const current = read();
    expect(current.status).toBe("current");
    expect(current.source).toMatchObject({ documentId: result.source.documentId,
      revision: result.source.revision, structuralHash: result.source.structuralHash });
    expect(current.operations.map(item => item.operation.kind)).toEqual([
      "vector-magnitude", "plane-slice", "line-profile"]);
    expect(current.plane).toEqual({ axis: "z", unit: "m", coordinate: 3 });
    expect(current.line).toMatchObject({ varyingAxis: "x", varyingUnit: "m",
      fixedAxis: "y", fixedUnit: "m", fixedCoordinate: 2, extent: [-2, 2], samples: 17 });
    expect(current).toMatchObject({ outputUnit: "m/s", method: "analytic-expression", availableRows: 17 });
    expect(current).not.toHaveProperty("coverage");
    const graphs = renderToStaticMarkup(<DerivedProfileProvenanceCard view="graphs" provenance={current} />);
    const explorer = renderToStaticMarkup(<DerivedProfileProvenanceCard view="explorer" provenance={current} />);
    for (const html of [graphs, explorer]) {
      expect(html).toContain(result.source.documentId);
      expect(html).toContain(result.source.structuralHash);
      expect(html).toContain("vector-magnitude → plane-slice → line-profile");
      expect(html).toContain("17 specified; 17 available");
      expect(html).not.toContain("Verified transfer coverage");
    }
    project = parseMath3DProject(serializeMath3DProject(project));
    expect(job.read(profileId)).toEqual(result);
    const unverified = buildDerivedProfileProvenance(project, profileId,
      { verifySource: () => false, result });
    expect(unverified).toMatchObject({ status: "withheld", reason: "source-unverified", availableRows: 0 });
    for (const view of ["graphs", "explorer"] as const)
      expect(renderToStaticMarkup(<DerivedProfileProvenanceCard view={view} provenance={unverified} />))
        .toContain("source cannot be verified");
    project = sourceChange(project);
    const changed = buildDerivedProfileProvenance(project, profileId,
      { verifySource: verified, result });
    expect(changed).toMatchObject({ status: "withheld", reason: "source-changed", availableRows: 0 });
    expect(changed.source.revision).toBe(result.source.revision);
    expect(changed.source.currentRevision).toBeGreaterThan(result.source.revision);
    expect(job.read(profileId)).toBeNull();
    for (const view of ["graphs", "explorer"] as const)
      expect(renderToStaticMarkup(<DerivedProfileProvenanceCard view={view} provenance={changed} />))
        .toContain("source revision or hash changed");
    job.dispose();
  });

  it("does not invent a method or transfer coverage without a result", () => {
    const project = load();
    const record = buildDerivedProfileProvenance(project, profileId,
      { verifySource: verified });
    expect(record).toMatchObject({ status: "withheld", reason: "not-computed",
      method: null, availableRows: 0 });
    expect(record).not.toHaveProperty("coverage");
  });

  it("shows coverage only from a matching verified scientific transfer", async () => {
    const directory = new URL("../../../tests/fixtures/scientific-scene/vortex-volume.sscene/", import.meta.url);
    const manifestJson = readFileSync(new URL("manifest.json", directory), "utf8");
    const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
    const names = ["east", "north", "up"] as const;
    const references = names.map(name => createGraph2DFieldReference(manifestJson, fingerprint,
      { kind: "preset", value: "vortexVolume" }, "field", name)) as
      [Graph2DFieldReference, Graph2DFieldReference, Graph2DFieldReference];
    let project = load();
    const original = project.workspace.entries.find(entry => entry.module === "vector3d")!;
    if (original.checkpoint.format !== "math3d.vector-field3d-document") throw new TypeError("Wrong fixture.");
    const sourceData = {
      ...original.checkpoint.source,
      axes: [{ ...original.checkpoint.source.axes[0] }, { ...original.checkpoint.source.axes[1] },
        { ...original.checkpoint.source.axes[2], min: -3, max: 3 }],
      field: { kind: "scientific-bundle", references, componentUnits: ["m/s", "m/s", "m/s"] },
    } as const;
    const source = createVectorField3DDocument(sourceData, {
      stableKey: original.checkpoint.identity.id, title: "Verified vortex",
      identity: advanceDocumentIdentity(original.checkpoint.identity, sourceData),
      workspace: defaultVectorField3DWorkspace(sourceData),
    });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
      derivedFields: [], entries: project.workspace.entries.map(entry => entry === original ?
        { ...entry, checkpoint: source, expected: source.identity } : entry) }));
    const operations = load().workspace.derivedFields!;
    let parentId = source.identity.id;
    for (const [index, operation] of operations.entries()) {
      project = appendProjectDerivedField(project, parentId, operation.operation,
        { stableKey: `gf05-scientific-${index}`, title: operation.metadata.title }, () => true);
      parentId = project.workspace.derivedFields!.at(-1)!.identity.id;
    }
    const shape = [21, 21, 17] as const;
    const volumes = names.map((name, index) => {
      const bytes = readFileSync(new URL(`${name}.f64`, directory));
      return { fingerprint, datasetId: "field", component: name, sourceShape: shape,
        sampleShape: shape, resourceSha256: references[index].resourceSha256,
        sampleSha256: sha256Checksum(bytes).slice(7),
        values: Array.from({ length: shape[0] * shape[1] * shape[2] }, (_, offset) =>
          bytes.readDoubleLE(offset * 8)) };
    }) as VectorField3DVolumes;
    const slice = sampleVectorField3DSlice(source, 2, 3, { manifestJson, fingerprint, volumes });
    const generation = { documentId: source.identity.id, revision: source.identity.revision,
      structuralHash: source.identity.structuralHash, generation: source.identity.revision };
    const job = createDerivedFieldProfileJob({ project: () => project, verifySource: () => true,
      loadBundle: async () => ({ manifestJson, fingerprint, volumes }) });
    const outcome = await job.submit(parentId).promise;
    expect(outcome.publication).toBe("published");
    const result = outcome.result!;
    const record = buildDerivedProfileProvenance(project, parentId, { verifySource: () => true, result,
      transfer: { source: generation, components: slice.verifiedSamples! } });
    expect(record.coverage).toHaveLength(3);
    expect(renderToStaticMarkup(<DerivedProfileProvenanceCard view="graphs" provenance={record} />))
      .toContain("Verified transfer coverage");
    expect(buildDerivedProfileProvenance(project, parentId, { verifySource: () => false, result,
      transfer: { source: generation, components: slice.verifiedSamples! } })).not.toHaveProperty("coverage");
    expect(buildDerivedProfileProvenance(project, parentId, { verifySource: () => true, result,
      transfer: { source: { ...generation, generation: generation.generation + 1 },
        components: slice.verifiedSamples! } })).not.toHaveProperty("coverage");
    job.dispose();
  });
});
