import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls, inspectFreezePackage, projectFreezeFixture } from "./helpers/projectFreeze";

const terminate = async (ctx: LaunchedSurfaceApp): Promise<void> => {
  const child = ctx.app.process();
  const exit = new Promise<void>(resolve => child.once("exit", () => resolve()));
  if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  else child.kill("SIGKILL");
  await exit;
};
const dispose = async (ctx: LaunchedSurfaceApp | null, profile: string | null): Promise<void> => {
  if (ctx) await ctx.app.close();
  if (profile) try { rmSync(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 }); }
  catch (error) {
    // Windows can hold the session directory until the Playwright worker exits.
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
};

test("a saved Project and library survive immediate process termination in the same profile", async () => {
  test.setTimeout(150_000);
  let ctx: LaunchedSurfaceApp | null = null;
  let profile: string | null = null;
  try {
    ctx = await launchSurfaceApp(); profile = ctx.profileDir;
    await resetSurfaceAppState(ctx.page);
    const userData = await ctx.app.evaluate(({ app }) => app.getPath("userData"));
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-template-open-catenoid-evidence").click();
    const panel = ctx.page.getByTestId("project-explorer-panel");
    if (!await panel.getByTestId("project-save").isVisible()) await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const saved = await ctx.page.evaluate(() => ({
      project: localStorage.getItem("math3d.project.v1"),
      library: localStorage.getItem("math3d.project-library.v1"),
    }));
    expect(saved.project).toBeTruthy(); expect(saved.library).toBeTruthy();
    await terminate(ctx); ctx = null;
    ctx = await launchSurfaceApp({}, profile);
    expect(await ctx.app.evaluate(({ app }) => app.getPath("userData"))).toBe(userData);
    await expect.poll(() => ctx!.page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(saved.project);
    await expect.poll(() => ctx!.page.evaluate(() => localStorage.getItem("math3d.project-library.v1"))).toBe(saved.library);
    await openLastSavedProject(ctx.page);
    await expect(ctx.page.getByTestId("project-view-mode")).toContainText("Catenoid Evidence Notebook");
    await expect(ctx.page.getByTestId("project-view-mode")).toContainText("Saved in Your saved projects");
  } finally {
    await dispose(ctx, profile);
  }
});

test("a resource-rich Project reopens with exact sidecars after a hard exit", async () => {
  test.setTimeout(300_000);
  let ctx: LaunchedSurfaceApp | null = null;
  let profile: string | null = null;
  try {
    const fixture = projectFreezeFixture();
    ctx = await launchSurfaceApp(); profile = ctx.profileDir;
    await resetSurfaceAppState(ctx.page);
    let controls = freezeControls(ctx.page);
    await controls.importOpen(fixture.raw);
    const saved = await controls.save();
    const bytes = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    await terminate(ctx); ctx = null;
    ctx = await launchSurfaceApp({}, profile);
    await expect.poll(() => ctx!.page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(bytes);
    controls = freezeControls(ctx.page);
    await controls.show();
    await controls.panel.getByTestId(`project-preview-${saved.identity.id}`).click();
    await controls.panel.getByTestId("project-restore-saved").click();
    await expect(controls.panel.getByTestId("project-message")).toContainText("Review editor compatibility");
    await expect(controls.panel.getByTestId("project-import-open")).toBeEnabled();
    await controls.panel.getByTestId("project-import-open").click();
    await expect(controls.panel.getByTestId("project-message")).toContainText("Opened supported project");
    await controls.panel.getByTestId("project-gallery-layout-toggle").click();
    await controls.panel.locator("details.project-header-more summary").click();
    await controls.panel.getByRole("button", { name: "Import / export" }).click();
    const output = test.info().outputPath("hard-exit-reopened.resources.json");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), output);
    await ctx.page.getByTestId("project-export-resources").click();
    await expect.poll(() => existsSync(output)).toBe(true);
    const reopened = inspectFreezePackage(readFileSync(output, "utf8"));
    const original = inspectFreezePackage(fixture.raw);
    expect(reopened.meshes).toEqual(original.meshes);
    expect(reopened.volumes).toEqual(original.volumes);
  } finally { await dispose(ctx, profile); }
});
