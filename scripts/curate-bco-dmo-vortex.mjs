import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { auditBcoDmoVortex } from "./audit-bco-dmo-vortex.mjs";
import { tileScientificScene } from "./tile-scientific-scene.mjs";

export const BCO_DMO_VORTEX = Object.freeze({
  doi: "10.26008/1912/bco-dmo.834530.1",
  page: "https://www.bco-dmo.org/dataset/834530",
  fileUrl: "https://datadocs.bco-dmo.org/dataset/834530/file/vmmwyR7c4JLlGB/flow_field.csv",
  license: "https://creativecommons.org/licenses/by/4.0/",
  sourceBytes: 133557055,
  sourceSha256: "31aa11b267183803bd3c4f40b30e5758a3d9ca7f09f539232341547375a79982",
  publishedMd5: "f2e18e754092c2e8e78eb71eaacdf407",
  selection: { Flow_field: "horizontal", Level: "level1" },
  gridToleranceMm: 1.1e-6,
});
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const names = ["vx", "vy", "vz"];

async function fileHash(path, algorithm) {
  const digest = createHash(algorithm);
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

/** Read one measured treatment without interpolation, fabricating missing values, or swapping axes. */
export async function readBcoDmoTreatment(rawPath) {
  const path = resolve(rawPath), size = (await stat(path)).size;
  if (size !== BCO_DMO_VORTEX.sourceBytes ||
      await fileHash(path, "sha256") !== BCO_DMO_VORTEX.sourceSha256 ||
      await fileHash(path, "md5") !== BCO_DMO_VORTEX.publishedMd5)
    throw new TypeError("BCO-DMO source bytes changed from the pinned published file.");
  const audit = await auditBcoDmoVortex(path);
  if (audit.missing || audit.malformed)
    throw new TypeError("The BCO-DMO file contains missing or malformed numeric rows.");
  const selected = audit.groups["horizontal/level1"];
  if (!selected || selected.rows !== selected.completeCount ||
      selected.axes.some(axis => axis.count < 2 || axis.count > 256 ||
        axis.maxGridResidual > BCO_DMO_VORTEX.gridToleranceMm))
    throw new TypeError("The selected treatment is not a complete regular grid.");
  // CSV coordinates are rounded to six decimal places. Use the actual sorted strings for
  // row identity; the regular manifest axis uses the endpoint-derived spacing.
  const actual = [new Set(), new Set(), new Set()];
  const input = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of input) {
    const fields = line.split(",");
    if (fields[6] === "horizontal" && fields[7] === "level1")
      for (let axis = 0; axis < 3; axis++) actual[axis].add(Number(fields[axis]));
  }
  const sorted = actual.map(set => [...set].sort((a, b) => a - b));
  if (sorted.some((axis, index) => axis.length !== selected.axes[index].count))
    throw new Error("Selected coordinate count changed during curation.");
  const coordinateIndex = sorted.map(axis => new Map(axis.map((value, index) => [value, index])));
  const shape = selected.shape, count = selected.completeCount;
  const values = names.map(() => Buffer.alloc(count * 8));
  const seen = new Uint8Array(count);
  let selectedRows = 0;
  const rows = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rows) {
    const fields = line.split(",");
    if (fields[6] !== "horizontal" || fields[7] !== "level1") continue;
    const point = [0, 1, 2].map(axis => coordinateIndex[axis].get(Number(fields[axis])));
    if (point.some(index => index === undefined)) throw new Error("Selected grid coordinate changed.");
    const offset = (point[0] * shape[1] + point[1]) * shape[2] + point[2];
    if (seen[offset]) throw new TypeError("Duplicate selected grid cell.");
    seen[offset] = 1; selectedRows++;
    for (let component = 0; component < 3; component++) {
      const value = Number(fields[component + 3]);
      if (!Number.isFinite(value)) throw new TypeError("Selected velocity is missing or non-finite.");
      values[component].writeDoubleLE(value, offset * 8);
    }
  }
  if (selectedRows !== count || seen.some(value => value !== 1))
    throw new TypeError("Selected treatment has missing grid cells.");
  return { audit, selected, shape, coordinates: sorted, values, selectedRows };
}

