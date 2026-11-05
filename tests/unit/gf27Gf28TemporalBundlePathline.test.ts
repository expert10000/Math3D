import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createMixedWorkspaceDocument,
  createTemporalFieldSourceDocument, createVectorField3DDocument,
  createMath3DProject, vectorField3DExpression,
  computeTemporalPathline, parseMath3DProject, projectTemporalFieldSourceStatus,
  projectTemporalPathlineStatus, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, sampleTemporalFieldProbe, sampleTemporalFieldSlice,
  serializeMath3DProject, sha256Checksum, upsertProjectTemporalFieldSource,
  upsertProjectTemporalPathline, type Math3DProject, type VectorField3DDocument,
  type VectorField3DVolumes, type VerifiedTemporalTransfers,
  type VerifiedVectorFieldTransfer } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../fixtures/graph-field/gf23Bundle";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bytesOf = (values: readonly number[]) => {
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
  return bytes;
};

function fixture() {
  let project = createGf23Project();
  const first = project.workspace.entries.find(item => item.module === "vector3d")!
    .checkpoint as VectorField3DDocument;
  const earlier = gf23Transfer();
  const manifest = JSON.parse(earlier.manifestJson) as { resources: { id: string;
    sha256: string }[]; source: { sourceId: string } };
  manifest.source.sourceId = "vortex-volume-later";
  const laterValues = earlier.volumes[0].values.map(value => value + 0.25);
  const laterSha = sha(bytesOf(laterValues));
  manifest.resources.find(item => item.id === "east")!.sha256 = laterSha;
  const manifestJson = JSON.stringify(manifest);
  const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
  if (first.source.field.kind !== "scientific-bundle") throw new Error("Wrong fixture.");
  const refs = first.source.field.references.map(ref => createGraph2DFieldReference(
    manifestJson, fingerprint, ref.locator, ref.datasetId, ref.component)) as
    typeof first.source.field.references;
  const second = createVectorField3DDocument({ ...first.source,
    field: { ...first.source.field, references: refs } },
  { stableKey: "gf27-later-bundle", title: "Later verified frame" });
  const later: VerifiedVectorFieldTransfer = { manifestJson, fingerprint,
    volumes: earlier.volumes.map((part, index) => ({ ...part, fingerprint,
      resourceSha256: index === 0 ? laterSha : part.resourceSha256,
      sampleSha256: index === 0 ? laterSha : part.sampleSha256,
      values: index === 0 ? laterValues : part.values })) as unknown as VectorField3DVolumes };
  project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
    ...project.workspace, entries: [...project.workspace.entries,
      { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
  const transfers: VerifiedTemporalTransfers = new Map([
    [first.identity.id, earlier], [second.identity.id, later] ]);
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: first.identity.id },
      { time: 1, documentId: second.identity.id }],
    { stableKey: "gf27-scientific-frames", timeUnit: "s",
      interpolation: "linear", transfers });
  project = upsertProjectTemporalFieldSource(project, temporal, transfers);
  return { project: parseMath3DProject(serializeMath3DProject(project)), first, second,
    temporal, transfers, earlier, later };
}

function replaceFrame(project: Math3DProject, document: VectorField3DDocument) {
  return replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
    ...project.workspace, entries: project.workspace.entries.map(item =>
      item.expected.id === document.identity.id ? { ...item, checkpoint: document,
        expected: document.identity } : item) }));
}

describe("GF-27 verified scientific time source", () => {
  it("reopens a two-frame bundle, interpolates physical probes and bounded slices", () => {
    const { project, first, second, temporal, transfers } = fixture();
    expect(temporal.schemaVersion).toBe(3);
    expect(projectTemporalFieldSourceStatus(project, temporal).reason)
      .toBe("frame-1-verification-required");
    expect(projectTemporalFieldSourceStatus(project, temporal, transfers).status).toBe("current");
    const a = sampleTemporalFieldProbe(project, temporal, 0, [0, 0, 0], transfers);
    const b = sampleTemporalFieldProbe(project, temporal, 1, [0, 0, 0], transfers);
    const middle = sampleTemporalFieldProbe(project, temporal, .5, [0, 0, 0], transfers);
    expect(middle.vector[0]).toBeCloseTo((a.vector[0] + b.vector[0]) / 2);
    expect(middle.frameIds).toEqual([first.identity.id, second.identity.id]);
    const slice = sampleTemporalFieldSlice(project, temporal, .5, 2, 0, 9, transfers);
    expect(slice.values).toHaveLength(81);
    expect(slice.values.every(Number.isFinite)).toBe(true);
    expect(() => sampleTemporalFieldSlice(project, temporal, .5, 2, 0, 33, transfers))
      .toThrow(/bounded/);
    expect(() => sampleTemporalFieldProbe(project, temporal, 1.1, [0, 0, 0], transfers))
      .toThrow(/outside/);
  });

  it("withholds absent, changed, misaligned and tampered frames", () => {
    const { project, first, second, temporal, transfers, later } = fixture();
    expect(projectTemporalFieldSourceStatus(project, temporal,
      new Map([[first.identity.id, transfers.get(first.identity.id)!]])).reason)
      .toBe("frame-2-verification-required");
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    expect(projectTemporalFieldSourceStatus(replaceFrame(project, changed), temporal, transfers).reason)
      .toBe("frame-2-changed");
    const tampered = { ...later, volumes: later.volumes.map((part, index) =>
      index === 0 ? { ...part, values: [part.values[0]! + 1, ...part.values.slice(1)] } :
        part) as unknown as VectorField3DVolumes };
    expect(projectTemporalFieldSourceStatus(project, temporal,
      new Map([...transfers, [second.identity.id, tampered]])).reason)
      .toBe("frame-2-verification-failed");
    const shiftedManifest = JSON.parse(later.manifestJson) as {
      coordinates: { origin: number[] }[] };
    shiftedManifest.coordinates[0]!.origin[0] += .4;
    const shiftedJson = JSON.stringify(shiftedManifest);
    const shiftedFingerprint = sha256Checksum(new TextEncoder().encode(shiftedJson)).slice(7);
    if (second.source.field.kind !== "scientific-bundle") throw new Error("Wrong fixture.");
    const shiftedRefs = second.source.field.references.map(ref =>
      createGraph2DFieldReference(shiftedJson, shiftedFingerprint, ref.locator,
        ref.datasetId, ref.component)) as typeof second.source.field.references;
    const bad = createVectorField3DDocument({ ...second.source,
      field: { ...second.source.field, references: shiftedRefs },
      axes: second.source.axes.map((axis, index) => index === 0 ?
        { ...axis, min: axis.min + .4, max: axis.max + .4 } : axis) as
          unknown as typeof second.source.axes }, { stableKey: "gf27-bad-grid" });
    const shiftedProject = replaceMath3DProjectWorkspace(project,
      createMixedWorkspaceDocument({ ...project.workspace,
        entries: [...project.workspace.entries,
          { module: "vector3d", checkpoint: bad, expected: bad.identity, replay: null }] }));
    expect(() => createTemporalFieldSourceDocument(shiftedProject,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: bad.identity.id }],
      { stableKey: "bad", timeUnit: "s", interpolation: "linear", transfers }))
      .toThrow();
  });
});

