import { expect, test, type Locator } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const scenarios = [
  { name: "light", preference: "light", forcedColors: "none" },
  { name: "dark", preference: "dark", forcedColors: "none" },
  { name: "high-contrast", preference: "light", forcedColors: "active" },
] as const;

const textContrast = (locator: Locator) => locator.evaluate(element => {
  const channels = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const luminance = (value: string) => channels(value).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  let background = element as Element | null;
  while (background && getComputedStyle(background).backgroundColor.match(/[\d.]+/g)?.[3] === "0") background = background.parentElement;
  const foreground = luminance(getComputedStyle(element).color);
  const behind = luminance(getComputedStyle(background ?? document.body).backgroundColor);
  return (Math.max(foreground, behind) + 0.05) / (Math.min(foreground, behind) + 0.05);
});

for (const scenario of scenarios) {
  test(`Gallery research route remains usable at 200% zoom in ${scenario.name}`, async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      const page = ctx.page;
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.emulateMedia({ forcedColors: scenario.forcedColors, colorScheme: scenario.preference });
      await page.evaluate(preference => localStorage.setItem("math3d.ui.themePreference.v1", preference), scenario.preference);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", scenario.preference);
      await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
      expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(scenario.forcedColors === "active");

      const captures = process.env.MATH3D_UI_CAPTURE_DIR;
      if (captures) mkdirSync(captures, { recursive: true });
      const capture = async (stage: string) => {
        if (captures) await page.screenshot({ path: join(captures, `${scenario.name}-${stage}-source-build.png`) });
      };
      const panel = page.getByTestId("project-explorer-panel");
      await page.getByTestId("projects-toggle").click();
      await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
      await panel.getByTestId("project-gallery-guided").click();
      await expect(panel.getByTestId("curated-study-open-catenary-study")).toBeVisible();
      await panel.getByTestId("curated-study-open-catenary-study").scrollIntoViewIfNeeded();
      if (scenario.name === "dark") {
        const requirements = panel.locator(".curated-study-content details summary", { hasText: "Requirements and limits" }).first();
        expect(await textContrast(requirements), "Gallery requirements label should remain readable in dark mode").toBeGreaterThanOrEqual(4.5);
      }
      await capture("gallery");
      await panel.getByTestId("curated-study-open-catenary-study").click();
      const study = panel.getByTestId("project-study-view");
      await expect(study).toBeVisible({ timeout: 60_000 });
      await study.getByRole("button", { name: "Source panes", exact: true }).click();
      await expect(study.locator('[data-testid^="project-study-source-status-"]').first()).toContainText("Saved source pin: current");
      await expect.poll(() => study.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
      if (scenario.name === "dark") {
        const citationHeading = study.getByText(/Referenced by Workbooks \(/).first();
        expect(await textContrast(citationHeading), "Study citation heading should remain readable in dark mode").toBeGreaterThanOrEqual(4.5);
      }
      await capture("study");
      await study.getByRole("button", { name: "Citations", exact: true }).click();
      await expect(study.getByTestId("project-study-workbook-references")).toBeFocused();
      await study.getByRole("button", { name: "Source panes", exact: true }).click();
      await expect(study.getByTestId("project-study-panes")).toBeFocused();

      await panel.getByTestId("project-save").click();
      await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
      const palette = page.getByTestId("global-command-palette");
      const search = async (query: string) => {
        await page.keyboard.press("Control+k");
        await expect(palette).toBeVisible();
        await palette.getByRole("textbox").fill(query);
      };
      await search("open workbook catenary");
      await palette.locator('[data-testid^="command-palette-research:workbook:"]').first().click();
      await expect(page.getByText("Workbook: Catenary, catenoid and derivative Research", { exact: false }).first()).toBeVisible();
      const workbook = page.locator(".geometry-full-workbook");
      await expect(workbook).toBeVisible();
      const workbookGrid = workbook.locator(":scope > div:nth-child(2)");
      await expect.poll(() => workbookGrid.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
      const outlineBox = await workbookGrid.locator(":scope > div:nth-child(1)").boundingBox();
      const editorBox = await workbookGrid.locator(":scope > div:nth-child(2)").boundingBox();
      const previewBox = await workbookGrid.locator(":scope > div:nth-child(3)").boundingBox();
      expect(outlineBox && editorBox && previewBox && editorBox.y > outlineBox.y + 50 && previewBox.y > editorBox.y + 50,
        "Workbook outline, editor and preview should stack at 200% zoom").toBeTruthy();
      if (scenario.name === "dark") {
        for (const label of ["Outline", "Live preview"]) {
          const contrast = await textContrast(workbook.getByText(label, { exact: true }).first());
          expect(contrast, `${label} should remain readable in dark mode`).toBeGreaterThanOrEqual(4.5);
        }
      }
      await capture("workbook");
      await workbookGrid.locator(":scope > div:nth-child(2)").scrollIntoViewIfNeeded();
      await capture("workbook-editor");
      await workbookGrid.locator(":scope > div:nth-child(3)").scrollIntoViewIfNeeded();
      await capture("workbook-preview");
      await search("open source");
      await palette.locator('[data-testid^="command-palette-research:document:"]:not([aria-disabled="true"])').first().click();
      await expect(panel.getByTestId("project-viewer-document")).toBeVisible();
      await expect(page.getByTestId("graphs-workspace")).toBeFocused();
      await capture("source");

      if (captures && scenario.name === "high-contrast") {
        writeFileSync(join(captures, "source-build-identity.json"), readFileSync("dist/build-identity.json"));
      }
    } finally { await closeSurfaceApp(ctx); }
  });
}
