import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-07 opens a saved profile in Graphs and locates its physical line in Explorer", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const core = require(resolve("packages/core/src/index.ts"));
    const original = core.parseMath3DProject(readFileSync(resolve(
      "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
    const vectorEntry = original.workspace.entries.find((entry: { module: string }) => entry.module === "vector3d");
    const project = core.replaceMath3DProjectWorkspace(original, core.createMixedWorkspaceDocument({
      ...original.workspace, entries: [vectorEntry], activeDocumentIds: [vectorEntry.expected.id],
      scientificSelections: original.workspace.scientificSelections.filter((item: any) =>
        item.identity.kind === "authored" && item.identity.migratedFrom?.ownerDocumentId === vectorEntry.expected.id),
    }));
    const profileId = project.workspace.derivedFields[2].identity.id;
    const selection = core.findProjectProfileSelection(project, profileId);
    expect(selection).toBeTruthy();
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-import-file").setInputFiles({ name: "gf07.math3d.project.json",
      mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await panel.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    await expect(explorer).toBeVisible();
    await explorer.getByTestId("gf07-open-profile-from-explorer").click();
    await expect(explorer).toBeHidden();
    const rightToggle = page.getByRole("button", { name: "Right", exact: true });
    if (await rightToggle.getAttribute("aria-pressed") === "true") await rightToggle.click();
    const compactInspector = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await compactInspector.isVisible()) await compactInspector.locator(":scope > summary").click();
    const inspector = compactInspector.getByTestId("gf07-graph-profile-status");
    await expect(inspector).toContainText(profileId);
    await expect(inspector).toContainText(selection.identity.id);
    await expect(inspector).toContainText("current");
    await inspector.getByTestId("gf07-locate-selection").click();
    const line = explorer.locator(`[data-selection-id="${selection.identity.id}"]`);
    await expect(line).toBeVisible();
    await expect(line.locator("summary")).toBeFocused();
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries.some((entry: any) => entry.module === "graph2d" &&
      JSON.stringify(entry).includes("project-derived-profile/v1"))).toBe(true);
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const reopenedExplorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (await reopenedExplorer.isVisible())
      await reopenedExplorer.getByRole("button", { name: "Back to Graphs" }).click();
    await expect(page.getByRole("button", { name: "Select Magnitude profile" })).toBeVisible();
    const reopenedInspector = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await reopenedInspector.isVisible()) {
      await reopenedInspector.locator(":scope > summary").click();
      await expect(reopenedInspector.getByTestId("gf07-graph-profile-status")).toContainText("current");
    }
  } finally { await closeSurfaceApp(app); }
});
