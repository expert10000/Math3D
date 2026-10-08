import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("profile Projects Gallery and saved-card opening with 25 projects", async () => {
  test.setTimeout(180_000);
  let context: LaunchedSurfaceApp | null = null;
  try {
    context = await launchSurfaceApp();
    const page = context.page;
    await resetSurfaceAppState(page);
    const panel = page.getByTestId("project-explorer-panel");
    const measureClick = (selector: string, visible: boolean) => page.evaluate(({ selector, visible }) => new Promise<number>((resolve, reject) => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      if (!button) { reject(new Error(`Missing button ${selector}`)); return; }
      const start = performance.now();
      const timeout = window.setTimeout(() => reject(new Error(`Gallery did not become ${visible ? "visible" : "hidden"}`)), 60_000);
      const check = () => {
        const panel = document.querySelector<HTMLElement>("[data-testid='project-explorer-panel']");
        if (Boolean(panel && panel.getBoundingClientRect().width > 0) === visible) {
          window.clearTimeout(timeout); resolve(Math.round(performance.now() - start));
        } else requestAnimationFrame(check);
      };
      button.click(); requestAnimationFrame(check);
    }), { selector, visible });
    const emptyMs = await measureClick("[data-testid='projects-toggle']", true);
    await expect(panel).toBeVisible();
    await panel.getByTestId("project-import-samsung-examples").click();
    await expect(panel.getByTestId("project-gallery-grid").locator("article")).toHaveCount(25, { timeout: 60_000 });
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await page.reload();
    const coldFirstPaintMs = await measureClick("[data-testid='projects-toggle']", true);
    await expect(panel).toBeVisible();
    const readyStart = await page.evaluate(() => performance.now());
      await expect(panel.getByTestId("project-gallery-grid")).not.toContainText("Loading project details…", { timeout: 60_000 });
      await expect(panel.getByTestId("project-message")).not.toContainText("Loading current workspace…", { timeout: 60_000 });
    const coldReadyMs = Math.round(await page.evaluate(() => performance.now()) - readyStart);
    await page.getByRole("button", { name: "Close project explorer" }).click();
    const warmFirstPaintMs = await measureClick("[data-testid='projects-toggle']", true);
    await expect(panel).toBeVisible();
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName("project-open:backup-ready", "mark").length > 0), { timeout: 15_000 }).toBe(true);
    const helicoid = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries.find((item: { title: string }) => item.title === "Helicoid")?.id as string);
    expect(helicoid).toBeTruthy();
    const savedCardOpenMs = await page.evaluate(id => new Promise<number>((resolve, reject) => {
      const button = document.querySelector<HTMLButtonElement>(`[data-testid='project-open-saved-${id}']`);
      if (!button) { reject(new Error("Saved Project card is missing")); return; }
      const start = performance.now();
      const timeout = window.setTimeout(() => reject(new Error("Saved Project did not open")), 60_000);
      const check = () => {
        if (document.querySelector('[data-testid="project-message"]')?.textContent?.startsWith("Opened supported project workspace")) {
          window.clearTimeout(timeout); resolve(Math.round(performance.now() - start));
        } else requestAnimationFrame(check);
      };
      button.click(); requestAnimationFrame(check);
    }), helicoid);
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project workspace");
    const stagedArchive = await page.evaluate(async () => {
      const backup = JSON.parse(localStorage.getItem("math3d.project.v1.before-open")!);
      const slot = localStorage.getItem("math3d.project-resource-backup-slot.v1")!;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("math3d.project-resources.v1", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const record = await new Promise<any>((resolve, reject) => {
          const request = db.transaction("projects").objectStore("projects").get(slot);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        return { slot, matchesBackup: record?.projectId === backup.identity.id, resources: record?.resources.length ?? 0,
          bytes: record?.resources.reduce((total: number, item: any) => total + item.bytes.byteLength, 0) ?? 0 };
      } finally { db.close(); }
    });
    expect(stagedArchive.slot).toMatch(/^before-open-[ab]$/);
    expect(stagedArchive.matchesBackup).toBe(true);
    expect(stagedArchive.resources).toBe(2);
    expect(stagedArchive.bytes).toBeGreaterThan(1_000_000);
    const openPhases = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType("measure").filter(entry => entry.name.startsWith("project-open:")).map(entry => [entry.name.replace("project-open:", ""), Math.round(entry.duration)])));
    const resourcePhases = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType("measure").filter(entry => entry.name.startsWith("project-resource-commit:")).map(entry => [entry.name.replace("project-resource-commit:", ""), Math.round(entry.duration)])));
    const resourceCounts = await page.evaluate(() => (performance.getEntriesByName("project-resource-commit:counts", "mark").at(-1) as PerformanceMark | undefined)?.detail);
    const usedStagedBackup = await page.evaluate(() => (performance.getEntriesByName("project-open:used-staged-backup", "mark").at(-1) as PerformanceMark | undefined)?.detail);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-detail-toggle").click();
    await expect(panel.getByTestId(`project-open-saved-${helicoid}`)).toBeVisible();
    const secondOpenMs = await page.evaluate(id => new Promise<number>((resolve, reject) => {
      const button = document.querySelector<HTMLButtonElement>(`[data-testid='project-open-saved-${id}']`);
      if (!button) { reject(new Error("Saved Project card is missing")); return; }
      const previous = performance.getEntriesByName("project-open:commit-and-restore", "measure").at(-1)?.startTime ?? 0;
      const start = performance.now();
      const timeout = window.setTimeout(() => reject(new Error("Saved Project did not reopen")), 60_000);
      const check = () => {
        if ((performance.getEntriesByName("project-open:commit-and-restore", "measure").at(-1)?.startTime ?? 0) > previous) {
          window.clearTimeout(timeout); resolve(Math.round(performance.now() - start));
        } else requestAnimationFrame(check);
      };
      button.click(); requestAnimationFrame(check);
    }), helicoid);
    const secondResourceCounts = await page.evaluate(() => (performance.getEntriesByName("project-resource-commit:counts", "mark").at(-1) as PerformanceMark | undefined)?.detail);
    const metrics = { platform: "desktop Electron", projectCount: 25, emptyFirstPaintMs: emptyMs, coldFirstPaintMs, coldReadyMs, warmFirstPaintMs, savedCardOpenMs, usedStagedBackup, stagedArchive, secondOpenMs, secondResourceCounts, openPhases, resourcePhases, resourceCounts };
    console.log(`PROJECT_GALLERY_LATENCY ${JSON.stringify(metrics)}`);
    writeFileSync(test.info().outputPath("project-gallery-latency.json"), `${JSON.stringify(metrics, null, 2)}\n`);
  } finally { await closeSurfaceApp(context); }
});
