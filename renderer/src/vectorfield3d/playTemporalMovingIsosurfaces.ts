import { projectTemporalFieldSourceStatus, type Math3DProject,
  type TemporalFieldSourceDocument, type VerifiedTemporalTransfers } from "@math3d/core";
import type { TemporalMovingIsosurfaceFrame } from "./runTemporalMovingIsosurfaces";

export const temporalSurfaceResidentBytes = (frames:
  readonly TemporalMovingIsosurfaceFrame[]) => frames.reduce((sum, frame) =>
    sum + frame.surface.positions.byteLength + frame.surface.normals.byteLength +
      frame.surface.indices.byteLength, 0);

/** Single pass over exact frames; no geometric interpolation or topology matching. */
export async function playTemporalMovingIsosurfaces(project: Math3DProject,
  temporal: TemporalFieldSourceDocument,
  frames: readonly TemporalMovingIsosurfaceFrame[], options: Readonly<{
    signal?: AbortSignal; currentProject?: () => Math3DProject;
    loadTransfers: () => Promise<VerifiedTemporalTransfers>;
    onFrame: (frame: TemporalMovingIsosurfaceFrame, index: number) => void;
    intervalMs: number; timeBudgetMs: number; memoryBudgetBytes: number;
    wait?: (ms: number) => Promise<void>;
  }>): Promise<void> {
  if (frames.length !== temporal.source.frames.length || frames.length < 2 ||
      frames.length > 4 || !Number.isSafeInteger(options.intervalMs) ||
      options.intervalMs < 100 || options.intervalMs > 2000 ||
      !Number.isSafeInteger(options.timeBudgetMs) || options.timeBudgetMs < 1000 ||
      options.timeBudgetMs > 10_000 ||
      !Number.isSafeInteger(options.memoryBudgetBytes) ||
      options.memoryBudgetBytes < 1 || options.memoryBudgetBytes > 64 * 1024 * 1024 ||
      temporalSurfaceResidentBytes(frames) > options.memoryBudgetBytes)
    throw new RangeError("Playback needs 2–4 exact frames within 10 seconds and 64 MiB of geometry.");
  const started = performance.now();
  for (const [index, frame] of frames.entries()) {
    if (options.signal?.aborted) throw new Error("Moving isosurface playback cancelled.");
    if (performance.now() - started >= options.timeBudgetMs)
      throw new RangeError("Moving isosurface playback time budget reached.");
    const pinned = temporal.source.frames[index]!;
    if (frame.time !== pinned.time || frame.field.identity.id !== pinned.documentId ||
        frame.field.identity.revision !== pinned.revision ||
        frame.field.identity.structuralHash !== pinned.structuralHash ||
        frame.surface.source.documentId !== pinned.documentId ||
        frame.surface.source.revision !== pinned.revision ||
        frame.surface.source.structuralHash !== pinned.structuralHash)
      throw new TypeError(`Moving isosurface frame ${index + 1} changed.`);
    const transfers = await options.loadTransfers();
    const status = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, transfers);
    if (status.status !== "current")
      throw new TypeError(`Moving isosurface frame ${index + 1} withheld: ${status.reason}.`);
    if (options.signal?.aborted) throw new Error("Moving isosurface playback cancelled.");
    options.onFrame(frame, index);
    if (index < frames.length - 1)
      await (options.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms))))(
        options.intervalMs);
  }
}
