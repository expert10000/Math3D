import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("QI-01 saved-run curvature and bands scenes each open in Math3D", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qi01-qwz-"));
  try {
    for (const [folder, view] of [
      ["run-05ce1036d70c466eb4f900944a85c474.qscene", "curvature"],
      ["run-05ce1036d70c466eb4f900944a85c474-bands.qscene", "bands"],
    ] as const) {
      const source = resolve(__dirname, "..", "fixtures", "quantum-qi01", folder);
      const app = await launchRepoElectron({ args: [".", "--quantum-scene", source],
        cwd: resolve(__dirname, "..", ".."),
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, view) } });
      try {
        const page = await app.firstWindow();
        const profile = page.getByTestId("qwz-study-profile");
        await expect(profile).toBeVisible();
        await expect(profile).toContainText(view === "bands" ? "band surfaces" : "Berry curvature");
        if (view === "bands") await expect(page.getByTestId("quantum-band-legend")).toContainText("Lower band");
        else await expect(page.getByTestId("quantum-topology-inspector")).toContainText("Lower-band Berry curvature");
      } finally { await app.close(); }
    }
  } finally {
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qi01-qwz-"))
      throw new Error("Unsafe QI-01 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
