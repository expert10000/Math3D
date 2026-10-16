import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const directory = join(import.meta.dirname, "..", "tests", "fixtures", "scientific-scene", "thermal-gradient.sscene");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const shape = [5, 7];
const values = Buffer.alloc(shape[0] * shape[1] * 8);
for (let time = 0; time < shape[0]; time += 1) for (let distance = 0; distance < shape[1]; distance += 1)
  values.writeDoubleLE(280 + 0.75 * time + 1.5 * (2 * distance), (time * shape[1] + distance) * 8);
const manifest = {
  schema: "scientific-scene/v1", sceneId: "thermal-gradient", title: "Thermal gradient · sample scalar grid",
  source: { producer: "math3d-fixture", sourceId: "thermal-gradient-v1", sourceSchema: "scientific-fixture/v1",
    sha256: sha256(values) },
  resources: [{ id: "temperature", path: "temperature.f64", format: "f64le", count: shape[0] * shape[1],
    bytes: values.length, sha256: sha256(values) }],
  coordinates: [{ id: "time-distance", kind: "cartesian",
    axes: [{ name: "time", unit: "s" }, { name: "distance", unit: "m" }],
    origin: [0, 0], spacing: [1, 2], periodic: [false, false] }],
  datasets: [{ id: "temperature", semanticType: "scalar-field", coordinateSystem: "time-distance", shape,
    order: "last-axis-fastest", quantity: { name: "Temperature", unit: "K" }, real: "temperature" }],
  views: [{ id: "surface", label: "Temperature height surface", dataset: "temperature",
    renderer: "height-surface", operation: "identity" }],
};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
const bundle = { schema: "scientific-scene-bundle/v1", manifest: { path: "manifest.json", bytes: manifestBytes.length,
  sha256: sha256(manifestBytes) } };
const files = [["bundle.json", Buffer.from(JSON.stringify(bundle, null, 2) + "\n")],
  ["manifest.json", manifestBytes], ["temperature.f64", values]];

if (process.argv.includes("--check")) {
  for (const [name, expected] of files) {
    const actual = await readFile(join(directory, name));
    if (!actual.equals(expected)) throw new Error(`Scientific thermal fixture changed: ${name}`);
  }
  console.log(`Deterministic thermal grid verified: ${bundle.manifest.sha256}`);
} else {
  await mkdir(directory, { recursive: true });
  for (const [name, bytes] of files) await writeFile(join(directory, name), bytes);
  console.log(`Wrote scientific thermal fixture: ${bundle.manifest.sha256}`);
}
