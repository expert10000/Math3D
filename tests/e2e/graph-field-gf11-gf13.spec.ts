import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-11–13 save region checks and a trajectory Curve across Project reopen", async () => {
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
        core.vectorField3DExpression("z", "m/s")] } });
    const project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [{ module: "vector3d", checkpoint: document, expected: document.identity, replay: null }],
      activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [],
      committedSelection: null, constructions: [],
    }), { stableKey: "gf11-gf13-rotational", title: "GF-11–13 rotational field" });
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({ name: "gf11-gf13.math3d.project.json",
      mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    const region = explorer.getByTestId("gf11-region-integral");
    await expect(region).toBeVisible();
    await region.getByRole("button", { name: "Save oriented region" }).click();
    await region.getByLabel("Measurement").selectOption("stokes");
    await region.getByRole("button", { name: "Compute and save" }).click();
    await expect(region.getByTestId("gf11-saved-result")).toContainText("stokes");
    await expect(region.getByTestId("gf11-saved-result")).toContainText("midpoint-curl-flux-vs-simpson-circulation");
    const seeds = explorer.getByTestId("gf13-trajectory-promotion");
    await seeds.getByLabel("Physical points (x, y, z; one per line)").fill("1, 0, 0");
    await seeds.getByRole("button", { name: "Save seed recipe" }).click();
    await seeds.getByRole("button", { name: "Promote trajectory to Curve" }).click();
    await expect(seeds.getByTestId("gf13-saved-curve")).toContainText("current");
    await expect(region.getByTestId("gf11-saved-result")).toContainText("source-changed");
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
    await expect(reopenedExplorer.getByTestId("gf13-saved-curve")).toContainText("current");
    await expect(reopenedExplorer.getByTestId("gf11-saved-result")).toContainText("source-changed");
  } finally { await closeSurfaceApp(app); }
});
