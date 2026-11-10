import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-10 saves an oriented circulation and withholds the old sign after reversal", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const core = require(resolve("packages/core/src/index.ts"));
    const fixture = core.parseMath3DProject(readFileSync(resolve(
      "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
    const vector = fixture.workspace.entries.find((entry: { module: string }) => entry.module === "vector3d");
    const document = core.reviseVectorField3DDocument(vector.checkpoint, { ...vector.checkpoint.source,
      field: { kind: "expressions", components: [
        core.vectorField3DExpression("-y", "m/s"),
        core.vectorField3DExpression("x", "m/s"),
        core.vectorField3DExpression("0", "m/s")] } });
    const project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [{ module: "vector3d", checkpoint: document, expected: document.identity, replay: null }],
      activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [],
      committedSelection: null, constructions: [],
    }), { stableKey: "gf10-rotational", title: "GF-10 rotational field" });
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({ name: "gf10.math3d.project.json",
      mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    const integral = explorer.getByTestId("gf10-line-integral");
    await expect(integral).toBeVisible();
    await integral.getByRole("button", { name: "Save oriented polyline" }).click();
    await integral.getByRole("button", { name: "Compute and save result" }).click();
    await expect(integral.getByTestId("gf10-saved-result")).toContainText("32 m/s·m");
    await expect(integral.getByTestId("gf10-saved-result").getByRole("button", { name: "Export evidence JSON" }))
      .toBeVisible();
    await integral.getByLabel("Orientation").selectOption("reverse");
    await integral.getByRole("button", { name: "Update oriented polyline" }).click();
    await expect(integral.getByTestId("gf10-saved-result")).toContainText("Value withheld: selection-changed");
    const historical = integral.getByTestId("gf10-saved-result").filter({ hasText: "selection-changed" });
    await expect(historical).not.toContainText("32 m/s·m");
    await expect(historical.getByRole("button", { name: "Export evidence JSON" })).toHaveCount(0);
    await integral.getByRole("button", { name: "Compute and save result" }).click();
    await expect(integral.getByTestId("gf10-saved-result").filter({ hasText: "-32 m/s·m" })).toBeVisible();
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const reopenedExplorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await reopenedExplorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    const reopened = reopenedExplorer.getByTestId("gf10-line-integral");
    await expect(reopened.getByTestId("gf10-saved-result").filter({ hasText: "-32 m/s·m" })).toBeVisible();
    await expect(reopened.getByTestId("gf10-saved-result").filter({ hasText: "selection-changed" })).toBeVisible();
  } finally { await closeSurfaceApp(app); }
});
