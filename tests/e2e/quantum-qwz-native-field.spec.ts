import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("supplied QWZ curvature opens in native Field Explorer with reciprocal grid and units", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qwz-field-"));
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    await page.getByTestId("quantum-example-qwz-curvature").click();
    await page.getByTestId("qwz-promote-native-field").click();
    const field = page.getByTestId("scientific-field-workspace");
    await expect(field).toBeVisible({ timeout: 60_000 });
    await expect(field).toContainText("QWZ lower-band Berry curvature");
    await expect(field).toContainText("21 × 21 grid");
    await expect(field).toContainText("kx (rad / lattice constant) / ky (rad / lattice constant)");
    await expect(field).toContainText("dimensionless (a=1)");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qwz-field-")) throw new Error("Unsafe QWZ cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
