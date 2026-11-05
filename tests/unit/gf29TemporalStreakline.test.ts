import { describe, expect, it } from "vitest";
import { computeTemporalStreakline, createMath3DProject, createMixedWorkspaceDocument,
  createTemporalFieldSourceDocument, createVectorField3DDocument,
  parseMath3DProject, projectTemporalStreaklineStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeMath3DProject, upsertProjectTemporalFieldSource,
  upsertProjectTemporalStreakline, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../fixtures/graph-field/gf23Bundle";

function analyticFixture() {
  const original = createGf23Project().workspace.entries[0]!.checkpoint as VectorField3DDocument;
  const field = (speed: string) => ({ ...original.source,
    field: { kind: "expressions" as const, components: [
      vectorField3DExpression(speed, "m/s"), vectorField3DExpression("0", "m/s"),
      vectorField3DExpression("0", "m/s")] as const } });
  const first = createVectorField3DDocument(field("1"), { stableKey: "gf29-first" });
  const second = createVectorField3DDocument(field("3"), { stableKey: "gf29-second" });
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [first, second].map(checkpoint => ({ module: "vector3d" as const,
      checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [first.identity.id], constructions: [], results: [],
    artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf29-analytic" });
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: first.identity.id }, { time: 1, documentId: second.identity.id }],
    { stableKey: "gf29-time", timeUnit: "s", interpolation: "linear" });
  project = upsertProjectTemporalFieldSource(project, temporal);
  return { project, temporal, second };
}

describe("GF-29 bounded release-seed streaklines", () => {
  it("keeps release order and physical units through Project reopen", async () => {
    const { project, temporal, second } = analyticFixture();
    const recipe = { seed: [0, 0, 0] as const, releaseStart: 0,
      releaseEnd: .5, observationTime: 1, releaseCount: 8,
      stepsPerParticle: 32, method: "fixed-rk4" as const };
    const curve = await computeTemporalStreakline(project, temporal, recipe);
    expect(curve.source.definition.points?.[0]?.[0]).toBeCloseTo(2, 10);
    expect(curve.source.definition.points?.at(-1)?.[0]).toBeCloseTo(1.25, 10);
    expect(curve.source.units).toMatchObject({ position: "m", parameter: "s" });
    expect(curve.source.definition.settings).toMatchObject({ releaseCount: 8,
      observationTime: 1, evaluations: 1024, stopReason: "observation-time" });
    const reopened = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalStreakline(project, curve)));
    expect(projectTemporalStreaklineStatus(reopened, curve).status).toBe("current");
    expect(reopened.workspace.entries.find(item => item.expected.id === curve.identity.id)
      ?.checkpoint).toEqual(curve);
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(reopened, createMixedWorkspaceDocument({
      ...reopened.workspace, entries: reopened.workspace.entries.map(item =>
        item.expected.id === second.identity.id ? { ...item, checkpoint: changed,
          expected: changed.identity } : item) }));
    expect(projectTemporalStreaklineStatus(stale, curve).status).toBe("stale");
  });

  it("caps work, cancels and rejects a late scientific frame change", async () => {
    const { project, temporal } = analyticFixture();
    const recipe = { seed: [0, 0, 0] as const, releaseStart: 0,
      releaseEnd: .5, observationTime: 1, releaseCount: 16,
      stepsPerParticle: 32, method: "fixed-rk4" as const };
    await expect(computeTemporalStreakline(project, temporal,
      { ...recipe, stepsPerParticle: 64 })).rejects.toThrow(/at most 512/);
    let cancelled = false;
    await expect(computeTemporalStreakline(project, temporal, recipe,
      { shouldCancel: () => cancelled,
        onProgress: done => { if (done >= 16) cancelled = true; } }))
      .rejects.toThrow(/cancelled/);
    let bundled = createGf23Project();
    const first = bundled.workspace.entries[0]!.checkpoint as VectorField3DDocument;
    const second = createVectorField3DDocument(first.source,
      { stableKey: "gf29-bundled-second" });
    bundled = replaceMath3DProjectWorkspace(bundled, createMixedWorkspaceDocument({
      ...bundled.workspace, entries: [...bundled.workspace.entries,
        { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
    const transfers = new Map([[first.identity.id, gf23Transfer()],
      [second.identity.id, gf23Transfer()]]);
    const time = createTemporalFieldSourceDocument(bundled,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "gf29-bundled-time", timeUnit: "s", interpolation: "linear", transfers });
    bundled = upsertProjectTemporalFieldSource(bundled, time, transfers);
    const scientificRecipe = { ...recipe, releaseCount: 4, stepsPerParticle: 16 };
    const scientific = await computeTemporalStreakline(bundled, time,
      scientificRecipe, { transfers, verifyBeforePublish: async () => transfers });
    const saved = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalStreakline(bundled, scientific, transfers)));
    expect(projectTemporalStreaklineStatus(saved, scientific).status).toBe("unverified");
    expect(projectTemporalStreaklineStatus(saved, scientific, transfers).status).toBe("current");
    const shifted = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    const late = replaceMath3DProjectWorkspace(bundled, createMixedWorkspaceDocument({
      ...bundled.workspace, entries: bundled.workspace.entries.map(item =>
        item.expected.id === second.identity.id ? { ...item, checkpoint: shifted,
          expected: shifted.identity } : item) }));
    let live = bundled;
    await expect(computeTemporalStreakline(bundled, time, scientificRecipe,
      { transfers, verifyBeforePublish: async () => transfers,
        currentProject: () => live,
        onProgress: done => { if (done >= 16) live = late; } })).rejects.toThrow(/withheld/);
  });
});
