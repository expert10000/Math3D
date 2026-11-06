import { projectTemporalFieldSourceStatus, type Math3DProject,
  type TemporalFieldSourceDocument, type VectorField3DClipBounds,
  type VectorField3DDocument, type VectorField3DIsosurface,
  type VerifiedTemporalTransfers } from "@math3d/core";
import { runVerifiedIsosurface } from "./runVerifiedIsosurface";

export type TemporalMovingIsosurfaceFrame = Readonly<{ time: number;
  field: VectorField3DDocument; surface: VectorField3DIsosurface }>;
export type TemporalMovingIsosurfaceRecipe = Readonly<{ level: number;
  clipBounds: VectorField3DClipBounds; triangleBudgetPerFrame: number;
  timeBudgetMs: number }>;

/** Exact pinned frames only. Each extraction uses the existing verified worker. */
export async function runTemporalMovingIsosurfaces(project: Math3DProject,
  temporal: TemporalFieldSourceDocument, recipe: TemporalMovingIsosurfaceRecipe,
  options: Readonly<{ signal?: AbortSignal;
    loadTransfers: () => Promise<VerifiedTemporalTransfers>;
    currentProject?: () => Math3DProject;
    onProgress?: (completed: number, total: number) => void;
    runFrame?: typeof runVerifiedIsosurface }> ):
  Promise<readonly TemporalMovingIsosurfaceFrame[]> {
  if (!Number.isFinite(recipe.level) || recipe.level < 0 || recipe.level > 1e9 ||
      !Number.isSafeInteger(recipe.triangleBudgetPerFrame) ||
      recipe.triangleBudgetPerFrame < 1 || recipe.triangleBudgetPerFrame > 20_000 ||
      !Number.isSafeInteger(recipe.timeBudgetMs) || recipe.timeBudgetMs < 100 ||
      recipe.timeBudgetMs > 60_000 || temporal.source.frames.length < 2 ||
      temporal.source.frames.length > 4)
    throw new RangeError("Moving isosurfaces need 2–4 frames, at most 20,000 triangles per frame and a 60-second budget.");
  const started = performance.now();
  const deadline = started + recipe.timeBudgetMs;
  const check = async () => {
    if (options.signal?.aborted) throw new Error("Moving isosurfaces cancelled.");
    if (performance.now() >= deadline) throw new RangeError("Moving isosurface time budget reached.");
    const status = projectTemporalFieldSourceStatus(options.currentProject?.() ?? project,
      temporal, await options.loadTransfers());
    if (status.status !== "current")
      throw new TypeError(`Moving isosurface source withheld: ${status.reason}.`);
  };
  await check();
  const frames: TemporalMovingIsosurfaceFrame[] = [];
  for (const [index, pinned] of temporal.source.frames.entries()) {
    if (options.signal?.aborted) throw new Error("Moving isosurfaces cancelled.");
    const field = project.workspace.entries.find(entry => entry.module === "vector3d" &&
      entry.expected.id === pinned.documentId)?.checkpoint;
    if (field?.format !== "math3d.vector-field3d-document" ||
        field.identity.revision !== pinned.revision ||
        field.identity.structuralHash !== pinned.structuralHash)
      throw new TypeError(`Moving isosurface frame ${index + 1} changed or is missing.`);
    const controller = new AbortController();
    const remaining = Math.max(1, deadline - performance.now());
    const timeout = setTimeout(() => controller.abort(), remaining);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const surface = await (options.runFrame ?? runVerifiedIsosurface)(field,
        { level: recipe.level, clipBounds: recipe.clipBounds,
          triangleBudget: recipe.triangleBudgetPerFrame },
        { signal: controller.signal });
      if (controller.signal.aborted) throw new RangeError("Moving isosurface time budget reached or cancelled.");
      if (!surface.complete || surface.triangleCount < 0)
        throw new TypeError(`Moving isosurface frame ${index + 1} is partial ` +
          `(${surface.triangleCount} triangles, ${surface.limitReason ?? "no limit"}).`);
      frames.push({ time: pinned.time, field, surface });
      options.onProgress?.(index + 1, temporal.source.frames.length);
      await check();
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
  await check();
  return frames;
}
