import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const starters = [
  { id: "mesh-subdivision-study", title: "Retained Mesh Generation Study", metric: "faceCount",
    values: [8, 32, 32], statuses: ["available", "available", "available"], resultCount: 3 },
  { id: "mesh-curvature-study", title: "Saved Mesh Curvature Study", metric: "mean.avg",
    values: null, statuses: ["available", "available", "available"], resultCount: 3 },
  { id: "mesh-trend-gap-study", title: "Mesh Trend With Missing Result", metric: "metrics.triangleArea.avg",
    values: [0.5, null, 2.53125], statuses: ["available", "not recorded", "available"], resultCount: 2 },
] as const;

type TrendRow = { revision: string; value: number | null; status: string; result: string; sourceHash: string };

async function openTrend(page: Page, metric: string): Promise<TrendRow[]> {
  await page.getByTestId("project-open-mesh-result-trend").click();
  const trend = page.getByTestId("project-mesh-result-trend");
  await trend.getByTestId("project-mesh-trend-metric").selectOption(metric);
  await expect(trend.locator("tbody tr")).toHaveCount(3);
  const rows = await trend.locator("tbody tr").evaluateAll(elements => elements.map(element => {
    const cells = Array.from(element.querySelectorAll("td"));
    const valueText = cells[0]?.textContent?.trim() ?? "";
    return { revision: element.querySelector("th")?.textContent?.trim() ?? "",
      value: valueText === "—" ? null : Number(valueText), status: (cells[2]?.textContent?.trim() ?? "").split(" · ")[0],
      result: cells[3]?.firstChild?.textContent?.trim() ?? "", sourceHash: cells[4]?.textContent?.trim() ?? "" };
  }));
  expect(rows.every(row => row.revision.startsWith("r") && row.sourceHash.startsWith("sha256:"))).toBe(true);
  return rows;
}

async function closeTrend(page: Page) {
  await page.getByTestId("project-mesh-result-trend").getByRole("button", { name: "Close", exact: true }).click();
}

async function showProjects(page: Page) {
  const panel = page.getByTestId("project-explorer-panel");
  if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click();
  return panel;
}

test("three Mesh starter Projects retain exact trends and source resources after independent transfer", async () => {
  test.setTimeout(300_000);
  let ctx: LaunchedSurfaceApp | null = null;
  const exported: { id: string; title: string; path: string; projectId: string; rows: TrendRow[] }[] = [];
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page;
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const starter of starters) {
      await test.step(`Save and export ${starter.title}`, async () => {
        const panel = await showProjects(page);
        if (!await panel.getByRole("button", { name: "Starter projects", exact: true }).isVisible())
          await panel.getByTestId("project-detail-toggle").click();
        await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
        await panel.getByTestId("project-library-search").fill(starter.title);
        await panel.getByTestId(`project-template-open-${starter.id}`).click();
        const rows = await openTrend(page, starter.metric);
        expect(rows.map(row => row.status)).toEqual(starter.statuses);
        if (starter.values) expect(rows.map(row => row.value)).toEqual(starter.values);
        else {
          const values = rows.map(row => row.value!);
          expect(values.every(value => Number.isFinite(value) && Math.abs(value) > 0.001)).toBe(true);
          expect(values[1] / values[0]).toBeCloseTo(1 / 1.3, 2);
          expect(values[2] / values[0]).toBeCloseTo(1 / (1.3 * 1.3), 2);
        }
        if (starter.id === "mesh-trend-gap-study") {
          expect(rows[1]).toMatchObject({ value: null, status: "not recorded" });
          expect(rows[1].result).toContain("No saved result");
          await expect(page.getByTestId("project-mesh-result-trend"))
            .toContainText("No saved result for this retained generation.");
          await expect(page.getByTestId("project-mesh-result-trend").getByTestId("project-mesh-trend-plot")
            .locator("g[role=button]")).toHaveCount(2);
        }
        await page.screenshot({ path: test.info().outputPath(`${starter.id}-trend.png`) });
        await closeTrend(page);
        await showProjects(page);
        await panel.getByTestId("project-gallery-layout-toggle").click();
        await panel.getByTestId("project-save").click();
        await expect(panel.getByTestId("project-message")).toContainText("Saved");
        const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id as string);
        const path = test.info().outputPath(`${starter.id}.json`);
        await panel.getByTestId("project-explorer-header").locator("summary").click();
        await panel.getByTestId("project-explorer-header").getByRole("button", { name: "Import / export" }).click();
        await ctx!.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
          (_event, item) => item.setSavePath(target)), path);
        await panel.getByTestId("project-export-resources").click();
        await expect.poll(async () => { try { return (await readFile(path)).length; } catch { return 0; } }).toBeGreaterThan(100);
        const bundle = JSON.parse(await readFile(path, "utf8"));
        expect(bundle.project.identity.id).toBe(projectId);
        const savedTrendResults = bundle.project.workspace.results.filter((result: { resultId: string }) =>
          result.resultId.startsWith("saved-mesh-analysis:"));
        expect(savedTrendResults).toHaveLength(starter.resultCount);
        for (const [index, result] of savedTrendResults.entries()) {
          const savedValue = starter.metric.split(".").reduce((value: any, key) => value?.[key], result.summary);
          expect(savedValue).toBeCloseTo(rows.filter(row => row.status === "available")[index].value!, 8);
        }
        expect(bundle.resources.length).toBeGreaterThan(0);
        expect(savedTrendResults.every((result: { provenance: { source: { structuralHash: string } } }) =>
          result.provenance.source.structuralHash.startsWith("sha256:"))).toBe(true);
        exported.push({ id: starter.id, title: starter.title, path, projectId, rows });
      });
    }

    await closeSurfaceApp(ctx); ctx = null;
    for (const item of exported) {
      await test.step(`Independently import ${item.title}`, async () => {
        ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
        page = ctx.page;
        await page.setViewportSize({ width: 1440, height: 900 });
        const starter = starters.find(candidate => candidate.id === item.id)!;
        const panel = await showProjects(page);
        await panel.getByTestId("project-import-file").setInputFiles(item.path);
        await expect(panel.getByTestId("project-import-open")).toBeEnabled();
        await panel.getByTestId("project-import-save").click();
        await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
        await panel.getByTestId(`project-open-saved-${item.projectId}`).click();
        const rows = await openTrend(page, starter.metric);
        expect(rows).toEqual(item.rows);
        await page.screenshot({ path: test.info().outputPath(`${item.id}-reopened.png`) });
        await closeTrend(page);
        const profile = ctx.profileDir;
        await ctx.app.close(); ctx = await launchSurfaceApp({}, profile);
        page = ctx.page;
        const reopenedPanel = await showProjects(page);
        await reopenedPanel.getByTestId(`project-open-saved-${item.projectId}`).click();
        expect(await openTrend(page, starter.metric)).toEqual(item.rows);
        await closeTrend(page);
        await closeSurfaceApp(ctx); ctx = null;
      });
    }
    await writeFile(test.info().outputPath("mesh-starter-observation.json"), JSON.stringify({
      scope: "Windows Electron; fresh-profile transfer and cold app restart", starters: exported.map(({ id, title, projectId, rows }) =>
        ({ id, title, projectId, rows })),
    }, null, 2));
  } finally { await closeSurfaceApp(ctx); }
});
