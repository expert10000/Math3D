import { createHash } from "node:crypto";
import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const encode = values => {
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => bytes.writeDoubleLE(value, 8 * index));
  return bytes;
};

/** Deterministic 31×31 geometry stress fixture; not a new physical QWZ result. */
export async function writeLargeBandFixture(sourceBundle, targetBundle) {
  await cp(sourceBundle, targetBundle, { recursive: true });
  const scene = JSON.parse(await readFile(join(targetBundle, "scene.json"), "utf8"));
  scene.id = "bounded-band-surface-fixture";
  scene.title = "Synthetic bounded band surface";
  scene.provenance.runId = "run-synthetic-bounded-bands";
  scene.bands.grid = [31, 31];
  scene.bands.bulkGap = 1.8;
  const k = [], e0 = [], e1 = [], p0 = [], p1 = [], triangles = [];
  for (let x = 0; x < 31; x++) for (let y = 0; y < 31; y++) {
    const kx = -Math.PI + 2 * Math.PI * x / 30;
    const ky = -Math.PI + 2 * Math.PI * y / 30;
    const magnitude = 1 + 0.1 * Math.sin(kx) * Math.sin(ky);
    k.push(kx, ky, 0); e0.push(-magnitude); e1.push(magnitude);
    p0.push(kx, ky, -magnitude); p1.push(kx, ky, magnitude);
  }
  for (let x = 0; x < 30; x++) for (let y = 0; y < 30; y++) {
    const a = x * 31 + y, b = (x + 1) * 31 + y;
    triangles.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (const [id, values] of [["band-k", k], ["band-energy-0", e0], ["band-energy-1", e1],
    ["band-positions-0", p0], ["band-positions-1", p1], ["band-triangles", triangles]]) {
    const dataset = scene.datasets.find(dataset => dataset.id === id);
    const bytes = encode(values);
    dataset.bytes = bytes.length; dataset.count = values.length / dataset.components; dataset.sha256 = hash(bytes);
    await writeFile(join(targetBundle, dataset.path), bytes);
  }
  const sceneBytes = Buffer.from(JSON.stringify(scene, null, 2) + "\n");
  await writeFile(join(targetBundle, "scene.json"), sceneBytes);
  await writeFile(join(targetBundle, "bundle.json"), JSON.stringify({ schema: "quantum-scene-bundle/v1",
    scene: { path: "scene.json", bytes: sceneBytes.length, sha256: hash(sceneBytes) } }, null, 2) + "\n");
  return targetBundle;
}
