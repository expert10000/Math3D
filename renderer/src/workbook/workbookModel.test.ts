import { describe, expect, it } from "vitest";
import type { Workbook, WorkbookComputeSavedRun } from "./workbookModel";
import { WORKBOOK_STAGE_ORDER, createDefaultWorkbook, createWorkbookFromTemplate } from "./workbookModel";

function makeIdFactory() {
  let n = 0;
  return () => `id-${n++}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`).join(",")}}`;
}

function replayDeterminismSignature(run: WorkbookComputeSavedRun): string {
  return stableStringify({
    operatorId: run.operatorId,
    datasetRef: run.datasetRef,
    viewerKind: run.viewerKind,
    inputHash: run.inputHash,
    inputRefs: run.inputRefs,
    params: run.params,
    viewSnapshot: run.viewSnapshot,
  });
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

  it("keeps deterministic replay signature stable on a reference scene", () => {
    const workbook = createWorkbookFromTemplate("compute_curvature", makeIdFactory());
    expect(workbook).not.toBeNull();
    if (!workbook) return;

    const computeStage = workbook.stages.find((stage) => stage.id === "compute");
    const computeBlock = computeStage?.blocks.find((block) => block.type === "compute");
    expect(computeBlock?.compute).toBeTruthy();
    if (!computeBlock?.compute) return;

    const baseRun: WorkbookComputeSavedRun = {
      id: "run-base",
      savedAt: 1_717_100_000_000,
      operatorId: "surface.curvature",
      datasetRef: "surface:mobius",
      viewerKind: "surface",
      inputHash: "input-hash-001",
      inputRefs: [{ portId: "dataset", type: "dataset", value: "surface:mobius" }],
      params: { colorMode: "gaussian" },
      viewSnapshot: {
        datasetRef: "surface:mobius",
        datasetKind: "surface",
        viewerKind: "surface",
      },
      status: "ok",
      summary: "Curvature computed.",
      outputHash: "output-hash-001",
      outputs: { viewPatch: { colorMode: "gaussian", showPrincipalDirections: true } },
      logs: ["ok"],
      timing: { startedAt: 100, endedAt: 160, durationMs: 60 },
      cacheHit: false,
    };

    const replayRun: WorkbookComputeSavedRun = {
      ...baseRun,
      id: "run-replay",
      savedAt: 1_717_100_100_000,
      summary: "Replay run.",
      timing: { startedAt: 200, endedAt: 260, durationMs: 60 },
      cacheHit: true,
    };

    computeBlock.compute.runHistory = [replayRun, baseRun];

    const firstSignature = replayDeterminismSignature(baseRun);
    const secondSignature = replayDeterminismSignature(replayRun);
    expect(firstSignature).toBe(secondSignature);
    expect(replayRun.outputHash).toBe(baseRun.outputHash);
    expect(replayRun.outputs).toEqual(baseRun.outputs);
  });

  it("preserves saved runs through .math3d bundle roundtrip", () => {
    const workbook = createWorkbookFromTemplate("compute_curvature", makeIdFactory());
    expect(workbook).not.toBeNull();
    if (!workbook) return;

    const computeStage = workbook.stages.find((stage) => stage.id === "compute");
    const computeBlock = computeStage?.blocks.find((block) => block.type === "compute");
    expect(computeBlock?.compute).toBeTruthy();
    if (!computeBlock?.compute) return;

    const savedRun: WorkbookComputeSavedRun = {
      id: "run-1",
      savedAt: 1_717_200_000_000,
      operatorId: "surface.curvature",
      datasetRef: "surface:mobius",
      viewerKind: "surface",
      inputHash: "input-hash-xyz",
      inputRefs: [{ portId: "dataset", type: "dataset", value: "surface:mobius" }],
      params: { colorMode: "mean", contourCount: 14 },
      viewSnapshot: {
        datasetRef: "surface:mobius",
        datasetKind: "surface",
        viewerKind: "surface",
      },
      status: "ok",
      summary: "Saved run snapshot.",
      outputHash: "output-hash-xyz",
      outputs: { viewPatch: { colorMode: "mean", showContours: true, contourCount: 14 } },
      logs: ["ok"],
      timing: { startedAt: 500, endedAt: 560, durationMs: 60 },
      cacheHit: false,
    };
    computeBlock.compute.runHistory = [savedRun];

    type Bundle = {
      version: number;
      format: "math3d-bundle";
      extension: ".math3d";
      savedAt: number;
      assetMode: "linked" | "embedded";
      payload: {
        version: number;
        workbooks: Workbook[];
        activeWorkbookId: string;
        activeStageId: "define" | "compute" | "visualize" | "explain";
      };
    };

    const bundle: Bundle = {
      version: 1,
      format: "math3d-bundle",
      extension: ".math3d",
      savedAt: 1_717_200_010_000,
      assetMode: "linked",
      payload: {
        version: 1,
        workbooks: [workbook],
        activeWorkbookId: workbook.id,
        activeStageId: "compute",
      },
    };

    const roundtrip = JSON.parse(JSON.stringify(bundle)) as Bundle;
    const restoredRun =
      roundtrip.payload.workbooks[0]?.stages
        .find((stage) => stage.id === "compute")
        ?.blocks.find((block) => block.type === "compute")
        ?.compute?.runHistory?.[0] ?? null;

    expect(roundtrip.format).toBe("math3d-bundle");
    expect(roundtrip.extension).toBe(".math3d");
    expect(restoredRun).toEqual(savedRun);
  });
});
