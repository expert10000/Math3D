import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
const collection = JSON.parse(readFileSync(resolve("renderer/src/projects/examples/samsung-projects.json"), "utf8"));
const projects = collection.projects.map((item: any) => item.project ?? item);

test("PRJ36–38 all Samsung projects expose qualified analysis and survive desktop save, transfer and restart", async () => {
  test.setTimeout(600_000); let ctx: LaunchedSurfaceApp | null = null;
  const directory = resolve("output/projects-integration/prj38-desktop"); mkdirSync(directory, { recursive: true });
  const exports: { id: string; raw: string; preview: boolean }[] = [], audit: unknown[] = [];
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
    const close = async () => { if (await panel.isVisible()) await page.getByRole("button", { name: "Close project explorer" }).click(); };
    await page.route(/^https?:\/\//, route => route.abort());
    await show(); await panel.getByTestId("project-import-samsung-examples").click();
    await expect(panel.getByTestId("project-example-import-message")).toContainText("Imported 25 Samsung projects", { timeout: 60_000 });
    const visitedRoutes = new Set<string>();
    for (const project of projects) {
      await test.step(project.metadata.title, async () => {
        await show(); const before = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
        await panel.getByTestId(`project-open-saved-${project.identity.id}`).click();
        const preview = project.metadata.title === "PRJ21 Mixed Preview";
        let routes: { id: string; route: string | null; reason: string | null }[] = [];
        if (preview) {
          await expect(panel.getByTestId("project-import-open")).toBeDisabled();
          expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(before);
          await expect(panel.getByTestId(`project-open-analysis-${project.workspace.entries[0].expected.id}`)).toBeDisabled();
        } else {
          await expect(panel).toBeHidden(); await show();
          for (const entry of project.workspace.entries) {
            const row = panel.getByTestId(`project-analysis-${entry.expected.id}`);
            await expect(row).toHaveCount(1);
            const route = await row.getAttribute("data-analysis-route"), reason = await row.getAttribute("data-analysis-reason");
            if (reason) await expect(row.getByRole("button", { name: "Open Analysis", exact: true })).toBeDisabled();
            else await expect(row.getByRole("button", { name: "Open Analysis", exact: true })).toBeEnabled();
            routes.push({ id: entry.expected.id, route, reason });
          }
          const chosen = routes.find(item => !item.reason && item.route !== "unavailable")!; expect(chosen).toBeTruthy();
          await panel.getByTestId(`project-open-analysis-${chosen.id}`).click(); await expect(panel).toBeHidden();
          if (chosen.route === "graph-tools") await expect(page.getByRole("region", { name: "Graph tools", exact: true })).toBeVisible();
          else if (chosen.route === "surface" || chosen.route === "surface-mesh") {
            const workflow = page.getByTestId("project-saved-mesh-workflow"); await expect(workflow).toBeVisible();
            await workflow.getByTestId("project-analysis-studies").locator("summary").click();
            await workflow.getByTestId("project-analysis-run-study").click();
            await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Discrete curvature");
          }
          visitedRoutes.add(chosen.route!);
          for (const route of ["mesh", "curve", "volume", "complex"]) {
            if (visitedRoutes.has(route)) continue;
            const candidate = routes.find(item => !item.reason && item.route === route); if (!candidate) continue;
            await show(); await panel.getByTestId(`project-open-analysis-${candidate.id}`).click(); await expect(panel).toBeHidden();
            if (route === "mesh") await expect(page.getByTestId("project-saved-mesh-workflow")).toBeVisible();
            if (route === "curve") await expect(page.getByTestId("curve-analysis-preset")).toBeVisible();
            if (route === "volume") await expect(page.getByTestId("volume-analysis-card")).toBeVisible();
            if (route === "complex") await expect(page.getByTestId("project-complex-function")).toBeVisible();
            visitedRoutes.add(route);
          }
          await show(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
          const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
          expect(saved.identity.id).toBe(project.identity.id);
          for (const entry of project.workspace.entries) expect(saved.workspace.entries.find((item: any) => item.expected.id === entry.expected.id)?.expected.structuralHash, `${project.metadata.title} ${entry.module}`).toBe(entry.expected.structuralHash);
        }
        const path = resolve(directory, `${exports.length + 1}.json`);
        await ctx!.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(target)), path);
        await panel.getByTestId(preview ? "project-export" : "project-export-resources").click();
        await expect(panel.getByTestId("project-message")).toContainText(preview ? "Exported verified project JSON" : "Exported project with verified");
        await expect.poll(() => existsSync(path)).toBe(true);
        exports.push({ id: project.identity.id, raw: readFileSync(path, "utf8"), preview });
        audit.push({ id: project.identity.id, title: project.metadata.title, previewOnly: preview, routes, opened: !preview, saved: !preview, exported: true });
      });
    }
    await closeSurfaceApp(ctx); ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    page = ctx.page; panel = page.getByTestId("project-explorer-panel");
    for (const exported of exports) {
      await show(); await panel.getByTestId("project-import-file").setInputFiles({ name: "returned.json", mimeType: "application/json", buffer: Buffer.from(exported.raw) });
      if (exported.preview) await expect(panel.getByTestId("project-import-open")).toBeDisabled();
      else await expect(panel.getByTestId("project-import-open")).toBeEnabled();
      await panel.getByTestId("project-import-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
      expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`math3d.project.v1.payload.${id}`)!).identity.id, exported.id)).toBe(exported.id);
    }
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile);
    page = ctx.page; panel = page.getByTestId("project-explorer-panel"); await show();
    await expect(panel.locator('[data-testid^="project-library-math3d:project:"]')).toHaveCount(25);
    for (const exported of exports) {
      const stored = await page.evaluate(id => JSON.parse(localStorage.getItem(`math3d.project.v1.payload.${id}`)!), exported.id), transfer = JSON.parse(exported.raw);
      expect(stored).toEqual(transfer.project ?? transfer);
    }
    const enneper = projects.find((project: any) => project.metadata.title === "Enneper Study");
    await panel.getByTestId(`project-open-saved-${enneper.identity.id}`).click(); await expect(panel).toBeHidden();
    const workflow = page.getByTestId("project-saved-mesh-workflow"); await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Discrete curvature");
    await workflow.getByTestId("project-analysis-studies").locator("summary").click();
    await page.screenshot({ path: resolve(directory, "returned-enneper-studies.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: resolve(directory, "returned-enneper-compact.png") });
    writeFileSync(resolve(directory, "acceptance.json"), JSON.stringify({ scope: "Electron desktop, offline bundled collection; fresh-profile transfer and cold restart", projects: audit, analysisRoutesOpened: [...visitedRoutes], transferred: exports.length, retainedAfterRestart: 25 }, null, 2));
  } finally { await closeSurfaceApp(ctx); }
});
