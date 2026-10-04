import { describe, expect, it } from "vitest";
import {
  createMixedWorkspaceDocument,
  instantiateMath3DProjectTemplate,
  replaceMath3DProjectWorkspace,
  updateMath3DProjectMetadata,
} from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import {
  createDefaultWorkbook,
  createNotebookReference,
  inspectNotebookReference,
  normalizeNotebookReference,
} from "@math3d/workbook";

const study = () => instantiateMath3DProjectTemplate("catenary-study", "notebook-reference-test");

describe("NOTE01 project-backed notebook references", () => {
  it("keeps exact document and result citations in an existing Workbook without copying source payloads", () => {
    const project = study();
    const graph = project.workspace.entries.find((entry) => entry.module === "graph2d")!;
    const result = project.workspace.results[0]!;
    const graphRef = createNotebookReference(project, "document", graph.expected.id);
    const resultRef = createNotebookReference(project, "result", result.resultId);
    expect(inspectNotebookReference(project, graphRef).status).toBe("current");
    expect(inspectNotebookReference(project, resultRef).status).toBe("current");
    expect(Object.keys(graphRef).sort()).toEqual(["kind", "projectId", "schemaVersion", "source", "targetId"]);
    expect(resultRef.kind === "result" && resultRef.resultHash).toMatch(/^sha256:/);
    expect(JSON.stringify(graphRef)).not.toContain("exp(x)");
    expect(JSON.stringify(resultRef)).not.toContain("summary");

    const workbook = createDefaultWorkbook(() => crypto.randomUUID());
    workbook.stages[0]!.blocks[0]!.notebookReference = graphRef;
    const restored = JSON.parse(JSON.stringify(workbook));
    expect(normalizeNotebookReference(restored.stages[0].blocks[0].notebookReference)).toEqual(graphRef);
    expect(inspectNotebookReference(updateMath3DProjectMetadata(project, { ...project.metadata, title: "Renamed study" }), graphRef).status).toBe("current");
  });

  it("marks both the source and its retained result stale after an edit", () => {
    const project = study();
    const graphEntry = project.workspace.entries.find((entry) => entry.module === "graph2d")!;
    const graph = graphEntry.checkpoint;
    if (graph.format !== "math3d.graph2d-document") throw new Error("Expected a Graph document.");
    const graphRef = createNotebookReference(project, "document", graph.identity.id);
    const resultRef = createNotebookReference(project, "result", project.workspace.results[0]!.resultId);
    const edited = new Graph2DCommandAdapter(graph).commitScene({
      source: { ...graph.source, objects: [] },
      display: { ...graph.display, objects: [] },
      selection: { objectId: null, probe: null },
    }, "delete");
    const workspace = createMixedWorkspaceDocument({
      ...project.workspace,
      entries: project.workspace.entries.map((entry) => entry.expected.id === graph.identity.id
        ? { ...entry, checkpoint: edited, expected: edited.identity }
        : entry),
    });
    const current = replaceMath3DProjectWorkspace(project, workspace);
    expect(inspectNotebookReference(current, graphRef).status).toBe("stale");
    expect(inspectNotebookReference(current, resultRef)).toMatchObject({ status: "stale", result: { resultId: resultRef.targetId } });
    expect(inspectNotebookReference(project, graphRef).status).toBe("current");
  });

  it("rejects invalid IDs, missing targets, and a different project without rebinding by title", () => {
    const project = study();
    const graph = project.workspace.entries.find((entry) => entry.module === "graph2d")!;
    const ref = createNotebookReference(project, "document", graph.expected.id);
    expect(normalizeNotebookReference({ ...ref, extra: "surprise" })).toBeNull();
    expect(normalizeNotebookReference({ ...ref, source: { ...ref.source, revision: 0 } })).toBeNull();
    expect(inspectNotebookReference(project, { ...ref, targetId: "math3d:graph2d:missing", source: { ...ref.source, documentId: "math3d:graph2d:missing" } }).status).toBe("missing");
    expect(inspectNotebookReference(instantiateMath3DProjectTemplate("catenary-study", "another-study"), ref).status).toBe("different-project");
    expect(() => createNotebookReference(project, "result", "absent-result")).toThrow(/not found/);
    const resultRef = createNotebookReference(project, "result", project.workspace.results[0]!.resultId);
    const changed = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace,
      results: project.workspace.results.map((item) => item.resultId === resultRef.targetId
        ? { ...item, summary: { ...item.summary, substituted: true } }
        : item),
    }));
    expect(inspectNotebookReference(changed, resultRef).status).toBe("missing");
  });
});
