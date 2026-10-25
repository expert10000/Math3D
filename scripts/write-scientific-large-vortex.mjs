import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tileScientificScene } from "./tile-scientific-scene.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const components = ["east", "north", "up"];

/** Deterministic, physically labelled vortex field; generated on demand instead of committing large binaries. */
export async function writeLargeScientificV1(directory, size = 80) {
  if (!Number.isSafeInteger(size) || size < 16 || size > 80)
    throw new RangeError("Choose a cubic side from 16 to 80 within the scientific scene memory budget.");
  await mkdir(directory);
  const count = size ** 3, bytes = components.map(() => Buffer.alloc(count * 8));
  const origin = -4, spacing = 8 / (size - 1);
  let index = 0;
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) for (let z = 0; z < size; z++) {
    const px = origin + spacing * x, py = origin + spacing * y, pz = origin + spacing * z;
    const attenuation = 1 / (1 + (px * px + py * py) / 16);
    const vector = [-py * attenuation, px * attenuation, 0.25 * Math.sin(pz)];
    vector.forEach((value, component) => bytes[component].writeDoubleLE(value, index * 8));
    index++;
  }
  const resources = [];
  for (let part = 0; part < components.length; part++) {
    const name = components[part], data = bytes[part];
    await writeFile(join(directory, `${name}.f64`), data);
    resources.push({ id: name, path: `${name}.f64`, format: "f64le", count,
      bytes: data.length, sha256: sha(data) });
  }
  const spec = { equation: "(-y*a,x*a,0.25*sin(z)); a=1/(1+(x²+y²)/16)",
    shape: [size, size, size], origin, spacing, unit: "m/s" };
  const manifest = Buffer.from(`${JSON.stringify({ schema: "scientific-scene/v1",
    sceneId: `large-vortex-${size}`, title: `Generated vortex ${size}³`,
    source: { producer: "math3d-benchmark", sourceId: `large-vortex-${size}`,
      sourceSchema: "generated-vortex/v1", sha256: sha(Buffer.from(JSON.stringify(spec))) },
    resources, coordinates: [{ id: "space", kind: "cartesian",
      axes: ["x", "y", "z"].map(name => ({ name, unit: "m" })),
      origin: [origin, origin, origin], spacing: [spacing, spacing, spacing],
      periodic: [false, false, false] }],
    datasets: [{ id: "field", semanticType: "vector-field", coordinateSystem: "space",
      shape: [size, size, size], order: "last-axis-fastest",
      quantity: { name: "Velocity", unit: "m/s" },
      components: components.map(name => ({ name, resource: name })) }], views: [],
  }, null, 2)}\n`);
  await writeFile(join(directory, "manifest.json"), manifest);
  await writeFile(join(directory, "bundle.json"), `${JSON.stringify({
    schema: "scientific-scene-bundle/v1",
    manifest: { path: "manifest.json", bytes: manifest.length, sha256: sha(manifest) },
  }, null, 2)}\n`);
  return { shape: [size, size, size], sourceBytes: count * 8 * 3 };
}

export async function writeLargeScientificVortex(destination, size = 80) {
  if (!basename(destination).toLowerCase().endsWith(".sscene"))
    throw new TypeError("Choose a new .sscene destination.");
  const temp = await mkdtemp(join(tmpdir(), "m3d-large-scientific-"));
  try {
    const source = join(temp, "source.sscene");
    const fixture = await writeLargeScientificV1(source, size);
    const converted = await tileScientificScene(source, destination);
    return { ...fixture, ...converted };
  } finally {
    const path = resolve(temp), relativePath = relative(resolve(tmpdir()), path);
    if (relativePath && !relativePath.startsWith(`..${sep}`) && relativePath !== ".." &&
        !isAbsolute(relativePath) && basename(path).startsWith("m3d-large-scientific-"))
      await rm(path, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2] ?? join("output", "scientific-vortex-80-overview.sscene");
  const size = process.argv[3] === undefined ? 80 : Number(process.argv[3]);
  const result = await writeLargeScientificVortex(destination, size);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
