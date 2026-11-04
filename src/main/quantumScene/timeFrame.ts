import type { ImportedQuantumScene } from "./importer";

/** A frame identity resolves only to its supplied physical sample, with no interpolation. */
export function inspectVerifiedTimeFrame(imported: ImportedQuantumScene, frameId: string) {
  const timeline = imported.source.time;
  if (!timeline) throw new Error("Scene has no typed timeline");
  const index = timeline.frameIds.indexOf(frameId);
  if (index < 0) throw new Error("Unknown frame identity");
  const time = imported.arrays.get(timeline.axis)![index];
  return { frameId, index, time, unit: timeline.unit, runId: imported.source.provenance.runId,
    resultSha256: imported.source.provenance.resultSha256,
    tracks: timeline.tracks.map(track => ({ id: track.id, object: track.object,
      xyz: [...imported.arrays.get(track.positions)!.slice(index * 3, index * 3 + 3)] })) };
}
export function inspectVerifiedTimeFrames(imported: ImportedQuantumScene) {
  const timeline = imported.source.time;
  if (!timeline) throw new Error("Scene has no typed timeline");
  return timeline.frameIds.map(frameId => inspectVerifiedTimeFrame(imported, frameId));
}
