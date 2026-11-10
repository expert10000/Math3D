import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("guided Study Gallery explains real Project and external-scene routes without changing starter navigation", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await expect(panel.getByTestId("project-template-card-catenary-study")).toBeVisible();
    await panel.getByTestId("project-gallery-guided").click();
    await expect(panel.locator(".curated-study-card")).toHaveCount(15);
    const catenary = panel.getByTestId("curated-study-card-catenary-study");
    await expect(catenary).toContainText("How does a catenary generate a catenoid?");
    await expect(catenary).toContainText("Graph profile, Curve snapshot, revolution Surface");
    await catenary.locator("summary").click();
    await expect(catenary).toContainText("The numerical derivative is not a proof of minimality");
    const qwz = panel.getByTestId("curated-study-card-quantum-qwz");
    await expect(qwz).toContainText("External verified scene");
    await qwz.locator("summary").click();
    await expect(qwz).toContainText("no scene is bundled with this card");
    await expect(qwz.getByTestId("curated-study-import-quantum-qwz")).toBeEnabled();
    await panel.getByTestId("project-library-module").selectOption("Quantum scene");
    await expect(panel.locator(".curated-study-card")).toHaveCount(3);
    await panel.getByTestId("project-library-search").fill("hydrogen");
    await expect(panel.locator(".curated-study-card")).toHaveCount(1);
    await expect(panel.getByTestId("curated-study-card-quantum-hydrogen")).toBeVisible();
    await panel.getByTestId("project-gallery-all-starters").click();
    await panel.getByTestId("project-library-search").fill("");
    await panel.getByTestId("project-library-module").selectOption("All modules");
    await expect(panel.getByTestId("project-template-card-catenary-study")).toBeVisible();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenary-study").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    const opened = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(opened.metadata.tags).toContain("catenary-study");
    expect(opened.workspace.entries.map((entry: { module: string }) => entry.module)).toEqual(["graph2d", "curve", "surface"]);
  } finally { await closeSurfaceApp(ctx); }
});

test("Algebra Gallery route saves a validated structure into the active Project", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenary-study").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id as string);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-detail-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("project-library-module").selectOption("Algebra");
    const card = panel.getByTestId("curated-study-card-cas-structures");
    await expect(panel.locator(".curated-study-card")).toHaveCount(1);
    await card.locator("summary").click();
    await expect(card).toContainText("do not constitute a Galois correspondence Study");
    await card.getByTestId("curated-study-open-cas-structures").click();
    const algebra = page.getByTestId("cas-algebra-gallery");
    await expect(algebra).toBeVisible();
    await algebra.locator("summary").click();
    await expect(algebra.getByTestId("cas-gallery-gf5")).toContainText("characteristic = 5");
    await algebra.getByTestId("cas-gallery-gf5").getByRole("button", { name: "Save example" }).click();
    await expect(algebra.getByTestId("cas-gallery-status")).toContainText("Saved Five-element field in Project", { timeout: 60_000 });
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`math3d.project.v1.payload.${id}`)!)
      .algebraObjects?.length ?? 0, projectId)).toBeGreaterThan(0);
  } finally { await closeSurfaceApp(ctx); }
});

test("guided Catenary Project keeps its exact two-pane Study through a desktop restart", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await expect(panel.getByTestId("curated-study-card-catenary-study")).toContainText("Saved Study layout");
    await panel.getByTestId("curated-study-open-catenary-study").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(first.workspace.studies).toHaveLength(1);
    expect(first.workspace.studies[0].layout.mode).toBe("split-2");
    expect(first.workspace.studies[0].members[0].resultId).toBe(first.workspace.results[0].resultId);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    let studies = panel.getByTestId("project-studies-panel");
    await studies.locator('[data-testid^="project-study-open-"]').click();
    await expect(studies.getByTestId("project-study-panes")).toHaveAttribute("data-layout", "split-2");
    await studies.getByTestId("project-study-preview-toggle-pane-1").click();
    await expect(studies.getByTestId("project-study-pane-preview")).toHaveAttribute("data-kind", "graph");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile); page = ctx.page; panel = page.getByTestId("project-explorer-panel");
    await openLastSavedProject(page);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    studies = panel.getByTestId("project-studies-panel");
    await studies.locator('[data-testid^="project-study-open-"]').click();
    await expect(studies.getByTestId("project-study-panes")).toHaveAttribute("data-layout", "split-2");
    await expect(studies.locator('[data-testid^="project-study-pane-"]').first()).toContainText("Source current");
    const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(reopened.workspace.studies[0].id).toBe(first.workspace.studies[0].id);
  } finally { await closeSurfaceApp(ctx); }
});

test("guided Catenoid Study opens its saved Mesh curvature result after a cold restart", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenoid-evidence").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const study = first.workspace.studies[0];
    expect(study.members.map((member: { documentId: string }) => first.workspace.entries.find(
      (entry: { expected: { id: string } }) => entry.expected.id === member.documentId).module))
      .toEqual(["surface", "mesh"]);
    expect(study.members[1].resultId).toBe(first.workspace.results.find((result: { provenance: { source: { documentId: string } } }) =>
      result.provenance.source.documentId === study.members[1].documentId).resultId);
    expect(first.workbooks).toHaveLength(1);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-studies-panel").locator('[data-testid^="project-study-open-"]').click();
    const comparison = panel.getByTestId("project-catenoid-waist-evidence");
    await expect(comparison).toContainText("analytic reference K=-1");
    await expect(comparison).toContainText("discrete estimate K=");
    await expect(panel.getByTestId("project-study-open-result-pane-1")).toBeEnabled();
    await expect(panel.getByTestId("project-study-open-result-pane-2")).toBeEnabled();
    const evidencePath = test.info().outputPath("catenoid-waist-comparison.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), evidencePath);
    await comparison.getByTestId("project-catenoid-waist-export").click();
    await expect.poll(() => { try { return readFileSync(evidencePath).length; } catch { return 0; } })
      .toBeGreaterThan(100);
    const exported = JSON.parse(readFileSync(evidencePath, "utf8"));
    expect(exported.result.summary.analyticWaistGaussian).toBe(-1);
    expect(exported.result.provenance.operation.type).toBe("surface.catenoid-waist-comparison");
    await panel.getByTestId("project-save").click();
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile); page = ctx.page; panel = page.getByTestId("project-explorer-panel");
    await openLastSavedProject(page);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-studies-panel").locator('[data-testid^="project-study-open-"]').click();
    await expect(panel.getByTestId("project-catenoid-waist-evidence"))
      .toContainText("discrete estimate K=");
    await panel.getByTestId("project-study-open-result-pane-2").click();
    await expect(panel.getByTestId("project-results-browser")).toBeVisible();
    await expect(panel.getByTestId(`project-result-select-${study.members[1].resultId}`))
      .toHaveAttribute("aria-current", "true");
  } finally { await closeSurfaceApp(ctx); }
});
