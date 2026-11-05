import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { definedEnvironment } from "./helpers/electronLauncher";

const command = promisify(execFile);

async function closeInstalled(app: Awaited<ReturnType<typeof electron.launch>>) {
  const pid = app.process()?.pid;
  try {
    await Promise.race([app.close(), new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Packaged app close timed out")), 5_000))]);
  } catch {
    if (pid) await command("taskkill", ["/PID", String(pid), "/T", "/F"]).catch(() => {});
  }
}

const matrix = require("../../docs/evidence/quantum-qi40-scene-matrix.json");
const cases = {
  candidate: [
    { id: "saved-ideal-qec", group: "quantum-qec",
      folder: "run-ee2889dc341d4cb88e638f2af4ec6d2d-qec.qscene", schema: "quantum-scene/v1" },
  ],
  "rolled-back": [
    { id: "qwz-curvature", group: "quantum-scene",
      folder: "run-97a132d1d712414bb62bb8c9212f517e.qscene", schema: "quantum-scene/v1" },
    { id: "rice-mele-bands", group: "quantum-scene",
      folder: "run-c0be71581dc94fb599f4df7c7dab2031-bands.qscene", schema: "quantum-scene/v2" },
  ],
} as const;

test("installed QEC candidate can roll back while pinned v1 and v2 readers still open", async () => {
  const phase = process.env.MATH3D_ROLLBACK_PHASE;
  test.skip(process.platform !== "win32" || !process.env.MATH3D_E2E_INSTALLED_EXE ||
    !["candidate", "rolled-back"].includes(phase ?? ""), "Requires an installed rollback phase");
  test.setTimeout(180_000);
  const repo = resolve(__dirname, "..", "..");
  const executable = resolve(process.env.MATH3D_E2E_INSTALLED_EXE!);
  const root = await mkdtemp(join(tmpdir(), "installed-quantum-rollback-"));
  const profile = process.env.MATH3D_ROLLBACK_PROFILE_ROOT
    ? resolve(process.env.MATH3D_ROLLBACK_PROFILE_ROOT) : join(root, "profile");
  const userData = join(profile, "user-data");
  const results: { id: string; schema: string; fingerprint: string }[] = [];
  try {
    for (const item of cases[phase as keyof typeof cases]) {
      const fixture = matrix.fixtures.find((row: { id: string }) => row.id === item.id);
      expect(fixture?.schema).toBe(item.schema);
      const bundle = join(repo, "tests", "fixtures", item.group, item.folder);
      const env = definedEnvironment({ ...process.env, MATH3D_E2E: "1",
        MATH3D_E2E_PROFILE_ROOT: profile, MATH3D_E2E_USER_DATA_DIR: userData });
      delete env.ELECTRON_RUN_AS_NODE;
      const app = await electron.launch({ executablePath: executable, cwd: dirname(executable),
        args: [`--user-data-dir=${userData}`, "--quantum-scene", bundle], env });
      try {
        const page = await app.firstWindow();
        const preview = page.getByTestId("quantum-scene-preview");
        await expect(preview).toBeVisible();
        await expect(preview).toContainText(item.schema);
        if (item.id === "saved-ideal-qec")
          await expect(preview.getByTestId("qec-repetition-profile")).toBeVisible();
        const opened = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
        expect(opened.ok).toBe(true);
        expect(opened.reference.sceneFingerprint).toBe(fixture.fingerprint);
        results.push({ id: item.id, schema: item.schema, fingerprint: fixture.fingerprint });
      } finally { await closeInstalled(app); }
    }
    if (process.env.MATH3D_ROLLBACK_PHASE_RESULT_PATH) {
      await writeFile(resolve(process.env.MATH3D_ROLLBACK_PHASE_RESULT_PATH), JSON.stringify({
        schema: "math3d/installed-quantum-rollback-phase/v1", phase,
        opened: results,
      }, null, 2) + "\n");
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("installed-quantum-rollback-"))
      throw new Error("Unsafe installed rollback test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
