import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, computeTemporalPathline, computeTemporalStreakline,
  parseMath3DProject,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeMath3DProject, upsertProjectTemporalFieldSource,
  upsertProjectTemporalPathline } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../../../tests/fixtures/graph-field/gf23Bundle";
import { additionalRepresentationView } from "./additionalProjectRepresentations";
import { tryRestoreAdditionalProjectSession } from "./additionalProjectSession";

describe("scientific pathline Project Curve presentation", () => {
  it("withholds on reopen, then shows pinned points only with verified frames", async () => {
    let project = createGf23Project();
    const first = project.workspace.entries[0]!.checkpoint;
    if (first.format !== "math3d.vector-field3d-document") throw new Error("Wrong fixture.");
    const second = createVectorField3DDocument(first.source,
      { stableKey: "scientific-pathline-preview-second" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
    const transfers = new Map([[first.identity.id, gf23Transfer()],
      [second.identity.id, gf23Transfer()]]);
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "scientific-pathline-preview-time", timeUnit: "s",
        interpolation: "linear", transfers });
    project = upsertProjectTemporalFieldSource(project, temporal, transfers);
    const curve = await computeTemporalPathline(project, temporal,
      { seed: [0, 0, 0], startTime: 0, endTime: .2,
        maxSteps: 16, method: "fixed-rk4" },
      { transfers, verifyBeforePublish: async () => transfers });
    project = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalPathline(project, curve, transfers)));
    const entry = project.workspace.entries.find(item => item.expected.id === curve.identity.id)!;
    const documents = new Map(project.workspace.entries.map(item =>
      [item.expected.id, item.checkpoint] as const));
    const context = { documents, project, timeSources: project.workspace.timeSources };
    const session = tryRestoreAdditionalProjectSession(entry, curve, () => context);
    expect(session).not.toBeNull();
    expect(() => session!.view()).toThrow(/fresh bundle verification/);
    const verified = { ...context, verifiedTemporalTransfers: transfers };
    const view = additionalRepresentationView(curve, verified);
    expect(view.sampleCount).toBeGreaterThan(2);
    expect(view.scene.segments.length).toBeGreaterThan(0);
    expect(session!.document().source.definition.points).toEqual(curve.source.definition.points);
    const streakline = await computeTemporalStreakline(project, temporal,
      { seed: [2, 0, 0], releaseStart: 0, releaseEnd: .1,
        observationTime: .2, releaseCount: 4, stepsPerParticle: 16,
        method: "fixed-rk4" },
      { transfers, verifyBeforePublish: async () => transfers });
    expect(() => additionalRepresentationView(streakline, context))
      .toThrow(/fresh bundle verification/);
    expect(additionalRepresentationView(streakline, verified).sampleCount).toBe(6);
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    const changedProject = replaceMath3DProjectWorkspace(project,
      createMixedWorkspaceDocument({ ...project.workspace,
        entries: project.workspace.entries.map(item => item.expected.id === second.identity.id ?
          { ...item, checkpoint: changed, expected: changed.identity } : item) }));
    expect(() => additionalRepresentationView(curve, { ...verified,
      project: changedProject,
      documents: new Map(changedProject.workspace.entries.map(item =>
        [item.expected.id, item.checkpoint] as const)) })).toThrow(/frame changed/);
    const changedContext = { ...context, project: changedProject,
      documents: new Map(changedProject.workspace.entries.map(item =>
        [item.expected.id, item.checkpoint] as const)) };
    const replayEntry = session!.entry();
    const reopenedSession = tryRestoreAdditionalProjectSession(replayEntry, curve,
      () => changedContext);
    expect(reopenedSession).not.toBeNull();
    expect(() => reopenedSession!.view()).toThrow(/frame changed/);
  });
});
