import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("bundled verified scenes are discoverable, pinned and open without a folder picker", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-quantum-examples-"));
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    const examples = await page.evaluate(() => (window as any).quantumScenes.examples());
    expect(examples).toHaveLength(9);
    expect(examples.map((item: { id: string }) => item.id)).toContain("qwz-curvature");
    expect(JSON.stringify(examples)).not.toContain(".qscene");
    const fileMenu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items
      .find(item => item.label === "File")?.submenu?.items.map(item => item.label) ?? []);
    expect(fileMenu).toContain("Verified quantum examples...");
    const rejected = await page.evaluate(() => (window as any).quantumScenes.openExample("../outside"));
    expect(rejected).toMatchObject({ ok: false, canceled: false });
    expect(rejected.error).toMatch(/Unknown bundled/);

    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    const chooser = page.getByTestId("quantum-scene-examples");
    await expect(chooser).toBeVisible();
    await expect(chooser).toContainText("Pinned Theory Lab exports");
    await expect(chooser.getByRole("button", { name: /QWZ · Berry curvature/ })).toBeVisible();
    await chooser.getByTestId("quantum-example-qwz-curvature").click();
    await expect(chooser).toHaveCount(0);
    await expect(page.getByTestId("quantum-topology-inspector")).toContainText("Lower-band Berry curvature");
    await expect(page.getByTestId("quantum-vector-reciprocal-b1")).toContainText("source samples shown");
    await page.getByTestId("quantum-scene-close").click();

    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    await expect(chooser).toBeVisible();
    await chooser.getByTestId("quantum-example-hydrogen-2p").click();
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("hydrogenic");
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("Hydrogenic ψ");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-quantum-examples-"))
      throw new Error("Unsafe examples cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
