import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, MATH3D_PROJECT_TEMPLATES, evaluateGraph2DExpression, evaluateGraph2DPromotionGeometry,
  geometryDocumentToSceneDocument, inspectProjectNoteAnchor, serializeMath3DProject,
  type GeometryDocument, type Graph2DDocument, type SurfaceDocument } from "@math3d/core";
import { inspectProjectCompatibility, previewProjectImport } from "./projectTransfer";
import { inspectProjectDependencies } from "./projectDependencies";
import { additionalRepresentationView, type AdditionalDocument } from "./additionalProjectRepresentations";
import { projectNoteSourceResolver } from "./projectNoteTargets";
import { resolveGeometryProjectNotePins } from "./projectNotePins";

describe("PRJ07 scientific starter projects", () => {
  it("creates independent containers, documents, results and lineage without sharing mutable source", () => {
    const first = instantiateMath3DProjectTemplate("catenary-study", "first"), second = instantiateMath3DProjectTemplate("catenary-study", "second");
    expect(first.identity.id).not.toBe(second.identity.id);
    const ids = new Set(first.workspace.entries.map((entry) => entry.expected.id));
    expect(second.workspace.entries.every((entry) => !ids.has(entry.expected.id))).toBe(true);
    expect(first.workspace.results[0]!.resultId).not.toBe(second.workspace.results[0]!.resultId);
    expect(first.workspace.relations.map((relation) => relation.relationId)).not.toEqual(second.workspace.relations.map((relation) => relation.relationId));
    const before = serializeMath3DProject(second), graph = first.workspace.entries[0]!.checkpoint as Graph2DDocument;
    (graph.source.objects as unknown as { label: string }[])[0]!.label = "Independent edit";
    expect(serializeMath3DProject(second)).toBe(before);
    expect(instantiateMath3DProjectTemplate("catenary-study", "second").workspace.entries).toEqual(second.workspace.entries);
  });
  it("uses a bounded catenary source and a real catenoid promotion with qualified analysis", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "math"), graph = project.workspace.entries[0]!.checkpoint as Graph2DDocument;
    const object = graph.source.objects[0]!;
    if (object.kind !== "explicit-cartesian") throw new Error("Expected a profile");
    for (const x of [-1.5, 0, 1.5]) {
      const value = evaluateGraph2DExpression(object.expression.ast, { x });
      expect(value.ok).toBe(true); if (value.ok) expect(value.value).toBeCloseTo(Math.cosh(x), 12);
    }
    expect(evaluateGraph2DPromotionGeometry(project.workspace.entries[2]!.checkpoint as SurfaceDocument).positions.length).toBeGreaterThan(0);
    expect(project.workspace.results[0]!.status).toBe("numerical");
    expect(inspectProjectDependencies(project).relations.every((relation) => relation.freshness === "current")).toBe(true);
    expect(inspectProjectCompatibility(project).canOpenWorkspace).toBe(true);
    expect(project.workspace.entries.map((entry) => entry.module)).toEqual(["graph2d", "curve", "surface"]);
    expect(project.workspace.artifacts).toEqual([]);
  });
  it("round trips every built-in recipe without requiring an external engine or executable template input", () => {
    for (const template of MATH3D_PROJECT_TEMPLATES) {
      const project = instantiateMath3DProjectTemplate(template.id, "portable");
      expect(previewProjectImport(serializeMath3DProject(project)).project).toEqual(project);
    }
    for (const token of ["", " ", " trailing ", "a".repeat(161)]) expect(() => instantiateMath3DProjectTemplate("catenary-study", token)).toThrow();
    expect(() => instantiateMath3DProjectTemplate("unknown", "fresh")).toThrow("Unknown");
  });
  it.each(["spline-surface-lab", "curve-construction-study", "scene-topology-study"])("qualifies %s with independent identities and complete source inputs", (id) => {
    const project = instantiateMath3DProjectTemplate(id, "first"), second = instantiateMath3DProjectTemplate(id, "second");
    expect(inspectProjectCompatibility(project).canOpenWorkspace).toBe(true);
    expect(inspectProjectDependencies(project).relations.every((relation) => relation.freshness === "current")).toBe(true);
    const ids = new Set(project.workspace.entries.map((entry) => entry.expected.id));
    expect(second.workspace.entries.every((entry) => !ids.has(entry.expected.id))).toBe(true);
    expect(project.workspace.results).toEqual([]); expect(project.workspace.artifacts).toEqual([]);
    const context = { documents: new Map(project.workspace.entries.map((entry) => [entry.expected.id, entry.checkpoint])) };
    for (const entry of project.workspace.entries) expect(additionalRepresentationView(entry.checkpoint as AdditionalDocument, context).sampleCount).toBeGreaterThan(0);
  });
  it("checks starter spline, sphere, construction and incidence measurements against independent expectations", () => {
    const view = (id: string, title: string) => {
      const project = instantiateMath3DProjectTemplate(id, "oracle"), entry = project.workspace.entries.find((entry) => project.metadata.documents[entry.expected.id]?.title === title)!;
      return additionalRepresentationView(entry.checkpoint as AdditionalDocument, { documents: new Map(project.workspace.entries.map((entry) => [entry.expected.id, entry.checkpoint])) });
    };
    expect(view("spline-surface-lab", "Weighted spline curve").bounds).toEqual({ min: [0,0,0], max: [2,4/3,0] });
    expect(view("spline-surface-lab", "Rational surface patch").bounds).toEqual({ min: [0,0,0], max: [1,1,1] });
    const sphere = view("spline-surface-lab", "Implicit unit sphere");
    for (const value of sphere.bounds!.max) expect(value).toBeCloseTo(1, 2);
    expect(view("curve-construction-study", "Curve on chart").bounds).toEqual({ min: [0,0,0], max: [1,1,2] });
    expect(view("curve-construction-study", "Profile revolution").bounds!.max[2]).toBeCloseTo(1, 8);
    expect(view("scene-topology-study", "Simplicial triangle").qualification).toContain("3 vertices");
  });
  it("opens the Geometry Notes starter with two current viewport pins", () => {
    const project = instantiateMath3DProjectTemplate("geometry-note-pins", "example");
    const geometry = project.workspace.entries[0]!.checkpoint as GeometryDocument;
    const objects = geometryDocumentToSceneDocument(geometry).objects;
    const pins = resolveGeometryProjectNotePins(project, geometry, objects);
    expect(project.notes).toHaveLength(2);
    expect(Object.fromEntries(pins.map((pin) => [pin.title, pin.position.x]))).toEqual({ "Box top": -2, "Sphere north pole": 2 });
    const resolver = projectNoteSourceResolver(project.identity.id, project.workspace);
    expect(project.notes!.map((note) => inspectProjectNoteAnchor(note, resolver).status)).toEqual(["current", "current"]);
    expect(inspectProjectCompatibility(project).canOpenWorkspace).toBe(true);
  });
  it("includes current Graph and result Notes in the Minimal Surface starter", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "with-notes");
    expect(project.notes).toHaveLength(2);
    const resolver = projectNoteSourceResolver(project.identity.id, project.workspace);
    expect(project.notes!.map((note) => inspectProjectNoteAnchor(note, resolver).status)).toEqual(["current", "current"]);
  });
});
