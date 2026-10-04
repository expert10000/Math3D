import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("WB00 adopts a Workbook and reopens it through the named Project", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    const personalId = await page.evaluate(() => localStorage.getItem("math3d.workbooks.active.v1") ??
      JSON.parse(localStorage.getItem("math3d.workbooks.v1")!)[0].id) as string;
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-title").fill("Workbook study");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    await panel.getByTestId("project-save-active-workbook").click();
    await expect(panel.getByTestId("project-message")).toContainText("Added");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workbooks).toHaveLength(1);
    const boundId = saved.workbooks[0].id as string;
    expect(boundId).not.toBe(personalId);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.workbooks.v1")!).map((w: { id: string }) => w.id))).toContain(personalId);
    const packagePath = resolve(ctx.profileDir, "workbook-study.resources.math3d.project.json");
    await ctx.app.evaluate(({ session }, savePath) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(savePath)), packagePath);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(() => existsSync(packagePath)).toBe(true);
    const exported = JSON.parse(readFileSync(packagePath, "utf8"));
    expect(exported.project.workbooks[0].id).toBe(boundId);
    expect(exported.resources.some((item: { kind: string; id: string }) => item.kind === "workbook-payload" && item.id === boundId)).toBe(true);
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile);
    await ctx.page.getByTestId("projects-toggle").click();
    const reopened = ctx.page.getByTestId("project-explorer-panel");
    await reopened.getByTestId(`project-open-workbook-${boundId}`).click();
    await expect(reopened).toBeHidden();
    await expect.poll(() => ctx!.page.evaluate(() => localStorage.getItem("math3d.workbooks.active.v1"))).toBe(boundId);
  } finally { await closeSurfaceApp(ctx); }
});
