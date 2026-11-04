import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advanceDocumentIdentity, createMixedWorkspaceDocument, parseMath3DProject,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument, serializeMath3DProject,
  vectorField3DExpression, type Math3DProject,
} from "@math3d/core";
import { createDerivedFieldProfileJob } from "@math3d/kernel";

const fixture = new URL("../../../tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));
const profileId = load().workspace.derivedFields![2]!.identity.id;

const changeSource = (project: Math3DProject): Math3DProject => {
  const workspace = createMixedWorkspaceDocument({ ...project.workspace,
    entries: project.workspace.entries.map(entry => {
      if (entry.module !== "vector3d" || entry.checkpoint.format !== "math3d.vector-field3d-document") return entry;
      const field = entry.checkpoint.source.field;
      if (field.kind !== "expressions") throw new TypeError("Wrong fixture field.");
      const changed = reviseVectorField3DDocument(entry.checkpoint, { ...entry.checkpoint.source,
        field: { ...field, components: [vectorField3DExpression("2*x", "m/s"),
          field.components[1], field.components[2]] } });
      return { ...entry, checkpoint: changed, expected: changed.identity };
    }) });
  return replaceMath3DProjectWorkspace(project, workspace);
};
const changeRecipe = (project: Math3DProject): Math3DProject => {
  const workspace = createMixedWorkspaceDocument({ ...project.workspace,
    derivedFields: project.workspace.derivedFields!.map(document => {
      if (document.identity.id !== profileId || document.operation.kind !== "line-profile") return document;
      const operation = { ...document.operation, samples: 9 };
      return { ...document, operation, identity: advanceDocumentIdentity(document.identity,
        { input: document.input, operation, output: document.output }) };
    }) });
  return replaceMath3DProjectWorkspace(project, workspace);
};

describe("GF-04 brokered derived profile execution", () => {
  it("computes bounded physical samples, reports progress, and gates both readers on reopen", async () => {
    let project = load(), verified = true;
    const job = createDerivedFieldProfileJob({ project: () => project,
      verifySource: document => verified && document.source.field.kind === "expressions" });
    const progress: number[] = [], events: string[] = [];
    const unsubscribe = job.subscribe(event => events.push(event.type));
    const capabilities = await job.capabilities();
    expect(capabilities.find(item => item.operation.id === "field.derived-profile")
      ?.availableBackends).toHaveLength(1);
    const outcome = await job.submit(profileId, { jobId: "gf04-profile-1",
      onProgress: completed => progress.push(completed) }).promise;
    expect(outcome.broker.ok).toBe(true);
    expect(outcome.publication).toBe("published");
    const result = outcome.result!;
    expect(result.rows).toHaveLength(17);
    expect(result.axis).toEqual({ name: "x", unit: "m", min: -2, max: 2 });
    expect(result.unit).toBe("m/s");
    for (const row of result.rows)
      expect(row.y).toBeCloseTo(Math.sqrt(row.x ** 2 + 13), 12);
    expect(progress).toEqual([16, 17]);
    expect(events).toContain("scientific-job.progressed");
    expect(events).toContain("scientific-job.completed");
    const explorer = job.read(profileId), graphs = job.read(profileId);
    expect(explorer).toEqual(result);
    expect(graphs).toEqual(explorer);
    project = parseMath3DProject(serializeMath3DProject(project));
    verified = false;
    expect(job.read(profileId)).toBeNull();
    expect(() => job.submit(profileId, { jobId: "gf04-unverified" })).toThrow(/verified/);
    verified = true;
    expect(job.read(profileId)).toEqual(result);
    unsubscribe(); job.dispose();
  });

  it("withholds a result when its source changes during execution", async () => {
    let project = load();
    const job = createDerivedFieldProfileJob({ project: () => project,
      verifySource: () => true });
    const outcome = await job.submit(profileId, { jobId: "gf04-stale-source",
      onProgress: () => { project = changeSource(project); } }).promise;
    expect(outcome.publication).toBe("failed");
    expect(outcome.broker).toMatchObject({ ok: false, code: "stale-source" });
    expect(job.read(profileId)).toBeNull();
    job.dispose();
  });

  it("withholds a completed job if the GF-03 recipe changes before publication", async () => {
    let project = load();
    const job = createDerivedFieldProfileJob({ project: () => project,
      verifySource: () => true,
      yieldControl: async () => { project = changeRecipe(project); } });
    const outcome = await job.submit(profileId, { jobId: "gf04-stale-recipe" }).promise;
    expect(outcome.broker.ok).toBe(true);
    expect(outcome.publication).toBe("stale-recipe");
    expect(job.read(profileId)).toBeNull();
    job.dispose();
  });

  it("keeps a newer result when an earlier job is cancelled and resolves late", async () => {
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const job = createDerivedFieldProfileJob({ project: load,
      verifySource: () => true,
      yieldControl: async id => { if (id === "gf04-old") { reached(); await gate; } } });
    const old = job.submit(profileId, { jobId: "gf04-old" });
    await entered;
    const newer = await job.submit(profileId, { jobId: "gf04-new" }).promise;
    expect(newer.publication).toBe("published");
    const current = job.read(profileId);
    expect(old.cancel()).toBe(true);
    const cancelled = await old.promise;
    expect(cancelled.broker).toMatchObject({ ok: false, code: "cancelled" });
    expect(cancelled.result).toBeNull();
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(job.read(profileId)).toEqual(current);
    job.dispose();
  });

  it("withholds an older successful job that finishes after a newer publication", async () => {
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const job = createDerivedFieldProfileJob({ project: load, verifySource: () => true,
      yieldControl: async id => { if (id === "gf04-older") { reached(); await gate; } } });
    const older = job.submit(profileId, { jobId: "gf04-older" });
    await entered;
    const newer = await job.submit(profileId, { jobId: "gf04-newer" }).promise;
    expect(newer.publication).toBe("published");
    release();
    const late = await older.promise;
    expect(late.broker.ok).toBe(true);
    expect(late.publication).toBe("superseded");
    expect(late.result).toBeNull();
    expect(job.read(profileId)).toEqual(newer.result);
    job.dispose();
  });

  it("enforces the broker deadline while a sample batch is stalled", async () => {
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const job = createDerivedFieldProfileJob({ project: load, verifySource: () => true,
      yieldControl: async () => { reached(); await gate; } });
    const handle = job.submit(profileId, { jobId: "gf04-deadline", timeoutMs: 500 });
    await entered;
    const outcome = await handle.promise;
    expect(outcome.broker.ok).toBe(false);
    if (outcome.broker.ok) throw new Error("Expected deadline failure.");
    expect([outcome.broker.code, outcome.broker.scientificFailure?.code])
      .toContain("deadline-exceeded");
    expect(outcome.result).toBeNull();
    release();
    expect(job.read(profileId)).toBeNull();
    job.dispose();
  });
});
