import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("five verified orbitals keep bounded Volume framing, empty-plane refusal, restart and tamper guards", async () => {
  test.setTimeout(300_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-orbital-preview-"));
  const profile = join(root, "profile");
  const launch = () => launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    for (const orbital of ["1s", "2s", "2p", "3p", "3d"]) {
      await page.getByRole("button", { name: "Palette", exact: true }).click();
      await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
        .fill("Verified quantum examples");
      await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
      await page.getByTestId(`quantum-example-hydrogen-${orbital}`).click();
      await expect(page.getByTestId("quantum-scene-preview")).toContainText("hydrogenic");
      await page.getByTestId("quantum-scene-geometry").getByRole("button", { name: "Volume", exact: true }).click();
      const volume = page.getByTestId("quantum-field-volume");
      await expect(volume.getByTestId("quantum-volume-source")).toContainText("a0");
      await expect(volume.getByTestId("quantum-volume-fit-details")).toContainText("source-grid window");
      await expect(volume.getByRole("button", { name: "Fit visible field" })).toBeEnabled();
      await volume.getByRole("button", { name: "Fit visible field" }).click();
      await expect(volume.getByTestId("volume-slice-viewer-free"))
        .toHaveAttribute("data-camera-fit-target", "crop");
      await volume.getByRole("button", { name: "Fit volume grid" }).click();
      await expect(volume.getByTestId("volume-slice-viewer-free"))
        .toHaveAttribute("data-camera-fit-target", "volume");
      if (orbital === "2p") {
        await page.evaluate(() => {
          const api = (window as any).quantumScenes;
          (window as any).__originalOrbitalFieldVolume = api.fieldVolume;
          (window as any).__orbitalVolumeDerivations = 0;
          api.fieldVolume = (...args: unknown[]) => {
            (window as any).__orbitalVolumeDerivations++;
            return (window as any).__originalOrbitalFieldVolume(...args);
          };
        });
        await volume.getByLabel("Volume slice").focus();
        await volume.getByLabel("Volume slice").press("ArrowRight");
        await expect(volume.getByLabel("Volume slice")).toHaveValue("11");
        await page.waitForTimeout(100);
        expect(await page.evaluate(() => (window as any).__orbitalVolumeDerivations)).toBe(0);
        await page.evaluate(() => {
          (window as any).quantumScenes.fieldVolume = (window as any).__originalOrbitalFieldVolume;
        });
      }
      if (orbital === "3p") {
        await volume.getByLabel("Volume quantity").selectOption("imaginary");
        await expect(volume.getByTestId("quantum-volume-fit-details"))
          .toContainText("No nonzero signal on this slice");
        await expect(volume.getByRole("button", { name: "Fit visible field" })).toBeDisabled();
        await expect(volume.getByTestId("quantum-volume-fit-hint")).toHaveText("No signal on this slice");
        await volume.getByRole("button", { name: "Fit volume grid" }).click();
        await expect(volume.getByTestId("volume-slice-viewer-free"))
          .toHaveAttribute("data-camera-fit-target", "volume");
      }
      await page.getByTestId("quantum-scene-close").click();
    }

    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect.poll(() => page.evaluate(() => typeof (window as any).quantumScenes?.reopenRecent)).toBe("function");
    const reopened = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(reopened).toMatchObject({ ok: true, remembered: true });
    if (!reopened.ok) throw new Error("Pinned 3d orbital did not reopen after restart");
    expect(reopened.document.metadata.sourceModel).toBe("hydrogenic");
    const originalFingerprint = reopened.reference.sceneFingerprint;
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send("app:menu-command", { command: "file:reopen-quantum-scene" });
    });
    await expect(page.getByTestId("quantum-scene-preview")).toContainText("hydrogenic");
    await page.getByTestId("quantum-scene-geometry").getByRole("button", { name: "Volume", exact: true }).click();
    await expect(page.getByTestId("quantum-volume-fit-details")).toContainText("source-grid window");
    await page.getByTestId("quantum-scene-close").click();

    const source = resolve(__dirname, "..", "fixtures", "quantum-scene-orbitals", "orbital-3d.qscene");
    const copy = join(root, "tamper-3d.qscene");
    await cp(source, copy, { recursive: true });
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, copy);
    const copied = await page.evaluate(() => (window as any).quantumScenes.open());
    expect(copied.ok).toBe(true);
    expect(copied.reference.sceneFingerprint).toBe(originalFingerprint);
    const realPath = join(copy, "psi-real.f64");
    const damaged = Buffer.from(await readFile(realPath));
    damaged[0] ^= 1;
    await writeFile(realPath, damaged);
    const refused = await page.evaluate(() => (window as any).quantumScenes.reopenRecent());
    expect(refused).toMatchObject({ ok: false, canceled: false });
    expect(refused.error).toMatch(/integrity/i);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-orbital-preview-"))
      throw new Error("Unsafe orbital-preview cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
