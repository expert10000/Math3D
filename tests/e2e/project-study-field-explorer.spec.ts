import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("a Field Explorer Study verifies its plane and survives a cold Project reopen", async () => {
  let app = await launchSurfaceApp();
  try {
    let page = app.page;
    await resetSurfaceAppState(page);
    const core = require(resolve("packages/core/src/index.ts"));
    const fixture = core.parseMath3DProject(readFileSync(resolve(
      "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
    const field = fixture.workspace.entries.find((entry: any) => entry.module === "vector3d").checkpoint;
    const project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [{ module: "vector3d", checkpoint: field, expected: field.identity, replay: null }],
      activeDocumentIds: [field.identity.id], results: [], artifacts: [], relations: [],
      constructions: [], committedSelection: null }), { stableKey: "field-study-journey" });
    const studied = core.createProjectStudyFromDocuments(project, "field-study-journey",
      "Saved Field Explorer plane", [field.identity.id]);
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "field-study.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(core.serializeMath3DProject(studied)) });
    await projects.getByTestId("project-import-open").click();
    await projects.getByTestId("project-gallery-layout-toggle").click();
    let studies = projects.getByTestId("project-studies-panel");
    await studies.locator("[data-testid^='project-study-open-']").click();
    await studies.getByTestId("project-study-preview-toggle-pane-1").click();
    await expect(studies.getByTestId("project-study-pane-preview")).toHaveAttribute("data-kind", "field");
    await expect(studies.getByTestId("project-study-field-slice")).toBeVisible();
    await projects.getByTestId("project-save").click();
    const profileDir = app.profileDir;
    await app.app.close();
    app = await launchSurfaceApp({}, profileDir);
    page = app.page;
    await openLastSavedProject(page);
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-gallery-layout-toggle").click();
    studies = projects.getByTestId("project-studies-panel");
    await studies.locator("[data-testid^='project-study-open-']").click();
    await studies.getByTestId("project-study-preview-toggle-pane-1").click();
    await expect(studies.getByTestId("project-study-field-slice")).toBeVisible();
    await expect(studies.getByTestId("project-study-source-status-pane-1")).toContainText("current");
  } finally { await closeSurfaceApp(app); }
});

test("an unavailable scientific Field Study source blocks Project activation", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const core = require(resolve("packages/core/src/index.ts"));
    const fixture = core.parseMath3DProject(readFileSync(resolve(
      "tests/fixtures/graph-field/gf23-bundled-profile.math3d"), "utf8"));
    const original = fixture.workspace.entries.find((entry: any) => entry.module === "vector3d").checkpoint;
    const field = core.createVectorField3DDocument({ ...original.source,
      field: { ...original.source.field, references: original.source.field.references.map((reference: any) =>
        ({ ...reference, locator: { kind: "preset", value: "unavailable-study-source" } })) } },
      { stableKey: "unavailable-field-study", workspace: original.workspace });
    const project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [{ module: "vector3d", checkpoint: field, expected: field.identity, replay: null }],
      activeDocumentIds: [field.identity.id], results: [], artifacts: [], relations: [],
      constructions: [], committedSelection: null }), { stableKey: "unavailable-field-study" });
    const studied = core.createProjectStudyFromDocuments(project, "missing-field-bundle",
      "Missing bundle Study", [field.identity.id]);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "missing-field-bundle.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(core.serializeMath3DProject(studied)) });
    await projects.getByTestId("project-import-open").click();
    await expect(projects.getByTestId("project-message")).toContainText("Project import failed:");
    await expect(projects.locator(".project-gallery-preview-backdrop")).toBeVisible();
    await expect(projects.getByTestId("project-study-field-slice")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});

test("a scientific Field Study opens only verified preset samples", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const core = require(resolve("packages/core/src/index.ts"));
    const project = core.parseMath3DProject(readFileSync(resolve(
      "tests/fixtures/graph-field/gf23-bundled-profile.math3d"), "utf8"));
    const field = project.workspace.entries.find((entry: any) => entry.module === "vector3d");
    const studied = core.createProjectStudyFromDocuments(project, "verified-field-bundle",
      "Verified bundle Study", [field.expected.id]);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "verified-field-bundle.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(core.serializeMath3DProject(studied)) });
    await projects.getByTestId("project-import-open").click();
    await expect(projects.locator(".project-gallery-preview-backdrop")).toHaveCount(0);
    await projects.getByTestId("project-gallery-layout-toggle").click();
    const studies = projects.getByTestId("project-studies-panel");
    await studies.locator("[data-testid^='project-study-open-']").click();
    await studies.getByTestId("project-study-preview-toggle-pane-1").click();
    await expect(studies.getByTestId("project-study-field-slice")).toBeVisible();
    await expect(studies.getByTestId("project-study-field-source-status")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
