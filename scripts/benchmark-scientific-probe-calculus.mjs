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
const temporary = await mkdtemp(join(tmpdir(), "math3d-probe-calculus-benchmark-"));
try {
  const entry = join(temporary, "entry.ts"), compiled = join(temporary, "core.cjs");
  await writeFile(entry, [
    "export { createGraph2DFieldReference } from '" + root.replaceAll("\\", "/") + "/packages/core/src/graph2dFieldReference.ts';",
    "export { createVectorField3DDocument } from '" + root.replaceAll("\\", "/") + "/packages/core/src/vectorField3DDocument.ts';",
    "export { analyzeVectorField3DDifferential } from '" + root.replaceAll("\\", "/") + "/packages/core/src/vectorField3DDifferential.ts';",
    "export { scientificAxisCoordinate } from '" + root.replaceAll("\\", "/") + "/packages/core/src/scientificDatasetCoordinates.ts';",
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
    const manifest = JSON.parse(manifestJson);
    const coordinate = manifest.coordinates.find(item => item.id === manifest.datasets[0].coordinateSystem);
    const shape = manifest.datasets[0].shape;
    const fingerprint = createHash("sha256").update(manifestJson).digest("hex");
    const references = names.map(name => core.createGraph2DFieldReference(manifestJson,
      fingerprint, { kind: "directory", value: directory }, "field", name));
    const axes = coordinate.axes.map((axis, index) => ({ role: ["x", "y", "z"][index],
      label: axis.name, unit: axis.unit, min: coordinate.origin[index],
      max: coordinate.origin[index] + coordinate.spacing[index] * (shape[index] - 1) }));
    const document = core.createVectorField3DDocument({ axes, timeUnit: "s",
      field: { kind: "scientific-bundle", references,
        componentUnits: Array(3).fill(manifest.datasets[0].quantity.unit) }, seeds: [],
      display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
      solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6, maxSteps: 1000, maxTime: 1 } },
    { stableKey: `benchmark-probe-${names[0]}` });
    const indices = shape.map(size => Math.round(15 * (size - 1) / 31));
    const position = indices.map((index, axis) => core.scientificAxisCoordinate(
      { ...references[0].axes[axis], count: shape[axis] }, index));
    const modes = [];
    for (const kind of ["bounded-volume", "source-stencil-probe"]) {
      const start = performance.now();
      const transfer = kind === "bounded-volume" ?
        { volumes: await host.previewScientificGraphVectorVolume(directory, fingerprint,
          "field", names) } :
        { samples: await host.previewScientificGraphVectorSamples(directory, fingerprint,
          "field", names, { kind, indices }) };
      const transferMs = performance.now() - start;
      const result = core.analyzeVectorField3DDifferential(document, position,
        { manifestJson, fingerprint, ...transfer });
      if (result.status !== "ready") throw new Error(`Calculus unavailable: ${label}, ${kind}`);
      const components = transfer.samples?.components ?? transfer.volumes;
      modes.push({ kind, firstProbeMs: +(performance.now() - start).toFixed(1),
        transferMs: +transferMs.toFixed(1),
        samplesPerComponent: components[0].values.length,
        transferredValueBytes: components[0].values.length * 8 * 3,
        verifiedTilesPerComponent: components.map(part => part.verifiedTiles?.length ?? null),
        verifiedSampleSha256: result.verifiedSamples?.map(part => part.sampleSha256) });
    }
    results.push({ fixture: label, shape, modes });
  }
  process.stdout.write(`${JSON.stringify({ note: "One sequential run per mode; OS file cache and JIT affect timings.", results }, null, 2)}\n`);
} finally {
  if (!resolve(temporary).startsWith(`${resolve(tmpdir())}${sep}`) ||
      !basename(temporary).startsWith("math3d-probe-calculus-benchmark-"))
    throw new Error("Unsafe benchmark cleanup directory.");
  await rm(temporary, { recursive: true, force: true });
}
