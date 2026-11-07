import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createMath3DProject, createMixedWorkspaceDocument, deriveProjectOpenIn,
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
  it("derives Curve and Geometry with exact lineage, idempotency, and return after reopen", () => {
    const { project, graph } = graphOnly();
    const actions = projectOpenInActions(project, graph.expected.id);
    expect(actions.map(item => item.targetModule)).toEqual(["curve", "geometry"]);
    expect(actions.every(item => item.enabled && item.sourceObjectId)).toBe(true);
    const first = deriveProjectOpenIn(project, actions[0]!);
    const second = deriveProjectOpenIn(first.project, actions[1]!);
    expect(first.existing).toBe(false);
    expect(deriveProjectOpenIn(second.project, actions[0]!).existing).toBe(true);
    const reopened = parseMath3DProject(serializeMath3DProject(second.project));
    expect(reopened.workspace.relations).toHaveLength(2);
    for (const result of [first, second]) {
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

  it("reports surface, mesh, field, and quantum destinations as unavailable until qualified", () => {
    const mixed = mobileMixedProjectFixture().project;
    for (const module of ["surface", "mesh"] as const) {
      const entry = mixed.workspace.entries.find(item => item.module === module)!;
      expect(projectOpenInActions(mixed, entry.expected.id)).toMatchObject([{ enabled: false,
        sourceModule: module, disabledReason: expect.stringContaining("qualified") }]);
    }
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
});
