import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { _electron as electron } from "playwright";
import { PNG } from "pngjs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const output = resolve(process.argv[2] ?? "output/qi40-39-review");
if (!process.argv.includes("--append")) {
  const result = spawnSync(process.execPath, ["scripts/capture-quantum-review.mjs", output],
    { cwd: resolve("."), stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Example capture failed (${result.status})`);
}
await mkdir(output, { recursive: true });
const index = JSON.parse(await readFile(join(output, "capture-index.json"), "utf8"));
if (process.argv.includes("--append") && index.length === 39) index.length = 36;
assert.equal(index.length, 36);
const matrix = JSON.parse(await readFile(resolve("docs/evidence/quantum-qi40-scene-matrix.json"), "utf8"));
const extras = [
  { id: "saved-qwz-curvature", group: "quantum-qi01", folder: "run-05ce1036d70c466eb4f900944a85c474.qscene" },
  { id: "saved-qwz-bands", group: "quantum-qi01", folder: "run-05ce1036d70c466eb4f900944a85c474-bands.qscene" },
  { id: "saved-ideal-qec", group: "quantum-qec", folder: "run-ee2889dc341d4cb88e638f2af4ec6d2d-qec.qscene" },
];
for (const [number, extra] of extras.entries()) {
  const profile = await mkdtemp(join(tmpdir(), "math3d-quantum-release-review-"));
  const env = { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const folder = resolve("tests/fixtures", extra.group, extra.folder);
  const app = await electron.launch({ args: [".", "--quantum-scene", folder], cwd: resolve("."), env });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1600, 1000));
    const preview = page.getByTestId("quantum-scene-preview");
    await preview.waitFor({ state: "visible", timeout: 30000 });
    const opened = await page.evaluate(() => window.quantumScenes.reopenRecent());
    const expected = matrix.fixtures.find(item => item.id === extra.id);
    assert(opened.ok && expected && opened.reference.sceneFingerprint === expected.fingerprint,
      `${extra.id}: source fingerprint`);
    await page.waitForTimeout(350);
    const file = `${number + 37}-${extra.id}.png`;
    await page.screenshot({ path: join(output, file), animations: "disabled" });
    index.push({ number: number + 37, id: extra.id, label: extra.id,
      model: opened.source?.provenance?.model ?? extra.id, file });
    console.log(`${number + 37}/39 ${extra.id} captured`);
  } finally {
    await app.close();
    if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-quantum-release-review-"))
      throw new Error("Unsafe release review cleanup path");
    await rm(profile, { recursive: true, force: true });
  }
}

assert.equal(index.length, 39);
const rows = [];
for (const row of index) {
  assert(row.file && !row.error, `${row.id}: capture missing or failed`);
  const bytes = await readFile(join(output, row.file));
  const png = PNG.sync.read(bytes);
  const colors = new Set(); let saturated = 0, sampled = 0;
  for (let y = Math.floor(png.height * .17); y < Math.floor(png.height * .82); y += 5)
    for (let x = Math.floor(png.width * .04); x < Math.floor(png.width * .68); x += 5) {
      const offset = (y * png.width + x) * 4;
      const r = png.data[offset], g = png.data[offset + 1], b = png.data[offset + 2];
      colors.add(`${r >> 5},${g >> 5},${b >> 5}`);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 30) saturated++;
      sampled++;
    }
  rows.push({ id: row.id, file: row.file, sha256: createHash("sha256").update(bytes).digest("hex"),
    width: png.width, height: png.height, colorBins: colors.size,
    saturatedFraction: Number((saturated / sampled).toFixed(4)),
    needsVisualReview: colors.size < 8 || saturated / sampled < .001 });
}
await writeFile(join(output, "capture-index.json"), JSON.stringify(index, null, 2) + "\n");
await writeFile(join(output, "visual-signal.json"), JSON.stringify({ schema: "math3d.quantum-visual-review/v1",
  fixtureCount: 39, rows }, null, 2) + "\n");
console.log(`Captured ${rows.length} matrix scenes; ${rows.filter(row => row.needsVisualReview).length} heuristic blank-screen flags`);
