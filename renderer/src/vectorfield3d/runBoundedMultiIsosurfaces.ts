import type { VectorField3DDocument, VectorField3DIsosurface,
  VectorField3DClipBounds } from "@math3d/core";
import { runVerifiedIsosurface } from "./runVerifiedIsosurface";

export type MultiIsosurfaceRecipe = Readonly<{ levels: readonly number[];
  clipBounds: VectorField3DClipBounds; triangleBudget: number;
  timeBudgetMs: number }>;
export type MultiIsosurfaceResult = Readonly<{ surfaces: readonly VectorField3DIsosurface[];
  attemptedLevels: number; complete: boolean;
  reason: "triangle-budget" | "time-budget" | null;
  triangleCount: number; elapsedMs: number }>;

/** Levels share one declared triangle and wall-time budget; each level re-verifies the source. */
export async function runBoundedMultiIsosurfaces(document: VectorField3DDocument,
  recipe: MultiIsosurfaceRecipe, options: { signal?: AbortSignal;
    runLevel?: typeof runVerifiedIsosurface; now?: () => number;
    onProgress?: (completed: number, total: number) => void } = {}): Promise<MultiIsosurfaceResult> {
  if (recipe.levels.length < 1 || recipe.levels.length > 8 ||
      recipe.levels.some((value, index) => !Number.isFinite(value) || value < 0 || value > 1e9 ||
        index > 0 && value <= recipe.levels[index - 1]!) ||
      !Number.isSafeInteger(recipe.triangleBudget) || recipe.triangleBudget < 1 ||
      recipe.triangleBudget > 100_000 || !Number.isSafeInteger(recipe.timeBudgetMs) ||
      recipe.timeBudgetMs < 1 || recipe.timeBudgetMs > 30_000)
    throw new RangeError("Multi-level extraction needs ascending levels and bounded budgets.");
  const now = options.now ?? (() => performance.now()), started = now();
  const runLevel = options.runLevel ?? runVerifiedIsosurface;
  const surfaces: VectorField3DIsosurface[] = [];
  let triangleCount = 0, attemptedLevels = 0;
  let reason: MultiIsosurfaceResult["reason"] = null;
  for (const level of recipe.levels) {
    if (options.signal?.aborted) throw new Error("Multi-level extraction cancelled.");
    const remainingTime = recipe.timeBudgetMs - (now() - started);
    const remainingTriangles = recipe.triangleBudget - triangleCount;
    if (remainingTime <= 0) { reason = "time-budget"; break; }
    if (remainingTriangles <= 0) { reason = "triangle-budget"; break; }
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, remainingTime);
    try {
      attemptedLevels++;
      const surface = await runLevel(document, { level,
        clipBounds: recipe.clipBounds, triangleBudget: remainingTriangles },
        { signal: controller.signal });
      if (controller.signal.aborted) throw new Error("Multi-level extraction time budget reached.");
      if (surface.source.documentId !== document.identity.id ||
          surface.source.revision !== document.identity.revision ||
          surface.source.structuralHash !== document.identity.structuralHash ||
          surface.level !== level || surface.triangleCount > remainingTriangles)
        throw new TypeError("Late or incompatible isosurface cannot publish.");
      surfaces.push(surface); triangleCount += surface.triangleCount;
      options.onProgress?.(surfaces.length, recipe.levels.length);
      if (!surface.complete) { reason = "triangle-budget"; break; }
    } catch (cause) {
      if (options.signal?.aborted) throw new Error("Multi-level extraction cancelled.");
      if (controller.signal.aborted) { reason = "time-budget"; break; }
      throw cause;
    } finally {
      clearTimeout(timeout); options.signal?.removeEventListener("abort", abort);
    }
  }
  return { surfaces, attemptedLevels, complete: reason === null &&
    surfaces.length === recipe.levels.length, reason, triangleCount,
    elapsedMs: Math.max(0, now() - started) };
}
