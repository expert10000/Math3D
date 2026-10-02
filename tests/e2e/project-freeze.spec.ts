import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { projectFreezeFixture, inspectFreezePackage, editFreezeProject, freezeControls, checkFreezeHistory, checkFreezeResources } from "./helpers/projectFreeze";
import { transferNamedProjectThroughMobile } from "./helpers/namedProjectMobileTransfer";

test("PRJ18 freezes all eight modules, resources and histories across independent hosts and cold restart", async () => {
  test.setTimeout(600_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    const fixture = projectFreezeFixture(); ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const saved = await editFreezeProject(ctx.page, fixture), filename = test.info().outputPath("combined.resources.json");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), filename);
    await ctx.page.getByTestId("project-export-resources").click(); await expect.poll(() => existsSync(filename)).toBe(true);
    const raw = readFileSync(filename, "utf8"), snapshot = inspectFreezePackage(raw);
    checkFreezeResources(raw);
    expect(snapshot.project.workspace.entries.map((entry: any) => entry.expected)).toEqual(saved.workspace.entries.map((entry: any) => entry.expected));
    expect([...new Set(saved.workspace.entries.map((entry: any) => entry.module))].sort()).toEqual(["complex","curve","geometry","graph2d","mesh","surface","topology","volume"]);
    const originalBytes = inspectFreezePackage(fixture.raw).resources;
    for (const sidecar of originalBytes.filter((item) => item.kind !== "mesh-buffers")) expect(snapshot.resources).toContainEqual(sidecar);
    const mobile = JSON.stringify(fixture.mobile); expect(JSON.parse(transferNamedProjectThroughMobile(mobile, false))).toEqual(fixture.mobile);
    const mobileEdited = JSON.parse(transferNamedProjectThroughMobile(mobile, true)); expect(mobileEdited.workspace.entries.slice(1)).toEqual(fixture.mobile.workspace.entries.slice(1));
    // This complete desktop container is outside mobile's qualified editor subset.
    expect(() => transferNamedProjectThroughMobile(JSON.stringify(snapshot.project), false)).toThrow(/checkpoint JSON/);
    await closeSurfaceApp(ctx); ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let controls = freezeControls(ctx.page); await controls.importOpen(raw);
    expect((await controls.save()).workspace.entries.map((entry: any) => entry.expected)).toEqual(saved.workspace.entries.map((entry: any) => entry.expected));
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); controls = freezeControls(ctx.page);
    await controls.reopen(saved.identity.id); const reopened = await controls.save();
    expect(reopened.workspace.entries.map((entry: any) => entry.expected)).toEqual(saved.workspace.entries.map((entry: any) => entry.expected));
    await checkFreezeHistory(ctx.page, fixture);
    await ctx.page.setViewportSize({ width: 390, height: 844 }); await controls.show();
    const bounds = await controls.panel.boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
    await controls.panel.screenshot({ path: test.info().outputPath("combined-project-phone.png") });
  } finally { await closeSurfaceApp(ctx); }
});
