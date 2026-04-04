import { describe, expect, it } from "vitest";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { buildQuotientPipeline } from "./quotientBuilder";

describe("buildQuotientPipeline", () => {
  it("builds the canonical dunce-cap quotient", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("dunce_cap");
    expect(preset).toBeTruthy();
    const diagram = preset!.buildDiagram();
    const result = buildQuotientPipeline(diagram);

    expect(result.quotient.vertices).toHaveLength(1);
    expect(result.quotient.edges).toHaveLength(1);
    expect(result.quotient.faces).toHaveLength(1);
    expect(result.quotient.invariants?.eulerCharacteristic).toBe(1);
    expect(result.quotient.attachmentMap[result.quotient.faces[0].attachmentId]?.boundaryWord).toContain("a");
  });
});

