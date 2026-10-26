import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const esbuild = require("../renderer/node_modules/esbuild");
const host = require("../dist/main/scientificScene/graphDataset.js");
const root = resolve(import.meta.dirname, "..");
const temporary = await mkdtemp(join(tmpdir(), "math3d-tile-solvers-benchmark-"));
try {
  const entry = join(temporary, "entry.ts"), compiled = join(temporary, "core.cjs");
  await writeFile(entry, [
    "export { createGraph2DFieldReference } from '" + root.replaceAll("\\", "/") + "/packages/core/src/graph2dFieldReference.ts';",
    "export { createVectorField3DDocument } from '" + root.replaceAll("\\", "/") + "/packages/core/src/vectorField3DDocument.ts';",
    "export { scientificAxisCoordinate } from '" + root.replaceAll("\\", "/") + "/packages/core/src/scientificDatasetCoordinates.ts';",
    "export { VectorField3DNeededTile, VectorField3DVerifiedTileCache } from '" + root.replaceAll("\\", "/") + "/packages/core/src/vectorField3DVerifiedTileCache.ts';",
    "export { integrateVectorField3DScientificTrajectories, integrateVectorField3DVerifiedTileTrajectories } from '" + root.replaceAll("\\", "/") + "/packages/core/src/vectorField3DTrajectories.ts';",
    "export { searchVectorField3DEquilibria, searchVectorField3DVerifiedTileEquilibria, VectorField3DEquilibriumNeedsTiles } from '" + root.replaceAll("\\", "/") + "/packages/core/src/vectorField3DEquilibria.ts';",
  ].join("\n"));
  await esbuild.build({ entryPoints: [entry], outfile: compiled, bundle: true,
    platform: "node", format: "cjs", target: "node20", logLevel: "silent" });
  const core = require(compiled);
  const fixtures = [
    ["80³ analytic vortex", "output/scientific-vortex-80-overview.sscene", ["east", "north", "up"]],
    ["measured Burgers", "output/scientific-burgers-horizontal-level1.sscene", ["vx", "vy", "vz"]],
  ];
  const results = [];
  for (const [label, relative, names] of fixtures) {
    const directory = resolve(root, relative);
    const manifestJson = await readFile(join(directory, "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestJson), dataset = manifest.datasets[0];
    const coordinate = manifest.coordinates.find(item => item.id === dataset.coordinateSystem);
    const shape = dataset.shape, fingerprint = createHash("sha256").update(manifestJson).digest("hex");
    const references = names.map(name => core.createGraph2DFieldReference(manifestJson,
      fingerprint, { kind: "directory", value: directory }, "field", name));
    const axes = coordinate.axes.map((axis, index) => ({ role: ["x", "y", "z"][index],
      label: axis.name, unit: axis.unit, min: coordinate.origin[index],
      max: coordinate.origin[index] + coordinate.spacing[index] * (shape[index] - 1) }));
    const seed = label.startsWith("80³") ? [1, 0, 0] : shape.map((size, axis) =>
      core.scientificAxisCoordinate({ ...references[0].axes[axis], count: size },
        Math.round((size - 1) / 2)));
    const document = core.createVectorField3DDocument({ axes, timeUnit: "s",
      field: { kind: "scientific-bundle", references,
        componentUnits: Array(3).fill(dataset.quantity.unit) },
      seeds: [{ id: "benchmark", position: seed }],
      display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
      solver: { method: "rk45", absoluteTolerance: 1e-6, relativeTolerance: 1e-6,
        maxSteps: 1000, maxTime: 1 } }, { stableKey: `tile-solver-${names[0]}` });
    const methods = [];
    for (const mode of ["trajectory", "equilibria"]) {
      const boundedStart = performance.now();
      const volumes = await host.previewScientificGraphVectorVolume(directory, fingerprint,
        "field", names);
      const bounded = mode === "trajectory" ?
        core.integrateVectorField3DScientificTrajectories(document, manifestJson, fingerprint, volumes) :
        core.searchVectorField3DEquilibria(document, { manifestJson, fingerprint, volumes });
      const boundedMs = performance.now() - boundedStart;
      const variants = [];
      for (const variant of mode === "equilibria" ?
        ["restart", "seed-resume-batch", "newton-resume-batch"] : ["single"]) {
        const cache = new core.VectorField3DVerifiedTileCache(document, manifestJson, fingerprint);
        const tileStart = performance.now();
        let result, requests = 0, continuation;
        for (;;) {
          try {
            result = mode === "trajectory" ?
              core.integrateVectorField3DVerifiedTileTrajectories(document, cache) :
              core.searchVectorField3DVerifiedTileEquilibria(document, cache, {}, continuation);
            break;
          } catch (cause) {
            if (mode === "trajectory" && cause instanceof core.VectorField3DNeededTile) {
              const tile = await host.previewScientificGraphVectorTile(directory, fingerprint,
                "field", names, cause.indices);
              cache.add(tile); requests++; continue;
            }
            if (!(cause instanceof core.VectorField3DEquilibriumNeedsTiles)) throw cause;
            if (variant !== "restart") {
              if (variant === "seed-resume-batch") {
                const { activeSeed, ...checkpoint } = cause.continuation;
                continuation = { ...checkpoint, attemptedSeeds: checkpoint.attemptedSeeds - 1,
                  evaluations: activeSeed.startEvaluations };
              } else continuation = cause.continuation;
              const tiles = await host.previewScientificGraphVectorTiles(directory, fingerprint,
                "field", names, cause.indicesBatch);
              tiles.forEach(tile => cache.add(tile)); requests++;
            } else {
              const tile = await host.previewScientificGraphVectorTile(directory, fingerprint,
                "field", names, cause.indicesBatch[0]);
              cache.add(tile); requests++;
            }
          }
        }
        variants.push({ variant, firstResultMs: +(performance.now() - tileStart).toFixed(1), requests,
          residentTileBytes: cache.residentBytes,
          verifiedTilesPerComponent: cache.provenance.map(part => part.verifiedTiles),
          resultCount: mode === "trajectory" ? result.trajectories.length : result.candidates.length,
          candidates: mode === "equilibria" ? result.candidates : undefined,
          evaluations: mode === "equilibria" ? result.evaluations : undefined,
          attemptedSeeds: mode === "equilibria" ? result.attemptedSeeds : undefined,
          rejectedSeeds: mode === "equilibria" ? result.rejectedSeeds : undefined });
      }
      if (mode === "equilibria" &&
          variants.slice(1).some(variant =>
            JSON.stringify(variants[0].candidates) !== JSON.stringify(variant.candidates) ||
            variants[0].evaluations !== variant.evaluations ||
            variants[0].attemptedSeeds !== variant.attemptedSeeds ||
            variants[0].rejectedSeeds !== variant.rejectedSeeds))
        throw new Error(`Resumed equilibrium candidates differ: ${label}`);
      methods.push({ operation: mode,
        bounded: { firstResultMs: +boundedMs.toFixed(1),
          transferredValueBytes: volumes[0].values.length * 8 * 3,
          verifiedTilesPerComponent: volumes.map(part => part.verifiedTiles?.length ?? null),
          resultCount: mode === "trajectory" ? bounded.trajectories.length : bounded.candidates.length },
        sourceTiles: variants.map(({ candidates, ...summary }) => summary) });
    }
    results.push({ fixture: label, shape, methods });
  }
  process.stdout.write(`${JSON.stringify({ note: "Sequential local run; disk cache and JIT affect time. Resident tile bytes are deterministic, not process peak RSS.", results }, null, 2)}\n`);
} finally {
  if (!resolve(temporary).startsWith(`${resolve(tmpdir())}${sep}`) ||
      !basename(temporary).startsWith("math3d-tile-solvers-benchmark-"))
    throw new Error("Unsafe benchmark cleanup directory.");
  await rm(temporary, { recursive: true, force: true });
}
