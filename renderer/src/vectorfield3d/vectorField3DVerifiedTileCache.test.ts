import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createVectorField3DDocument,
  scientificTileLayout, scientificTileSampleLocation, searchVectorField3DVerifiedTileEquilibria,
  VectorField3DEquilibriumNeedsTiles, VectorField3DNeededTile,
  VectorField3DVerifiedTileCache,
  type VectorField3DEquilibriumContinuation,
  type VectorField3DSource, type VectorField3DVerifiedTile } from "@math3d/core";

const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const shape = [9, 9, 9] as const, tileShape = [3, 3, 3] as const;
const names = ["east", "north", "up"] as const;
const coordinate = (index: number) => -1 + index / 4;

function fixture(signs: readonly [number, number, number], power: 1 | 3 = 1,
  chosenTileShape: readonly [number, number, number] = tileShape) {
  const layout = scientificTileLayout(shape, chosenTileShape);
  const payloads = names.map((name, component) => {
    const tiles = layout.map(tile => {
      const bytes = Buffer.alloc(tile.bytes);
      let offset = 0;
      for (let x = tile.start[0]; x < tile.start[0] + tile.size[0]; x++)
        for (let y = tile.start[1]; y < tile.start[1] + tile.size[1]; y++)
          for (let z = tile.start[2]; z < tile.start[2] + tile.size[2]; z++)
            bytes.writeDoubleLE(signs[component]! * (component + 1) *
              coordinate([x, y, z][component]!) ** power, offset++ * 8);
      return bytes;
    });
    const resource = { id: name, path: `${name}.f64`, format: "f64le", count: 729,
      bytes: 729 * 8, sha256: sha(Buffer.concat(tiles)), layout: "tiled-3d",
      tileShape: chosenTileShape, tileSha256: tiles.map(sha) };
    return { resource, tiles };
  });
  const manifestJson = JSON.stringify({ schema: "scientific-scene/v3", sceneId: "analytic-equilibrium",
    title: "Analytic linear field", source: { producer: "test", sourceId: "linear",
      sourceSchema: "analytic/v1", sha256: "a".repeat(64) },
    resources: payloads.map(part => part.resource),
    coordinates: [{ id: "space", kind: "cartesian", axes: names.map((_, index) =>
      ({ name: ["x", "y", "z"][index], unit: "m" })), origin: [-1, -1, -1],
      spacing: [.25, .25, .25], periodic: [false, false, false] }],
    datasets: [{ id: "field", semanticType: "vector-field", coordinateSystem: "space",
      shape, order: "last-axis-fastest", quantity: { name: "Velocity", unit: "m/s" },
      components: names.map(name => ({ name, resource: name })) }], views: [] });
  const fingerprint = sha(manifestJson);
  const references = names.map(name => createGraph2DFieldReference(manifestJson, fingerprint,
    { kind: "preset", value: "analytic-equilibrium" }, "field", name)) as
    [ReturnType<typeof createGraph2DFieldReference>, ReturnType<typeof createGraph2DFieldReference>,
      ReturnType<typeof createGraph2DFieldReference>];
  const axes = (["x", "y", "z"] as const).map(role =>
    ({ role, label: role, unit: "m", min: -1, max: 1 })) as VectorField3DSource["axes"];
  const document = createVectorField3DDocument({ axes, timeUnit: "s", field: {
    kind: "scientific-bundle", references, componentUnits: ["m/s", "m/s", "m/s"] },
  seeds: [], display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-7, relativeTolerance: 1e-7, maxSteps: 1000, maxTime: 1 } },
  { stableKey: `field-${power}-${signs.join("-")}` });
  const transfer = (indices: readonly [number, number, number]): VectorField3DVerifiedTile => ({
    fingerprint, datasetId: "field", indices, components: payloads.map(({ resource, tiles }, component) => {
      const location = scientificTileSampleLocation(shape, chosenTileShape, indices, layout);
      const tile = layout[location.tileIndex]!, bytes = tiles[location.tileIndex]!;
      return { name: names[component]!, resourceSha256: resource.sha256,
        tileIndex: tile.index, tileSha256: resource.tileSha256[tile.index]!,
        start: tile.start, size: tile.size,
        values: Array.from({ length: bytes.length / 8 }, (_, index) => bytes.readDoubleLE(index * 8)) };
    }) });
  return { document, manifestJson, fingerprint, transfer };
}

