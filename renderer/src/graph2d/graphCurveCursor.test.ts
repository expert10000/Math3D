import { describe, expect, it } from "vitest";
import { advanceDocumentIdentity, createGraph2DDocument, instantiateMath3DProjectTemplate, replaceCurveDocumentSource,
  viewerSourceFromDocument } from "@math3d/core";
import { ScientificCursorBus } from "../components/scientificCursor";
import { curveParameterFrame } from "../curveAnalysis/curveCursor";
import { currentGraphCurvePair, projectCurveParameterToGraph } from "./graphCurveCursor";

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
});
