import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

test("guided Study Gallery explains real Project and external-scene routes without changing starter navigation", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await expect(panel.getByTestId("project-template-card-catenary-study")).toBeVisible();
    await panel.getByTestId("project-gallery-guided").click();
    await expect(panel.locator(".curated-study-card")).toHaveCount(17);
    await expect(panel.getByTestId("curated-study-card-field-line-profile-study"))
      .toContainText("exact Field source");
    const catenary = panel.getByTestId("curated-study-card-catenary-study");
    await catenary.scrollIntoViewIfNeeded();
    if (process.env.MATH3D_GALLERY_CAPTURE_DIR) {
      const directory = process.env.MATH3D_GALLERY_CAPTURE_DIR;
      mkdirSync(directory, { recursive: true });
      await catenary.screenshot({ path: join(directory, "desktop-guided-gallery.png") });
      writeFileSync(join(directory, "desktop-build-identity.json"),
        readFileSync("dist/build-identity.json"));
    }
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

test("Projects Journeys lists the Catenoid flow and opens its step tabs", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Journeys", exact: true }).click();
    await expect(panel.getByTestId("project-explorer-header").locator("h2")).toHaveText("Journeys");
    await expect(panel.getByRole("heading", { name: "Journeys (1)" })).toBeVisible();
    await expect(panel.locator(".curated-study-card")).toHaveCount(1);
    await expect(panel.locator(".curated-study-card").first())
      .toHaveAttribute("data-testid", "curated-study-card-catenoid-evidence");
    await expect(panel.locator(".project-gallery-workspace")).toBeHidden();
    await panel.getByTestId("curated-study-open-catenoid-evidence").click();
    await expect(panel.getByTestId("project-explorer-header").locator("h2"))
      .toHaveText("Catenoid evidence journey", { timeout: 60_000 });
    await expect(panel.getByTestId("project-journey-source"))
      .toContainText("Catenoid Evidence Notebook");
    await expect(panel.getByTestId("project-detail-tab-journey")).toHaveAttribute("aria-current", "page");
    await expect(panel.getByTestId("catenoid-flow-tab-study")).toBeInViewport();
    await expect(panel.getByTestId("catenoid-flow-tab-study")).toBeFocused();
    const workflow = panel.getByRole("tablist", { name: "Catenoid journey workflow" });
    await expect(workflow).toContainText("Workflow");
    await expect(workflow.locator(".catenoid-journey-arrow")).toHaveCount(3);
    await expect(workflow.getByRole("tab")).toHaveText(["1 Study", "2 Curvature", "3 Comparison", "4 Workbook"]);
    await workflow.getByRole("tab", { name: "1 Study" }).press("ArrowRight");
    await expect(workflow.getByRole("tab", { name: "2 Curvature" })).toHaveAttribute("aria-selected", "true");
    await expect(workflow.getByRole("tab", { name: "2 Curvature" })).toBeFocused();
    await expect(panel.getByTestId("project-study-create")).toBeHidden();
    await panel.getByTestId("project-detail-tab-overview").click();
    await expect(panel.locator(".project-dashboard-documents")).toBeVisible();
    await panel.getByTestId("project-detail-tab-journey").click();
    await expect(panel.getByTestId("catenoid-flow-tab-curvature")).toBeVisible();
    await panel.getByTestId("project-research-nav-journeys").click();
    await expect(panel.getByTestId("curated-study-open-catenoid-evidence"))
      .toHaveText("Continue journey");
    await panel.getByTestId("curated-study-open-catenoid-evidence").click();
    await expect(panel.getByTestId("project-detail-tab-journey")).toHaveAttribute("aria-current", "page");
    await expect(panel.getByTestId("catenoid-flow-tab-study")).toBeInViewport();
  } finally { await closeSurfaceApp(ctx); }
});

