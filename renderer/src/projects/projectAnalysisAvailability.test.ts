import { describe, it, expect } from "vitest";
import { setProjectDocumentMetadata } from "@math3d/core";
import raw from "./examples/samsung-projects.json?raw";
import { prepareProjectExampleCollection } from "./projectExampleCollection";
import { projectAnalysisAvailability } from "./projectAnalysisAvailability";

const examples = prepareProjectExampleCollection(raw);
describe("project analysis entry points", () => {
  it("distinguishes native custom Surface analysis from saved-source numerical Mesh analysis", () => {
    for (const [title, route] of [["Helicoid", "surface"], ["Enneper Study", "surface-mesh"], ["Implicit Sphere", "surface-mesh"]]) {
      const example = examples.find(item => item.project.metadata.title === title)!;
      const items = projectAnalysisAvailability(example.project, { resources: example.resources });
      expect(items[0], title).toMatchObject({ route, reason: null });
      expect(items[0].qualification.length).toBeGreaterThan(20);
    }
  });
  it("does not advertise analysis for archived documents or missing source resources", () => {
    const example = examples.find(item => item.project.metadata.title === "Helicoid")!, id = example.project.workspace.entries[0].expected.id;
    const archived = setProjectDocumentMetadata(example.project, id, { archived: true });
    expect(projectAnalysisAvailability(archived)[0]).toMatchObject({ route: null, reason: expect.stringContaining("Archived") });
    const mixed = examples.find(item => item.project.metadata.title === "PRJ30 Graph Curve Surface Study (Samsung)")!;
    const items = projectAnalysisAvailability(mixed.project);
    expect(items.filter(item => item.module === "mesh").every(item => item.route === null && item.reason?.includes("buffers"))).toBe(true);
    expect(items.filter(item => item.module === "graph2d").some(item => item.reason?.includes("point table"))).toBe(true);
    expect(projectAnalysisAvailability(mixed.project, { resources: mixed.resources }).filter(item => item.module === "mesh").every(item => item.route === "mesh")).toBe(true);
  });
  it("qualifies every bundled document without silently discarding unsupported representations", () => {
    for (const example of examples) {
      const items = projectAnalysisAvailability(example.project, { resources: example.resources });
      expect(items.map(item => item.id), example.project.metadata.title).toEqual(example.project.workspace.entries.map(entry => entry.expected.id));
      for (const item of items) {
        if (item.route) { expect(item.tools.length).toBeGreaterThan(0); expect(item.reason).toBeNull(); }
        else expect(item.reason?.length, item.id).toBeGreaterThan(0);
      }
    }
  });
});
