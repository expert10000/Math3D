import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("supplied QWZ curvature opens in native Field Explorer with reciprocal grid and units", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-qwz-field-"));
  const profile = join(root, "profile");
  let app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
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
    const line = field.getByTestId("scientific-field-line");
    await expect(line).toContainText("Graph x: kx (rad / lattice constant)");
    await line.getByRole("button", { name: "Preview Graph line" }).click();
    await expect(line.getByRole("figure", { name: /Preview Graph line/ })).toContainText("21 samples");
    await line.getByRole("button", { name: "Add line to Graphs" }).click();
    await expect(line).toContainText("already in Graphs");
    await field.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const fieldEntry = saved.workspace.entries.find((entry: { checkpoint: { format: string } }) =>
      entry.checkpoint.format === "math3d.scientific-field-document");
    const graphEntry = saved.workspace.entries.find((entry: { module: string }) => entry.module === "graph2d");
    expect(fieldEntry?.checkpoint.source.reference.axes.map((axis: { name: string }) => axis.name)).toEqual(["kx", "ky"]);
    expect(graphEntry?.checkpoint.source.objects.find((item: { kind: string; origin?: unknown }) =>
      item.kind === "point-series" && item.origin)?.origin.fieldDocument.id).toBe(fieldEntry.expected.id);
    const id = saved.identity.id as string;
    await app.close();
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
    const reopened = await app.firstWindow();
    await reopened.getByTestId("projects-toggle").click();
    const reopenedProjects = reopened.getByTestId("project-explorer-panel");
    await reopenedProjects.getByTestId(`project-open-saved-${id}`).click();
    await expect(reopenedProjects.getByTestId("project-message"))
      .toContainText("Opened supported project", { timeout: 60_000 });
    const restored = await reopened.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(restored.workspace.entries.find((entry: { expected: { id: string } }) =>
      entry.expected.id === fieldEntry.expected.id)?.checkpoint.source.reference)
      .toEqual(fieldEntry.checkpoint.source.reference);
    await reopened.getByTestId("project-viewer-document").selectOption(fieldEntry.expected.id);
    await expect(reopened.getByTestId("scientific-field-workspace")).toContainText("QWZ lower-band Berry curvature", { timeout: 60_000 });
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qwz-field-")) throw new Error("Unsafe QWZ cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
