import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("hydrogen field promotes to a source-backed Explorer document with exact spatial cursor and surface recipe", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qi11-field-"));
  const launch = () => launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    await page.getByTestId("quantum-example-hydrogen-2p").click();
    await page.getByTestId("quantum-promote-field").click();
    await expect(page.getByTestId("quantum-field-explorer-document")).toContainText("verified scientific-scene/v1 mapping");
    await expect(page.getByTestId("quantum-field-explorer-document")).toContainText("a0^-3/2");
    const canvas = page.getByTestId("quantum-field-canvas");
    await expect(canvas).toBeVisible();
    await canvas.click({ position: { x: 100, y: 100 } });
    await expect(page.getByTestId("quantum-field-sample")).toContainText("Grid [");
    await page.getByLabel("Quantum slice normal").selectOption("0");
    await expect(page.getByTestId("quantum-spatial-cursor-status")).toContainText("exact verified field sample");
    await page.getByLabel("Quantum field quantity").selectOption("amplitude");
    await expect(page.getByTestId("quantum-field-legend")).toBeVisible();
    await expect(page.getByText("Absolute phase and signed components depend on arbitrary global phase.", { exact: false })).toBeVisible();
    await page.getByLabel("Quantum field quantity").selectOption("phase");
    await expect(page.getByTestId("quantum-field-legend")).toContainText("y → · z ↑");
    await page.getByRole("button", { name: "Density surface" }).click();
    await expect(page.getByTestId("quantum-surface-derivation")).toContainText("quantum-density-isosurface/tetrahedra");
    await expect(page.getByTestId("quantum-surface-legend")).toContainText("threshold");
    await page.getByTestId("quantum-scene-close").click();
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const saved = await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem("math3d.project.v1")!);
      const field = project.workspace.entries.find((entry: { checkpoint: { format: string } }) =>
        entry.checkpoint.format === "math3d.quantum-field-document");
      return { projectId: project.identity.id, fieldId: field?.expected.id,
        view: field?.checkpoint.view, derivations: field?.checkpoint.derivations?.length,
        references: project.quantumScenes?.length };
    });
    expect(saved.fieldId).toMatch(/^math3d:quantum-field:/);
    expect(saved.view).toMatchObject({ normalAxis: 0, quantity: "phase" });
    expect(saved.derivations).toBeGreaterThanOrEqual(2);
    expect(saved.references).toBe(1);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId(`project-open-saved-${saved.projectId}`).click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    if (await projects.getByRole("button", { name: "View current project" }).count())
      await projects.getByRole("button", { name: "View current project" }).click();
    await projects.getByTestId(`project-tree-document-${saved.fieldId}`)
      .or(projects.getByTestId(`project-open-${saved.fieldId}`)).click();
    await expect(page.getByTestId("quantum-field-explorer-document")).toContainText("Native Project field");
    await expect(page.getByLabel("Quantum slice normal")).toHaveValue("0");
    await expect(page.getByLabel("Quantum field quantity")).toHaveValue("phase");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qi11-field-")) throw new Error("Unsafe field cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
