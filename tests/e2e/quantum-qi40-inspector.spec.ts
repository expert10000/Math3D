import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("QI-40 inspector keyboard, redacted support export, and changed-source refusal", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qi40-inspector-"));
  const source = resolve(__dirname, "..", "fixtures", "quantum-qi01",
    "run-05ce1036d70c466eb4f900944a85c474-bands.qscene");
  const sceneFolder = join(root, "bands.qscene");
  await cp(source, sceneFolder, { recursive: true });
  const app = await launchRepoElectron({ args: [".", "--quantum-scene", sceneFolder],
    cwd: resolve(__dirname, "..", ".."), env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const supportPath = join(root, "support.json");
    const evidencePath = join(root, "inspector-evidence.json");
    await app.evaluate(({ session }, paths) => {
      session.defaultSession.on("will-download", (_event, item) => item.setSavePath(
        item.getFilename().startsWith("quantum-inspector-") ? paths.evidencePath : paths.supportPath));
    }, { supportPath, evidencePath });
    const page = await app.firstWindow();
    const dialog = page.getByTestId("quantum-scene-preview");
    await expect(dialog).toBeVisible();
    const view = dialog.getByRole("tab", { name: "View" });
    const science = dialog.getByRole("tab", { name: "Science" });
    const provenance = dialog.getByRole("tab", { name: "Provenance" });
    await view.focus();
    await view.press("Shift+Tab");
    expect(await page.evaluate(() => document.querySelector('[data-testid="quantum-scene-preview"]')?.contains(document.activeElement))).toBe(true);
    await view.focus();
    await view.press("End");
    await expect(provenance).toHaveAttribute("aria-selected", "true");
    await provenance.press("ArrowLeft");
    await expect(science).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByTestId("quantum-inspector-summary")).toHaveAttribute("data-qualification", "current");
    await expect(dialog.getByRole("tabpanel")).toContainText("Producer science");
    await science.press("Home");
    await expect(view).toHaveAttribute("aria-selected", "true");
    await provenance.click();
    await expect(dialog.getByTestId("quantum-inspector-summary")).toHaveAttribute("data-qualification", "current");
    await dialog.getByRole("button", { name: "Download Inspector evidence JSON" }).click();
    await expect.poll(async () => { try { return (await readFile(evidencePath)).length; } catch { return 0; } })
      .toBeGreaterThan(0);
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    expect(evidence).toMatchObject({ format: "math3d.quantum-inspector-evidence.v1",
      qualification: "current", source: { runId: "run-05ce1036d70c466eb4f900944a85c474" } });
    expect(evidence.checkScope).toMatch(/not independently proved/);
    expect(JSON.stringify(evidence)).not.toMatch(/directory|sampleValue|parameters/i);
    await dialog.getByRole("button", { name: "Download redacted support bundle" }).click();
    await expect.poll(async () => { try { return (await readFile(supportPath)).length; } catch { return 0; } }).toBeGreaterThan(0);
    const bundle = JSON.parse(await readFile(supportPath, "utf8"));
    expect(bundle.schema).toBe("math3d.quantum-viewer-support/v1");
    expect(bundle.correlation.runId).toBe("run-05ce1036d70c466eb4f900944a85c474");
    expect(bundle.correlation.resultSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.correlation.sceneFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.correlation.jobId).toBeNull();
    expect(JSON.stringify(bundle)).not.toMatch(/directory|parameters|\\\\|[A-Z]:\\/i);
    await expect(dialog.getByRole("status").filter({ hasText: "support bundle downloaded" })).toBeVisible();

    const scenePath = join(sceneFolder, "scene.json");
    const original = await readFile(scenePath);
    await writeFile(scenePath, Buffer.concat([original, Buffer.from(" ")]));
    await science.click();
    await expect(dialog.getByTestId("quantum-inspector-summary")).toHaveAttribute("data-qualification", "withheld");
    await expect(dialog.getByRole("tabpanel")).toContainText("Invariant values withheld");
    await dialog.getByRole("tab", { name: "Data" }).click();
    await expect(dialog.getByRole("tabpanel")).toContainText("Dataset values withheld");
    await expect(dialog.getByTestId("quantum-detailed-source-withheld")).toBeVisible();
    await provenance.click();
    await expect(dialog.getByRole("button", { name: "Download Inspector evidence JSON" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Download redacted support bundle" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: "Support export refused" })).toBeVisible();
    await provenance.press("Escape");
    await expect(dialog).toHaveCount(0);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qi40-inspector-"))
      throw new Error("Unsafe QI-40 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
