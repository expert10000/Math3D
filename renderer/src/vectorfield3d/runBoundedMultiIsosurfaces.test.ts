import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMath3DProject, type VectorField3DDocument,
  type VectorField3DIsosurface } from "@math3d/core";
import { runBoundedMultiIsosurfaces } from "./runBoundedMultiIsosurfaces";
import type { runVerifiedIsosurface } from "./runVerifiedIsosurface";

const fixture = new URL("../../../tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d",
  import.meta.url);
const field = () => parseMath3DProject(readFileSync(fixture, "utf8"))
  .workspace.entries.find(item => item.module === "vector3d")!.checkpoint as VectorField3DDocument;
const recipe = { levels: [0.5, 1, 2],
  clipBounds: [[-1, 1], [-1, 1], [-1, 1]] as const,
  triangleBudget: 5, timeBudgetMs: 5000 };
const runner = (triangles: number, changed = false) =>
  (async (document: VectorField3DDocument, levelRecipe: { level: number;
    triangleBudget: number }) => ({
    source: { documentId: document.identity.id,
      revision: document.identity.revision + Number(changed),
      structuralHash: document.identity.structuralHash },
    level: levelRecipe.level, triangleCount: Math.min(triangles, levelRecipe.triangleBudget),
    complete: triangles <= levelRecipe.triangleBudget,
  } as VectorField3DIsosurface)) as typeof runVerifiedIsosurface;

describe("GF-14 shared multi-level extraction budgets", () => {
  it("publishes only completed levels inside the combined triangle cap", async () => {
    const progress: number[] = [];
    const result = await runBoundedMultiIsosurfaces(field(), recipe,
      { runLevel: runner(3), onProgress: completed => progress.push(completed) });
    expect(result).toMatchObject({ complete: false, reason: "triangle-budget",
      triangleCount: 5, attemptedLevels: 2 });
    expect(result.surfaces).toHaveLength(2);
    expect(progress).toEqual([1, 2]);
  });

  it("rejects a late generation and cancels without publishing it", async () => {
    await expect(runBoundedMultiIsosurfaces(field(), recipe,
      { runLevel: runner(1, true) })).rejects.toThrow(/Late or incompatible/);
    const abort = new AbortController(); abort.abort();
    await expect(runBoundedMultiIsosurfaces(field(), recipe,
      { signal: abort.signal, runLevel: runner(1) })).rejects.toThrow(/cancelled/);
    await expect(runBoundedMultiIsosurfaces(field(), { ...recipe,
      levels: [2, 1] })).rejects.toThrow(/ascending/);
  });
});
