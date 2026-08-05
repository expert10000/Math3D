import { describe, expect, it } from "vitest";
import { getAdaptiveTopologyGizmoConfig, mapTopologyGizmoDragToParams } from "./adaptiveTopologyGizmo";

describe("adaptiveTopologyGizmo", () => {
  it("uses edge-specific Mesh handles and actions", () => {
    expect(getAdaptiveTopologyGizmoConfig("Mesh", "Edge")).toMatchObject({
      label: "Edge rail",
      modeLabel: "Slide / bevel",
      handleLabel: "edge tangent handle",
      handleKind: "edge-rail",
      primaryActionLabel: "Split / Bevel",
      statusLabel: "Edge rail: Slide / bevel (edge tangent handle)",
    });
  });

  it("chooses topology handle types from workspace and selection type", () => {
    expect(getAdaptiveTopologyGizmoConfig("Mesh", "Face").handleKind).toBe("normal-axis");
    expect(getAdaptiveTopologyGizmoConfig("Mesh", "Vertex").handleKind).toBe("point");
    expect(getAdaptiveTopologyGizmoConfig("Geometry", "Object").handleKind).toBe("object-transform");
  });

  it("maps face normal drags to extrude and inset params", () => {
    expect(
      mapTopologyGizmoDragToParams({
        workspace: "Mesh",
        selectionType: "Face",
        dragDistance: 0.125,
        referenceLength: 1,
      })
    ).toMatchObject({ operation: "Extrude Face", distance: 0.125, label: "distance=0.125" });

    const inset = mapTopologyGizmoDragToParams({
      workspace: "Mesh",
      selectionType: "Face",
      dragDistance: -0.2,
      referenceLength: 1,
      initialRatio: 0.1,
    });
    expect(inset).toMatchObject({ operation: "Inset Face", label: "ratio=0.3" });
    expect(inset?.operation === "Inset Face" ? inset.ratio : 0).toBeCloseTo(0.3);
  });

  it("maps edge rail and vertex point drags to editable operation params", () => {
    expect(
      mapTopologyGizmoDragToParams({
        workspace: "Mesh",
        selectionType: "Edge",
        operation: "Split Edge",
        dragDistance: 0.25,
        referenceLength: 2,
        initialRatio: 0.5,
      })
    ).toMatchObject({ operation: "Split Edge", ratio: 0.625, label: "ratio=0.625" });

    expect(
      mapTopologyGizmoDragToParams({
        workspace: "Mesh",
        selectionType: "Edge",
        operation: "Bevel Edge",
        dragDistance: 0.075,
        initialAmount: 0.025,
      })
    ).toMatchObject({ operation: "Bevel Edge", amount: 0.1, label: "amount=0.1" });

    expect(
      mapTopologyGizmoDragToParams({
        workspace: "Mesh",
        selectionType: "Vertex",
        dragDistance: -0.04,
      })
    ).toMatchObject({ operation: "Move Vertex", amount: 0.04, directionSign: -1, label: "amount=0.04" });
  });

  it("uses face-specific Geometry handles and actions", () => {
    expect(getAdaptiveTopologyGizmoConfig("Geometry", "Face")).toMatchObject({
      label: "Face edit",
      modeLabel: "Extrude / inset",
      handleLabel: "face normal handle",
      primaryActionLabel: "Extrude / Inset",
    });
  });

  it("reports when the chosen topology level has no active selection", () => {
    expect(getAdaptiveTopologyGizmoConfig("Mesh", "Vertex", false).statusLabel).toBe(
      "Vertex point: waiting for selection"
    );
  });
});
