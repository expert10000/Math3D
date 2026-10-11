import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const encode = values => { const bytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8)); return bytes; };
const pi = Math.PI;
const definitions = {
  ssh: { direct: [[1, 0, 0]], basis: [[2 * pi, 0, 0]],
    points: [{ id: "Xminus", label: "−π", position: [-pi, 0, 0] },
      { id: "Gamma", label: "Γ", position: [0, 0, 0] },
      { id: "Xplus", label: "+π", position: [pi, 0, 0] }],
    path: ["Xminus", "Gamma", "Xplus"],
    boundary: [-pi, 0, 0, pi, 0, 0], kind: "point-cloud" },
  square: { direct: [[1, 0, 0], [0, 1, 0]], basis: [[2 * pi, 0, 0], [0, 2 * pi, 0]],
    points: [{ id: "Gamma", label: "Γ", position: [0, 0, 0] },
      { id: "X", label: "X", position: [pi, 0, 0] }, { id: "M", label: "M", position: [pi, pi, 0] }],
    path: ["Gamma", "X", "M", "Gamma"],
    boundary: [-pi, -pi, 0, pi, -pi, 0, pi, pi, 0, -pi, pi, 0, -pi, -pi, 0], kind: "polyline" },
  honeycomb: { direct: [[Math.sqrt(3), 0, 0], [Math.sqrt(3) / 2, 1.5, 0]],
    basis: [[2 * pi / Math.sqrt(3), -2 * pi / 3, 0], [0, 4 * pi / 3, 0]],
    points: [{ id: "Gamma", label: "Γ", position: [0, 0, 0] },
      { id: "M", label: "M", position: [pi / Math.sqrt(3), pi / 3, 0] },
      { id: "K", label: "K", position: [4 * pi / (3 * Math.sqrt(3)), 0, 0] }],
    path: ["Gamma", "M", "K", "Gamma"],
    boundary: Array.from({ length: 7 }, (_, i) =>
      [4 * pi / (3 * Math.sqrt(3)) * Math.cos(i * pi / 3),
        4 * pi / (3 * Math.sqrt(3)) * Math.sin(i * pi / 3), 0]).flat(), kind: "polyline" },
  simple_cubic: { direct: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    basis: [[2 * pi, 0, 0], [0, 2 * pi, 0], [0, 0, 2 * pi]],
    points: [{ id: "Gamma", label: "Γ", position: [0, 0, 0] },
      { id: "X", label: "X", position: [pi, 0, 0] }, { id: "M", label: "M", position: [pi, pi, 0] },
      { id: "R", label: "R", position: [pi, pi, pi] }],
    path: ["Gamma", "X", "M", "Gamma", "R", "X"],
    boundary: (() => { const out = []; for (let mask = 0; mask < 8; mask++) for (let axis = 0; axis < 3; axis++)
      if (!(mask & (1 << axis))) { const p = [0, 1, 2].map(i => mask & (1 << i) ? pi : -pi), q = [...p];
        q[axis] = pi; out.push(...p, ...q); } return out; })(), kind: "segments" },
};

/** Portable, geometry-only counterparts of Theory Lab's reviewed QVIS-009 families. */
export async function writeReciprocalFixture(directory, family) {
  const definition = definitions[family];
  if (!definition) throw new TypeError("Unsupported reciprocal fixture family");
  const descriptor = Buffer.from(`math3d-q05-reciprocal:${family}`), id = `fixture-${hash(descriptor).slice(0, 24)}`;
  const unit = family === "ssh" ? "rad / cell spacing" : "rad / schematic primitive spacing";
  const scene = { schema: family === "ssh" ? "quantum-scene/v2" : "quantum-scene/v1", id, title: `${family} primitive reciprocal fixture`,
    provenance: { kind: "geometry-fixture", runId: id, jobId: id, model: family, engine: "geometry",
      engineVersion: "qvis/1", computedAt: "not applicable (no calculation)", resultSha256: hash(descriptor), adapter: "qvis/1" },
    coordinates: { handedness: "right", axes: ["kx", "ky", "kz"], units: [unit, unit, unit] },
    camera: { position: [12, -10, 10], target: [0, 0, 0], up: [0, 0, 1] },
    datasets: [], objects: [], annotations: [],
    reciprocal: { directBasis: definition.direct, basis: definition.basis,
      directUnit: family === "ssh" ? "cell spacing a=1" : "schematic primitive spacing", reciprocalUnit: unit,
      pointObject: "symmetry-points", points: definition.points,
      paths: [{ object: "symmetry-path", label: definition.path.map(id =>
        definition.points.find(point => point.id === id).label).join(" → "), points: definition.path }],
      boundaryObjects: ["primitive-bz"] } };
  const artifacts = new Map();
  const add = (id, values) => { const bytes = encode(values), path = `${id}.f64`;
    artifacts.set(path, bytes); scene.datasets.push({ id, path, format: "f64le", count: values.length / 3,
      components: 3, unit, bytes: bytes.length, sha256: hash(bytes) }); return id; };
  const style = (color, size = 1) => ({ color, opacity: 1, size });
  scene.objects.push({ id: "symmetry-points", label: "Named high-symmetry k-points", kind: "point-cloud",
    positions: add("symmetry-points", definition.points.flatMap(point => point.position)), visible: true,
    style: style("#f2b36f", 1.5) });
  scene.objects.push({ id: "symmetry-path", label: "Supplied high-symmetry path", kind: "polyline",
    positions: add("symmetry-path", definition.path.flatMap(id =>
      definition.points.find(point => point.id === id).position)), visible: true, style: style("#f2b36f") });
  scene.objects.push({ id: "primitive-bz", label: "Supplied primitive-zone boundary", kind: definition.kind,
    positions: add("primitive-bz", definition.boundary), visible: true, style: style("#79d9c1") });
  definition.basis.forEach((vector, index) => scene.objects.push({ id: `reciprocal-b${index + 1}`,
    label: `Reciprocal b${index + 1}`, kind: "vectors", positions: add(`reciprocal-origin-${index}`, [0, 0, 0]),
    values: add(`reciprocal-basis-${index}`, vector), visible: true, style: style("#5995f0") }));
  await mkdir(directory, { recursive: true });
  const sceneBytes = Buffer.from(JSON.stringify(scene, null, 2) + "\n");
  for (const [path, bytes] of artifacts) await writeFile(join(directory, path), bytes);
  await writeFile(join(directory, "scene.json"), sceneBytes);
  await writeFile(join(directory, "bundle.json"), JSON.stringify({ schema: "quantum-scene-bundle/v1",
    scene: { path: "scene.json", bytes: sceneBytes.length, sha256: hash(sceneBytes) } }, null, 2) + "\n");
  return { scene, definition };
}
