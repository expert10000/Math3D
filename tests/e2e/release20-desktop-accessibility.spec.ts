import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("guided release journeys have distinct actions, Project focus and reduced motion", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp();
    await resetSurfaceAppState(app.page);
    const page = app.page;
    await page.getByTestId("projects-toggle").focus();
    await page.keyboard.press("Enter");
    const projects = page.getByTestId("project-explorer-panel");
    await expect(projects).toBeVisible();
    await projects.getByRole("button", { name: "Starter projects", exact: true }).click();
    await projects.getByTestId("project-gallery-guided").click();
    await expect(projects.getByRole("article", { name: "Catenoid Evidence Notebook" })).toBeVisible();
    await expect(projects.getByRole("article", { name: "QWZ" })).toBeVisible();
    await expect(projects.getByRole("article", { name: "Algebra structures" })).toBeVisible();
    await expect(projects.getByRole("article", { name: "Field Line Profile Study" })).toBeVisible();
    await resizeSurfaceAppWindow(app, 1200, 1000);
    for (const [id, label] of [["catenoid-evidence", "surface"], ["quantum-qwz", "qwz"],
      ["cas-structures", "algebra"], ["field-line-profile-study", "field"]] as const)
      await projects.getByTestId(`curated-study-card-${id}`).screenshot({
        path: test.info().outputPath(`source-build-${label}-card.png`) });
    await resizeSurfaceAppWindow(app, 760, 680);
    for (const id of ["catenoid-evidence", "quantum-qwz", "cas-structures", "field-line-profile-study"]) {
      const card = projects.getByTestId(`curated-study-card-${id}`);
      await card.scrollIntoViewIfNeeded();
      await expect.poll(() => card.evaluate(element => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
    }
    await resizeSurfaceAppWindow(app, 1200, 1000);
    await expect(projects.getByRole("button", { name: "Choose verified QWZ scene bundle" })).toBeEnabled();
    await expect(projects.getByRole("button", { name: "Open Algebra structures CAS examples" })).toBeEnabled();
    await expect(projects.getByRole("button", { name: "Open Field Line Profile Study Project" })).toBeEnabled();
    const open = projects.getByTestId("curated-study-open-catenoid-evidence");
    await expect(open).toHaveAccessibleName("Open Catenoid Evidence Notebook Project");
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project");
    await expect(projects.getByRole("heading", { name: "Catenoid Evidence Notebook", level: 2 })).toBeFocused();
    await expect(projects.getByTestId("project-message")).toHaveAttribute("role", "status");
    await resizeSurfaceAppWindow(app, 760, 680);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await projects.screenshot({ path: test.info().outputPath("source-build-surface-narrow-project.png") });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("button")!).transitionDuration)))
      .toBeLessThan(0.001);
    if (!await projects.getByTestId("project-studies-panel").count())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    const studies = projects.getByTestId("project-studies-panel");
    await studies.locator("[data-testid^='project-study-open-']").first().click();
    await studies.getByTestId("project-study-open-source-pane-1").click();
    await expect.poll(() => page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return !!active && active !== document.body && active.getClientRects().length > 0;
    })).toBe(true);
  } finally { await closeSurfaceApp(app); }
});

test("Field Project to source and Graph return keep a visible focus target", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp(); await resetSurfaceAppState(app.page);
    const page = app.page;
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByRole("button", { name: "Starter projects", exact: true }).click();
    await projects.getByTestId("project-gallery-guided").click();
    await projects.getByTestId("curated-study-open-field-line-profile-study").focus();
    await page.keyboard.press("Enter");
    await expect(projects.getByRole("heading", { name: "Field Line Profile Study", level: 2 })).toBeFocused();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const studyId = project.workspace.studies[0].id as string;
    if (!await projects.getByTestId("project-studies-panel").count())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-studies-panel").getByTestId(`project-study-open-${studyId}`).click();
    await projects.getByTestId("project-study-open-source-pane-1").click();
    let field = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(field).toBeVisible();
    await expect(field.getByRole("heading", { name: /Scientific Field Explorer/, level: 3 })).toBeFocused();
    await page.getByTestId("workspace-nav-graphs").click();
    field = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await field.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer", exact: true }).click();
    }
    await field.getByRole("button", { name: "Place probe at selected coordinates" }).click();
    await field.getByRole("button", { name: "XY slice" }).click();
    await field.getByRole("button", { name: "Preview slice" }).click();
    await field.getByRole("region", { name: "Line profile through probe" })
      .getByRole("button", { name: "Send analytic line to Graphs" }).click();
    await field.getByRole("button", { name: "Save document" }).click();
    await field.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("workspace-nav-graphs")).toBeFocused();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await page.getByRole("button", { name: /Select SPEED vs x/ }).click();
    const inspector = page.locator(".graph2d-compact-panels > details").last();
    await inspector.locator(":scope > summary").click();
    await page.getByRole("button", { name: "Fit selection" }).last().click();
    await inspector.locator(":scope > summary").click();
    await page.getByTestId("graph2d-plot").locator('[data-row-id="row_65"]').click();
    await inspector.locator(":scope > summary").click();
    await inspector.getByTestId("graph2d-return-field-cursor").focus();
    await page.keyboard.press("Enter");
    await expect(field).toBeVisible();
    await expect(field.getByRole("heading", { name: /Scientific Field Explorer/, level: 3 })).toBeFocused();
    await field.getByLabel("Density x").fill("6");
    await field.getByRole("button", { name: "Save document" }).click();
    await field.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await page.getByRole("button", { name: /Select SPEED vs x/ }).click();
    await inspector.locator(":scope > summary").click();
    await page.getByRole("button", { name: "Fit selection" }).last().click();
    await inspector.locator(":scope > summary").click();
    await page.getByTestId("graph2d-plot").locator('[data-row-id="row_65"]').click();
    await inspector.locator(":scope > summary").click();
    if (!await inspector.getByTestId("graph2d-return-field-cursor").isVisible())
      await inspector.locator(":scope > summary").click();
    await inspector.getByTestId("graph2d-return-field-cursor").click();
    await expect(inspector.getByTestId("graph2d-return-field-cursor-error"))
      .toHaveAttribute("role", "alert");
    await expect(inspector.getByTestId("graph2d-return-field-cursor-error"))
      .toContainText("Analytic Field source has changed");
  } finally { await closeSurfaceApp(app); }
});

test("Algebra card opens CAS with keyboard focus", async () => {
  test.setTimeout(90_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp(); await resetSurfaceAppState(app.page);
    const page = app.page;
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByRole("button", { name: "Starter projects", exact: true }).click();
    await projects.getByTestId("project-gallery-guided").click();
    await projects.getByTestId("curated-study-open-cas-structures").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("workspace-nav-cas")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("workspace-nav-cas")).toBeFocused();
  } finally { await closeSurfaceApp(app); }
});
