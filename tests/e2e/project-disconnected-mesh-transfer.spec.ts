import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { disconnectedPatchResourceFixture, inspectMeshPackage } from "./helpers/meshProjectResources";

const showProjects = async (page: Page) => {
  const panel = page.getByTestId("project-explorer-panel");
  if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click();
  await expect(panel).toBeVisible();
  if (await panel.getAttribute("data-project-placement")) await panel.getByTestId("project-gallery-layout-toggle").click();
  if (await panel.locator(".project-gallery-layout-detail").count()) await panel.getByTestId("project-detail-toggle").click();
  return panel;
};

const expectOpenPatches = async (page: Page) => {
  const study = page.getByTestId("project-mesh-study-view");
  await expect(study).toBeVisible();
  await study.click();
  const sourceTab = page.getByRole("tab", { name: "Source/Object" });
  await expect(sourceTab).toBeVisible();
  await sourceTab.click();
  await expect(page.getByTestId("project-mesh-editor")).toContainText("Coincident disconnected patches");
  const status = page.getByTestId("project-mesh-topology-status");
  await expect(status).toContainText("Raw indexed topology · 2 components · 8 boundary edges · open mesh");
  await expect(status).toContainText("solid volume n/a: requires a qualified closed, consistently oriented solid");
};

test("transferred disconnected patches remain separate and open after Project restart", async () => {
  test.setTimeout(120_000);
  const fixture = disconnectedPatchResourceFixture();
  const expected = inspectMeshPackage(fixture.raw)[0]!;
  expect(expected.positions).toHaveLength(24);
  expect(expected.indices).toEqual([0,1,2,0,2,3,4,5,6,4,6,7]);
  let source: LaunchedSurfaceApp | null = null;
  let destination: LaunchedSurfaceApp | null = null;
  try {
    source = await launchSurfaceApp();
    await resetSurfaceAppState(source.page);
    let panel = await showProjects(source.page);
    await panel.getByTestId("project-import-file").setInputFiles({ name: "disconnected.resources.json", mimeType: "application/json", buffer: Buffer.from(fixture.raw) });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-open").click();
    await expectOpenPatches(source.page);

    panel = await showProjects(source.page);
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const projectId = fixture.project.identity.id;
    const sourceProfile = source.profileDir;
    await source.app.close();
    source = await launchSurfaceApp({}, sourceProfile);
    panel = await showProjects(source.page);
    await panel.getByTestId(`project-open-saved-${projectId}`).click();
    await expectOpenPatches(source.page);

    const exportPath = resolve(source.profileDir, "disconnected-after-restart.resources.json");
    panel = await showProjects(source.page);
    await source.app.evaluate(({ session }, filePath) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(filePath)), exportPath);
    await panel.getByTestId("project-export-resources").click();
    await expect(panel.getByTestId("project-message")).toContainText("Exported project with verified");
    await expect.poll(() => existsSync(exportPath)).toBe(true);
    const exported = readFileSync(exportPath, "utf8");
    expect(inspectMeshPackage(exported)[0]!.positions).toEqual(expected.positions);
    expect(inspectMeshPackage(exported)[0]!.indices).toEqual(expected.indices);

    destination = await launchSurfaceApp();
    await resetSurfaceAppState(destination.page);
    panel = await showProjects(destination.page);
    await panel.getByTestId("project-import-file").setInputFiles({ name: "transferred.resources.json", mimeType: "application/json", buffer: Buffer.from(exported) });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-open").click();
    await expectOpenPatches(destination.page);
    panel = await showProjects(destination.page);
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const destinationProfile = destination.profileDir;
    await destination.app.close();
    destination = await launchSurfaceApp({}, destinationProfile);
    panel = await showProjects(destination.page);
    await panel.getByTestId(`project-open-saved-${projectId}`).click();
    await expectOpenPatches(destination.page);
    const destinationExportPath = resolve(destination.profileDir, "disconnected-after-transfer.resources.json");
    panel = await showProjects(destination.page);
    await destination.app.evaluate(({ session }, filePath) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(filePath)), destinationExportPath);
    await panel.getByTestId("project-export-resources").click();
    await expect(panel.getByTestId("project-message")).toContainText("Exported project with verified");
    await expect.poll(() => existsSync(destinationExportPath)).toBe(true);
    const transferred = inspectMeshPackage(readFileSync(destinationExportPath, "utf8"))[0]!;
    expect(transferred.positions).toEqual(expected.positions);
    expect(transferred.indices).toEqual(expected.indices);
  } finally {
    await closeSurfaceApp(destination);
    await closeSurfaceApp(source);
  }
});
