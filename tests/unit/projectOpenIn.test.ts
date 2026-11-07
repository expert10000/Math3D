import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createMath3DProject, createMixedWorkspaceDocument, createGraph2DDocument, parseGraph2DExpression, deriveProjectOpenIn,
  createQuantumSceneDocument, upsertMath3DProjectQuantumScene, replaceMath3DProjectWorkspace,
  instantiateMath3DProjectTemplate, parseMath3DProject, projectOpenInActions,
  projectOpenInReturn, serializeMath3DProject, type Math3DProject,
} from "@math3d/core";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";

const graphOnly = () => {
  const template = instantiateMath3DProjectTemplate("derivative-study", "m3d20-open-in-source");
  const graph = template.workspace.entries.find(item => item.module === "graph2d")!;
  const workspace = createMixedWorkspaceDocument({ entries: [graph], activeDocumentIds: [graph.expected.id],
    constructions: [], results: [], artifacts: [], relations: [], committedSelection: null });
  return { project: createMath3DProject(workspace, { stableKey: "m3d20-open-in", title: "Open in test" }), graph };
};

describe("M3D20-02 qualified Open in", () => {
  it("disables sampled destinations for an undefined Graph profile while retaining exact Curve promotion", () => {
    const parsed = parseGraph2DExpression("1/x");
    if (!parsed.ok) throw new Error("Fixture expression did not parse.");
    const graph = createGraph2DDocument({ stableKey: "open-in-pole", title: "Pole", source: {
      objects: [{ id: "pole", label: "Pole", kind: "explicit-cartesian",
        expression: { source: "1/x", variable: "x", ast: parsed.ast },
        domain: { min: -1, max: 1, includeMin: true, includeMax: true } }], variables: [], assumptions: [] } });
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "graph2d", checkpoint: graph,
      expected: graph.identity, replay: null }], activeDocumentIds: [graph.identity.id],
      constructions: [], results: [], artifacts: [], relations: [], committedSelection: null });
    const project = createMath3DProject(workspace, { stableKey: "open-in-pole-project", title: "Pole" });
    const actions = projectOpenInActions(project, graph.identity.id);
    expect(actions.map(item => item.enabled)).toEqual([true, false, false]);
    expect(actions[1]?.disabledReason).toMatch(/undefined on its domain/);
    expect(() => deriveProjectOpenIn(project, { ...actions[1]!, enabled: true })).toThrow(/no longer qualified/);
  });

  it("derives Curve, Geometry, and Surface with exact lineage, idempotency, and return after reopen", () => {
    const { project, graph } = graphOnly();
    const actions = projectOpenInActions(project, graph.expected.id);
    expect(actions.map(item => item.targetModule)).toEqual(["curve", "geometry", "surface"]);
    expect(actions.every(item => item.enabled && item.sourceObjectId)).toBe(true);
    const first = deriveProjectOpenIn(project, actions[0]!);
    const second = deriveProjectOpenIn(first.project, actions[1]!);
    const third = deriveProjectOpenIn(second.project, actions[2]!);
    expect(first.existing).toBe(false);
    expect(deriveProjectOpenIn(second.project, actions[0]!).existing).toBe(true);
    expect(deriveProjectOpenIn(third.project, actions[2]!).existing).toBe(true);
    const reopened = parseMath3DProject(serializeMath3DProject(third.project));
    expect(reopened.workspace.relations).toHaveLength(3);
    for (const result of [first, second, third]) {
      const returned = projectOpenInReturn(reopened, result.targetDocumentId);
      expect(returned).toMatchObject({ sourceDocumentId: graph.expected.id, exact: true,
        relationId: result.relationId });
      expect(reopened.workspace.entries.find(item => item.expected.id === result.targetDocumentId)?.module)
        .toBe(result.targetModule);
    }
    expect(project.workspace.entries).toHaveLength(1);
  });

  it("refuses stale or forged choices without changing Project bytes", () => {
    const { project, graph } = graphOnly();
    const choice = projectOpenInActions(project, graph.expected.id)[0]!;
    const before = serializeMath3DProject(project);
    expect(() => deriveProjectOpenIn(project, { ...choice,
      source: { ...choice.source, generation: choice.source.generation + 1 } })).toThrow(/changed/);
    expect(() => deriveProjectOpenIn(project, { ...choice, targetModule: "mesh" })).toThrow(/qualified/);
    expect(serializeMath3DProject(project)).toBe(before);
    expect(projectOpenInReturn(project, graph.expected.id)).toBeNull();
  });

  it("marks a historical source generation and refuses an exact return", () => {
    const { project, graph } = graphOnly();
    const derived = deriveProjectOpenIn(project, projectOpenInActions(project, graph.expected.id)[0]!);
    const current = structuredClone(derived.project) as Math3DProject;
    const relation = current.workspace.relations[0]!;
    const targetId = derived.targetDocumentId;
    // A historical relation can be inspected without pretending its current source is exact.
    const historical = { ...current, workspace: { ...current.workspace,
      relations: [{ ...relation, sources: [{ ...relation.sources[0]!, generation: relation.sources[0]!.generation + 1 }] }] } } as Math3DProject;
    expect(projectOpenInReturn(historical, targetId)).toMatchObject({ exact: false });
  });

  it("qualifies Surface only with a host sampler and keeps other routes explicit", () => {
    const mixed = mobileMixedProjectFixture().project;
    const surface = mixed.workspace.entries.find(item => item.module === "surface")!;
    expect(projectOpenInActions(mixed, surface.expected.id)).toMatchObject([{ enabled: false,
      disabledReason: expect.stringContaining("sampler") }]);
    expect(projectOpenInActions(mixed, surface.expected.id, { surfaceMesh: { available: true, reason: null } }))
      .toMatchObject([{ id: "surface.tessellate-saved", enabled: true, targetModule: "mesh" }]);
    const mesh = mixed.workspace.entries.find(item => item.module === "mesh")!;
    expect(projectOpenInActions(mixed, mesh.expected.id)).toMatchObject([{ enabled: false,
      sourceModule: "mesh", disabledReason: expect.stringContaining("buffers") }]);
    const legacy = parseMath3DProject(readFileSync(new URL("../fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url), "utf8"));
    const field = legacy.workspace.entries.find(item => item.module === "vector3d")!;
    expect(projectOpenInActions(legacy, field.expected.id)).toMatchObject([{ enabled: false,
      targetModule: "graph2d", disabledReason: expect.stringContaining("qualified") }]);
    const quantum = { ...mixed, workspace: { ...mixed.workspace, entries: [{
      ...mixed.workspace.entries[0]!, module: "quantum" as const,
    }] } } as Math3DProject;
    expect(projectOpenInActions(quantum, quantum.workspace.entries[0]!.expected.id)).toMatchObject([{ enabled: false,
      targetModule: "graph2d", disabledReason: expect.stringContaining("qualified") }]);
  });

  it("offers Quantum → Graph only for a linked polyline and verified host", () => {
    const base = graphOnly().project;
    const reference = { format: "quantum-scene/v1" as const, title: "Reciprocal path",
      directory: "C:\\scene.qscene", sceneFingerprint: "a".repeat(64) };
    const scene = createQuantumSceneDocument({ sceneSchema: "quantum-scene/v1", sceneId: "k-path",
      sceneFingerprint: reference.sceneFingerprint,
      provenance: { runId: "run-1", model: "qwz", resultSha256: "b".repeat(64),
        engine: "QuTiP", engineVersion: "5", adapter: "qvis/1" },
      coordinates: { axes: ["kx", "ky", "value"], units: ["1", "1", "1"], handedness: "right" },
      datasets: [{ id: "positions", sha256: "c".repeat(64), count: 2, components: 3, unit: "1", bytes: 48 }],
      objects: [{ id: "path", kind: "polyline", label: "Path" }] }, reference.directory, reference.title);
    const linked = upsertMath3DProjectQuantumScene(base, reference);
    const project = replaceMath3DProjectWorkspace(linked, createMixedWorkspaceDocument({ ...linked.workspace,
      entries: [...linked.workspace.entries, { module: "quantum", checkpoint: scene, expected: scene.identity, replay: null }],
      activeDocumentIds: [...linked.workspace.activeDocumentIds, scene.identity.id] }));
    expect(projectOpenInActions(project, scene.identity.id)).toMatchObject([
      { enabled: false, disabledReason: expect.stringContaining("verifier") },
      { enabled: false, disabledReason: expect.stringContaining("verifier") }]);
    expect(projectOpenInActions(project, scene.identity.id, { quantumGraph: { available: true, reason: null } }))
      .toMatchObject([{ id: "quantum.promote-graph2d", enabled: true, targetModule: "graph2d" },
        { id: "quantum.promote-curve", enabled: true, targetModule: "curve" }]);
    const unlinked = { ...project, quantumScenes: [] } as Math3DProject;
    expect(projectOpenInActions(unlinked, scene.identity.id, { quantumGraph: { available: true, reason: null } }))
      .toMatchObject([{ enabled: false, disabledReason: expect.stringContaining("not linked") },
        { enabled: false, disabledReason: expect.stringContaining("not linked") }]);
    const noPolyline = { ...project, workspace: { ...project.workspace,
      entries: project.workspace.entries.map(entry => entry.module === "quantum" ? {
        ...entry, checkpoint: { ...entry.checkpoint, source: { ...entry.checkpoint.source,
          objects: [] } },
      } : entry) } } as Math3DProject;
    expect(projectOpenInActions(noPolyline, scene.identity.id, { quantumGraph: { available: true, reason: null } }))
      .toMatchObject([{ enabled: false, disabledReason: expect.stringContaining("no polyline") },
        { enabled: false, disabledReason: expect.stringContaining("no polyline") }]);
  });
});
