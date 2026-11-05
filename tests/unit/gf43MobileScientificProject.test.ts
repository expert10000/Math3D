import { describe, expect, it } from "vitest";
import { appendProjectDerivedField, applyGraph2DAuthoring,
  createEmptyGraph2DDocument, createGraph2DDocument,
  createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, parseMath3DProject,
  replaceMath3DProjectWorkspace, serializeMath3DProject,
  upsertProjectTemporalFieldSource, verifiedVectorFieldSampler,
  type VectorField3DDocument } from "@math3d/core";
import { createGf23Project, gf23Transfer } from
  "../fixtures/graph-field/gf23Bundle";
import { importMobileProjectPreview } from
  "../../apps/mobile/src/models/mobileProjectPreview";
import { buildMobileProjectExplorer } from
  "../../apps/mobile/src/models/mobileProjectExplorer";
import { serializeMobileProjectPackage } from
  "../../apps/mobile/src/models/mobileProjectResources";

describe("GF-43 mobile Project contract round trip", () => {
  it("retains GF-38–40 IDs and recipes while withholding unverified bundle values", () => {
    let project = createGf23Project();
    const first = project.workspace.entries[0]!.checkpoint as VectorField3DDocument;
    const second = createVectorField3DDocument(first.source,
      { stableKey: "gf43-second-scientific-frame" });
    project = replaceMath3DProjectWorkspace(project,
      createMixedWorkspaceDocument({ ...project.workspace, entries:
        [...project.workspace.entries, { module: "vector3d", checkpoint: second,
          expected: second.identity, replay: null }] }));
    const transfer = gf23Transfer();
    project = appendProjectDerivedField(project, first.identity.id,
      { kind: "q-criterion" }, { stableKey: "gf43-q", title: "Q criterion" },
      source => { verifiedVectorFieldSampler(source, transfer); return true; });
    const transfers = new Map([[first.identity.id, transfer],
      [second.identity.id, transfer]]);
    const time = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "gf43-time", timeUnit: "s", interpolation: "linear",
        transfers });
    project = upsertProjectTemporalFieldSource(project, time, transfers);
    const blank = createEmptyGraph2DDocument("gf43-graph");
    const curve = applyGraph2DAuthoring(blank, { type: "create", draft: {
      label: "Cubic", expression: "x^3",
      domain: { min: -2, max: 2, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid",
        visible: true } } });
    const extended = applyGraph2DAuthoring(
      createGraph2DDocument({ ...curve, stableKey: "gf43-graph" }),
      { type: "create-saved-derivative", sourceObjectId: "function_1",
        order: 2, fallback: "finite-difference", tolerance: 1e-5 });
    const graph = createGraph2DDocument({ ...extended, stableKey: "gf43-graph" });
    project = replaceMath3DProjectWorkspace(project,
      createMixedWorkspaceDocument({ ...project.workspace, entries:
        [...project.workspace.entries, { module: "graph2d",
          checkpoint: graph, expected: graph.identity, replay: null }] }));
    const raw = serializeMath3DProject(project);
    const imported = importMobileProjectPreview(raw, [], "gf43.project.json");
    const explorer = buildMobileProjectExplorer(imported.serializedProject);
    const tensor = explorer.scientificContracts.find(item => item.kind ===
      "Derived q-criterion")!;
    const frames = explorer.scientificContracts.find(item => item.kind ===
      "Moving-surface frame source")!;
    const derivative = explorer.scientificContracts.find(item => item.kind ===
      "Saved derivative curve")!;
    expect(tensor.status).toBe("unverified");
    expect(frames.status).toBe("unverified");
    expect(derivative).toMatchObject({ id: "saved_derivative_1",
      sourceId: "function_1", status: "recipe retained" });
    const returned = parseMath3DProject(importMobileProjectPreview(
      serializeMobileProjectPackage(imported), [], "gf43-return.project-package.json")
      .serializedProject);
    expect(returned.workspace.derivedFields!.some(item =>
      item.identity.id === tensor.id)).toBe(true);
    expect(returned.workspace.timeSources![0]!.identity.id).toBe(frames.id);
    const reopenedGraph = returned.workspace.entries.find(item =>
      item.expected.id === graph.identity.id)!.checkpoint;
    if (reopenedGraph.format !== "math3d.graph2d-document")
      throw new Error("Saved Graph is missing.");
    expect(reopenedGraph.source.objects.find(item => item.kind === "derivative-curve"))
      .toMatchObject({ id: derivative.id, order: 2, fallback: "finite-difference" });
  });
});
