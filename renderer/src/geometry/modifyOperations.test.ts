import { describe, expect, it } from "vitest";
import {
  GEOMETRY_MODIFY_COMMAND_IDS,
  buildGeometryModifyGroups,
  inferGeometryModifyRepresentation,
  type GeometryModifyContext,
} from "./modifyOperations";
import type { GeometrySemanticEntityKind } from "./semanticSelection";
import { resolveGeometrySemanticObjectType } from "./semanticSelection";

const context = (overrides: Partial<GeometryModifyContext> = {}): GeometryModifyContext => ({
  semanticKind: "body",
  selectionCount: 1,
  representation: "parametric",
  cgalReady: true,
  topologySelection: null,
  ...overrides,
});

const commandsFor = (overrides: Partial<GeometryModifyContext> = {}) =>
  buildGeometryModifyGroups(context(overrides)).flatMap((group) => group.commands);

describe("selection-driven Geometry Modify", () => {
  it("shows body tools for bodies and curve tools for curves instead of one flat inventory", () => {
    const bodyGroups = buildGeometryModifyGroups(context({ semanticKind: "body" }));
    const curveGroups = buildGeometryModifyGroups(context({ semanticKind: "curve" }));

    expect(bodyGroups.map((group) => group.id)).toEqual(["transform", "body"]);
    expect(curveGroups.map((group) => group.id)).toEqual(["transform", "curve"]);
    expect(bodyGroups.flatMap((group) => group.commands).some((entry) => entry.id === "curve-trim")).toBe(false);
    expect(curveGroups.flatMap((group) => group.commands).some((entry) => entry.id === "body-boolean")).toBe(false);
  });

  it("registers every planned curve, surface, body, reference, and discrete-edit command", () => {
    const kinds: GeometrySemanticEntityKind[] = ["body", "surface", "curve", "trim-loop", "point", "construction-role"];
    const visible = new Set(kinds.flatMap((semanticKind) => commandsFor({
      semanticKind,
      topologySelection: semanticKind === "surface" ? "face" : semanticKind === "curve" || semanticKind === "trim-loop" ? "edge" : semanticKind === "point" ? "vertex" : null,
    }).map((entry) => entry.id)));

    expect([...GEOMETRY_MODIFY_COMMAND_IDS].filter((id) => !visible.has(id))).toEqual([]);
    expect(GEOMETRY_MODIFY_COMMAND_IDS).toContain("curve-reparameterize");
    expect(GEOMETRY_MODIFY_COMMAND_IDS).toContain("surface-untrim");
    expect(GEOMETRY_MODIFY_COMMAND_IDS).toContain("body-thicken");
    expect(GEOMETRY_MODIFY_COMMAND_IDS).toContain("reference-project");
    expect(GEOMETRY_MODIFY_COMMAND_IDS).toContain("vertex-weld");
  });

  it("gives every displayed command an availability state and explanation", () => {
    for (const semanticKind of ["body", "surface", "curve", "point", "construction-role"] as const) {
      for (const entry of commandsFor({ semanticKind })) {
        expect(["available", "warning", "unavailable"]).toContain(entry.status);
        expect(entry.explanation.length).toBeGreaterThan(12);
      }
    }
  });

  it("explains missing operands and robust backend fallback", () => {
    const missingOperand = commandsFor({ semanticKind: "body", selectionCount: 1 }).find((entry) => entry.id === "body-boolean");
    const fallback = commandsFor({ semanticKind: "body", selectionCount: 2, cgalReady: false }).find((entry) => entry.id === "body-boolean");
    const robust = commandsFor({ semanticKind: "body", selectionCount: 2, cgalReady: true }).find((entry) => entry.id === "body-boolean");

    expect(missingOperand).toMatchObject({ status: "warning" });
    expect(missingOperand?.explanation).toContain("1 of 2");
    expect(fallback).toMatchObject({ status: "warning", backend: "cgal" });
    expect(fallback?.explanation).toContain("CGAL");
    expect(robust).toMatchObject({ status: "warning", backend: "cgal" });
  });

  it("keeps direct topology edits in an expandable discrete group", () => {
    const faceGroup = buildGeometryModifyGroups(context({ semanticKind: "surface", representation: "sampled-mesh", topologySelection: "face" }))
      .find((group) => group.id === "discrete");
    const vertexGroup = buildGeometryModifyGroups(context({ semanticKind: "point", representation: "sampled-mesh", selectionCount: 2, topologySelection: "vertex" }))
      .find((group) => group.id === "discrete");

    expect(faceGroup?.discrete).toBe(true);
    expect(faceGroup?.commands.map((entry) => entry.id)).toEqual([
      "face-extrude",
      "face-inset",
      "face-delete",
      "face-subdivide",
    ]);
    expect(vertexGroup?.commands.find((entry) => entry.id === "vertex-weld")).toMatchObject({ status: "available" });
  });

  it("classifies scene representations without relabeling mesh data as exact", () => {
    expect(inferGeometryModifyRepresentation({ objectType: "mesh" })).toBe("sampled-mesh");
    expect(inferGeometryModifyRepresentation({ objectType: "constructed", constructionKind: "curve-nurbs" })).toBe("parametric");
    expect(inferGeometryModifyRepresentation({ objectType: "plane", constructionRole: "reference" })).toBe("reference");
    expect(resolveGeometrySemanticObjectType("constructed", { constructionKind: "curve-nurbs" })).toBe("curve-nurbs");
  });
});
