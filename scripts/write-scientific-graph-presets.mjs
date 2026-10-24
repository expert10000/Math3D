import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "tests", "fixtures", "scientific-scene");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const encode = values => {
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
  return bytes;
};
const coordinates = (id, axes, origin, spacing) => ({ id, kind: "cartesian", axes,
  origin, spacing, periodic: axes.map(() => false) });
const grid = (shape, sample) => {
  const values = [];
  for (let first = 0; first < shape[0]; first++) for (let second = 0; second < shape[1]; second++) {
    if (shape.length === 2) values.push(sample(first, second));
    else for (let third = 0; third < shape[2]; third++) values.push(sample(first, second, third));
  }
  return values;
};

const complexShape = [41, 41], complexOrigin = [-4, -4], complexSpacing = [0.2, 0.2];
const wave = (i, j) => {
  const x = complexOrigin[0] + i * complexSpacing[0], y = complexOrigin[1] + j * complexSpacing[1];
  const envelope = Math.exp(-(x * x + y * y) / 18);
  const phase = 2.2 * x + 0.9 * y + 0.4 * Math.sin(y);
  return [envelope * Math.cos(phase), envelope * Math.sin(phase)];
};
const complexVolumeShape = [41, 41, 17], complexVolumeOrigin = [-4, -4, -2];
const complexVolumeSpacing = [0.2, 0.2, 0.25];
const volumeWave = (i, j, k) => {
  const x = complexVolumeOrigin[0] + i * complexVolumeSpacing[0];
  const y = complexVolumeOrigin[1] + j * complexVolumeSpacing[1];
  const z = complexVolumeOrigin[2] + k * complexVolumeSpacing[2];
  const envelope = Math.exp(-(x * x + y * y) / 18 - z * z / 12);
  const phase = 1.3 * x + 0.8 * y + 0.65 * z + 0.25 * Math.sin(y);
  return [envelope * Math.cos(phase), envelope * Math.sin(phase)];
};
const vortexShape = [33, 33], vortexOrigin = [-4, -4], vortexSpacing = [0.25, 0.25];
const vortex = (i, j) => {
  const x = vortexOrigin[0] + i * vortexSpacing[0], y = vortexOrigin[1] + j * vortexSpacing[1];
  const amplitude = 1 / (1 + (x * x + y * y) / 8);
  return [-y * amplitude, x * amplitude];
};
const volumeShape = [21, 21, 17], volumeOrigin = [-4, -4, -3], volumeSpacing = [0.4, 0.4, 0.375];
const volume = (i, j, k) => {
  const x = volumeOrigin[0] + i * volumeSpacing[0];
  const y = volumeOrigin[1] + j * volumeSpacing[1];
  const z = volumeOrigin[2] + k * volumeSpacing[2];
  const envelope = Math.exp(-(x * x + y * y) / 18) * (0.55 + 0.45 * Math.cos(z * Math.PI / 6));
  return [-y * envelope, x * envelope, 0.8 * Math.sin(z * Math.PI / 3) * Math.exp(-(x * x + y * y) / 12)];
};

const presets = [
  { directory: "complex-wave.sscene", sceneId: "complex-wave", title: "Complex wave packet · 2D",
    shape: complexShape, coordinate: coordinates("plane", [{ name: "x", unit: "m" }, { name: "y", unit: "m" }],
      complexOrigin, complexSpacing), quantity: { name: "Wave amplitude", unit: "1" },
    semanticType: "complex-scalar-field", components: ["real", "imaginary"], sample: wave },
  { directory: "complex-wave-volume.sscene", sceneId: "complex-wave-volume", title: "Complex wave volume · 3D",
    shape: complexVolumeShape, coordinate: coordinates("space", [{ name: "x", unit: "m" },
      { name: "y", unit: "m" }, { name: "z", unit: "m" }], complexVolumeOrigin, complexVolumeSpacing),
    quantity: { name: "Wave amplitude", unit: "1" }, semanticType: "complex-scalar-field",
    components: ["real", "imaginary"], sample: volumeWave },
  { directory: "vortex-flow.sscene", sceneId: "vortex-flow", title: "Planar vortex · 2D vector field",
    shape: vortexShape, coordinate: coordinates("plane", [{ name: "x", unit: "m" }, { name: "y", unit: "m" }],
      vortexOrigin, vortexSpacing), quantity: { name: "Velocity", unit: "m/s" },
    semanticType: "vector-field", components: ["east", "north"], sample: vortex },
  { directory: "vortex-volume.sscene", sceneId: "vortex-volume", title: "Swirling flow · 3D vector field",
    shape: volumeShape, coordinate: coordinates("space", [{ name: "x", unit: "m" }, { name: "y", unit: "m" },
      { name: "z", unit: "m" }], volumeOrigin, volumeSpacing), quantity: { name: "Velocity", unit: "m/s" },
    semanticType: "vector-field", components: ["east", "north", "up"], sample: volume },
];

for (const preset of presets) {
  const directory = join(root, preset.directory);
  const samples = grid(preset.shape, preset.sample);
  const resources = preset.components.map((name, component) => {
    const bytes = encode(samples.map(sample => sample[component]));
    return { id: name, path: `${name}.f64`, format: "f64le", count: samples.length,
      bytes: bytes.length, sha256: sha256(bytes), data: bytes };
  });
  const sourceBytes = Buffer.concat(resources.map(item => item.data));
  const dataset = { id: "field", semanticType: preset.semanticType, coordinateSystem: preset.coordinate.id,
    shape: preset.shape, order: "last-axis-fastest", quantity: preset.quantity,
    ...(preset.semanticType === "complex-scalar-field" ? { real: "real", imaginary: "imaginary" } :
      { components: preset.components.map(name => ({ name, resource: name })) }) };
  const manifest = { schema: "scientific-scene/v1", sceneId: preset.sceneId, title: preset.title,
    source: { producer: "math3d-fixture", sourceId: `${preset.sceneId}-v1`, sourceSchema: "scientific-fixture/v1",
      sha256: sha256(sourceBytes) },
    resources: resources.map(({ data: _data, ...descriptor }) => descriptor),
    coordinates: [preset.coordinate], datasets: [dataset], views: [] };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  const bundle = { schema: "scientific-scene-bundle/v1", manifest: { path: "manifest.json",
    bytes: manifestBytes.length, sha256: sha256(manifestBytes) } };
  const files = [["manifest.json", manifestBytes], ["bundle.json", Buffer.from(JSON.stringify(bundle, null, 2) + "\n")],
    ...resources.map(item => [item.path, item.data])];
  if (process.argv.includes("--check")) {
    for (const [name, expected] of files) {
      const actual = await readFile(join(directory, name));
      if (!actual.equals(expected)) throw new Error(`Scientific Graph preset changed: ${preset.directory}/${name}`);
    }
    console.log(`Verified ${preset.directory}: ${bundle.manifest.sha256}`);
  } else {
    await mkdir(directory, { recursive: true });
    for (const [name, bytes] of files) await writeFile(join(directory, name), bytes);
    console.log(`Wrote ${preset.directory}: ${bundle.manifest.sha256}`);
  }
}
