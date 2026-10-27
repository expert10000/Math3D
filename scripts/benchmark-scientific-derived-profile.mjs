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
const temporary = await mkdtemp(join(tmpdir(), "math3d-derived-profile-benchmark-"));
const vortexLaplacian = (x, y, z) => {
  const r2 = x * x + y * y, denominator = 16 + r2;
  const a = 16 / denominator, q = r2 * a * a + Math.sin(z) ** 2 / 16;
  const speed = Math.sqrt(q);
  const qRadial = 256 * (16 - r2) / denominator ** 3;
  const qGradient = [2 * x * qRadial, 2 * y * qRadial, Math.sin(2 * z) / 16];
  const qLaplacian = 1024 * (256 - 64 * r2 + r2 * r2) / denominator ** 4 + Math.cos(2 * z) / 8;
  return qLaplacian / (2 * speed) -
    qGradient.reduce((sum, value) => sum + value * value, 0) / (4 * speed ** 3);
};
try {
  const entry = join(temporary, "entry.ts"), compiled = join(temporary, "core.cjs");
  await writeFile(entry, [
    "export { createGraph2DFieldReference } from '" + root.replaceAll("\\", "/") + "/packages/core/src/graph2dFieldReference.ts';",
    "export { createVectorField3DDocument } from '" + root.replaceAll("\\", "/") + "/packages/core/src/vectorField3DDocument.ts';",
    "export { sampleVectorField3DDerivedSlice } from '" + root.replaceAll("\\", "/") + "/packages/core/src/vectorField3DDifferential.ts';",
    "export { createVectorField3DDerivedLine } from '" + root.replaceAll("\\", "/") + "/packages/core/src/vectorField3DDerivedLine.ts';",
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
        componentUnits: [manifest.datasets[0].quantity.unit, manifest.datasets[0].quantity.unit,
          manifest.datasets[0].quantity.unit] }, seeds: [],
      display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
      solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6, maxSteps: 1000, maxTime: 1 } },
    { stableKey: `benchmark-${names[0]}` });
    const fixedIndex = Math.round(15 * (shape[2] - 1) / 31);
    const yIndex = Math.round(15 * (shape[1] - 1) / 31);
    const z = core.scientificAxisCoordinate({ ...references[0].axes[2], count: shape[2] }, fixedIndex);
    const y = core.scientificAxisCoordinate({ ...references[0].axes[1], count: shape[1] }, yIndex);
    const profiles = [];
    for (const kind of ["stencil-slice", "source-stencil-slice"]) {
      const start = performance.now();
      const samples = await host.previewScientificGraphVectorSamples(directory, fingerprint,
        "field", names, { kind, normalAxis: 2, fixedIndex });
      const transferMs = performance.now() - start;
      const slice = core.sampleVectorField3DDerivedSlice(document, 2, z, "laplacian-speed",
        { manifestJson, fingerprint, samples });
      const line = core.createVectorField3DDerivedLine(document, slice, 0, y);
      profiles.push({ kind, firstProfileMs: +(performance.now() - start).toFixed(1),
        transferMs: +transferMs.toFixed(1), transferredValueBytes: samples.components[0].values.length * 8 * 3,
        samplesPerComponent: samples.components[0].values.length,
        verifiedTilesPerComponent: samples.components.map(part => part.verifiedTiles.length),
        line });
    }
    const [bounded, source] = profiles;
    const difference = Math.max(...source.line.rows.map((row, index) =>
      Math.abs((row.y ?? 0) - (bounded.line.rows[index].y ?? 0))));
    const accuracy = label === "80³ analytic vortex" ? profiles.map(({ kind, line }) => {
      const errors = line.rows.map(row => Math.abs(row.y - vortexLaplacian(row.x, y, z)));
      return { kind, meanAbsError: errors.reduce((sum, value) => sum + value, 0) / errors.length,
        maxAbsError: Math.max(...errors) };
    }) : undefined;
    results.push({ fixture: label, shape, profiles: profiles.map(({ line, ...rest }) => rest),
      ...(accuracy ? { analyticLaplacianAccuracy: accuracy } : {}),
      maxAbsProfileDifference: difference });
  }
  process.stdout.write(`${JSON.stringify({ note: "One sequential run per mode; OS file cache affects timings.", results }, null, 2)}\n`);
} finally {
  if (!resolve(temporary).startsWith(`${resolve(tmpdir())}${sep}`) ||
      !basename(temporary).startsWith("math3d-derived-profile-benchmark-"))
    throw new Error("Unsafe benchmark cleanup directory.");
  await rm(temporary, { recursive: true, force: true });
}
