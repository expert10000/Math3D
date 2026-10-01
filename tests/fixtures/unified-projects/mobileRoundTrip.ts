import { applyGraph2DAuthoring, structuralHash } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { importMobileGraph, readMobileGraph, updateStoredMobileGraph } from "../../../apps/mobile/src/models/mobileGraphProject";
import { serializeMobileProjectHandoff } from "../../../apps/mobile/src/models/mobileProjectTransfer";

/** The actual mobile Graph model; no file picker, renderer or device is simulated. */
export function roundTripNamedProjectOnMobile(raw: string, edit: boolean): string {
  let project = importMobileGraph(raw, [], "desktop-checkpoint.project.json", 100, "desktop");
  if (edit) {
    const graph = readMobileGraph(project), adapter = new Graph2DCommandAdapter(graph);
    const edited = adapter.commitScene(applyGraph2DAuthoring(graph, { type: "duplicate", objectId: graph.source.objects[0]!.id }), "duplicate");
    if (structuralHash(adapter.undo()!.source) !== structuralHash(graph.source) || structuralHash(adapter.redo()!.source) !== structuralHash(edited.source))
      throw new Error("Mobile Graph history did not preserve its mathematical source.");
    project = updateStoredMobileGraph(project, adapter.document(), 200);
  }
  // Portable library record survives serialization before the host's export model runs.
  return serializeMobileProjectHandoff(JSON.parse(JSON.stringify(project)));
}
