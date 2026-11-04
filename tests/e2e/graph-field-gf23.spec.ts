import { cp, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { serializeMath3DProject } from "@math3d/core";
import { createGf23Project } from "../fixtures/graph-field/gf23Bundle";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-23 verified bundled profile survives Project reopen and explicit refresh", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-gf23-profile-"));
  const directory = join(root, "vortex-volume.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"),
    directory, { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const project = createGf23Project({ kind: "directory", value: directory });
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf23-bundle.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    await explorer.getByTestId("gf07-open-profile-from-explorer").click();
    await expect(explorer).toBeHidden();
    const rightToggle = page.getByRole("button", { name: "Right", exact: true });
    if (await rightToggle.getAttribute("aria-pressed") === "true") await rightToggle.click();
    const inspector = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await inspector.getAttribute("open") === null)
      await inspector.locator(":scope > summary").click();
    const status = inspector.getByTestId("gf07-graph-profile-status");
    await expect(status).toContainText("verified-volume-trilinear");
    await expect(status).toContainText("current");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const reopenedExplorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (await reopenedExplorer.isVisible())
      await reopenedExplorer.getByRole("button", { name: "Back to Graphs" }).click();
    if (await rightToggle.getAttribute("aria-pressed") === "true") await rightToggle.click();
    const reopened = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await reopened.getAttribute("open") === null)
      await reopened.locator(":scope > summary").click();
    await expect(reopened.getByTestId("gf07-refresh-profile")).toBeVisible();
    await expect(reopened.getByTestId("gf07-graph-profile-status"))
      .toContainText("values withheld");
    const resource = join(directory, "east.f64"), original = await readFile(resource);
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(resource, changed);
    await reopened.getByTestId("gf07-refresh-profile").click();
    await expect(reopened.getByRole("alert").last()).toContainText(/changed|integrity|failed/i);
    await unlink(resource);
    await reopened.getByTestId("gf07-refresh-profile").click();
    await expect(reopened.getByRole("alert").last()).toContainText(/missing|failed/i);
    await writeFile(resource, original);
    await reopened.getByTestId("gf07-refresh-profile").click();
    await expect(reopened.getByTestId("gf07-graph-profile-status")).toContainText("current");
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-gf23-profile-"))
      throw new Error("Unsafe scientific fixture cleanup path.");
    await rm(root, { recursive: true, force: true });
  }
});
