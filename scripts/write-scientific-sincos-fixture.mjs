import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const directory = join(import.meta.dirname, "..", "tests", "fixtures", "scientific-scene", "sincos.sscene");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const shape = [17, 17];
const origin = [-Math.PI, -Math.PI];
const spacing = [Math.PI / 8, Math.PI / 8];
const values = Buffer.alloc(shape[0] * shape[1] * 8);
for (let x = 0; x < shape[0]; x++) for (let y = 0; y < shape[1]; y++)
  values.writeDoubleLE(Math.sin(origin[0] + x * spacing[0]) * Math.cos(origin[1] + y * spacing[1]),
    (x * shape[1] + y) * 8);
const manifest = {
  schema: "scientific-scene/v1", sceneId: "sincos-grid", title: "sin(x) cos(y) · supplied scalar grid",
  source: { producer: "math3d-fixture", sourceId: "sincos-v1", sourceSchema: "scientific-fixture/v1", sha256: sha256(values) },
  resources: [{ id: "values", path: "values.f64", format: "f64le", count: shape[0] * shape[1], bytes: values.length,
    sha256: sha256(values) }],
  coordinates: [{ id: "xy", kind: "cartesian", axes: [{ name: "x", unit: "1" }, { name: "y", unit: "1" }],
    origin, spacing, periodic: [false, false] }],
  datasets: [{ id: "f", semanticType: "scalar-field", coordinateSystem: "xy", shape,
    order: "last-axis-fastest", quantity: { name: "scalar value", unit: "1", symbol: "f" }, real: "values" }],
  views: [{ id: "surface", label: "f(x,y) height surface", dataset: "f", renderer: "height-surface", operation: "identity" }],
};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
const bundle = { schema: "scientific-scene-bundle/v1", manifest: { path: "manifest.json", bytes: manifestBytes.length,
  sha256: sha256(manifestBytes) } };
const files = [["bundle.json", Buffer.from(JSON.stringify(bundle, null, 2) + "\n")],
  ["manifest.json", manifestBytes], ["values.f64", values]];

if (process.argv.includes("--check")) {
  for (const [name, expected] of files) {
    const actual = await readFile(join(directory, name));
    if (!actual.equals(expected)) throw new Error(`Scientific fixture changed: ${name}`);
  }
  console.log("Deterministic scientific sincos fixture verified");
} else {
  await mkdir(directory, { recursive: true });
  for (const [name, bytes] of files) await writeFile(join(directory, name), bytes);
  console.log(`Wrote scientific sincos fixture to ${directory}`);
}