export async function curateBcoDmoVortex(rawPath, destination) {
  const output = resolve(destination);
  if (!basename(output).toLowerCase().endsWith(".sscene"))
    throw new TypeError("Choose a new .sscene output directory.");
  const treatment = await readBcoDmoTreatment(rawPath);
  const temp = await mkdtemp(join(tmpdir(), "m3d-bco-dmo-vortex-"));
  try {
    const source = join(temp, "source.sscene");
    await mkdir(source);
    const resources = [];
    for (let component = 0; component < names.length; component++) {
      const name = names[component], bytes = treatment.values[component];
      await writeFile(join(source, `${name}.f64`), bytes);
      resources.push({ id: name, path: `${name}.f64`, format: "f64le",
        count: treatment.selectedRows, bytes: bytes.length, sha256: sha(bytes) });
    }
    const axes = treatment.selected.axes;
    const manifest = Buffer.from(`${JSON.stringify({
      schema: "scientific-scene/v1", sceneId: "bco-dmo-burgers-h1",
      title: "Measured Burgers vortex · horizontal level 1",
      source: { producer: "BCO-DMO", sourceId: "bco-dmo-834530-horizontal-level1",
        sourceSchema: "bco-dmo-flow-field/v1", sha256: BCO_DMO_VORTEX.sourceSha256 },
      resources, coordinates: [{ id: "space", kind: "cartesian",
        axes: ["x", "y", "z"].map(name => ({ name, unit: "m" })),
        origin: axes.map(axis => axis.min / 1000),
        spacing: axes.map(axis => axis.idealSpacing / 1000),
        periodic: [false, false, false] }],
      datasets: [{ id: "field", semanticType: "vector-field", coordinateSystem: "space",
        shape: treatment.shape, order: "last-axis-fastest",
        quantity: { name: "Measured water velocity", unit: "m/s" },
        components: names.map(name => ({ name, resource: name })) }], views: [],
    }, null, 2)}\n`);
    await writeFile(join(source, "manifest.json"), manifest);
    await writeFile(join(source, "bundle.json"), `${JSON.stringify({
      schema: "scientific-scene-bundle/v1",
      manifest: { path: "manifest.json", bytes: manifest.length, sha256: sha(manifest) },
    }, null, 2)}\n`);
    const converted = await tileScientificScene(source, output);
    const tiledManifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
    const recipe = {
      schema: "math3d-scientific-curation/v1",
      source: { doi: BCO_DMO_VORTEX.doi, page: BCO_DMO_VORTEX.page,
        fileUrl: BCO_DMO_VORTEX.fileUrl, license: BCO_DMO_VORTEX.license,
        file: "flow_field.csv", bytes: BCO_DMO_VORTEX.sourceBytes,
        sha256: BCO_DMO_VORTEX.sourceSha256, publishedMd5: BCO_DMO_VORTEX.publishedMd5 },
      selection: { ...BCO_DMO_VORTEX.selection, rows: treatment.selectedRows,
        shape: treatment.shape, missingValues: treatment.audit.missing,
        duplicateCells: 0, omittedSelectedRows: 0 },
      coordinates: { sourceUnit: "mm", sceneUnit: "m", scale: 0.001,
        sourceAxes: treatment.selected.axes.map(axis => ({ min: axis.min, max: axis.max,
          count: axis.count, idealSpacing: axis.idealSpacing,
          maxGridResidual: axis.maxGridResidual })),
        roundingToleranceMm: BCO_DMO_VORTEX.gridToleranceMm },
      values: { sourceColumns: ["V_x", "V_y", "V_z"], sceneComponents: names,
        unit: "m/s", resampling: "none", missingValueImputation: "none" },
      output: { scene: basename(output), fingerprint: converted.fingerprint,
        resourceSha256: tiledManifest.resources.map(item => item.sha256),
        logicalResourceSha256: resources.map(item => item.sha256),
        tileShape: converted.tileShapes,
        overviewBytes: converted.overviewBytes },
    };
    const recipePath = join(dirname(output), `${basename(output, ".sscene")}.curation.json`);
    await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
    return { ...converted, recipePath, selectedRows: treatment.selectedRows,
      shape: treatment.shape, sourceSha256: BCO_DMO_VORTEX.sourceSha256 };
  } finally {
    const path = resolve(temp), relativePath = relative(resolve(tmpdir()), path);
    if (relativePath && !relativePath.startsWith(`..${sep}`) && relativePath !== ".." &&
        !isAbsolute(relativePath) && basename(path).startsWith("m3d-bco-dmo-vortex-"))
      await rm(path, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.argv[2] ?? join("data", "bco-dmo-834530-flow_field.csv");
  const output = process.argv[3] ?? join("output", "scientific-burgers-horizontal-level1.sscene");
  process.stdout.write(`${JSON.stringify(await curateBcoDmoVortex(source, output))}\n`);
}