test("Catenoid workflow stays visible on its Surface and returns to the selected journey step", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Journeys", exact: true }).click();
    await panel.getByTestId("curated-study-open-catenoid-evidence").click();
    await panel.getByTestId("catenoid-flow-tab-curvature").click();
    await panel.getByTestId("catenoid-flow-open-surface").click();
    await expect(panel).toBeHidden();
    const inherited = page.getByTestId("catenoid-document-workflow");
    await expect(inherited).toBeVisible();
    await expect(inherited.locator("xpath=ancestor::header")).toHaveCount(1);
    const surfaceFlow = page.getByTestId("catenoid-surface-subflow");
    await expect(surfaceFlow).toBeVisible();
    await expect(surfaceFlow.locator("nav")).toHaveAttribute("aria-label", "Surface curvature subflow");
    await expect(surfaceFlow.locator("nav").getByRole("button")).toHaveText([
      "1 Surface", "2 Analysis", "3 Curvature field", "4 Compute",
    ]);
    await expect(inherited.getByTestId("catenoid-document-step-curvature"))
      .toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("surfaces-left-tab-analysis")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("surface-curvature-compute")).toBeVisible();
    await surfaceFlow.getByTestId("catenoid-surface-step-surface").click();
    await expect(page.getByTestId("surfaces-left-tab-scene")).toHaveAttribute("aria-pressed", "true");
    await surfaceFlow.getByTestId("catenoid-surface-step-analysis").click();
    await expect(page.getByTestId("surfaces-left-tab-analysis")).toHaveAttribute("aria-pressed", "true");
    await expect(surfaceFlow.getByTestId("catenoid-surface-step-analysis"))
      .toHaveAttribute("aria-current", "step");
    await surfaceFlow.getByTestId("catenoid-surface-step-curvature").click();
    await expect(page.getByTestId("surface-curvature-compute")).toBeVisible();
    await surfaceFlow.getByTestId("catenoid-surface-step-compute").click();
    await expect(surfaceFlow.getByRole("status"))
      .toHaveText("Curvature result ready. Continue with 3 Comparison.", { timeout: 30_000 });
    await expect(surfaceFlow.getByTestId("catenoid-surface-open-mesh")).toBeVisible();
    await surfaceFlow.getByTestId("catenoid-surface-open-mesh").click();
    await expect(page.getByRole("button", { name: "Back to catenoid" })).toBeVisible();
    await page.getByRole("button", { name: "Back to catenoid" }).click();
    await expect(surfaceFlow).toBeVisible();
    await expect(inherited.getByRole("button")).toHaveText([
      "1 Study", "2 Curvature", "3 Comparison", "4 Workbook",
    ]);
    await inherited.getByTestId("catenoid-document-step-comparison").click();
    await expect(panel.getByTestId("project-detail-tab-journey"))
      .toHaveAttribute("aria-current", "page");
    await expect(panel.getByTestId("catenoid-flow-tab-comparison"))
      .toHaveAttribute("aria-selected", "true");
    await expect(panel.getByTestId("catenoid-flow-panel-comparison")).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});

test("Surfaces navigation inherits the open Catenoid journey workflow", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("workspace-nav-surfaces").click();
    await expect(page.getByTestId("catenoid-document-workflow")).toHaveCount(0);
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Journeys", exact: true }).click();
    await panel.getByTestId("curated-study-open-catenoid-evidence").click();
    await expect(panel.getByTestId("catenoid-journey-flow")).toBeVisible();
    await page.getByTestId("workspace-nav-surfaces").click();
    await expect(panel).toBeHidden();
    const workflow = page.getByTestId("catenoid-document-workflow");
    await expect(workflow).toBeVisible();
    await expect(workflow.getByTestId("catenoid-document-step-curvature"))
      .toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("surface-curvature-compute")).toBeVisible();
    await page.getByTestId("workspace-nav-surfaces").click();
    await expect(workflow).toBeVisible();
    await expect(page.getByTestId("surface-curvature-compute")).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});

