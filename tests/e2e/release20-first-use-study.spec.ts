import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("M3D20-13b first-use scientific starter retains its Project and evidence after restart", async () => {
  test.setTimeout(120_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    const expectedVersion = process.env.MATH3D_RELEASE20_EXPECTED_VERSION;
    if (expectedVersion) expect(await ctx.app.evaluate(({ app }) => app.getVersion())).toBe(expectedVersion);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-template-open-catenary-study").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1"))).not.toBeNull();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(before.metadata.title).toBe("Minimal Surface Study");
    expect(before.workspace.entries.map((entry: { module: string }) => entry.module)).toEqual(["graph2d", "curve", "surface"]);
    expect(before.workspace.results).toHaveLength(1);
    expect(before.workspace.relations).toHaveLength(3);
    expect(before.notes).toHaveLength(2);
    const profile = ctx.profileDir;
    await ctx.app.close(); ctx = await launchSurfaceApp({}, profile);
    await ctx.page.getByTestId("projects-toggle").click();
    const reopened = ctx.page.getByTestId("project-explorer-panel");
    await reopened.getByTestId(`project-open-saved-${before.identity.id}`).click();
    await expect.poll(() => ctx!.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(before.identity.id);
    const after = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(after.identity).toEqual(before.identity);
    expect(after.workspace.entries.map((entry: { expected: unknown }) => entry.expected)).toEqual(before.workspace.entries.map((entry: { expected: unknown }) => entry.expected));
    expect(after.workspace.results).toEqual(before.workspace.results);
    expect(after.workspace.relations).toEqual(before.workspace.relations);
    expect(after.notes).toEqual(before.notes);
  } finally { await closeSurfaceApp(ctx); }
});
