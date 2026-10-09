import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const f64 = values => {
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
  return bytes;
};
async function writeBundle(directory, scene, artifacts) {
  await mkdir(directory, { recursive: true });
  const sceneBytes = Buffer.from(JSON.stringify(scene, null, 2) + "\n");
  for (const [path, bytes] of artifacts) await writeFile(join(directory, path), bytes);
  await writeFile(join(directory, "scene.json"), sceneBytes);
  await writeFile(join(directory, "bundle.json"), JSON.stringify({ schema: "quantum-scene-bundle/v1",
    scene: { path: "scene.json", bytes: sceneBytes.length, sha256: hash(sceneBytes) } }, null, 2) + "\n");
}
const definitions = {
  square: { dimensions: 2, translations: [[1, 0, 0], [0, 1, 0]], basis: [{ label: "A", position: [0, 0, 0] }], repeats: [2, 2, 1] },
  honeycomb: { dimensions: 2, translations: [[Math.sqrt(3), 0, 0], [Math.sqrt(3) / 2, 1.5, 0]],
    basis: [{ label: "A", position: [0, 0, 0] }, { label: "B", position: [0, 1, 0] }], repeats: [2, 2, 1] },
  simple_cubic: { dimensions: 3, translations: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    basis: [{ label: "A", position: [0, 0, 0] }], repeats: [2, 2, 2] },
};

/** Deterministic geometry-only fixtures with the same bounded lattice vocabulary as Theory Lab. */
export async function writeLatticeFixture(directory, family) {
  const definition = definitions[family];
  if (!definition) throw new TypeError("Unsupported lattice fixture");
  const { dimensions, translations, basis, repeats } = definition;
  const at = (cell, offset = [0, 0, 0]) => [0, 1, 2].map(axis =>
    offset[axis] + translations.reduce((sum, vector, index) => sum + vector[axis] * cell[index], 0));
  const sites = [], cells = [], basisIndices = [], bonds = [];
  const inside = cell => cell.every((value, axis) => value >= 0 && value < repeats[axis]);
  for (let x = 0; x < repeats[0]; x++) for (let y = 0; y < repeats[1]; y++) for (let z = 0; z < repeats[2]; z++) {
    const cell = [x, y, z];
    for (let i = 0; i < basis.length; i++) { sites.push(...at(cell, basis[i].position)); cells.push(...cell); basisIndices.push(i); }
    if (family === "honeycomb") bonds.push(...at(cell, basis[0].position), ...at(cell, basis[1].position));
    else for (let axis = 0; axis < dimensions; axis++) {
      const next = [...cell]; next[axis]++;
      if (inside(next)) bonds.push(...at(cell), ...at(next));
    }
  }
  const descriptor = Buffer.from(`math3d-q04-geometry:${family}`);
  const id = `fixture-${hash(descriptor).slice(0, 24)}`;
  const scene = {
    schema: "quantum-scene/v1", id, title: `${family} open lattice geometry`,
    provenance: { kind: "geometry-fixture", runId: id, jobId: id, model: family, engine: "geometry",
      engineVersion: "qvis/1", computedAt: "not applicable (no calculation)", resultSha256: hash(descriptor),
      adapter: "qvis/1" },
    coordinates: { handedness: "right", axes: ["x", "y", "z"], units: ["schematic spacing", "schematic spacing", "schematic spacing"] },
    camera: { position: [6, -6, 5], target: [0.5, 0.5, 0], up: [0, 0, 1] },
    datasets: [], objects: [], annotations: [],
    lattice: { ...definition, boundary: "open", sites: "lattice-sites", cells: "site-cells", basisIndices: "site-basis" },
  };
  const artifacts = new Map();
  const addData = (id, values, components, unit) => {
    const path = `${id}.f64`, bytes = f64(values);
    artifacts.set(path, bytes);
    scene.datasets.push({ id, path, format: "f64le", count: values.length / components, components,
      unit, bytes: bytes.length, sha256: hash(bytes) });
  };
  addData("lattice-sites", sites, 3, "schematic spacing");
  addData("site-cells", cells, 3, "integer primitive cell indices");
  addData("site-basis", basisIndices, 1, "integer basis index");
  scene.objects.push({ id: "lattice-sites-object", label: "Supplied basis sites", kind: "point-cloud",
    positions: "lattice-sites", scalars: "site-basis", visible: true,
    style: { color: "#79d9c1", opacity: 1, size: 0.15 } });
  if (bonds.length) {
    addData("geometric-bonds", bonds, 3, "schematic spacing");
    scene.objects.push({ id: "geometric-bonds", label: "Supplied geometric links (no hopping)", kind: "segments",
      positions: "geometric-bonds", visible: true, style: { color: "#79d9c1", opacity: 1, size: 1 } });
  }
  await writeBundle(directory, scene, artifacts);
  return { scene, arrays: { sites, cells, basisIndices, bonds } };
}

/** The v1 lattice block cannot express 1D. Keep a chain as supplied Geometry, without a fictitious 2D basis. */
export async function writeOneDimensionalChainFixture(directory) {
  const descriptor = Buffer.from("math3d-q04-geometry:one-dimensional-chain"), id = `fixture-${hash(descriptor).slice(0, 24)}`;
  const sites = [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0];
  const links = [0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0, 2, 0, 0, 3, 0, 0];
  const siteBytes = f64(sites), linkBytes = f64(links);
  const dataset = (id, bytes, count) => ({ id, path: `${id}.f64`, format: "f64le", count, components: 3,
    unit: "schematic spacing", bytes: bytes.length, sha256: hash(bytes) });
  const scene = { schema: "quantum-scene/v1", id, title: "1D open chain · supplied geometry fixture",
    provenance: { kind: "geometry-fixture", runId: id, jobId: id, model: "one_dimensional_chain", engine: "geometry",
      engineVersion: "qvis/1", computedAt: "not applicable (no calculation)", resultSha256: hash(descriptor), adapter: "qvis/1" },
    coordinates: { handedness: "right", axes: ["chain x", "display y", "display z"],
      units: ["schematic spacing", "dimensionless", "dimensionless"] },
    camera: { position: [4, -4, 3], target: [1.5, 0, 0], up: [0, 0, 1] },
    datasets: [dataset("chain-sites", siteBytes, 4), dataset("chain-links", linkBytes, 6)],
    objects: [
      { id: "chain-sites-object", label: "Supplied chain sites", kind: "point-cloud", positions: "chain-sites", visible: true,
        style: { color: "#79d9c1", opacity: 1, size: 0.15 } },
      { id: "chain-links-object", label: "Supplied geometric links", kind: "segments", positions: "chain-links", visible: true,
        style: { color: "#79d9c1", opacity: 1, size: 1 } },
    ],
    annotations: [{ id: "chain-contract", text: "1D supplied geometry; no lattice basis or periodic bonds in quantum-scene/v1",
      position: [1.5, 0, 0.5] }],
  };
  await writeBundle(directory, scene, new Map([["chain-sites.f64", siteBytes], ["chain-links.f64", linkBytes]]));
  return scene;
}
