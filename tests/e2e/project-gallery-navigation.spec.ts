import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("reactivating Projects during resize keeps the Gallery and its filters open", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const toggle = ctx.page.getByTestId("projects-toggle"), panel = ctx.page.getByTestId("project-explorer-panel");
    // Two activations characterize the former toggle race without timing sleeps.
    await toggle.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-library-search").fill("edge path");
    await resizeSurfaceAppWindow(ctx, 1440, 1000);
    await toggle.click();
    await expect(panel.getByTestId("project-library-search")).toHaveValue("edge path");
    await expect(panel.locator(".project-starter-card")).toHaveCount(1);
    await panel.getByRole("button", { name: "Close project explorer" }).click();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  } finally { await closeSurfaceApp(ctx); }
});

test("Project Gallery filters starters and saved projects and keeps browsing separate from project actions", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await resizeSurfaceAppWindow(ctx, 1440, 1000);
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-library-module").selectOption("Workbook");
    await expect(panel.locator(".project-starter-card")).toHaveCount(4);
    await panel.getByTestId("project-library-search").fill("edge path");
    await expect(panel.locator(".project-starter-card")).toHaveCount(1);
    await expect(panel.getByTestId("project-template-select")).toHaveValue("edge-path-evidence");
    const untouched = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    await panel.getByTestId("project-template-preview").click();
    await expect(panel.getByTestId("project-import-preview")).toContainText("Edge Path Evidence Notebook");
    await panel.getByTestId("project-import-cancel").click();
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(untouched);
    await panel.getByTestId("project-library-search").fill("no such project");
    await expect(panel.getByTestId("project-template-preview")).toBeDisabled();
    await panel.getByRole("button", { name: "Clear filters", exact: true }).click();
    await panel.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    await expect(panel).toHaveClass(/project-viewer-panel/);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await expect(panel.getByTestId("project-detail-toggle")).toHaveAttribute("aria-pressed", "true");
    const active = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await expect(panel.getByTestId("project-workbooks")).toContainText(active.workbooks[0].title);
    await expect(panel.locator(".project-workspace-notes")).toContainText(`Notes (${active.notes.length})`);
    await panel.getByTestId("project-detail-toggle").click();
    await panel.getByRole("button", { name: "Your saved projects", exact: true }).click();
    await panel.getByTestId("project-library-module").selectOption("Workbook");
    const card = panel.getByTestId(`project-library-${active.identity.id}`);
    await expect(card).toContainText("Workbook");
    await card.getByRole("button", { name: `Favorite ${active.metadata.title}`, exact: true }).click();
    await panel.getByRole("button", { name: "Favorites", exact: true }).click();
    await expect(panel.locator(".project-gallery-card")).toHaveCount(1);
    await panel.screenshot({ path: test.info().outputPath("project-gallery-desktop.png") });

    const leftScroll = await panel.locator(".project-gallery-library").evaluate(element => element.scrollTop);
    await panel.getByRole("navigation", { name: "Jump to project section" }).getByRole("button", { name: "Contents", exact: true }).click();
    await expect(panel.getByTestId("project-sidebar-contents")).toBeFocused();
    await expect(panel.getByTestId("project-workbooks")).toContainText(active.workbooks[0].title);
    expect(await panel.locator(".project-gallery-library").evaluate(element => element.scrollTop)).toBe(leftScroll);
    await panel.screenshot({ path: test.info().outputPath("project-gallery-contents.png") });
    const download = resolve(ctx.profileDir, "gallery-project.resources.json");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), download);
    await panel.getByRole("navigation", { name: "Jump to project section" }).getByRole("button", { name: "Import / export", exact: true }).click();
    await expect(panel.getByTestId("project-sidebar-transfer")).toBeFocused();
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(() => existsSync(download)).toBe(true);
    const exported = JSON.parse(readFileSync(download, "utf8"));
    expect(exported.project.identity.id).toBe(active.identity.id);
    expect(exported.resources.some((item: any) => item.kind === "workbook-payload")).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!))).toEqual(active);
    await panel.screenshot({ path: test.info().outputPath("project-gallery-transfer.png") });

    await panel.getByTestId(`project-preview-${active.identity.id}`).click();
    await expect(panel.locator(".project-workspace-summary")).toContainText("SAVED COPY · PREVIEW");
    await expect(panel.getByTestId("project-title")).toBeDisabled();
    await panel.getByTestId("project-manage").click();
    await expect(panel.locator(".project-workspace-summary")).toContainText("EDITING SAVED COPY");
    await panel.getByTestId("project-title").fill("My catenoid study");
    await panel.getByTestId("project-save").click();
    await expect(card).toContainText("My catenoid study");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!))).toEqual(active);
    await panel.getByTestId(`project-preview-${active.identity.id}`).click();
    await panel.getByTestId("project-sidebar-open").click();
    await expect(panel).toBeHidden();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).metadata.title)).toBe("My catenoid study");
  } finally { await closeSurfaceApp(ctx); }
});

