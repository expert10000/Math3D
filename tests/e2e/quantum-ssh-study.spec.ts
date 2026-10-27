import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("SSH study links source-matched finite chain and bands without inferring a phase", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-ssh-"));
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    await page.getByTestId("quantum-example-ssh-chain").click();
    const profile = page.getByTestId("ssh-study-profile");
    await expect(profile).toContainText("finite chain");
    await expect(profile).toContainText("does not infer edge/bulk classification");
    await profile.getByTestId("ssh-link-views").click();
    await expect(profile.getByTestId("ssh-study-source")).toContainText("run-145ac3f06cb940c28d457937345b0243");
    await expect(profile).toContainText("Intracell A–B / t₁ = 0.6");
    await expect(profile).toContainText("Midgap-pair density (color)");
    await expect(profile).toContainText("SSH winding: 1");
    await expect(profile).toContainText("worker bulk gap 0.8");
    await profile.getByTestId("ssh-view-bands").click();
    await expect(profile.getByTestId("ssh-view-bands")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("quantum-band-legend")).toContainText("Lower band");
    await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
    await expect(page.getByTestId("quantum-band-selection")).toContainText("Stored datasets");
    await profile.getByTestId("ssh-view-chain").click();
    await expect(profile.getByTestId("ssh-view-chain")).toHaveAttribute("aria-pressed", "true");
    await expect(profile).toContainText("producer status: verified");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-ssh-")) throw new Error("Unsafe SSH cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SSH study refuses modified chain source instead of pairing it with pinned bands", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-ssh-"));
  const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "run-145ac3f06cb940c28d457937345b0243.qscene");
  const source = join(root, "source.qscene");
  await cp(fixture, source, { recursive: true });
  const app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    const profile = page.getByTestId("ssh-study-profile");
    await expect(profile).toBeVisible();
    const binary = join(source, "density.f64"), bytes = await readFile(binary);
    bytes[0] ^= 1; await writeFile(binary, bytes);
    await profile.getByTestId("ssh-link-views").click();
    await expect(profile.getByRole("alert")).toContainText("Current SSH source failed exact read-back verification");
    await expect(profile.getByTestId("ssh-view-bands")).toHaveCount(0);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-ssh-")) throw new Error("Unsafe SSH cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
