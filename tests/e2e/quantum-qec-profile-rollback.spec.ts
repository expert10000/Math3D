import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const matrix = require("../../docs/evidence/quantum-qi40-scene-matrix.json");
const cases = [
  { id: "saved-ideal-qec", group: "quantum-qec",
    folder: "run-ee2889dc341d4cb88e638f2af4ec6d2d-qec.qscene", schema: "quantum-scene/v1" },
  { id: "qwz-curvature", group: "quantum-scene",
    folder: "run-97a132d1d712414bb62bb8c9212f517e.qscene", schema: "quantum-scene/v1" },
  { id: "rice-mele-bands", group: "quantum-scene",
    folder: "run-c0be71581dc94fb599f4df7c7dab2031-bands.qscene", schema: "quantum-scene/v2" },
] as const;

test("QEC profile rollback preserves generic v1 and v2 scene reading", async () => {
  test.skip(process.env.MATH3D_QEC_ROLLBACK !== "1", "Requires a renderer built with VITE_QEC_PROFILE=off");
  test.setTimeout(120_000);
  const repo = resolve(__dirname, "..", "..");
  const root = await mkdtemp(join(tmpdir(), "m3d-qec-rollback-"));
  try {
    for (const [index, item] of cases.entries()) {
      const fixture = matrix.fixtures.find((row: {id: string}) => row.id === item.id);
      expect(fixture?.schema).toBe(item.schema);
      const directory = join(repo, "tests", "fixtures", item.group, item.folder);
      const app = await launchRepoElectron({ args: [".", "--quantum-scene", directory], cwd: repo,
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, `profile-${index}`) } });
      try {
        const page = await app.firstWindow();
        const preview = page.getByTestId("quantum-scene-preview");
        await expect(preview).toBeVisible();
        await expect(preview).toContainText(item.schema);
        if (item.id === "saved-ideal-qec")
          await expect(preview.getByTestId("qec-repetition-profile")).toHaveCount(0);
        const opened = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
        expect(opened.ok).toBe(true);
        expect(opened.reference.sceneFingerprint).toBe(fixture.fingerprint);
      } finally { await app.close(); }
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qec-rollback-"))
      throw new Error("Unsafe QEC rollback cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
