import { describe, expect, it } from "vitest";
import { negotiateQuantumView, type QuantumSceneCapabilities, type QuantumViewHandler } from "./quantumViewHandlers";

const capabilities: QuantumSceneCapabilities = { fields: [], hasGeometry: true, hasBands: true,
  hasLattice: false, hasTrajectory: false };

describe("semantic quantum view negotiation", () => {
  it("routes supplied bands through the existing geometry viewer and rejects unavailable field views", () => {
    expect(negotiateQuantumView("geometry", capabilities)?.id).toBe("bands/v1");
    expect(negotiateQuantumView("volume", capabilities)).toBeNull();
  });

  it("accepts a new handler through registration without changing the preview route", () => {
    const added: QuantumViewHandler = { id: "new-dataset/v1", request: "geometry",
      accepts: caps => caps.hasBands, render: () => "new view" };
    expect(negotiateQuantumView("geometry", capabilities, [added])?.id).toBe("new-dataset/v1");
  });
});
