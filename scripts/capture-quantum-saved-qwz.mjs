import { _electron as electron } from "playwright";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const output = resolve(process.argv[2] ?? "output/quantum-review");
await mkdir(output, { recursive: true });
const fixtures = [
  { id: "saved-qwz-curvature", number: 37, folder: "run-05ce1036d70c466eb4f900944a85c474.qscene", expect: "Berry curvature" },
  { id: "saved-qwz-bands", number: 38, folder: "run-05ce1036d70c466eb4f900944a85c474-bands.qscene", expect: "band surfaces" },
];
const records = [];
for (const fixture of fixtures) {
  const profile = await mkdtemp(join(tmpdir(), "math3d-quantum-saved-review-"));
  const source = resolve("tests/fixtures/quantum-qi01", fixture.folder);
  const env = { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ args: [".", "--quantum-scene", source], cwd: resolve("."), env });
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1600, 1000));
    const preview = page.getByTestId("quantum-scene-preview");
    await preview.waitFor({ state: "visible", timeout: 30_000 });
    await page.getByTestId("qwz-study-profile").getByText(fixture.expect, { exact: false }).waitFor();
    await page.waitForTimeout(350);
    const file = `${fixture.number}-${fixture.id}.png`;
    await page.screenshot({ path: join(output, file), animations: "disabled" });
    records.push({ id: fixture.id, file, schema: "quantum-scene/v1" });
    process.stdout.write(`${fixture.id} captured\n`);
  } finally {
    if (app) await app.close();
    if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-quantum-saved-review-"))
      throw new Error("Unsafe temporary profile cleanup path.");
    await rm(profile, { recursive: true, force: true });
  }
}
await writeFile(join(output, "saved-qwz-index.json"), JSON.stringify(records, null, 2));
