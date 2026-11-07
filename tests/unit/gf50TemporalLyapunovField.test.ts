import { describe, expect, it } from "vitest";
import { computeTemporalLyapunovField, createMath3DProject,
  createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, parseMath3DProject,
  projectTemporalLyapunovFieldStatus, replaceMath3DProjectWorkspace,
  reviseVectorField3DDocument, serializeMath3DProject,
  upsertProjectTemporalFieldSource, upsertProjectTemporalLyapunovField,
  vectorField3DExpression, type VectorField3DDocument } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../fixtures/graph-field/gf23Bundle";
import { buildMobileProjectExplorer } from
  "../../apps/mobile/src/models/mobileProjectExplorer";

const fixture = (scientific = false, unit = "m/s",
  components: readonly [string, string, string] = ["x", "0", "0"]) => {
  const base = createGf23Project();
  const source = base.workspace.entries[0]!.checkpoint as VectorField3DDocument;
  const make = (key: string) => createVectorField3DDocument(scientific ? source.source :
    { ...source.source, field: { kind: "expressions" as const, components: [
      vectorField3DExpression(components[0], unit),
      vectorField3DExpression(components[1], unit),
      vectorField3DExpression(components[2], unit)] as const } }, { stableKey: key });
  const a = make("gf50-a"), b = make("gf50-b");
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [a, b].map(checkpoint => ({ module: "vector3d" as const,
      checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [a.identity.id], constructions: [], results: [],
    artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf50-project" });
  const transfers = scientific ? new Map([[a.identity.id, gf23Transfer()],
    [b.identity.id, gf23Transfer()]]) : undefined;
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: a.identity.id },
      { time: 1, documentId: b.identity.id }],
    { stableKey: "gf50-time", timeUnit: "s", interpolation: "linear", transfers });
  project = upsertProjectTemporalFieldSource(project, temporal, transfers);
  return { project, temporal, transfers, a, b };
};
const recipe = { normalAxis: 2 as const, coordinate: 0, resolution: 2,
  startTime: 0, endTime: .2, perturbation: .001, maxSteps: 16,
  method: "fixed-rk4-cauchy-green" as const };

describe("GF-50 finite-time Lyapunov field", () => {
  it("measures analytic expansion, records uncertainty, and withholds changed frames after reopen", async () => {
    const { project, temporal, b } = fixture();
    const progress: number[] = [];
    const study = await computeTemporalLyapunovField(project, temporal, recipe,
      { onProgress: value => progress.push(value) });
    expect(study.status).toBe("ready");
    expect(study.cells).toHaveLength(4);
    expect(study.cells.every(cell => Math.abs(cell.estimate - 1) < 1e-3)).toBe(true);
    expect(study.cells.every(cell => cell.uncertainty >= 0 &&
      cell.uncertainty < 1e-3)).toBe(true);
    expect(study.evaluations).toBeLessThanOrEqual(60_000);
    expect(progress).toEqual([1, 2, 3, 4]);
    const saved = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalLyapunovField(project, study)));
    const result = saved.workspace.results.find(item => item.resultId ===
      study.publication!.resultId)!;
    expect(result.summary.exponentUnit).toBe("1/s");
    expect(projectTemporalLyapunovFieldStatus(saved, result).status).toBe("current");
    const changed = reviseVectorField3DDocument(b, { ...b.source,
      display: { ...b.source.display, magnitudeScale: 2 } });
    const stale = replaceMath3DProjectWorkspace(saved, createMixedWorkspaceDocument({
      ...saved.workspace, entries: saved.workspace.entries.map(entry =>
        entry.expected.id === b.identity.id ? { ...entry, checkpoint: changed,
          expected: changed.identity } : entry) }));
    expect(projectTemporalLyapunovFieldStatus(stale, result).reason).toMatch(/frame-2-changed/);
    expect(buildMobileProjectExplorer(serializeMath3DProject(stale)).scientificContracts
      .find(item => item.id === result.resultId)?.spoken).toMatch(/frame-2-changed/);
    await expect(computeTemporalLyapunovField(stale, temporal, recipe))
      .resolves.toMatchObject({ status: "unavailable", reason: "frame-2-changed" });
  });

  it("requires verified bundle transfers and a fresh final check", async () => {
    const { project, temporal, transfers } = fixture(true);
    expect(temporal.schemaVersion).toBe(3);
    expect((await computeTemporalLyapunovField(project, temporal, recipe)).reason)
      .toBe("frame-1-verification-required");
    const study = await computeTemporalLyapunovField(project, temporal, recipe,
      { transfers, verifyBeforePublish: async () => transfers });
    expect(study.status).toBe("ready");
    const saved = parseMath3DProject(serializeMath3DProject(
      upsertProjectTemporalLyapunovField(project, study, transfers)));
    const result = saved.workspace.results.find(item => item.resultId ===
      study.publication!.resultId)!;
    expect(projectTemporalLyapunovFieldStatus(saved, result).status).toBe("withheld");
    expect(projectTemporalLyapunovFieldStatus(saved, result, transfers).status).toBe("current");
  });

  it("cancels before publication and refuses excess seed or work budgets", async () => {
    const { project, temporal } = fixture();
    let cancelled = false;
    await expect(computeTemporalLyapunovField(project, temporal, recipe,
      { shouldCancel: () => cancelled,
        onProgress: () => { cancelled = true; } })).rejects.toThrow(/cancelled/);
    await expect(computeTemporalLyapunovField(project, temporal,
      { ...recipe, resolution: 5 })).rejects.toThrow(/bounded/);
  });

  it("admits repeated maximum stretches and rejects incompatible velocity units", async () => {
    const isotropic = fixture(false, "m/s", ["x", "y", "z"]);
    const study = await computeTemporalLyapunovField(isotropic.project,
      isotropic.temporal, recipe);
    expect(study.status).toBe("ready");
    expect(study.cells.every(cell => Math.abs(cell.estimate - 1) < 1e-3)).toBe(true);
    expect(() => fixture(false, "m")).toThrow(/Invalid 3D vector-field/);
  });
});
