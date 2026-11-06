import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { definedEnvironment } from "./helpers/electronLauncher";

const projectTitle = "QI40 rollback Graph";
const matrix = require("../../docs/evidence/quantum-qi40-scene-matrix.json");
const scenes = [
  { id: "qwz-curvature", group: "quantum-scene",
    folder: "run-97a132d1d712414bb62bb8c9212f517e.qscene" },
  { id: "rice-mele-bands", group: "quantum-scene",
    folder: "run-c0be71581dc94fb599f4df7c7dab2031-bands.qscene" },
  { id: "saved-ideal-qec", group: "quantum-qec",
    folder: "run-ee2889dc341d4cb88e638f2af4ec6d2d-qec.qscene" },
  { id: "hydrogen-2p", group: "quantum-scene-orbitals", folder: "orbital-2p.qscene" },
  { id: "rice-mele-pump", group: "quantum-scene",
    folder: "run-19f513c1ee9d4d1f8716a590fc7f1dc0-pump.qscene" },
  { id: "kitaev-bands", group: "quantum-scene",
    folder: "run-18145016435540afafc5a2a06870566f-bands.qscene" },
] as const;

test("installed QEC rollback retains a saved Graph Project and setting", async () => {
  const phase = process.env.MATH3D_ROLLBACK_PROFILE_PHASE;
  test.skip(process.platform !== "win32" || !process.env.MATH3D_E2E_INSTALLED_EXE ||
    !process.env.MATH3D_ROLLBACK_PROFILE_ROOT || !["seed", "verify"].includes(phase ?? ""),
  "Requires installed Math3D and a rollback profile phase");
  test.setTimeout(300_000);
  const executable = resolve(process.env.MATH3D_E2E_INSTALLED_EXE!);
  const profileRoot = resolve(process.env.MATH3D_ROLLBACK_PROFILE_ROOT!);
  const userData = join(profileRoot, "user-data");
  const env = definedEnvironment({ ...process.env, MATH3D_E2E: "1",
    MATH3D_E2E_PROFILE_ROOT: profileRoot, MATH3D_E2E_USER_DATA_DIR: userData });
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: executable, cwd: dirname(executable),
    args: [`--user-data-dir=${userData}`], env });
  try {
    expect(await app.evaluate(({ app }) => app.getVersion())).toBe("1.7.0");
    const page = await app.firstWindow();
    await page.getByTestId("top-settings-button").click();
    const toggle = page.getByTestId("settings-command-preview-overlays-toggle");
    await expect(toggle).toBeVisible();
    if (phase === "seed") await toggle.setChecked(false);
    await expect(toggle).not.toBeChecked();
    await page.getByRole("button", { name: "Close", exact: true }).click();

    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    let gallery = page.getByTestId("graph-gallery");
    await gallery.getByRole("button", { name: "My Graphs", exact: true }).click();
    if (phase === "seed") {
      await gallery.getByLabel("Reusable copy title").fill(projectTitle);
      await gallery.getByRole("button", { name: "Save current as reusable copy" }).click();
      await page.getByTestId("graph-gallery-open").click();
      gallery = page.getByTestId("graph-gallery");
      await gallery.getByRole("button", { name: "My Graphs", exact: true }).click();
    }
    const saved = gallery.getByRole("button", { name: `Open project ${projectTitle}`, exact: true });
    await expect(saved).toBeVisible();
    if (phase === "verify") {
      await saved.click();
      await expect(page.getByTestId("graph-gallery")).toBeHidden();
      await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    }
    // Return to the startup workspace before testing the separate Project explorer.
    await page.reload();
    await expect(page.getByTestId("app-shell")).toBeVisible();
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    let seedGeometryIds: string[] = [];
    if (phase === "seed") {
      for (const item of scenes) {
        const folder = resolve(__dirname, "..", "fixtures", item.group, item.folder);
        await app.evaluate(({ dialog }, path) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
        }, folder);
        await projects.getByTestId("project-import-qscene").click();
        await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
        await page.getByTestId("quantum-scene-close").click();
        await projects.getByTestId("project-attach-quantum-scene").click();
        await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
        await page.getByTestId("quantum-scene-close").click();
      }
      await projects.getByTestId("project-save").click();
      await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
      seedGeometryIds = saved.workspace.entries.filter((entry: { module: string }) =>
        entry.module === "geometry").map((entry: { expected: { id: string } }) => entry.expected.id);
      const qwz = matrix.fixtures.find((row: { id: string }) => row.id === "qwz-curvature");
      expect(qwz?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(saved.quantumScenes.some((row: { sceneFingerprint: string }) =>
        row.sceneFingerprint === qwz.fingerprint)).toBe(true);
      await projects.getByTestId(`quantum-promote-geometry-${qwz.fingerprint}`).click();
      await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("geometry copy staged");
      await projects.getByTestId("project-save").click();
      await expect.poll(() => page.evaluate(() =>
        JSON.parse(localStorage.getItem("math3d.project.v1") || "null")?.workspace?.relations?.some(
          (relation: { operation: string }) => relation.operation === "quantum.promote-geometry")),
      { timeout: 60_000 }).toBe(true);
      await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    }
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1") || "null"));
    expect(project?.quantumScenes).toHaveLength(scenes.length);
    const promotion = project.workspace.relations.find((relation: { operation: string }) =>
      relation.operation === "quantum.promote-geometry");
    expect(promotion).toBeTruthy();
    const promoted = project.workspace.entries.find((entry: { module: string; expected: { id: string } }) =>
      entry.module === "geometry" && (phase === "seed" ? !seedGeometryIds.includes(entry.expected.id) :
        entry.expected.id === process.env.MATH3D_ROLLBACK_PROMOTED_GEOMETRY_ID));
    expect(promoted?.checkpoint?.format).toBe("math3d.geometry-document");
    if (phase === "verify") {
      await projects.getByTestId(`project-open-saved-${project.identity.id}`).click();
      await expect(projects.getByTestId("project-message")).toContainText("Opened supported project");
      await projects.getByTestId(`project-open-${promoted.expected.id}`).click();
      await expect(page.getByTestId("workspace-nav-geometry")).toHaveAttribute("aria-pressed", "true");
      if (!await projects.isVisible()) await page.getByTestId("projects-toggle").click();
    }
    const sceneChecks: { id: string; fingerprint: string; reopenedAfterRollback: boolean }[] = [];
    for (const item of scenes) {
      const expected = matrix.fixtures.find((row: { id: string }) => row.id === item.id);
      expect(expected?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      const reference = project.quantumScenes.find((row: { sceneFingerprint: string }) =>
        row.sceneFingerprint === expected.fingerprint);
      expect(reference).toBeTruthy();
      if (phase === "verify") {
        await projects.getByTestId(`project-open-quantum-scene-${expected.fingerprint}`).click();
        await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
        expect(await page.evaluate(fingerprint =>
          (window as any).quantumScenes.verifyActive(fingerprint), expected.fingerprint)).toBe(true);
        await page.getByTestId("quantum-scene-close").click();
      }
      sceneChecks.push({ id: item.id, fingerprint: expected.fingerprint,
        reopenedAfterRollback: phase === "verify" });
    }
    if (process.env.MATH3D_ROLLBACK_PROFILE_RESULT_PATH) {
      await writeFile(resolve(process.env.MATH3D_ROLLBACK_PROFILE_RESULT_PATH), JSON.stringify({
        schema: "math3d/installed-rollback-profile-phase/v1", phase, version: "1.7.0",
        projectTitle, savedProjectVisible: true, commandPreviewOverlaysOff: true,
        quantumProjectId: project.identity.id, promotedGeometryId: promoted.expected.id,
        promotedGeometryReopenedAfterRollback: phase === "verify", sceneChecks,
      }, null, 2) + "\n");
    }
  } finally { await app.close(); }
});
