import { projectTemporalFieldSourceStatus, type Math3DProject,
  type TemporalFieldSourceDocument, type VerifiedTemporalTransfers } from "@math3d/core";
import type { TemporalMovingIsosurfaceFrame } from "./runTemporalMovingIsosurfaces";
import { interpolateTemporalSurfacePair, validateTemporalSurfacePair } from
  "./validateTemporalSurfacePair";

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
    interpolate?: boolean;
    onInterpolated?: (surface: TemporalMovingIsosurfaceFrame["surface"],
      from: number, to: number) => void;
    onInterpolationUnavailable?: (index: number, reason: string) => void;
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
      temporalSurfaceResidentBytes(frames) + (options.interpolate ?
        Math.max(...frames.map(frame => frame.surface.positions.byteLength +
          frame.surface.normals.byteLength)) : 0) > options.memoryBudgetBytes)
    throw new RangeError("Playback needs 2–4 exact frames within 10 seconds and 64 MiB of geometry.");
  const started = performance.now();
  const assertPinned = (frame: TemporalMovingIsosurfaceFrame, index: number) => {
    const pinned = temporal.source.frames[index]!;
    if (frame.time !== pinned.time || frame.field.identity.id !== pinned.documentId ||
        frame.field.identity.revision !== pinned.revision ||
        frame.field.identity.structuralHash !== pinned.structuralHash ||
        frame.surface.source.documentId !== pinned.documentId ||
        frame.surface.source.revision !== pinned.revision ||
        frame.surface.source.structuralHash !== pinned.structuralHash)
      throw new TypeError(`Moving isosurface frame ${index + 1} changed.`);
  };
  for (const [index, frame] of frames.entries()) {
    if (options.signal?.aborted) throw new Error("Moving isosurface playback cancelled.");
    if (performance.now() - started >= options.timeBudgetMs)
      throw new RangeError("Moving isosurface playback time budget reached.");
    assertPinned(frame, index);
    const transfers = await options.loadTransfers();
    const status = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, transfers);
    if (status.status !== "current")
      throw new TypeError(`Moving isosurface frame ${index + 1} withheld: ${status.reason}.`);
    if (options.signal?.aborted) throw new Error("Moving isosurface playback cancelled.");
    options.onFrame(frame, index);
    if (index < frames.length - 1) {
      const next = frames[index + 1]!;
      if (options.interpolate) assertPinned(next, index + 1);
      const review = options.interpolate ? validateTemporalSurfacePair(frame.surface,
        next.surface) : null;
      if (review?.status === "unavailable")
        options.onInterpolationUnavailable?.(index, review.reason);
      const wait = options.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
      await wait(options.intervalMs / 2);
      if (review?.status === "compatible") {
        if (options.signal?.aborted) throw new Error("Moving isosurface playback cancelled.");
        if (performance.now() - started >= options.timeBudgetMs)
          throw new RangeError("Moving isosurface playback time budget reached.");
        const fresh = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
          temporal, await options.loadTransfers());
        if (fresh.status !== "current")
          throw new TypeError(`Interpolated surface withheld: ${fresh.reason}.`);
        options.onInterpolated?.(interpolateTemporalSurfacePair(frame.surface,
          next.surface, 0.5), frame.time, next.time);
      }
      await wait(options.intervalMs / 2);
    }
  }
}
