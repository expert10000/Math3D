import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("QWZ study links independently verified bands and Berry views without inferred classifications", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-qwz-"));
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    await page.getByTestId("quantum-example-qwz-curvature").click();
    const profile = page.getByTestId("qwz-study-profile");
    await expect(profile).toContainText("Berry curvature");
    await expect(profile).toContainText("not supplied in these bundles");
    await profile.getByTestId("qwz-link-views").click();
    await expect(profile.getByTestId("qwz-study-source")).toContainText("abbcae23a0bb3fe1");
    await expect(profile).toContainText("Chern number: -1");
    await expect(profile).toContainText("worker bulk gap 2");
    await profile.getByTestId("qwz-view-bands").click();
    await expect(profile.getByTestId("qwz-view-bands")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("quantum-band-legend")).toContainText("Lower band");
    await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
    await expect(page.getByTestId("quantum-band-selection")).toContainText("Stored datasets");
    await profile.getByTestId("qwz-view-curvature").click();
    await expect(profile.getByTestId("qwz-view-curvature")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("quantum-topology-inspector")).toContainText("Lower-band Berry curvature");
    await page.getByRole("button", { name: "Inspect first topology sample lower-curvature" }).click();
    await expect(page.getByTestId("quantum-topology-selection")).toContainText("Source datasets");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-qwz-")) throw new Error("Unsafe QWZ cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("QWZ study refuses a changed source rather than linking it to a pinned companion", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-qwz-"));
  const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "run-97a132d1d712414bb62bb8c9212f517e.qscene");
  const source = join(root, "source.qscene");
  await cp(fixture, source, { recursive: true });
  const app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    const profile = page.getByTestId("qwz-study-profile");
    await expect(profile).toBeVisible();
    const binary = join(source, "curvature.f64"), bytes = await readFile(binary);
    bytes[0] ^= 1; await writeFile(binary, bytes);
    await profile.getByTestId("qwz-link-views").click();
    await expect(profile.getByRole("alert")).toContainText("Current QWZ source failed exact read-back verification");
    await expect(profile.getByTestId("qwz-view-bands")).toHaveCount(0);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-qwz-")) throw new Error("Unsafe QWZ cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
