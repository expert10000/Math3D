import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, parseMath3DProject, projectTemporalFieldSourceStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  sampleTemporalFieldProbe, sampleTemporalFieldSlice, serializeMath3DProject,
  upsertProjectTemporalFieldSource, vectorField3DExpression } from "@math3d/core";

const fixture = new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const make = () => {
  let project = parseMath3DProject(readFileSync(fixture, "utf8"));
  const first = project.workspace.entries.find(item => item.module === "vector3d")!.checkpoint;
  if (first.format !== "math3d.vector-field3d-document") throw new Error("Wrong fixture.");
  const second = createVectorField3DDocument({ ...first.source,
    field: { kind: "expressions", components: [vectorField3DExpression("2*x", "m/s"),
      vectorField3DExpression("y", "m/s"), vectorField3DExpression("z", "m/s")] } },
  { stableKey: "gf25-later", title: "Later frame" });
  project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
    ...project.workspace, entries: [...project.workspace.entries,
      { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: first.identity.id }, { time: 2, documentId: second.identity.id }],
    { stableKey: "gf25-time", timeUnit: "s", interpolation: "linear" });
  project = upsertProjectTemporalFieldSource(project, temporal);
  return { project: parseMath3DProject(serializeMath3DProject(project)), temporal, second };
};

describe("GF-25 time-aware sampling", () => {
  it("reopens a versioned linear recipe and samples bounded physical probes and slices", () => {
    const { project, temporal } = make();
    expect(temporal.schemaVersion).toBe(2);
    expect(temporal.source.timeAxis.interpolation).toBe("linear");
    const point = [1, 2, 3] as const;
    const probe = sampleTemporalFieldProbe(project, temporal, 1, point);
    expect(probe.vector).toEqual([1.5, 2, 3]);
    expect(probe.magnitude).toBeCloseTo(Math.hypot(1.5, 2, 3));
    expect(probe.frameIds).toHaveLength(2);
    expect(sampleTemporalFieldProbe(project, temporal, 2, point))
      .toMatchObject({ vector: [2, 2, 3], frameIds: [temporal.source.frames[1]!.documentId] });
    const slice = sampleTemporalFieldSlice(project, temporal, 1, 2, 3, 9);
    expect(slice.shape).toEqual([9, 9]);
    expect(slice.values).toHaveLength(81);
    expect(slice.values.every(Number.isFinite)).toBe(true);
    expect(() => sampleTemporalFieldProbe(project, temporal, 3, point)).toThrow(/outside/);
    expect(() => sampleTemporalFieldProbe(project, temporal, 1, [100, 0, 0])).toThrow(/outside/);
    expect(() => sampleTemporalFieldSlice(project, temporal, 1, 2, 3, 33)).toThrow(/bounded/);
  });

  it("withholds both sample types when a pinned frame changes", () => {
    const { project, temporal, second } = make();
    const changed = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: project.workspace.entries.map(item =>
        item.expected.id === second.identity.id ? { ...item, checkpoint: changed,
          expected: changed.identity } : item) }));
    expect(projectTemporalFieldSourceStatus(stale, temporal).reason).toBe("frame-2-changed");
    expect(() => sampleTemporalFieldProbe(stale, temporal, 1, [1, 2, 3])).toThrow(/withheld/);
    expect(() => sampleTemporalFieldSlice(stale, temporal, 1, 2, 3, 9)).toThrow(/withheld/);
  });
});
