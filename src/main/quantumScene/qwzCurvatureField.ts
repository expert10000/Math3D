import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImportedQuantumScene } from "./importer";
import { sceneFingerprint } from "./recent";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Copy only the supplied scalar samples; refuse a nonregular or reinterpreted display mesh. */
export function qwzCurvatureScientificField(imported: ImportedQuantumScene) {
  const scene = imported.source;
  const object = scene.objects.find(item => item.id === "berry-curvature");
  if (scene.schema !== "quantum-scene/v1" || scene.provenance.model !== "qwz" ||
      !object || object.kind !== "mesh" || !object.positions || !object.scalars ||
      scene.coordinates.axes[0] !== "kx" || scene.coordinates.axes[1] !== "ky")
    throw new TypeError("A verified QWZ Berry-curvature mesh is required.");
  const positions = scene.datasets.find(item => item.id === object.positions);
  const scalar = scene.datasets.find(item => item.id === object.scalars);
  const grid = positions && imported.arrays.get(positions.id);
  const values = scalar && imported.arrays.get(scalar.id);
  const size = scalar && Math.sqrt(scalar.count);
  if (!positions || !scalar || !grid || !values || !size || !Number.isSafeInteger(size) ||
      size < 2 || size > 256 || positions.components !== 3 || scalar.components !== 1 ||
      positions.count !== scalar.count || grid.length !== scalar.count * 3 || values.length !== scalar.count)
    throw new TypeError("QWZ curvature grid and scalar dataset do not agree.");
  const origin = [grid[0]!, grid[1]!];
  const spacing = [grid[size * 3]! - origin[0], grid[4]! - origin[1]];
  if (spacing.some(value => !Number.isFinite(value) || value <= 0))
    throw new TypeError("QWZ curvature coordinates are not a regular increasing grid.");
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) {
    const index = x * size + y, offset = index * 3;
    const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    if (!close(grid[offset]!, origin[0] + x * spacing[0]!) ||
        !close(grid[offset + 1]!, origin[1] + y * spacing[1]!) ||
        !close(grid[offset + 2]!, values[index]!))
      throw new TypeError("QWZ display positions do not match the supplied scalar grid.");
  }
  const resource = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
  if (resource.length !== scalar.bytes || sha256(resource) !== scalar.sha256)
    throw new TypeError("QWZ curvature scalar bytes changed during promotion.");
  const sourceFingerprint = sceneFingerprint(imported);
  const manifest = {
    schema: "scientific-scene/v1" as const,
    sceneId: `qwz-curvature-${sourceFingerprint.slice(0, 16)}`,
    title: "QWZ lower-band Berry curvature",
    source: { producer: "theory-lab", sourceId: scene.id, sourceSchema: scene.schema, sha256: sourceFingerprint },
    resources: [{ id: "curvature", path: "curvature.f64", format: "f64le" as const,
      count: scalar.count, bytes: scalar.bytes, sha256: scalar.sha256 }],
    coordinates: [{ id: "reciprocal-grid", kind: "cartesian" as const,
      axes: [{ name: "kx", unit: scene.coordinates.units[0] }, { name: "ky", unit: scene.coordinates.units[1] }],
      origin, spacing, periodic: [false, false] }],
    datasets: [{ id: "berry-curvature", semanticType: "scalar-field" as const,
      coordinateSystem: "reciprocal-grid", shape: [size, size], order: "last-axis-fastest" as const,
      quantity: { name: object.label, unit: scalar.unit }, real: "curvature" }],
    views: [{ id: "curvature-plane", label: "Supplied Berry curvature", dataset: "berry-curvature",
      renderer: "height-surface" as const, operation: "identity" as const }],
  };
  return { manifest, resource: Buffer.from(resource), sourceFingerprint };
}

/** Materialize the verified 2D field for the existing native Field Explorer reader. */
export async function writeQwzCurvatureScientificField(imported: ImportedQuantumScene, root: string) {
  const { manifest, resource, sourceFingerprint } = qwzCurvatureScientificField(imported);
  const directory = join(root, `${sourceFingerprint}.sscene`);
  await mkdir(root, { recursive: true });
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const fingerprint = sha256(Buffer.from(manifestJson));
  const verifyWritten = async (path: string) => {
    const entries = await readdir(path);
    if (entries.sort().join(",") !== "bundle.json,curvature.f64,manifest.json")
      throw new TypeError("QWZ field bundle contains unexpected files.");
    for (const name of entries) {
      const info = await lstat(join(path, name));
      if (!info.isFile() || info.isSymbolicLink()) throw new TypeError("QWZ field bundle contains a linked file.");
    }
    const [savedManifest, savedResource, envelope] = await Promise.all([
      readFile(join(path, "manifest.json")), readFile(join(path, "curvature.f64")),
      readFile(join(path, "bundle.json"), "utf8")]);
    if (sha256(savedManifest) !== fingerprint || !savedResource.equals(resource) ||
        JSON.parse(envelope).manifest.sha256 !== fingerprint)
      throw new TypeError("QWZ field bundle differs from the verified source.");
  };
  try {
    await verifyWritten(directory);
    return { directory, fingerprint, manifestJson, sourceFingerprint };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = await mkdtemp(join(root, ".qwz-field-"));
  try {
    await writeFile(join(temporary, "curvature.f64"), resource);
    await writeFile(join(temporary, "manifest.json"), manifestJson);
    await writeFile(join(temporary, "bundle.json"), `${JSON.stringify({ schema: "scientific-scene-bundle/v1",
      manifest: { path: "manifest.json", bytes: Buffer.byteLength(manifestJson), sha256: fingerprint } }, null, 2)}\n`);
    await verifyWritten(temporary);
    await rename(temporary, directory);
    return { directory, fingerprint, manifestJson, sourceFingerprint };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
