import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-14–16 derived recipe and promoted scalar Mesh survive Project reopen", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const core = require(resolve("packages/core/src/index.ts"));
    const fixture = core.parseMath3DProject(readFileSync(resolve(
      "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
    const vector = fixture.workspace.entries.find((entry: { module: string }) =>
      entry.module === "vector3d");
    const project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [vector], activeDocumentIds: [vector.expected.id],
      derivedFields: [fixture.workspace.derivedFields[0]],
      results: [], artifacts: [], relations: [], committedSelection: null,
      constructions: [] }),
    { stableKey: "gf14-gf16-e2e", title: "GF-14–16 analytic field" });
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf14-gf16.math3d.project.json", mimeType: "application/json",
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
    const derived = explorer.getByTestId("gf16-derived-operations");
    await expect(derived).toBeVisible();
    await derived.getByLabel("Input").selectOption({ index: 1 });
    await derived.getByLabel("Operation").selectOption("scalar-gradient");
    await derived.getByRole("button", { name: "Save derived operation" }).click();
    await expect(derived).toContainText("scalar gradient: vector");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    explorer = await openExplorer();
    await expect(explorer.getByTestId("gf16-derived-operations"))
      .toContainText("scalar gradient: vector");
    const scalar = explorer.getByTestId("gf14-derived-isosurface");
    await scalar.getByLabel("Scalar recipe").selectOption({ index: 1 });
    await scalar.getByLabel("Time budget (ms)").fill("30000");
    await scalar.getByRole("button", { name: "Extract derived scalar" }).click();
    await expect(scalar.getByRole("button", { name: "Promote derived scalar to Mesh" }))
      .toBeEnabled({ timeout: 45000 });
    await scalar.getByRole("button", { name: "Promote derived scalar to Mesh" }).click();
    await expect(page.getByRole("button", { name: "Mesh module" })).toBeVisible();
    await expect(page.getByTestId("mesh-summary-card")
      .getByText("source-linked derived scalar isosurface 1 m/s"))
      .toBeVisible();
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    explorer = await openExplorer();
    await expect(explorer.getByTestId("gf16-derived-operations"))
      .toContainText("scalar gradient: vector");
  } finally { await closeSurfaceApp(app); }
});
