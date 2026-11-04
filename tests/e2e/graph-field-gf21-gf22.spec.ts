import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-21/25 Cartesian plan and linear temporal probe/slice reopen", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const core = require(resolve("packages/core/src/index.ts"));
    const fixture = core.parseMath3DProject(readFileSync(resolve(
      "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
    const first = fixture.workspace.entries.find((entry: { module: string }) =>
      entry.module === "vector3d").checkpoint;
    const second = core.createVectorField3DDocument({ ...first.source,
      field: { kind: "expressions", components: [
        core.vectorField3DExpression("2*x", "m/s"),
        core.vectorField3DExpression("y", "m/s"),
        core.vectorField3DExpression("z", "m/s")] } },
    { stableKey: "gf22-desktop-later", title: "Later field" });
    const project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [first, second].map(document => ({ module: "vector3d", checkpoint: document,
        expected: document.identity, replay: null })),
      activeDocumentIds: [first.identity.id], results: [], artifacts: [], relations: [],
      committedSelection: null, constructions: [] }),
    { stableKey: "gf21-gf22-desktop", title: "Cartesian and time contracts" });
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf21-gf22.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const openExplorer = async () => {
      const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
      if (!await explorer.isVisible()) {
        await page.locator(".graph2d-toolbar-menu > summary").click();
        await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
      }
      return explorer;
    };
    let explorer = await openExplorer();
    const units = explorer.getByTestId("gf21-frame-unit");
    await expect(units).toContainText("Right-handed Cartesian");
    await units.getByLabel("Preview length unit").selectOption("cm");
    await units.getByLabel("Preview time unit").selectOption("ms");
    await expect(units.getByRole("status")).toContainText("(100, 100, 100) cm");
    const temporal = explorer.getByTestId("gf22-time-source");
    await temporal.getByLabel("Later frame").selectOption(second.identity.id);
    await temporal.getByLabel("Later time (s)").fill("2");
    await temporal.getByLabel("Time interpolation").selectOption("linear");
    await temporal.getByRole("button", { name: "Save temporal source" }).click();
    await expect(temporal).toContainText("Saved temporal sources (1)");
    await temporal.getByTestId("gf25-saved-time-source-select").selectOption({ index: 1 });
    await temporal.getByLabel("Sample time").fill("1");
    await temporal.getByRole("button", { name: "Sample temporal probe and slice" }).click();
    await expect(temporal.getByTestId("gf25-sample-result")).toContainText("9 × 9");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    explorer = await openExplorer();
    const reopened = explorer.getByTestId("gf22-time-source");
    await expect(reopened).toContainText("Saved temporal sources (1)");
    await reopened.getByText("Saved temporal sources (1)").click();
    await expect(reopened).toContainText("2 frames, s, current");
    await reopened.getByTestId("gf25-saved-time-source-select").selectOption({ index: 1 });
    await reopened.getByLabel("Sample time").fill("1");
    await reopened.getByRole("button", { name: "Sample temporal probe and slice" }).click();
    await expect(reopened.getByTestId("gf25-sample-result")).toContainText("9 × 9");
  } finally { await closeSurfaceApp(app); }
});
