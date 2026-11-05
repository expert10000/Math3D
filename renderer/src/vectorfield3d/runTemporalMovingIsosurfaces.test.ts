import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, defaultVectorField3DWorkspace,
  extractVectorField3DSpeedIsosurface, planVectorField3DIsosurface,
  replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, upsertProjectTemporalFieldSource,
  vectorField3DExpression,
  type VectorField3DDocument, type VectorField3DIsosurface } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../../../tests/fixtures/graph-field/gf23Bundle";
import { runTemporalMovingIsosurfaces } from "./runTemporalMovingIsosurfaces";
import { playTemporalMovingIsosurfaces, temporalSurfaceResidentBytes } from
  "./playTemporalMovingIsosurfaces";
import { interpolateTemporalSurfacePair, validateTemporalSurfacePair } from
  "./validateTemporalSurfacePair";

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
  it("GF-35 distinguishes stable and changing topology in analytic extraction fixtures", () => {
    const { first } = fixture();
    const plan = planVectorField3DIsosurface(first,
      defaultVectorField3DWorkspace(first.source).clipBounds);
    const speed = (centers: number) => Float64Array.from(
      plan.coordinates[0].flatMap(x => plan.coordinates[1].flatMap(y =>
        plan.coordinates[2].map(z => Math.min(
          Math.hypot(x - centers, y, z), Math.hypot(x + centers, y, z))))));
    const separated = extractVectorField3DSpeedIsosurface(first, plan, speed(1), .7);
    const joined = extractVectorField3DSpeedIsosurface(first, plan, speed(.4), .7);
    expect(separated.topology.connectedComponents).toBe(2);
    expect(joined.topology.connectedComponents).toBe(1);
    expect(validateTemporalSurfacePair(separated, separated).status).toBe("compatible");
    expect(validateTemporalSurfacePair(separated, joined).reason).toMatch(/topology/);
  });
  it("GF-35 admits stable indexed topology and explains changed topology", async () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const indices = new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
    const surface = { complete: true, triangleCount: 4, level: 1, unit: "m/s",
      clipBounds: [[-2, 2], [-2, 2], [-2, 2]], coordinateAxes: [],
      topology: { connectedComponents: 1, boundaryEdgeCount: 0,
        clipBoundaryEdgeCount: 0, nonManifoldEdgeCount: 0, watertight: true },
      positions, normals: new Float32Array([0, 0, 1, 0, 0, 1,
        0, 0, 1, 0, 0, 1]), indices } as unknown as VectorField3DIsosurface;
    const shifted = { ...surface, positions: Float32Array.from(positions,
      (value, index) => index % 3 === 2 ? value + .1 : value) };
    expect(validateTemporalSurfacePair(surface, shifted).status).toBe("compatible");
    const midpoint = interpolateTemporalSurfacePair(surface, shifted, .5);
    expect(midpoint.positions[2]).toBeCloseTo(.05);
    expect(midpoint.sourceHash).toBeNull();
    expect(validateTemporalSurfacePair(surface, { ...shifted,
      topology: { ...shifted.topology, connectedComponents: 2 } }).reason)
      .toMatch(/topology changed/);
    expect(validateTemporalSurfacePair(surface, { ...shifted,
      indices: new Uint32Array([0, 1, 2, ...indices.slice(3)]) }).reason)
      .toMatch(/correspondence|indexing/);
    expect(validateTemporalSurfacePair(surface, { ...shifted,
      positions: Float32Array.from(positions,
        (value, index) => index % 3 === 2 ? value + 2 : value) }).reason)
      .toMatch(/motion/);
    let { project, first, second } = fixture();
    const transfers = new Map([[first.identity.id, gf23Transfer()],
      [second.identity.id, gf23Transfer()]]);
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "gf35-time", timeUnit: "s", interpolation: "linear", transfers });
    project = upsertProjectTemporalFieldSource(project, temporal, transfers);
    const frames = [first, second].map((field, index) => ({ time: index, field,
      surface: { ...(index ? shifted : surface),
        source: { documentId: field.identity.id,
          revision: field.identity.revision,
          structuralHash: field.identity.structuralHash } } as VectorField3DIsosurface }));
    const midpoints: number[] = [];
    await playTemporalMovingIsosurfaces(project, temporal, frames, {
      loadTransfers: async () => transfers, onFrame: () => {},
      interpolate: true, onInterpolated: result => midpoints.push(result.positions[2]!),
      intervalMs: 100, timeBudgetMs: 1000, memoryBudgetBytes: 10_000,
      wait: async () => {} });
    expect(midpoints).toHaveLength(1);
    expect(midpoints[0]).toBeCloseTo(.05, 5);
    await expect(playTemporalMovingIsosurfaces(project, temporal, frames, {
      loadTransfers: async () => transfers, onFrame: () => {},
      interpolate: true, intervalMs: 100, timeBudgetMs: 1000,
      memoryBudgetBytes: temporalSurfaceResidentBytes(frames) +
        surface.positions.byteLength + surface.normals.byteLength - 1,
      wait: async () => {} })).rejects.toThrow(/64 MiB/);
    let reason = "";
    await playTemporalMovingIsosurfaces(project, temporal,
      [frames[0]!, { ...frames[1]!, surface: { ...frames[1]!.surface,
        topology: { ...surface.topology, connectedComponents: 2 } } }], {
        loadTransfers: async () => transfers, onFrame: () => {},
        interpolate: true, onInterpolated: () => { throw new Error("Unexpected interpolation."); },
        onInterpolationUnavailable: (_, message) => { reason = message; },
        intervalMs: 100, timeBudgetMs: 1000, memoryBudgetBytes: 10_000,
        wait: async () => {} });
    expect(reason).toMatch(/topology changed/);
  });
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