test("Project Gallery keeps its sections reachable on a narrow screen and in the quick panel", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await resizeSurfaceAppWindow(ctx, 390, 844);
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Your saved projects", exact: true }).click();
    await panel.getByTestId("project-title").fill("Phone project");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    await panel.screenshot({ path: test.info().outputPath("project-gallery-phone.png") });
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await panel.getByRole("navigation", { name: "Jump to project section" }).getByRole("button", { name: "Import / export", exact: true }).click();
    await expect(panel.getByTestId("project-import-file")).toBeInViewport();
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await expect(panel).toHaveClass(/project-quick-panel/);
    await panel.getByRole("navigation", { name: "Jump to project section" }).getByRole("button", { name: "Project details", exact: true }).click();
    await expect(panel.getByTestId("project-title")).toHaveValue("Phone project");
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await panel.screenshot({ path: test.info().outputPath("project-gallery-quick.png") });
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(panel).toHaveClass(/project-viewer-panel/);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await expect(panel).toHaveClass(/project-gallery-page/);
    await expect(panel.getByTestId("project-detail-toggle")).toHaveAttribute("aria-pressed", "true");
  } finally { await closeSurfaceApp(ctx); }
});

test("Catenoid Project Notes open from the Project detail page", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, projects = page.getByTestId("project-explorer-panel");
    await page.setViewportSize({ width: 2048, height: 1107 });
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(projects).toHaveClass(/project-viewer-panel/);
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await expect(projects.getByTestId("project-detail-toggle")).toHaveAttribute("aria-pressed", "true");
    await projects.getByTestId("project-all-notes").click();
    const notes = page.getByTestId("project-notes-panel");
    await expect(notes).toBeVisible();
    await expect(projects).toBeVisible();
    await expect(projects.getByTestId("project-library")).toBeHidden();
    await expect(notes).toHaveClass(/project-notes-page-panel/);
    await expect(notes).toContainText("Catenoid Evidence Notebook");
    await expect(notes.locator("article[data-testid^='project-note-']")).toHaveCount(3);
    await page.screenshot({ path: test.info().outputPath("catenoid-notes-open.png") });
    await projects.getByTestId("project-detail-toggle").click();
    await expect(notes).toBeHidden();
    await expect(projects.getByTestId("project-library")).toBeVisible();
    await projects.getByTestId("project-detail-toggle").click();
    await projects.getByTestId("project-all-notes").click();
    await notes.getByRole("button", { name: "Back to Project" }).click();
    await expect(projects.getByTestId("project-workbooks")).toBeVisible();
    const active = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await projects.getByTestId(`project-open-note-${active.notes[0].identity.id}`).click();
    await expect(projects).toBeVisible();
    await expect(notes.getByTestId(`project-note-${active.notes[0].identity.id}`)).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});

test("Project documents and Notes can stay beside the live viewer", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, projects = page.getByTestId("project-explorer-panel");
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(projects).toHaveClass(/project-viewer-panel/);
    await expect(page.locator("canvas:visible").first()).toBeVisible();
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await expect(projects.getByTestId("project-detail-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project");
    const active = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const surface = active.workspace.entries.find((entry: { module: string }) => entry.module === "surface");
    expect(surface).toBeTruthy();
    await projects.getByTestId(`project-view-${surface.expected.id}`).click();
    await expect(projects).toHaveClass(/project-viewer-panel/);
    const viewerCanvas = page.locator("canvas:visible").first();
    await expect(viewerCanvas).toBeVisible();
    expect((await viewerCanvas.boundingBox())?.width ?? 0).toBeGreaterThan(100);
    await expect(projects.getByTestId("project-viewer-document")).toHaveValue(surface.expected.id);
    await expect(projects.getByTestId("project-workbooks")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("project-beside-viewer.png") });
    await projects.getByTestId(`project-view-workbook-${active.workbooks[0].id}`).click();
    await expect(projects).toHaveClass(/project-viewer-panel/);
    await expect(projects.getByTestId("project-viewer-document")).toHaveValue("");
    await projects.getByTestId("project-viewer-document").selectOption(surface.expected.id);
    await expect(projects.getByTestId("project-viewer-document")).toHaveValue(surface.expected.id);
    await projects.getByTestId("project-all-notes").click();
    const notes = projects.getByTestId("project-notes-panel");
    await expect(notes).toBeVisible();
    const anchored = active.notes.find((note: { anchor?: unknown }) => note.anchor);
    await notes.getByTestId(`project-note-${anchored.identity.id}`).getByRole("button", { name: "Open target" }).click();
    await expect(projects).toHaveClass(/project-viewer-panel/);
    await expect(notes).toBeVisible();
    await expect(projects.getByTestId("project-viewer-document")).toHaveValue(anchored.anchor.source.documentId);
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await expect(projects).toHaveClass(/project-gallery-page/);
    await expect(notes).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});

