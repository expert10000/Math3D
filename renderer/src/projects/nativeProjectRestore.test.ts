import { describe, it, expect } from "vitest";
import { createCurveDocument, createSurfaceDocument, createMixedWorkspaceDocument, createMath3DProject, serializeMath3DProject, parseMath3DProject } from "@math3d/core";
import { curveEditorSeed, curveSourceFromEditor, surfaceEditorSeed, surfaceSourceFromEditor } from "./nativeProjectRestore";
import { CurveDocumentAdapter } from "../curveAnalysis/curveDocumentAdapter";
import { SurfaceDocumentAdapter } from "../surfaceAnalysis/surfaceDocumentAdapter";
import { inspectProjectCompatibility } from "./projectTransfer";
export const independentDocuments = () => {
  const curve = createCurveDocument({ stableKey: "independent-curve", source: { representation: "parametric", dimension: 3,
    domain: { parameter: "s", min: -2, max: 3, closed: false, periodic: false }, units: { position: "m", parameter: "s", angle: "rad" }, orientation: { direction: "forward" }, derivatives: null,
    definition: { familyId: "custom-independent", expressions: { x: "s", y: "s*s", z: "sin(s)" }, settings: { untouched: true } }, dependencies: [] }, metadata: { title: "Independent Curve" } });
  const surface = createSurfaceDocument({ stableKey: "independent-surface", source: { representation: "parametric", domain: { kind: "parameter", u: { min: -2, max: 2, label: "u", periodic: false }, v: { min: -1, max: 1, label: "v", periodic: false } }, units: { length: "m" }, orientation: { sign: 1 },
    definition: { familyId: "custom-independent", expressions: { x: "u", y: "v", z: "u*v" }, settings: { untouched: true } }, parameters: { untouched: 7 }, branchPolicy: null }, metadata: { title: "Independent Surface" } });
  const project = createMath3DProject(createMixedWorkspaceDocument({ results: [], artifacts: [], relations: [], constructions: [], committedSelection: null, activeDocumentIds: [curve.identity.id, surface.identity.id], entries: [ { module: "curve", checkpoint: curve, expected: curve.identity, replay: null }, { module: "surface", checkpoint: surface, expected: surface.identity, replay: null } ] }), { stableKey: "independent-project", title: "Independent editors" });
  return { curve, surface, project };
};
describe("independent native project editors", () => {
  it("opens without a Graph and maps existing editor fields without changing source generations", () => {
    const { curve, surface, project } = independentDocuments(), c = curveEditorSeed(curve), s = surfaceEditorSeed(surface);
    expect(inspectProjectCompatibility(project).canOpenWorkspace).toBe(true);
    expect(curveSourceFromEditor(curve.source, c, { tMin: c.min, tMax: c.max, closed: c.closed })).toEqual(curve.source);
    expect(surfaceSourceFromEditor(surface.source, s, s)).toEqual(surface.source);
    expect(parseMath3DProject(serializeMath3DProject(project))).toEqual(project);
  });
  it("edits original identities, retains untouched fields and restores undo/replay", () => {
    const { curve, surface } = independentDocuments(), c = curveEditorSeed(curve), s = surfaceEditorSeed(surface);
    const ca = new CurveDocumentAdapter(curve), sa = new SurfaceDocumentAdapter(surface);
    ca.commitSource(curveSourceFromEditor(curve.source, { ...c, y: "t*t*t" }, { tMin: c.min, tMax: c.max, closed: c.closed }));
    sa.commitSource(surfaceSourceFromEditor(surface.source, { ...s, z: "u*u+v*v" }, s));
    expect(ca.document().identity.id).toBe(curve.identity.id); expect(ca.document().source.definition.expressions?.y).toBe("s*s*s");
    expect(ca.document().source.definition.settings).toEqual(curve.source.definition.settings);
    expect(sa.document().source.parameters).toEqual(surface.source.parameters); expect(sa.document().identity.id).toBe(surface.identity.id);
    const edited = ca.document(); ca.undo(); expect(ca.document().source).toEqual(curve.source); ca.redo(); expect(ca.document().source).toEqual(edited.source);
    expect(CurveDocumentAdapter.fromReplayBundle(ca.replayBundle()).document()).toEqual(ca.document());
    expect(SurfaceDocumentAdapter.fromReplayBundle(sa.replayBundle()).document()).toEqual(sa.document());
  });
  it("keeps unsupported or non-restorable sources as previews", () => {
    const { surface } = independentDocuments();
    expect(() => surfaceEditorSeed({ ...surface, source: { ...surface.source, definition: { ...surface.source.definition, expressions: { x: "preset:x", y: "v", z: "u" } } } })).toThrow();
    expect(() => surfaceEditorSeed({ ...surface, source: { ...surface.source, domain: { kind: "parameter", u: { min: 0, max: 1, periodic: true }, v: { min: 0, max: 1 } } } })).toThrow();
  });
});
