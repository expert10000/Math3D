import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, replaceCurveDocumentSource, replaceSurfaceDocumentSource,
  viewerSourceFromDocument } from "@math3d/core";
import { ScientificCursorBus } from "../components/scientificCursor";
import { curveParameterFrame } from "./curveCursor";
import { currentCurveSurfacePair, curveSurfaceCursorDraft, projectCurveSurfaceParameter } from "./curveSurfaceCursor";

const project = instantiateMath3DProjectTemplate("curve-construction-study", "cursor-chart");
const chart = project.workspace.entries.find(entry => entry.checkpoint.format === "math3d.surface-document" &&
  entry.checkpoint.metadata.title === "Parameter chart")!.checkpoint;
const trace = project.workspace.entries.find(entry => entry.checkpoint.format === "math3d.curve-document" &&
  entry.checkpoint.metadata.title === "Curve on chart")!.checkpoint;
if (chart.format !== "math3d.surface-document" || trace.format !== "math3d.curve-document") throw Error("Fixture");
const source = viewerSourceFromDocument(trace);
const cursor = new ScientificCursorBus().publishProject({ source, sourceModule: "curve", frame: curveParameterFrame(trace),
  position: [0.5], resourceSha256: null, mode: "locked", originViewId: "curve-probe" }, source);

describe("M3D20-03 Curve-on-Surface cursor", () => {
  it("uses an exact saved relation to map t into the bounded Surface chart", () => {
    expect(currentCurveSurfacePair(project, trace.identity.id, chart.identity.id)).toEqual({ curve: trace, surface: chart });
    expect(projectCurveSurfaceParameter(cursor, project, chart.identity.id)).toEqual({ status: "matched", value: { u: 0.5, v: 0.25 } });
  });
  it("refuses a stale Curve, stale Surface, missing relation and wrong parameter frame", () => {
    const editedCurve = replaceCurveDocumentSource(trace, { ...trace.source, definition: {
      ...trace.source.definition, expressions: { u: "t", v: "t*t*t" } } });
    const editedSurface = replaceSurfaceDocumentSource(chart, { ...chart.source, definition: {
      ...chart.source.definition, expressions: { x: "u", y: "v", z: "u-v" } } });
    const changed = (entry: typeof project.workspace.entries[number]["checkpoint"]) => ({ ...project, workspace: {
      ...project.workspace, entries: project.workspace.entries.map(item => item.expected.id === entry.identity.id ?
        { ...item, checkpoint: entry, expected: entry.identity, replay: null } : item),
    } });
    expect(projectCurveSurfaceParameter(cursor, changed(editedCurve), chart.identity.id).status).toBe("incompatible-source");
    expect(projectCurveSurfaceParameter(cursor, changed(editedSurface), chart.identity.id).status).toBe("incompatible-source");
    expect(projectCurveSurfaceParameter(cursor, { ...project, workspace: { ...project.workspace, relations: [] } }, chart.identity.id).status).toBe("incompatible-source");
    expect(projectCurveSurfaceParameter({ ...cursor, frame: { ...cursor.frame, frameId: "other" } }, project, chart.identity.id).status).toBe("incompatible-source");
  });
  it("refuses extrapolation and unsupported chart expressions", () => {
    expect(projectCurveSurfaceParameter({ ...cursor, position: [2] }, project, chart.identity.id).status).toBe("outside");
    const chartCursor = { ...cursor, position: [1] };
    expect(projectCurveSurfaceParameter(chartCursor, project, chart.identity.id)).toEqual({ status: "matched", value: { u: 1, v: 1 } });
  });
  it("publishes a saved Curve parameter only when the linked chart can receive it", () => {
    const draft = curveSurfaceCursorDraft(project, trace.identity.id, chart.identity.id, 0.75, "saved-curve");
    expect(draft.status).toBe("matched");
    if (draft.status !== "matched") return;
    const shared = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(projectCurveSurfaceParameter(shared, project, chart.identity.id)).toEqual({ status: "matched", value: { u: 0.75, v: 0.5625 } });
    expect(curveSurfaceCursorDraft(project, trace.identity.id, chart.identity.id, 2, "saved-curve").status).toBe("outside");
  });
});
