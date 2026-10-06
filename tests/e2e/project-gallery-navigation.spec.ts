import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Project Gallery filters starters and saved projects and keeps browsing separate from project actions", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.setViewportSize({ width: 1440, height: 1000 });
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
    const active = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
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
    await page.setViewportSize({ width: 390, height: 844 });
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
  } finally { await closeSurfaceApp(ctx); }
});

test("starter Open and Preview reuse edited copies; only New copy adds another project", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
    const size = () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries.length);
    const active = () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const payload = (id: string) => page.evaluate(id => localStorage.getItem(`math3d.project.v1.payload.${id}`), id);
    await show();
    await panel.getByTestId("project-template-open-edge-path-evidence").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    const first = await active();
    await panel.getByTestId("project-title").fill("My edited edge path");
    await panel.getByTestId("project-description").fill("Keep my observations and recorded evidence.");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “My edited edge path”");
    const edited = await payload(first.identity.id);
    await expect(panel.getByTestId("project-template-copy-edge-path-evidence")).toContainText("My edited edge path");
    for (let repeat = 0; repeat < 2; repeat++) {
      await panel.getByTestId("project-template-open-edge-path-evidence").click();
      await expect(panel).toBeHidden();
      expect(await size()).toBe(1);
      expect((await active()).identity.id).toBe(first.identity.id);
      expect(await payload(first.identity.id)).toBe(edited);
      await show();
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
    expect(await size()).toBe(1);
    expect((await active()).identity.id).toBe(first.identity.id);

    await panel.getByTestId("project-template-new-copy-edge-path-evidence").click();
    await expect.poll(size).toBe(2);
    const second = await active();
    expect(second.identity.id).not.toBe(first.identity.id);
    expect(await payload(first.identity.id)).toBe(edited);
    // Choose the older copy explicitly; starter Open must prefer it while active.
    await panel.getByTestId(`project-open-saved-${first.identity.id}`).click();
    await expect(panel).toBeHidden(); await show();
    await panel.getByTestId("project-template-open-edge-path-evidence").click();
    await expect(panel).toBeHidden();
    expect(await size()).toBe(2);
    expect((await active()).identity.id).toBe(first.identity.id);
    await show();
    await panel.getByTestId(`project-library-${second.identity.id}`).getByRole("button", { name: `Favorite ${second.metadata.title}`, exact: true }).click();
    await panel.getByTestId("project-template-open-catenoid-evidence").click();
    await expect.poll(size).toBe(3);
    await panel.getByTestId("project-template-open-edge-path-evidence").click();
    await expect(panel).toBeHidden();
    expect(await size()).toBe(3);
    expect((await active()).identity.id).toBe(first.identity.id);
    expect(await payload(first.identity.id)).toBe(edited);
    await show();
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
    const original = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
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
