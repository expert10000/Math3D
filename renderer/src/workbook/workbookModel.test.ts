import { describe, expect, it } from "vitest";
import { WORKBOOK_STAGE_ORDER, createDefaultWorkbook, createWorkbookFromTemplate } from "./workbookModel";

function makeIdFactory() {
  let n = 0;
  return () => `id-${n++}`;
}

describe("workbook model functional behavior", () => {
  it("builds the default workbook with stable stage order and starter blocks", () => {
    const makeId = makeIdFactory();
    const workbook = createDefaultWorkbook(makeId);

    expect(workbook.id).toBe("id-0");
    expect(workbook.title).toBe("Untitled Workbook");
    expect(workbook.stages.map((stage) => stage.id)).toEqual(WORKBOOK_STAGE_ORDER.map((stage) => stage.id));
    expect(workbook.stages.map((stage) => stage.blocks.length)).toEqual([2, 0, 1, 2]);

    const visualizeBlock = workbook.stages[2].blocks[0];
    expect(visualizeBlock.type).toBe("visualize");
    expect(visualizeBlock.visualize?.live).toBe(true);
    expect(visualizeBlock.visualize?.snapshotA).toBeNull();
    expect(visualizeBlock.visualize?.snapshotB).toBeNull();

    const assertBlock = workbook.stages[3].blocks[1];
    expect(assertBlock.type).toBe("assert");
    expect(assertBlock.assert?.status).toBe("pending");
  });

  it("returns null for unknown template ids", () => {
    const workbook = createWorkbookFromTemplate("missing-template", makeIdFactory());
    expect(workbook).toBeNull();
  });

  it("builds geodesic template with expected interaction and compute defaults", () => {
    const workbook = createWorkbookFromTemplate("geodesics_from_point", makeIdFactory());
    expect(workbook).not.toBeNull();
    if (!workbook) return;

    const computeStage = workbook.stages.find((stage) => stage.id === "compute");
    expect(computeStage).toBeDefined();
    const blocks = computeStage?.blocks ?? [];
    expect(blocks.map((block) => block.type)).toEqual(["interaction", "interaction", "compute", "compute"]);

    const interactionBlock = blocks[0];
    expect(interactionBlock.interaction?.kind).toBe("pick_point");
    expect(interactionBlock.interaction?.status).toBe("idle");

    const computeBlock = blocks[2];
    expect(computeBlock.compute?.status).toBe("stale");
    expect(computeBlock.compute?.operatorId).toBe("surface.geodesicDistance");
    expect(computeBlock.compute?.cache).toEqual({});
  });
});
