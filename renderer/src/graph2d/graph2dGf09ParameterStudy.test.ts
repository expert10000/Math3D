import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createMath3DProject,
  createMixedWorkspaceDocument, Graph2DPointTableStore, graph2DParameterStudyOrigin,
  graph2DParameterStudyRows, graph2DParameterStudyStatus, inspectGraph2DCompatibility,
  parseMath3DProject, serializeMath3DProject, type Graph2DDocument,
  type Graph2DParameterStudy } from "@math3d/core";
import { createGraph2DParameterStudyJob, Graph2DCommandAdapter } from "@math3d/kernel";

const style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };
const domain = { min: -4, max: 4, includeMin: true, includeMax: true };
const recipe: Graph2DParameterStudy = { id: "study_1", label: "Slope at x=2",
  sourceObjectId: "function_1", parameterName: "a",
  range: { min: 0, max: 2, samples: 17 }, measurement: { kind: "point-value", x: 2 } };
const setup = () => {
  const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument("gf09-parameter-study"));
  const commit = (action: Parameters<typeof applyGraph2DAuthoring>[1]) =>
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), action), action.type);
  commit({ type: "parameter-create", draft: { name: "a", value: 1,
    min: 0, max: 2, step: 0.1, unit: "m" } });
  commit({ type: "create", draft: { label: "Line family", expression: "a*x+1", domain, style } });
  commit({ type: "create-parameter-study", study: recipe });
  return { adapter, commit };
};
const project = (document: Graph2DDocument) => createMath3DProject(createMixedWorkspaceDocument({
  entries: [{ module: "graph2d", checkpoint: document, expected: document.identity, replay: null }],
  activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [],
  committedSelection: null, constructions: [],
}), { stableKey: "gf09-project", title: "GF-09 parameter study" });

describe("GF-09 saved parameter study", () => {
  it("measures a bounded series and keeps recipe, values and source guard through Project reopen", async () => {
    const { adapter, commit } = setup();
    const backing = new Map<string, string>();
    const store = new Graph2DPointTableStore({ read: id => backing.get(id) ?? null,
      write: (id, content) => { backing.set(id, content); } });
    const progress: number[] = [];
    const job = createGraph2DParameterStudyJob({ document: () => adapter.document() });
    const outcome = await job.submit(recipe.id, { onProgress: done => progress.push(done) }).promise;
    expect(outcome.publication).toBe("published");
    expect(outcome.result?.rows).toHaveLength(17);
    expect(outcome.result?.rows[0]).toEqual({ x: 0, y: 1 });
    expect(outcome.result?.rows[16]).toEqual({ x: 2, y: 5 });
    expect(progress).toEqual([8, 16, 17]);
    const origin = graph2DParameterStudyOrigin(adapter.document(), outcome.result!);
    const rows = graph2DParameterStudyRows(outcome.result!);
    const table = store.publish(rows);
    commit({ type: "create-point-series", draft: { label: "Slope at x=2 · a (m)",
      table, mode: "line", domain: { min: 0, max: 2, includeMin: true, includeMax: true },
      parameterStudyOrigin: origin, style } });
    const object = adapter.document().source.objects.find(item => item.kind === "point-series");
    if (object?.kind !== "point-series" || !object.parameterStudyOrigin) throw new Error("Missing saved series");
    expect(graph2DParameterStudyStatus(adapter.document(), object.parameterStudyOrigin,
      store.resolve(object.table))).toEqual({ status: "current", reason: null });
    expect(inspectGraph2DCompatibility(adapter.document()).status).toBe("current");
    expect(adapter.document().selection.objectId).toBe(object.id);
    expect(adapter.undo()?.source.objects.some(item => item.id === object.id)).toBe(false);
    expect(adapter.redo()?.source.objects.some(item => item.id === object.id)).toBe(true);

    const reopened = parseMath3DProject(serializeMath3DProject(project(adapter.document())))
      .workspace.entries[0]!.checkpoint as Graph2DDocument;
    const saved = reopened.source.objects.find(item => item.id === object.id);
    if (saved?.kind !== "point-series" || !saved.parameterStudyOrigin) throw new Error("Missing reopened series");
    const reopenedStore = new Graph2DPointTableStore({ read: id => backing.get(id) ?? null,
      write: () => {} });
    expect(reopened.source.parameterStudies).toEqual([recipe]);
    expect(reopenedStore.resolve(saved.table)).toEqual(rows);
    expect(graph2DParameterStudyStatus(reopened, saved.parameterStudyOrigin,
      reopenedStore.resolve(saved.table))).toEqual({ status: "current", reason: null });
    expect(graph2DParameterStudyStatus(reopened, saved.parameterStudyOrigin, null))
      .toEqual({ status: "withheld", reason: "samples-missing" });
    expect(graph2DParameterStudyStatus(reopened, saved.parameterStudyOrigin,
      [{ ...rows[0]!, y: 99 }, ...rows.slice(1)]))
      .toEqual({ status: "withheld", reason: "samples-changed" });

    commit({ type: "update-parameter-study", study: { ...recipe,
      measurement: { kind: "point-value", x: 3 } } });
    expect(graph2DParameterStudyStatus(adapter.document(), origin, store.resolve(table)))
      .toEqual({ status: "withheld", reason: "study-changed" });
    expect(adapter.undo()?.source.parameterStudies).toEqual([recipe]);
    commit({ type: "edit", objectId: recipe.sourceObjectId,
      draft: { label: "Line family", expression: "a*x+2", domain, style } });
    expect(graph2DParameterStudyStatus(adapter.document(), origin, store.resolve(table)))
      .toEqual({ status: "withheld", reason: "source-changed" });
    expect(() => commit({ type: "update-parameter-study", study: { ...recipe,
      range: { min: -1, max: 2, samples: 17 } } })).toThrow(/bounds/);
    expect(() => commit({ type: "update-parameter-study", study: { ...recipe,
      measurement: { kind: "point-value", x: 5 } } })).toThrow(/outside/);
    job.dispose();
  });

  it("cancels cooperatively and refuses a late result after its source changes", async () => {
    const { adapter, commit } = setup();
    let release: (() => void) | null = null;
    let progressed: (() => void) | null = null;
    const reachedProgress = new Promise<void>(resolve => { progressed = resolve; });
    const job = createGraph2DParameterStudyJob({ document: () => adapter.document(),
      yieldControl: () => new Promise<void>(resolve => { release = resolve; }) });
    const handle = job.submit(recipe.id, { onProgress: () => progressed?.() });
    await reachedProgress;
    expect(handle.cancel()).toBe(true);
    release?.();
    const cancelled = await handle.promise;
    expect(cancelled.publication).not.toBe("published");
    expect(cancelled.result).toBeNull();
    expect(job.read(recipe.id)).toBeNull();

    let releaseLate: (() => void) | null = null;
    let progressedLate: (() => void) | null = null;
    const reachedLate = new Promise<void>(resolve => { progressedLate = resolve; });
    const lateJob = createGraph2DParameterStudyJob({ document: () => adapter.document(),
      yieldControl: () => new Promise<void>(resolve => { releaseLate = resolve; }) });
    const late = lateJob.submit(recipe.id, { onProgress: () => progressedLate?.() });
    await reachedLate;
    commit({ type: "parameter-value", name: "a", value: 1.5 });
    releaseLate?.();
    const stale = await late.promise;
    expect(stale.publication).not.toBe("published");
    expect(stale.result).toBeNull();
    expect(lateJob.read(recipe.id)).toBeNull();
    job.dispose(); lateJob.dispose();
  });
});
