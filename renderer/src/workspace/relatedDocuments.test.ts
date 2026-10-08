import { expect, it } from "vitest";
import { instantiateMath3DProjectTemplate } from "@math3d/core";
import { relatedDocuments } from "./relatedDocuments";

it("qualifies a captured source against its live unsaved generation", () => {
  const workspace = instantiateMath3DProjectTemplate("catenary-study", "related-live-source").workspace;
  const graph = workspace.entries.find(entry => entry.module === "graph2d")!;
  const surface = workspace.entries.find(entry => entry.module === "surface")!;
  const live = new Map([[graph.expected.id, { identity: { ...graph.expected, revision: graph.expected.revision + 1, structuralHash: "changed-source" } }]]);
  expect(relatedDocuments(workspace, surface.expected.id).find(item => item.id === graph.expected.id)?.label).not.toContain("captured");
  expect(relatedDocuments(workspace, surface.expected.id, live).find(item => item.id === graph.expected.id)?.label)
    .toContain(`current r${graph.expected.revision + 1} (captured r${graph.expected.revision})`);
});
