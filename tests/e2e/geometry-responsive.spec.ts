import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";
import { clickFirstVisibleButton } from "./helpers/uiActions";

const VIEWPORTS = [
  { width: 1920, height: 1080, layout: "split" },
  { width: 1280, height: 800, layout: "split" },
  { width: 900, height: 900, layout: "stacked" },
  { width: 640, height: 900, layout: "stacked" },
  { width: 480, height: 900, layout: "stacked" },
] as const;

const openGeometry = async (page: Page): Promise<void> => {
  await clickFirstVisibleButton(page, "Geometry");
  await expect(page.getByRole("heading", { name: "Geometry Viewer", exact: true })).toBeVisible();
};

const clickVisibleButtonIn = async (scope: Locator, name: string): Promise<void> => {
  const buttons = scope.getByRole("button", { name, exact: true });
  const count = await buttons.count();
  for (let index = 0; index < count; index++) {
    const button = buttons.nth(index);
    if (!(await button.isVisible())) continue;
    await button.click();
    return;
  }
  throw new Error(`Visible button not found in scope: ${name}`);
};

const expectNoHorizontalOverflow = async (locator: Locator, label: string): Promise<void> => {
  await expect(locator, `${label} should be visible`).toBeVisible();
  const measurement = await locator.evaluate((element) => {
    const node = element as HTMLElement;
    const rect = node.getBoundingClientRect();
    return {
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
    };
  });
  expect(measurement.scrollWidth, `${label} content should fit its panel`).toBeLessThanOrEqual(measurement.clientWidth + 1);
  expect(measurement.left, `${label} should remain inside the viewport`).toBeGreaterThanOrEqual(-1);
  expect(measurement.right, `${label} should remain inside the viewport`).toBeLessThanOrEqual(measurement.viewportWidth + 1);
};

const expectVerticalContentReachable = async (locator: Locator, label: string): Promise<void> => {
  const measurement = await locator.evaluate((element) => {
    const node = element as HTMLElement;
    const originalScrollTop = node.scrollTop;
    node.scrollTop = node.scrollHeight;
    const result = {
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
      overflowY: window.getComputedStyle(node).overflowY,
    };
    node.scrollTop = originalScrollTop;
    return result;
  });
  expect(measurement.overflowY, `${label} must not hide vertical overflow`).not.toBe("hidden");
  if (measurement.scrollHeight > measurement.clientHeight + 1) {
    expect(measurement.scrollTop, `${label} should scroll to reveal its bottom`).toBeGreaterThan(0);
  }
};

test.describe("Geometry responsive workspace", () => {
  let ctx: LaunchedSurfaceApp | null = null;

  test.beforeEach(async () => {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
  });

  test.afterEach(async () => {
    await closeSurfaceApp(ctx);
    ctx = null;
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.width}px uses ${viewport.layout} layout without clipping`, async () => {
      const page = ctx!.page;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openGeometry(page);

      const workspace = page.getByTestId("geometry-workspace");
      const leftPanel = page.getByTestId("geometry-left-panel");
      const viewerStack = page.getByTestId("geometry-viewer-stack");
      await expect(workspace).toHaveAttribute("data-layout", viewport.layout);
      await expectNoHorizontalOverflow(workspace, "Geometry workspace");
      await expectNoHorizontalOverflow(leftPanel, "Geometry left panel");
      await expectNoHorizontalOverflow(page.getByTestId("geometry-gallery-toolbar"), "Geometry Create Gallery toolbar");

      const arrangement = await Promise.all([leftPanel.boundingBox(), viewerStack.boundingBox()]);
      expect(arrangement[0]).not.toBeNull();
      expect(arrangement[1]).not.toBeNull();
      if (viewport.layout === "stacked") {
        expect(arrangement[1]!.y).toBeLessThan(arrangement[0]!.y);
      } else {
        expect(arrangement[0]!.x + arrangement[0]!.width).toBeLessThanOrEqual(arrangement[1]!.x + 8);
      }

      await clickFirstVisibleButton(page, "Scratch editor");
      if (!(await page.getByTestId("construction-script-workspace").isVisible())) {
        await clickFirstVisibleButton(page, "Script");
      }
      await expect(page.getByTestId("construction-script-workspace")).toBeVisible();
      await expectNoHorizontalOverflow(page.getByTestId("geometry-left-panel"), "Scratch Script panel");
      await expectNoHorizontalOverflow(page.getByTestId("construction-script-workspace"), "Scratch Script workspace");
      await expectVerticalContentReachable(page.getByTestId("geometry-left-panel"), "Scratch Script panel");
      const scriptWorkspace = page.getByTestId("construction-script-workspace");
      const scriptEditor = page.getByTestId("construction-script-editor");
      const [scriptWorkspaceBox, scriptEditorBox] = await Promise.all([
        scriptWorkspace.boundingBox(),
        scriptEditor.boundingBox(),
      ]);
      expect(scriptWorkspaceBox).not.toBeNull();
      expect(scriptEditorBox).not.toBeNull();
      expect(scriptEditorBox!.height).toBeGreaterThan(scriptWorkspaceBox!.height * 0.8);
      await expect(page.getByTestId("construction-script-templates-toggle")).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByTestId("construction-script-templates")).toHaveCount(0);
      for (const section of ["construction-script-diagnostics", "construction-script-sync"]) {
        await expect(page.getByTestId(section)).not.toHaveAttribute("open", "");
      }
      await page.getByTestId("construction-script-diagnostics").locator("summary").click();
      await expect(page.getByTestId("construction-script-diagnostic-badges")).toContainText("16 steps");
      await expect(page.getByTestId("construction-script-diagnostic-badges")).toContainText("15 objects");
      await expect(page.getByTestId("construction-script-diagnostic-badges")).toContainText("1 claim");

      for (const tab of ["Claims", "Scene"] as const) {
        await clickFirstVisibleButton(page, tab);
        await expectNoHorizontalOverflow(page.getByTestId("geometry-left-panel"), `Scratch ${tab} panel`);
        await expectVerticalContentReachable(page.getByTestId("geometry-left-panel"), `Scratch ${tab} panel`);
      }
    });
  }
});