test("Catenoid Notebook links directly to its distinct guided journey", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-open-catenoid-evidence").click();
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await expect(panel.getByTestId("project-explorer-header").locator("h2"))
      .toHaveText("Catenoid Evidence Notebook");
    const guide = panel.getByTestId("project-open-guided-catenoid");
    await expect(guide).toBeVisible({ timeout: 60_000 });
    await guide.click();
    await expect(panel.getByTestId("project-library").getByRole("button", { name: "Journeys", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByTestId("project-library-search")).toHaveValue("catenoid evidence");
    await expect(panel.locator(".curated-study-card")).toHaveCount(1);
    await expect(panel.getByTestId("curated-study-card-catenoid-evidence")).toBeVisible();
    await expect(panel.getByTestId("curated-study-card-catenoid-evidence"))
      .toContainText("Catenoid evidence journey");
    await expect(panel.getByTestId("curated-study-open-catenoid-evidence"))
      .toHaveText("Open journey");
    await panel.getByTestId("curated-study-open-catenoid-evidence").click();
    await expect(panel.getByTestId("catenoid-journey-flow")).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByTestId("project-detail-tab-journey")).toHaveAttribute("aria-current", "page");
    await expect(panel.getByTestId("catenoid-flow-tab-curvature")).toBeVisible();
    await panel.getByTestId("project-research-nav-gallery").click();
    await panel.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(panel.getByTestId("project-explorer-header").locator("h2"))
      .toHaveText("Catenoid Evidence Notebook");
    await panel.getByTestId("project-open-guided-catenoid").click();
    await expect(panel.getByTestId("curated-study-open-catenoid-evidence"))
      .toHaveText("Continue journey");
    await panel.getByTestId("curated-study-open-catenoid-evidence").click();
    await expect(panel.getByTestId("project-detail-tab-journey")).toHaveAttribute("aria-current", "page");
    await expect(panel.getByTestId("catenoid-flow-tab-study")).toBeInViewport();
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
    await page.getByTestId("sage-workspace-open-projects").click();
    await expect(algebra).toHaveCount(0);
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("project-library-module").selectOption("Algebra");
    await expect(panel.getByTestId("curated-study-cas-provenance")).toContainText("Gallery GF(5)");
    await expect(panel.getByTestId("curated-study-cas-provenance")).toContainText("revision 1");
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
    let studies = panel.getByTestId("project-studies-panel");
    await expect(studies.getByTestId("project-study-panes")).toHaveAttribute("data-layout", "split-2");
    await studies.getByTestId("project-study-preview-toggle-pane-1").click();
    await expect(studies.getByTestId("project-study-pane-preview")).toHaveAttribute("data-kind", "graph");
    await studies.getByTestId("project-study-back").click();
    await expect(studies.getByTestId(`project-study-open-${first.workspace.studies[0].id}`)).toBeFocused();
    await panel.getByTestId("project-research-nav-results").click();
    await expect(panel.getByTestId("project-detail-tab-results")).toHaveAttribute("aria-current", "page");
    await panel.getByTestId("project-research-nav-studies").click();
    await expect(studies).toBeVisible();
    await studies.getByTestId(`project-study-open-${first.workspace.studies[0].id}`).click();
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
    expect(first.workbooks).toHaveLength(2);
    expect(first.workbooks.some((book: { title: string }) => book.title.endsWith("Research"))).toBe(true);
    if (!await panel.getByTestId("project-studies-panel").count())
      await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-detail-tab-overview").click();
    if (!await panel.getByTestId("project-study-panes").count())
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
    if (!await panel.getByTestId("project-studies-panel").count())
      await panel.getByTestId("project-gallery-layout-toggle").click();
    if (!await panel.getByTestId("project-study-panes").count())
      await panel.getByTestId("project-studies-panel").locator('[data-testid^="project-study-open-"]').click();
    await expect(panel.getByTestId("project-catenoid-waist-evidence"))
      .toContainText("discrete estimate K=");
    await panel.getByTestId("project-study-open-result-pane-2").click();
    await expect(panel.getByTestId("project-results-browser")).toBeVisible();
    await expect(panel.getByTestId(`project-result-select-${study.members[1].resultId}`))
      .toHaveAttribute("aria-current", "true");
  } finally { await closeSurfaceApp(ctx); }
});

test("guided reset opens a new Study while retaining the original Project, Workbook and Note", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenary-study").click();
    await expect(panel.getByTestId("project-study-panes")).toBeVisible({ timeout: 60_000 });
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await panel.getByTestId("project-detail-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-reset-catenary-study").click();
    await expect.poll(() => panel.getByTestId("project-message").textContent(), { timeout: 60_000 })
      .toMatch(/Opened supported|failed|unavailable/);
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported");
    await expect(panel.getByTestId("project-study-panes")).toBeVisible({ timeout: 60_000 });
    const second = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(second.identity.id).not.toBe(first.identity.id);
    expect(second.workspace.studies).toHaveLength(1);
    expect(second.notes?.some((note: { title: string }) => note.title.endsWith("observation"))).toBe(true);
    expect(second.workbooks?.some((book: { title: string }) => book.title.endsWith("Research"))).toBe(true);
    expect(await page.evaluate(id => localStorage.getItem(`math3d.project.v1.payload.${id}`) !== null, first.identity.id))
      .toBe(true);
  } finally { await closeSurfaceApp(ctx); }
});

test("narrative JSON reviews citations and omissions before an independent desktop import", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    const file = panel.getByTestId("project-import-file");
    await file.setInputFiles("tests/fixtures/gallery-catenary-narrative.json");
    const review = page.getByTestId("project-research-narrative-review");
    await expect(review).toBeVisible();
    await expect(review).toContainText("Citations");
    await expect(review).toContainText("Notes");
    await expect(review).toContainText("Omissions");
    await page.getByTestId("project-import-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Imported into the library", { timeout: 60_000 });
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBeNull();
    await file.setInputFiles("tests/fixtures/gallery-catenary-narrative.json");
    await expect(panel.getByTestId("project-message")).toContainText("Project ID already exists");
    await expect(review).toHaveCount(0);
  } finally { await closeSurfaceApp(ctx); }
});
