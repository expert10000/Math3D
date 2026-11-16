import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, viewerSourceFromDocument } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { instantiateNotebookStarter } from "./notebookStarters";
import { geometryMeshProjectWorkspace } from "./projectGeometryMeshScope";

describe("focused Geometry–Mesh Project capture", () => {
  it("keeps the exact workbench checkpoints and drops unrelated evidence", () => {
    const base = instantiateNotebookStarter("mesh-geometry-probe", "focused-capture").project.workspace;
    const selected = base.entries.find((entry) => entry.module === "geometry")!;
    const original = createMixedWorkspaceDocument({ ...base, committedSelection: {
      state: "committed", source: viewerSourceFromDocument(selected.checkpoint), entityIds: ["box"],
    } });
    const focused = geometryMeshProjectWorkspace(original);
    expect(focused.entries.map((entry) => entry.module).sort()).toEqual(["geometry", "mesh"]);
    expect(focused.entries.map((entry) => entry.expected)).toEqual(original.entries.filter((entry) =>
      entry.module === "geometry" || entry.module === "mesh").map((entry) => entry.expected));
    expect(focused.activeDocumentIds).toEqual(focused.entries.map((entry) => entry.expected.id));
    expect(focused.committedSelection).toEqual(original.committedSelection);
    expect(focused.results.every((result) => focused.entries.some((entry) =>
      entry.expected.id === result.provenance.source.documentId))).toBe(true);
    expect(focused.results).toEqual(original.results.filter((result) => focused.entries.some((entry) =>
      entry.expected.id === result.provenance.source.documentId)));
    expect(focused.relations.every((relation) => relation.sources.every((source) =>
      focused.entries.some((entry) => entry.expected.id === source.documentId)))).toBe(true);
    expect(verifyMixedWorkspaceReplay(focused).size).toBe(2);
  });
});