describe("verified v3 tile-backed equilibrium search", () => {
  it.each([[1, 1, 1, "source"], [1, -1, -1, "saddle"]] as const)(
    "finds the analytic %s,%s,%s field's %s equilibrium", (a, b, c, classification) => {
      const scene = fixture([a, b, c]);
      const cache = new VectorField3DVerifiedTileCache(scene.document,
        scene.manifestJson, scene.fingerprint);
      let result: ReturnType<typeof searchVectorField3DVerifiedTileEquilibria>;
      let continuation: VectorField3DEquilibriumContinuation | undefined;
      let furthestSeed = 0, largestBatch = 0;
      let retainedStencilSamples = 0;
      for (;;) {
        try { result = searchVectorField3DVerifiedTileEquilibria(scene.document, cache,
          {}, continuation); break; }
        catch (cause) {
          if (!(cause instanceof VectorField3DEquilibriumNeedsTiles)) throw cause;
          continuation = cause.continuation;
          furthestSeed = Math.max(furthestSeed, continuation.nextSeedIndex);
          retainedStencilSamples = Math.max(retainedStencilSamples,
            continuation.activeSeed?.sampled.length ?? 0);
          largestBatch = Math.max(largestBatch, cause.indicesBatch.length);
          cause.indicesBatch.forEach(indices => cache.add(scene.transfer(indices)));
        }
      }
      expect(furthestSeed).toBeGreaterThan(0);
      expect(retainedStencilSamples).toBeGreaterThan(0);
      expect(largestBatch).toBeLessThanOrEqual(8);
      const seedCache = new VectorField3DVerifiedTileCache(scene.document,
        scene.manifestJson, scene.fingerprint);
      let seedResumed: typeof result;
      let seedContinuation: VectorField3DEquilibriumContinuation | undefined;
      for (;;) {
        try { seedResumed = searchVectorField3DVerifiedTileEquilibria(scene.document,
          seedCache, {}, seedContinuation); break; }
        catch (cause) {
          if (!(cause instanceof VectorField3DEquilibriumNeedsTiles)) throw cause;
          const { activeSeed, ...checkpoint } = cause.continuation;
          seedContinuation = { ...checkpoint, attemptedSeeds: checkpoint.attemptedSeeds - 1,
            evaluations: activeSeed!.startEvaluations };
          cause.indicesBatch.forEach(indices => seedCache.add(scene.transfer(indices)));
        }
      }
      const restartCache = new VectorField3DVerifiedTileCache(scene.document,
        scene.manifestJson, scene.fingerprint);
      let restarted: typeof result;
      for (;;) {
        try { restarted = searchVectorField3DVerifiedTileEquilibria(scene.document,
          restartCache); break; }
        catch (cause) {
          if (!(cause instanceof VectorField3DEquilibriumNeedsTiles)) throw cause;
          cause.indicesBatch.forEach(indices => restartCache.add(scene.transfer(indices)));
        }
      }
      expect(result.candidates).toEqual(restarted.candidates);
      expect(result.candidates).toEqual(seedResumed.candidates);
      expect(result.evaluations).toBe(restarted.evaluations);
      expect(result.evaluations).toBe(seedResumed.evaluations);
      expect(result.attemptedSeeds).toBe(restarted.attemptedSeeds);
      const center = result.candidates.find(item => Math.hypot(...item.position) < 1e-5);
      expect(center?.classification).toBe(classification);
      expect(center?.residual).toBeLessThan(1e-7);
      expect(cache.provenance.every(part => part.verifiedTiles <= part.totalTiles)).toBe(true);
      expect(cache.residentBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
      const other = fixture([a, b === 1 ? -1 : 1, c]);
      expect(() => searchVectorField3DVerifiedTileEquilibria(other.document, cache))
        .toThrow(/verified tile equilibria/i);
      const changed = scene.transfer([4, 4, 4]);
      const forged = { ...changed, components: [{ ...changed.components[0]!,
        values: changed.components[0]!.values.map((value, index) => index === 0 ? value + 1 : value) },
        ...changed.components.slice(1)] };
      expect(() => new VectorField3DVerifiedTileCache(scene.document,
        scene.manifestJson, scene.fingerprint).add(forged)).toThrow(/checksum/);
      const small = new VectorField3DVerifiedTileCache(scene.document,
        scene.manifestJson, scene.fingerprint, 1024);
      small.add(scene.transfer([0, 0, 0]));
      expect(() => small.add(scene.transfer([3, 0, 0]))).toThrow(/memory budget/);
    });
});

it("resumes a cubic field after a tile miss in a later Newton iteration", () => {
  const scene = fixture([1, 1, 1], 3);
  const cache = new VectorField3DVerifiedTileCache(scene.document,
    scene.manifestJson, scene.fingerprint);
  let continuation: VectorField3DEquilibriumContinuation | undefined;
  let laterIteration = false;
  let result: ReturnType<typeof searchVectorField3DVerifiedTileEquilibria>;
  for (;;) {
    try { result = searchVectorField3DVerifiedTileEquilibria(scene.document, cache,
      { seedResolution: 3 }, continuation); break; }
    catch (cause) {
      if (!(cause instanceof VectorField3DEquilibriumNeedsTiles)) throw cause;
      continuation = cause.continuation;
      laterIteration ||= continuation.activeSeed?.phase === "newton" &&
        continuation.activeSeed.iteration > 0;
      cause.indicesBatch.forEach(indices => cache.add(scene.transfer(indices)));
    }
  }
  expect(laterIteration).toBe(true);
  expect(result.evaluations).toBeGreaterThan(0);
});

it("batches all missing interpolation-corner tiles at a three-axis tile boundary", () => {
  const scene = fixture([1, 1, 1]);
  const cache = new VectorField3DVerifiedTileCache(scene.document,
    scene.manifestJson, scene.fingerprint);
  try { cache.sample([-.375, -.375, -.375]); throw new Error("Expected a tile miss."); }
  catch (cause) {
    if (!(cause instanceof VectorField3DNeededTile)) throw cause;
    expect(cause.indicesBatch).toHaveLength(8);
    cause.indicesBatch.forEach(indices => cache.add(scene.transfer(indices)));
  }
  expect(cache.sample([-.375, -.375, -.375])).toEqual([-.375, -.75, -1.125]);
});

it("prefetches a dense seed lattice only when all tiles fit the verified cache", () => {
  const scene = fixture([1, 1, 1]);
  const cache = new VectorField3DVerifiedTileCache(scene.document,
    scene.manifestJson, scene.fingerprint);
  const plan = cache.equilibriumPrefetchPlan(scene.document);
  expect(plan).toHaveLength(27);
  expect(new Set(plan!.map(indices => indices.join(","))).size).toBe(27);
  expect(cache.equilibriumPrefetchPlan(scene.document, 5, 100)).toBeNull();
  const small = new VectorField3DVerifiedTileCache(scene.document,
    scene.manifestJson, scene.fingerprint, 1024);
  expect(small.equilibriumPrefetchPlan(scene.document)).toBeNull();
  const sparseScene = fixture([1, 1, 1], 1, [2, 2, 2]);
  const sparseCache = new VectorField3DVerifiedTileCache(sparseScene.document,
    sparseScene.manifestJson, sparseScene.fingerprint);
  expect(sparseCache.equilibriumPrefetchPlan(sparseScene.document, 3)).toBeNull();
  expect(sparseCache.equilibriumPrefetchPlan(sparseScene.document, 5)).toHaveLength(125);
});
