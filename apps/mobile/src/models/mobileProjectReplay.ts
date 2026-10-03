import { replayMixedWorkspaceDocument, type MixedWorkspaceDocument } from "@math3d/core";
import { Graph2DCommandAdapter, type Graph2DReplayBundle } from "@math3d/kernel";

/** Only the shared bounded Graph command adapter may execute history on mobile. */
export const resolveMobileProjectWorkspace = (workspace: MixedWorkspaceDocument) => replayMixedWorkspaceDocument(workspace, {
  graph2d: entry => {
    if (entry.replay?.format !== "math3d.graph2d-replay.v1") throw new TypeError("Unsupported Graph replay format.");
    return Graph2DCommandAdapter.restore(entry.replay.payload as unknown as Graph2DReplayBundle).document();
  },
});
