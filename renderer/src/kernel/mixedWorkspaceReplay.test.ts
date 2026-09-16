import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, createVolumeDocument } from "@math3d/core";
import { VolumeDocumentAdapter } from "../volume/volumeDocumentAdapter";
import { MIXED_REPLAY_FORMATS, verifyMixedWorkspaceReplay } from "./mixedWorkspaceReplay";

describe("GK17 renderer module replay bridge", () => {
  it("replays a real Volume command log and verifies the exact expected generation", () => {
    const document = createVolumeDocument({ stableKey: "mixed-replay-volume", source: {
      representation: "analytic-scalar-field", recipe: { kind: "analytic-preset", presetId: "sphere" },
      spatial: { dimensions: [8, 8, 8], origin: [0, 0, 0], spacing: [1, 1, 1], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        centering: "point", coordinateSystem: "world", positionUnits: "m", valueUnits: "unitless" }, dependencies: [], payload: null,
    } });
    const adapter = new VolumeDocumentAdapter(document);
    adapter.commitSource({ ...document.source, recipe: { kind: "analytic-preset", presetId: "torus" } });
    const replay = adapter.replayBundle();
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "volume", checkpoint: replay.checkpoint,
      expected: adapter.document().identity, replay: { format: MIXED_REPLAY_FORMATS.volume, payload: replay as never } }],
      activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] });
    expect(verifyMixedWorkspaceReplay(workspace).get(document.identity.id)?.identity).toEqual(adapter.document().identity);
    const corrupt = createMixedWorkspaceDocument({ ...workspace, entries: [{ ...workspace.entries[0], replay: { format: MIXED_REPLAY_FORMATS.volume,
      payload: { ...replay, cursor: 0 } as never } }] });
    expect(() => verifyMixedWorkspaceReplay(corrupt)).toThrow("Replay diverged");
  });
});