test("reopening a saved Catenoid starter shows its Surface in the viewer", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, projects = page.getByTestId("project-explorer-panel");
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project");
    const catenoid = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const surface = catenoid.workspace.entries.find((entry: { module: string }) => entry.module === "surface");
    expect(surface).toBeTruthy();
    await expect(projects.getByTestId("project-viewer-document")).toHaveValue(surface.expected.id);
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-detail-toggle").click();
    await projects.getByTestId("project-template-open-edge-path-evidence").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).not.toBe(catenoid.identity.id);
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-detail-toggle").click();
    await projects.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(projects).toHaveClass(/project-viewer-panel/);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(catenoid.identity.id);
    await expect(projects.getByTestId("project-viewer-document")).toHaveValue(surface.expected.id);
    await expect(page.getByTestId("surface-viewer-canvas-host")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("catenoid-reopened-surface.png") });
  } finally { await closeSurfaceApp(ctx); }
});

test("starter Open and Preview reuse edited copies; only New copy adds another project", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
    const full = async () => { await expect(panel).toHaveClass(/project-viewer-panel/); await panel.getByTestId("project-gallery-layout-toggle").click(); };
    const size = () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries.length);
    const active = () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const payload = (id: string) => page.evaluate(id => localStorage.getItem(`math3d.project.v1.payload.${id}`), id);
    await show();
    await panel.getByTestId("project-template-open-edge-path-evidence").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    await full();
    const first = await active();
    await panel.getByTestId("project-title").fill("My edited edge path");
    await panel.getByTestId("project-description").fill("Keep my observations and recorded evidence.");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “My edited edge path”");
    const edited = await payload(first.identity.id);
    await panel.getByTestId("project-detail-toggle").click();
    await expect(panel.getByTestId("project-template-copy-edge-path-evidence")).toContainText("My edited edge path");
    for (let repeat = 0; repeat < 2; repeat++) {
      await panel.getByTestId("project-template-open-edge-path-evidence").click();
      await full();
      await expect(panel.getByTestId("project-detail-toggle")).toHaveAttribute("aria-pressed", "true");
      expect(await size()).toBe(1);
      expect((await active()).identity.id).toBe(first.identity.id);
      expect(await payload(first.identity.id)).toBe(edited);
      await panel.getByTestId("project-detail-toggle").click();
    }
    await panel.getByTestId("project-template-card-preview-edge-path-evidence").click();
    await expect(panel.getByTestId("project-import-preview")).toContainText("My edited edge path");
    await panel.getByTestId("project-import-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
    expect(await size()).toBe(1);
    expect(await payload(first.identity.id)).toBe(edited);
    await panel.getByTestId("project-template-card-preview-edge-path-evidence").click();
    await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    await full();
    expect(await size()).toBe(1);
    expect((await active()).identity.id).toBe(first.identity.id);
    await panel.getByTestId("project-detail-toggle").click();

    await panel.getByTestId("project-template-new-copy-edge-path-evidence").click();
    await full();
    await expect.poll(size).toBe(2);
    const second = await active();
    expect(second.identity.id).not.toBe(first.identity.id);
    expect(await payload(first.identity.id)).toBe(edited);
    await panel.getByTestId("project-detail-toggle").click();
    // Choose the older copy explicitly; starter Open must prefer it while active.
    await panel.getByTestId(`project-open-saved-${first.identity.id}`).click();
    await expect(panel).toBeHidden(); await show();
    await panel.getByTestId("project-template-open-edge-path-evidence").click();
    await full();
    await expect(panel.getByTestId("project-detail-toggle")).toHaveAttribute("aria-pressed", "true");
    expect(await size()).toBe(2);
    expect((await active()).identity.id).toBe(first.identity.id);
    await panel.getByTestId("project-detail-toggle").click();
    await panel.getByTestId(`project-library-${second.identity.id}`).getByRole("button", { name: `Favorite ${second.metadata.title}`, exact: true }).click();
    await panel.getByTestId("project-template-open-catenoid-evidence").click();
    await full();
    await expect.poll(size).toBe(3);
    await panel.getByTestId("project-detail-toggle").click();
    await panel.getByTestId("project-template-open-edge-path-evidence").click();
    await full();
    await expect(panel.getByTestId("project-detail-toggle")).toHaveAttribute("aria-pressed", "true");
    expect(await size()).toBe(3);
    expect((await active()).identity.id).toBe(first.identity.id);
    expect(await payload(first.identity.id)).toBe(edited);
    await panel.getByTestId("project-detail-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-library-module").selectOption("Workbook");
    await panel.screenshot({ path: test.info().outputPath("starter-open-existing-copy.png") });
  } finally { await closeSurfaceApp(ctx); }
});

test("a missing starter payload reports an error without silently creating another copy", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-open-edge-path-evidence").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    await panel.getByTestId("project-gallery-layout-toggle").click();
    const original = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    await panel.getByTestId("project-detail-toggle").click();
    await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem("math3d.project.v1")!);
      localStorage.removeItem(`math3d.project.v1.payload.${project.identity.id}`);
    });
    await panel.getByTestId("project-template-open-edge-path-evidence").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved project payload is missing");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries.length)).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(original);
  } finally { await closeSurfaceApp(ctx); }
});
