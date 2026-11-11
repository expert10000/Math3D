import { describe, expect, it } from "vitest";
import { createProjectStudyFromDocuments, instantiateMath3DProjectTemplate,
  viewerSourceFromDocument } from "@math3d/core";
import { instantiateNotebookStarter } from "./notebookStarters";
import { addQualifiedStudySurfaceMeshLink } from "./studySurfaceMeshLink";
import { addQualifiedStudyGraphCurveLink } from "./studyGraphCurveLink";
import { addQualifiedStudyCurveSurfaceLink } from "./studyCurveSurfaceLink";
import { curveSurfaceCursorDraft } from "../curveAnalysis/curveSurfaceCursor";
import { savedCurveParameterCursorDraft } from "../curveAnalysis/curveCursor";
import { ScientificCursorBus } from "../components/scientificCursor";
import { projectNativeCursor } from "./projectNativeCursor";
import type { ProjectScientificCursor } from "../components/scientificCursor";

const source = instantiateNotebookStarter("surface-mesh-probe", "native-inspector").project;
const entries = source.workspace.entries;
const study = createProjectStudyFromDocuments(source, "native-inspector", "Physical marker",
  entries.map(entry => entry.expected.id));
const linked = addQualifiedStudySurfaceMeshLink(study, study.workspace.studies![0]!.id);
const surface = entries.find(entry => entry.module === "surface")!.checkpoint;
const mesh = entries.find(entry => entry.module === "mesh")!.checkpoint;
const cursor: ProjectScientificCursor = { kind: "project", source: viewerSourceFromDocument(surface),
  sourceModule: "surface", frame: { kind: "cartesian", frameId: "local",
    axes: ["x", "y", "z"].map(name => ({ name, dimension: "length", unit: "m" })) },
  position: [1, 2, 3], resourceSha256: null, mode: "locked", originViewId: "study:native-inspector",
  sequence: 1 };

describe("native Project cursor inspection", () => {
  it("shows an exact Surface point and a linked Mesh physical marker", () => {
    expect(projectNativeCursor(linked, surface, "surface", cursor)).toMatchObject({
      status: "matched", coordinates: [1, 2, 3], method: "Exact saved source" });
    expect(projectNativeCursor(linked, mesh, "mesh", cursor)).toMatchObject({
      status: "matched", coordinates: [1, 2, 3], method: expect.stringContaining("no element correspondence") });
    expect(projectNativeCursor(study, mesh, "mesh", cursor)).toMatchObject({
      status: "withheld", reason: expect.stringContaining("No current Study mapping") });
  });

  it("withholds a changed target, stale source or incompatible frame", () => {
    const changed = { ...linked, workspace: { ...linked.workspace,
      entries: linked.workspace.entries.map(entry => entry.module === "mesh" ?
        { ...entry, expected: { ...entry.expected, revision: entry.expected.revision + 1 } } : entry) } };
    expect(projectNativeCursor(changed, mesh, "mesh", cursor).status).toBe("withheld");
    expect(projectNativeCursor(linked, mesh, "mesh", { ...cursor,
      source: { ...cursor.source, revision: cursor.source.revision + 1 } }).status).toBe("withheld");
    expect(projectNativeCursor(linked, mesh, "mesh", { ...cursor,
      frame: { ...cursor.frame, frameId: "other" } }).status).toBe("withheld");
  });

  it("projects a promoted Curve parameter to its exact Graph Inspector", () => {
    const template = instantiateMath3DProjectTemplate("derivative-study", "native-graph");
    const graph = template.workspace.entries.find(entry => entry.module === "graph2d")!.checkpoint;
    const curve = template.workspace.entries.find(entry => entry.module === "curve")!.checkpoint;
    if (curve.format !== "math3d.curve-document") throw new Error("Curve fixture unavailable.");
    const staged = createProjectStudyFromDocuments(template, "native-graph", "Graph Curve",
      [graph.identity.id, curve.identity.id]);
    const linked = addQualifiedStudyGraphCurveLink(staged, staged.workspace.studies![0]!.id);
    const draft = savedCurveParameterCursorDraft(curve, 0.5, "study:native-graph");
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const published = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(projectNativeCursor(linked, graph, "graph2d", published)).toMatchObject({
      status: "matched", method: "Qualified Curve promotion" });
    expect(projectNativeCursor(staged, graph, "graph2d", published).status).toBe("withheld");
  });

  it("projects a chart Curve parameter to its exact Surface Inspector", () => {
    const template = instantiateMath3DProjectTemplate("curve-construction-study", "native-chart");
    const surface = template.workspace.entries.find(entry => entry.checkpoint.format === "math3d.surface-document" &&
      entry.checkpoint.metadata.title === "Parameter chart")!.checkpoint;
    const curve = template.workspace.entries.find(entry => entry.checkpoint.format === "math3d.curve-document" &&
      entry.checkpoint.metadata.title === "Curve on chart")!.checkpoint;
    const staged = createProjectStudyFromDocuments(template, "native-chart", "Chart Curve",
      [surface.identity.id, curve.identity.id]);
    const linked = addQualifiedStudyCurveSurfaceLink(staged, staged.workspace.studies![0]!.id);
    const draft = curveSurfaceCursorDraft(linked, curve.identity.id, surface.identity.id, 0.5, "study:native-chart");
    expect(draft.status).toBe("matched");
    if (draft.status !== "matched") return;
    const published = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(projectNativeCursor(linked, surface, "surface", published)).toMatchObject({
      status: "matched", coordinates: [0.5, 0.25], method: "Qualified Curve to Surface chart" });
  });
});
