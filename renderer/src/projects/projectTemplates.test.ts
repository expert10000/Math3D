import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, MATH3D_PROJECT_TEMPLATES, evaluateGraph2DExpression, evaluateGraph2DPromotionGeometry,
  serializeMath3DProject, type Graph2DDocument, type SurfaceDocument } from "@math3d/core";
import { inspectProjectCompatibility, previewProjectImport } from "./projectTransfer";
import { inspectProjectDependencies } from "./projectDependencies";

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
});
