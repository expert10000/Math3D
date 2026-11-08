import { describe, expect, it } from "vitest";
import { advanceDocumentIdentity, createGraph2DDocument, createMath3DProject, createMixedWorkspaceDocument,
  instantiateMath3DProjectTemplate, parseGraph2DExpression, promoteGraph2DToCurve, replaceCurveDocumentSource,
  viewerSourceFromDocument } from "@math3d/core";
import { ScientificCursorBus } from "../components/scientificCursor";
import { curveParameterFrame } from "../curveAnalysis/curveCursor";
import { currentGraphCurvePair, graphProbeCurveCursorDraft, projectCurveParameterToGraph } from "./graphCurveCursor";

const project = instantiateMath3DProjectTemplate("derivative-study", "graph-curve-cursor");
const graph = project.workspace.entries.find(entry => entry.module === "graph2d")!.checkpoint;
const curve = project.workspace.entries.find(entry => entry.module === "curve")!.checkpoint;
if (graph.format !== "math3d.graph2d-document" || curve.format !== "math3d.curve-document") throw Error("Fixture");
const source = viewerSourceFromDocument(curve);
const cursor = new ScientificCursorBus().publishProject({ source, sourceModule: "curve", frame: curveParameterFrame(curve),
  position: [2], resourceSha256: null, mode: "locked", originViewId: "curve-probe" }, source);

describe("M3D20-03 Graph promotion cursor", () => {
  it("projects a promoted Curve parameter to its original Graph object", () => {
    expect(currentGraphCurvePair(project, graph.identity.id, curve.identity.id)?.object.id).toBe("profile");
    expect(projectCurveParameterToGraph(cursor, project, graph.identity.id, "profile")).toEqual({
      status: "matched", value: { objectId: "profile", x: 2, y: 4 },
    });
  });
  it("refuses wrong object, frame, domain, relation and edited source generations", () => {
    expect(projectCurveParameterToGraph(cursor, project, graph.identity.id, "other").status).toBe("incompatible-source");
    expect(projectCurveParameterToGraph({ ...cursor, frame: { ...cursor.frame, frameId: "other" } },
      project, graph.identity.id, "profile").status).toBe("incompatible-source");
    expect(projectCurveParameterToGraph({ ...cursor, position: [4] }, project, graph.identity.id, "profile").status).toBe("outside");
    expect(projectCurveParameterToGraph(cursor, { ...project, workspace: { ...project.workspace, relations: [] } },
      graph.identity.id, "profile").status).toBe("incompatible-source");
    const changedCurve = replaceCurveDocumentSource(curve, { ...curve.source, definition: {
      ...curve.source.definition, expressions: { x: "x", y: "x^3" } } });
    const graphSource = { ...graph.source, variables: [{ name: "a", value: 2 }] };
    const changedGraph = createGraph2DDocument({ source: graphSource,
      identity: advanceDocumentIdentity(graph.identity, graphSource), title: graph.metadata.title });
    const withEntry = (document: typeof changedCurve | typeof changedGraph) => ({ ...project, workspace: {
      ...project.workspace, entries: project.workspace.entries.map(entry => entry.expected.id === document.identity.id ?
        { ...entry, checkpoint: document, expected: document.identity, replay: null } : entry),
    } });
    expect(projectCurveParameterToGraph(cursor, withEntry(changedCurve), graph.identity.id, "profile").status).toBe("incompatible-source");
    expect(projectCurveParameterToGraph(cursor, withEntry(changedGraph), graph.identity.id, "profile").status).toBe("incompatible-source");
  });
  it("returns a checked Graph probe to the promoted Curve without guessing a point", () => {
    const result = graphProbeCurveCursorDraft(project, graph.identity.id, curve.identity.id,
      { objectId: "profile", x: 2, y: 4 }, "graphs-probe");
    expect(result).toMatchObject({ status: "matched", value: { position: [2], sourceModule: "curve" } });
    if (result.status === "matched") {
      const shared = new ScientificCursorBus().publishProject(result.value, result.value.source);
      expect(projectCurveParameterToGraph(shared, project, graph.identity.id, "profile").status).toBe("matched");
    }
    expect(graphProbeCurveCursorDraft(project, graph.identity.id, curve.identity.id,
      { objectId: "profile", x: 2, y: 5 }, "graphs-probe").status).toBe("outside");
    expect(graphProbeCurveCursorDraft(project, graph.identity.id, curve.identity.id,
      { objectId: "other", x: 2, y: 4 }, "graphs-probe").status).toBe("incompatible-source");
  });
  it("maps a parametric Graph and respects excluded endpoints", () => {
    const ast = (source: string) => {
      const parsed = parseGraph2DExpression(source, ["t"]);
      if (!parsed.ok) throw Error("Invalid fixture expression");
      return parsed.ast;
    };
    const sourceGraph = createGraph2DDocument({ stableKey: "parametric-cursor", source: { objects: [{
      id: "trace", kind: "parametric", label: "trace",
      xExpression: { source: "t", variable: "t", ast: ast("t") },
      yExpression: { source: "t*t", variable: "t", ast: ast("t*t") },
      domain: { min: 0, max: 1, includeMin: false, includeMax: true },
    }], variables: [], assumptions: [] } });
    const promoted = promoteGraph2DToCurve(sourceGraph, "trace");
    const workspace = createMixedWorkspaceDocument({ entries: [
      { module: "graph2d", checkpoint: sourceGraph, expected: sourceGraph.identity, replay: null },
      { module: "curve", checkpoint: promoted.document, expected: promoted.document.identity, replay: null },
    ], activeDocumentIds: [sourceGraph.identity.id], constructions: [], results: [], relations: [promoted.relation],
    artifacts: [], committedSelection: null });
    const study = createMath3DProject(workspace, { stableKey: "parametric-cursor" });
    const draft = graphProbeCurveCursorDraft(study, sourceGraph.identity.id, promoted.document.identity.id,
      { objectId: "trace", x: 0.5, y: 0.25, parameter: 0.5 }, "graphs-probe");
    expect(draft.status).toBe("matched");
    if (draft.status === "matched") {
      const shared = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
      expect(projectCurveParameterToGraph(shared, study, sourceGraph.identity.id, "trace")).toEqual({
        status: "matched", value: { objectId: "trace", x: 0.5, y: 0.25, parameter: 0.5 },
      });
      expect(projectCurveParameterToGraph({ ...shared, position: [0] }, study, sourceGraph.identity.id, "trace").status).toBe("outside");
    }
    expect(graphProbeCurveCursorDraft(study, sourceGraph.identity.id, promoted.document.identity.id,
      { objectId: "trace", x: 0.5, y: 0.3, parameter: 0.5 }, "graphs-probe").status).toBe("outside");
  });
});