describe("GF-28 physical pathline", () => {
  it("integrates a changing analytic velocity in physical time with an exact reference", async () => {
    const base = createGf23Project();
    const source = base.workspace.entries[0]!.checkpoint as VectorField3DDocument;
    const field = (speed: string) => ({ ...source.source,
      field: { kind: "expressions" as const, components: [
        vectorField3DExpression(speed, "m/s"),
        vectorField3DExpression("0", "m/s"),
        vectorField3DExpression("0", "m/s")] as const } });
    const first = createVectorField3DDocument(field("1"), { stableKey: "gf28-v0" });
    const second = createVectorField3DDocument(field("3"), { stableKey: "gf28-v1" });
    let project = createMath3DProject(createMixedWorkspaceDocument({
      entries: [first, second].map(checkpoint => ({ module: "vector3d" as const,
        checkpoint, expected: checkpoint.identity, replay: null })),
      activeDocumentIds: [first.identity.id], constructions: [], results: [],
      artifacts: [], relations: [], committedSelection: null }),
    { stableKey: "gf28-analytic-reference" });
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "gf28-analytic-time", timeUnit: "s", interpolation: "linear" });
    project = upsertProjectTemporalFieldSource(project, temporal);
    const curve = await computeTemporalPathline(project, temporal,
      { seed: [0, 0, 0], startTime: 0, endTime: 1,
        maxSteps: 16, method: "fixed-rk4" });
    expect(curve.source.definition.points?.at(-1)?.[0]).toBeCloseTo(2, 10);
    expect(curve.source.domain.max).toBe(1);
    expect(curve.source.units).toMatchObject({ position: "m", parameter: "s" });
    const boundary = await computeTemporalPathline(project, temporal,
      { seed: [3, 0, 0], startTime: 0, endTime: 1,
        maxSteps: 16, method: "fixed-rk4" });
    expect(boundary.source.definition.settings?.stopReason).toBe("boundary");
  });

  it("saves physical time, solver and frame lineage, then withholds stale Curves", async () => {
    const { project, second, temporal, transfers } = fixture();
    const recipe = { seed: [0, 0, 0] as const, startTime: 0,
      endTime: .2, maxSteps: 32, method: "fixed-rk4" as const };
    const curve = await computeTemporalPathline(project, temporal, recipe,
      { transfers, verifyBeforePublish: async () => transfers });
    expect(curve.source.definition.familyId).toBe("vector3d.temporal-pathline");
    expect(curve.source.definition.pointCount).toBe(33);
    expect(curve.source.definition.settings).toMatchObject({ method: "fixed-rk4",
      stopReason: "time-end", acceptedSteps: 32, evaluations: 128 });
    const reopened = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalPathline(project, curve, transfers)));
    expect(projectTemporalPathlineStatus(reopened, curve).status).toBe("unverified");
    expect(projectTemporalPathlineStatus(reopened, curve, transfers).status).toBe("current");
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    expect(projectTemporalPathlineStatus(replaceFrame(reopened, changed), curve, transfers).status)
      .toBe("stale");
  });

  it("cancels and rejects late source changes without saving a Curve", async () => {
    const { project, second, temporal, transfers } = fixture();
    const recipe = { seed: [0, 0, 0] as const, startTime: 0,
      endTime: .5, maxSteps: 128, method: "fixed-rk4" as const };
    let cancelled = false;
    await expect(computeTemporalPathline(project, temporal, recipe, { transfers,
      shouldCancel: () => cancelled,
      onProgress: completed => { if (completed >= 16) cancelled = true; },
      verifyBeforePublish: async () => transfers })).rejects.toThrow(/cancelled/);
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    let live = project;
    await expect(computeTemporalPathline(project, temporal, recipe, { transfers,
      currentProject: () => live,
      onProgress: completed => { if (completed >= 16) live = replaceFrame(project, changed); },
      verifyBeforePublish: async () => transfers })).rejects.toThrow(/withheld/);
  });
});
