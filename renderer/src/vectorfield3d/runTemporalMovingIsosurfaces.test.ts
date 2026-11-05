import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, upsertProjectTemporalFieldSource,
  vectorField3DExpression,
  type VectorField3DDocument, type VectorField3DIsosurface } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../../../tests/fixtures/graph-field/gf23Bundle";
import { runTemporalMovingIsosurfaces } from "./runTemporalMovingIsosurfaces";
import { playTemporalMovingIsosurfaces, temporalSurfaceResidentBytes } from
  "./playTemporalMovingIsosurfaces";

const fixture = () => {
  let project = createGf23Project();
  const first = project.workspace.entries[0]!.checkpoint as VectorField3DDocument;
  const second = createVectorField3DDocument(first.source,
    { stableKey: "gf30-second-frame" });
  project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
    ...project.workspace, entries: [...project.workspace.entries,
      { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
  return { project, first, second };
};

describe("GF-30 bounded pinned-frame isosurfaces", () => {
  it("GF-33 plays exact verified frames, enforces memory and withholds a changed frame", async () => {
    let { project, first, second } = fixture();
    const transfers = new Map([[first.identity.id, gf23Transfer()],
      [second.identity.id, gf23Transfer()]]);
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "gf33-time", timeUnit: "s", interpolation: "linear", transfers });
    project = upsertProjectTemporalFieldSource(project, temporal, transfers);
    const frames = [first, second].map((field, index) => ({ time: index, field,
      surface: { source: { documentId: field.identity.id,
        revision: field.identity.revision,
        structuralHash: field.identity.structuralHash },
        positions: new Float32Array(9), normals: new Float32Array(9),
        indices: new Uint32Array(3) } as VectorField3DIsosurface }));
    expect(temporalSurfaceResidentBytes(frames)).toBe(168);
    const shown: number[] = [];
    const options = { loadTransfers: async () => transfers,
      onFrame: (frame: typeof frames[number]) => { shown.push(frame.time); },
      intervalMs: 100, timeBudgetMs: 1000, memoryBudgetBytes: 168,
      wait: async () => {} };
    await playTemporalMovingIsosurfaces(project, temporal, frames, options);
    expect(shown).toEqual([0, 1]);
    await expect(playTemporalMovingIsosurfaces(project, temporal, frames,
      { ...options, memoryBudgetBytes: 167 })).rejects.toThrow(/64 MiB/);
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: project.workspace.entries.map(item =>
        item.expected.id === second.identity.id ? { ...item, checkpoint: changed,
          expected: changed.identity } : item) }));
    let live = project;
    shown.length = 0;
    await expect(playTemporalMovingIsosurfaces(project, temporal, frames, {
      ...options, currentProject: () => live,
      onFrame: frame => { shown.push(frame.time); live = stale; } }))
      .rejects.toThrow(/withheld/);
    expect(shown).toEqual([0]);
    const controller = new AbortController();
    shown.length = 0;
    await expect(playTemporalMovingIsosurfaces(project, temporal, frames, {
      ...options, signal: controller.signal,
      onFrame: frame => { shown.push(frame.time); controller.abort(); } }))
      .rejects.toThrow(/cancelled/);
    expect(shown).toEqual([0]);
  });
  it("preserves exact frame times and refuses a changed source before publication", async () => {
    // Use expression sources for the runner contract; the desktop gate exercises
    // the real verified bundle worker and Mesh promotion.
    const { first, second } = fixture();
    const makeAnalytic = (document: VectorField3DDocument) =>
      createVectorField3DDocument({ ...document.source,
        field: { kind: "expressions" as const, components: [
          vectorField3DExpression("x", "m/s"),
          vectorField3DExpression("y", "m/s"),
          vectorField3DExpression("z", "m/s")] as const } },
      { stableKey: `gf30-analytic-${document.identity.id}` });
    const a = makeAnalytic(first), b = makeAnalytic(second);
    let project = createMath3DProject(createMixedWorkspaceDocument({
      entries: [a, b].map(checkpoint => ({ module: "vector3d" as const,
        checkpoint, expected: checkpoint.identity, replay: null })),
      activeDocumentIds: [a.identity.id], constructions: [], results: [], artifacts: [],
      relations: [], committedSelection: null }), { stableKey: "gf30-analytic" });
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: a.identity.id },
        { time: 1, documentId: b.identity.id }],
      { stableKey: "gf30-time", timeUnit: "s", interpolation: "linear" });
    project = upsertProjectTemporalFieldSource(project, temporal);
    const recipe = { level: 1, clipBounds: [[-2, 2], [-2, 2], [-2, 2]] as const,
      triangleBudgetPerFrame: 100, timeBudgetMs: 1000 };
    const mock = async (field: VectorField3DDocument) => ({
      source: { documentId: field.identity.id,
        revision: field.identity.revision,
        structuralHash: field.identity.structuralHash },
      complete: true, triangleCount: 1,
    } as VectorField3DIsosurface);
    const frames = await runTemporalMovingIsosurfaces(project, temporal, recipe,
      { loadTransfers: async () => new Map(), runFrame: mock });
    expect(frames.map(frame => frame.time)).toEqual([0, 1]);
    expect(frames.map(frame => frame.surface.source.documentId))
      .toEqual([a.identity.id, b.identity.id]);
    const changed = reviseVectorField3DDocument(b, { ...b.source,
      display: { ...b.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: project.workspace.entries.map(item =>
        item.expected.id === b.identity.id ? { ...item, checkpoint: changed,
          expected: changed.identity } : item) }));
    let live = project;
    await expect(runTemporalMovingIsosurfaces(project, temporal, recipe,
      { loadTransfers: async () => new Map(), currentProject: () => live,
        onProgress: done => { if (done === 1) live = stale; }, runFrame: mock }))
      .rejects.toThrow(/withheld/);
  });
});
