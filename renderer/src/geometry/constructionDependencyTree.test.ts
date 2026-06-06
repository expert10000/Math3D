import { describe, expect, it } from "vitest";
import {
  buildConstructionDependencyTree,
  getConstructionDependencyUpdateChain,
  type ConstructionDependencyTreeInputEdge,
  type ConstructionDependencyTreeInputNode,
} from "./constructionDependencyTree";

const nodes: ConstructionDependencyTreeInputNode[] = [
  { id: "scene", label: "Scene", kind: "scene-root", status: "valid" },
  { id: "object:cone", label: "Cone #1", kind: "geometry-object", status: "valid" },
  { id: "object:box", label: "Box #1", kind: "geometry-object", status: "valid" },
  { id: "object:octa", label: "Octahedron #1", kind: "geometry-object", status: "valid" },
  { id: "face:box:3", label: "Face F4", kind: "face-reference", status: "valid" },
  { id: "math:M1", label: "Midpoint M1", kind: "derived-point", status: "valid" },
  { id: "derived:N1", label: "Normal N1", kind: "derived-line", status: "valid" },
  { id: "derived:TP1", label: "Tangent Plane TP1", kind: "derived-plane", status: "valid" },
];

const edges: ConstructionDependencyTreeInputEdge[] = [
  { sourceId: "scene", targetId: "object:cone", relation: "contains" },
  { sourceId: "scene", targetId: "object:box", relation: "contains" },
  { sourceId: "scene", targetId: "object:octa", relation: "contains" },
  { sourceId: "object:box", targetId: "face:box:3", relation: "contains" },
  { sourceId: "object:cone", targetId: "math:M1", relation: "derived-from" },
  { sourceId: "object:box", targetId: "math:M1", relation: "derived-from" },
  { sourceId: "face:box:3", targetId: "derived:N1", relation: "derived-from" },
  { sourceId: "derived:N1", targetId: "derived:TP1", relation: "depends-on" },
];

describe("constructionDependencyTree", () => {
  it("builds a Mathematica-like scene tree with nested construction dependencies", () => {
    const tree = buildConstructionDependencyTree(nodes, edges, "scene");
    expect(tree?.label).toBe("Scene");
    expect(tree?.children.map((child) => child.label)).toEqual(["Cone #1", "Box #1", "Octahedron #1", "Midpoint M1"]);
    const box = tree?.children.find((child) => child.id === "object:box");
    expect(box?.children.map((child) => child.label)).toEqual(["Face F4"]);
    expect(tree?.children.find((child) => child.id === "math:M1")?.children).toEqual([]);
    const face = box?.children.find((child) => child.id === "face:box:3");
    expect(face?.children[0]?.label).toBe("Normal N1");
    expect(face?.children[0]?.children[0]?.label).toBe("Tangent Plane TP1");
  });

  it("orders downstream updates from changed object to dependent constructions", () => {
    const chain = getConstructionDependencyUpdateChain(nodes, edges, "object:box")
      .filter((step) => step.kind !== "face-reference")
      .map((step) => `${step.label} ${step.action}`);

    expect(chain).toEqual([
      "Box #1 changed",
      "Midpoint M1 updated",
      "Normal N1 updated",
      "Tangent Plane TP1 updated",
    ]);
  });
});
