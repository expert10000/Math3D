import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("promoted geometry saves beside its verified quantum source", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qi21-ui-"));
  const scene = resolve(__dirname, "..", "fixtures", "quantum-qi01",
    "run-05ce1036d70c466eb4f900944a85c474.qscene");
  const app = await launchRepoElectron({ args: [".", "--quantum-scene", scene],
    cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-attach-quantum-scene").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    await page.getByTestId("quantum-scene-close").click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("staged");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const reference = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).quantumScenes[0]);
    await projects.getByTestId(`quantum-promote-geometry-${reference.sceneFingerprint}`).click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("geometry copy staged");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("with 9 documents", { timeout: 60_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries.some((entry: { module: string }) => entry.module === "geometry")).toBe(true);
    expect(saved.workspace.entries.some((entry: { module: string }) => entry.module === "quantum")).toBe(true);
    expect(saved.workspace.relations.some((relation: { operation: string }) => relation.operation === "quantum.promote-geometry")).toBe(true);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qi21-ui-")) throw new Error("Unsafe QI-21 cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
