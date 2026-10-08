import { expect, test, _electron as electron } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("normal current-build launch honors its explicit profile and session directory", async () => {
  const root = path.resolve(__dirname, "../.."), profile = mkdtempSync(path.join(tmpdir(), "math3d-profile-e2e-"));
  const env: Record<string, string | undefined> = { ...process.env, MATH3D_DEV_USER_DATA_DIR: profile, MATH3D_GPU_MODE: "software" };
  for (const name of ["ELECTRON_RUN_AS_NODE", "VITE_DEV_SERVER_URL", "MATH3D_E2E", "MATH3D_E2E_USER_DATA_DIR", "MATH3D_STARTUP_SMOKE", "MATH3D_GEOMETRY_SMOKE", "MATH3D_MESH_TRACE_AUTORUN"]) delete env[name];
  const app = await electron.launch({ executablePath: path.join(root, "node_modules/electron/dist/electron.exe"), cwd: root, args: [`--user-data-dir=${profile}`, root], env });
  try {
    const actual = await app.evaluate(({ app }) => ({ userData: app.getPath("userData"), sessionData: app.getPath("sessionData"), e2e: process.env.MATH3D_E2E }));
    expect(actual.e2e).toBeUndefined(); expect(actual.userData).toBe(profile); expect(actual.sessionData).toBe(path.join(profile, "session"));
  } finally {
    await app.close();
    if (path.dirname(profile) !== path.resolve(tmpdir()) || !path.basename(profile).startsWith("math3d-profile-e2e-")) throw new Error("Unsafe test profile cleanup path.");
    rmSync(profile, { recursive: true, force: true });
  }
});
