import { describe, expect, it } from "vitest";
import { getAdaptiveTopologyGizmoConfig } from "./adaptiveTopologyGizmo";

describe("adaptiveTopologyGizmo", () => {
  it("uses edge-specific Mesh handles and actions", () => {
    expect(getAdaptiveTopologyGizmoConfig("Mesh", "Edge")).toMatchObject({
      label: "Edge rail",
      modeLabel: "Slide / bevel",
      handleLabel: "edge tangent handle",
      primaryActionLabel: "Split / Bevel",
      statusLabel: "Edge rail: Slide / bevel (edge tangent handle)",
    });
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
