import { describe, expect, it } from "vitest";
import {
  createMixedWorkspaceDocument,
  instantiateMath3DProjectTemplate,
  serializeMath3DProject,
} from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createNotebookReference, inspectNotebookReference } from "@math3d/workbook";
import { readNotebookProjectContext } from "./notebookProjectContext";

const savedProject = () => instantiateMath3DProjectTemplate("catenary-study", "notebook-context-test");

describe("NOTE02 named Project context", () => {
  it("uses the active Project identity and live source generations", () => {
    const saved = savedProject();
    const graph = saved.workspace.entries.find((entry) => entry.module === "graph2d")!;
    if (graph.checkpoint.format !== "math3d.graph2d-document") throw new Error("Expected Graph document.");
    const reference = createNotebookReference(saved, "document", graph.expected.id);
    const edited = new Graph2DCommandAdapter(graph.checkpoint).commitScene({
      source: { ...graph.checkpoint.source, objects: [] },
      display: { ...graph.checkpoint.display, objects: [] },
      selection: { objectId: null, probe: null },
    }, "delete");
    const live = createMixedWorkspaceDocument({
      ...saved.workspace,
      entries: saved.workspace.entries.map((entry) => entry.expected.id === graph.expected.id
        ? { ...entry, checkpoint: edited, expected: edited.identity }
        : entry),
    });
    const context = readNotebookProjectContext(saved, serializeMath3DProject(saved), () => live);
    expect(context?.live).toBe(true);
    expect(context?.project.identity.id).toBe(saved.identity.id);
    expect(inspectNotebookReference(context!.project, reference).status).toBe("stale");
    expect(inspectNotebookReference(saved, reference).status).toBe("current");
  });

  it("does not relabel another active workspace as the saved Project", () => {
    const saved = savedProject();
    const unrelated = instantiateMath3DProjectTemplate("catenary-study", "unrelated-context");
    const context = readNotebookProjectContext(unrelated, serializeMath3DProject(saved), () => {
      throw new Error("Unrelated workspace must not be captured.");
    });
    expect(context).toMatchObject({ live: false, project: { identity: { id: saved.identity.id } } });
    expect(readNotebookProjectContext(saved, null, () => saved.workspace)).toBeNull();
  });
});
