import { replayMixedWorkspaceDocument, type MixedWorkspaceDocument } from "@math3d/core";
import { Graph2DCommandAdapter, SurfaceCommandAdapter, type SurfaceReplayBundle, CurveCommandAdapter, type CurveReplayBundle, type Graph2DReplayBundle } from "@math3d/kernel";

/** Shared bounded Graph and Curve adapters execute qualified history on mobile. */
export const resolveMobileProjectWorkspace = (workspace: MixedWorkspaceDocument) => replayMixedWorkspaceDocument(workspace, {
  graph2d: entry => {
    if (entry.replay?.format !== "math3d.graph2d-replay.v1") throw new TypeError("Unsupported Graph replay format.");
    return Graph2DCommandAdapter.restore(entry.replay.payload as unknown as Graph2DReplayBundle).document();
  },
  surface: entry => {
    if (entry.replay?.format !== "math3d.surface-replay.v1") throw new TypeError("Unsupported Surface replay format.");
    return SurfaceCommandAdapter.fromReplayBundle(entry.replay.payload as unknown as SurfaceReplayBundle).document();
  },
  curve: entry => {
    if (entry.replay?.format !== "math3d.curve-replay.v1") throw new TypeError("Unsupported Curve replay format.");
    return CurveCommandAdapter.fromReplayBundle(entry.replay.payload as unknown as CurveReplayBundle).document();
  },
});
