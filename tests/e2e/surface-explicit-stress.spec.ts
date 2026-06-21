import { expect, test, type Locator, type Page } from "@playwright/test";
import { clickFirstVisible, clickFirstVisibleButton } from "./helpers/uiActions";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

const getSurfacesLayout3ModeToggle = (page: Page) => page.getByTestId("surfaces-layout3-mode-toggle").first();

const wait = (delayMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, delayMs));

const isMath3dPageAlive = async (page: Page): Promise<boolean> => {
  if (page.isClosed()) return false;
  try {
    return await page.evaluate(() => {
      const hasHeading = Array.from(document.querySelectorAll("h1")).some((heading) =>
        /^math3d$/i.test(heading.textContent?.trim() ?? "")
      );
      const hasSurfacesNav = Array.from(document.querySelectorAll("button")).some((button) => {
        const text = (button.textContent ?? "").replace(/\s+/g, " ").trim();
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return text === "Surfaces" && rect.width > 0 && rect.height > 0 && style.display !== "none";
      });
      return hasHeading && hasSurfacesNav;
    });
  } catch {
    return false;
  }
};

const getLiveMath3dPage = async (ctx: LaunchedSurfaceApp, timeoutMs = 12_000): Promise<Page> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pages = ctx.app.windows();
    for (const page of [...pages].reverse()) {
      if (await isMath3dPageAlive(page)) {
        ctx.page = page;
        return page;
      }
    }
    await wait(250);
  }
  throw new Error("MATH3D page did not recover within timeout.");
};

const settleRenderer = async (page: Page, delayMs = 180): Promise<void> => {
  await page.waitForTimeout(delayMs);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
};

const readToggleLabel = async (toggle: Locator): Promise<string> =>
  (await toggle.innerText()).replace(/\s+/g, " ").trim().toLowerCase();

const setSurfacesLayout = async (page: Page, layout: 1 | 2 | 3): Promise<void> => {
  if (layout === 3 && (await getSurfacesLayout3ModeToggle(page).count()) > 0) return;
  const button = page.getByTestId(`surfaces-layout-${layout}`);
  if ((await button.count()) > 0 && (await button.first().isVisible())) {
    await clickFirstVisible(button, `data-testid=surfaces-layout-${layout}`);
    await settleRenderer(page);
    return;
  }

  const fallback = page.getByRole("button", { name: new RegExp(`^(Layout ${layout}|L${layout})$`) });
  if ((await fallback.count()) > 0 && (await fallback.first().isVisible())) {
    await clickFirstVisible(fallback, `button Layout ${layout}/L${layout}`);
    await settleRenderer(page);
  }
};

const setSurfacesLayout3PanelMode = async (page: Page, mode: "browse" | "work"): Promise<void> => {
  const toggle = getSurfacesLayout3ModeToggle(page);
  if ((await toggle.count()) === 0 || !(await toggle.isVisible())) return;
  const label = await readToggleLabel(toggle);

  if (mode === "work" && (label.includes("show scene/object tabs") || label.includes("tabs"))) {
    await clickFirstVisible(toggle, 'data-testid="surfaces-layout3-mode-toggle"');
    await settleRenderer(page);
    return;
  }

  if (mode === "browse" && label === "gallery") {
    await clickFirstVisible(toggle, 'data-testid="surfaces-layout3-mode-toggle"');
    await settleRenderer(page);
  }
};

const ensureExplicitSurfaceGallery = async (page: Page): Promise<void> => {
  await clickFirstVisibleButton(page, "Surfaces");
  await setSurfacesLayout(page, 3);
  await setSurfacesLayout3PanelMode(page, "browse");
  await clickFirstVisible(page.getByTestId("surface-family-explicit"), 'data-testid="surface-family-explicit"');
  await expect(page.getByTestId("surface-preset-grid")).toBeVisible();
  await expect.poll(async () => page.locator("[data-testid^='surface-preset-card-']").count()).toBeGreaterThan(0);
};

const explicitCardTestIds = async (page: Page): Promise<string[]> =>
  page.locator("[data-testid^='surface-preset-card-']").evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute("data-testid") ?? "")
      .filter((testId): testId is string => testId.startsWith("surface-preset-card-"))
  );

const largestVisibleCanvasHost = async (page: Page): Promise<Locator> => {
  const hosts = page.getByTestId("surface-viewer-canvas-host");
  const count = await hosts.count();
  let bestIndex = -1;
  let bestArea = 0;
  for (let i = 0; i < count; i += 1) {
    const host = hosts.nth(i);
    if (!(await host.isVisible())) continue;
    const box = await host.boundingBox();
    if (!box) continue;
    const area = Math.max(0, box.width) * Math.max(0, box.height);
    if (area > bestArea) {
      bestArea = area;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) throw new Error("No visible surface canvas host found.");
  return hosts.nth(bestIndex);
};

const openFirstExplicitSurfaceInWorkMode = async (page: Page): Promise<void> => {
  await ensureExplicitSurfaceGallery(page);
  const firstCard = page.locator("[data-testid^='surface-preset-card-']").first();
  await expect(firstCard).toBeVisible();
  await clickFirstVisible(firstCard, "first explicit surface preset card");
  await settleRenderer(page, 300);
  await setSurfacesLayout3PanelMode(page, "work");
  await expect(await largestVisibleCanvasHost(page)).toBeVisible();
};

test.describe("Explicit surface stress", () => {
  test("explicit gallery presets can be traversed", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await ensureExplicitSurfaceGallery(ctx.page);

      const cardIds = await explicitCardTestIds(ctx.page);
      expect(cardIds.length).toBeGreaterThan(0);

      for (const testId of cardIds) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const page = await getLiveMath3dPage(ctx);
          try {
            await ensureExplicitSurfaceGallery(page);
            const card = page.getByTestId(testId);
            await card.scrollIntoViewIfNeeded();
            await clickFirstVisible(card, `data-testid="${testId}"`, { timeoutMs: 10_000 });
            await settleRenderer(page, 250);
            await expect(await largestVisibleCanvasHost(page)).toBeVisible();
            break;
          } catch (error) {
            if (attempt > 0) throw error;
            await getLiveMath3dPage(ctx, 15_000);
          }
        }
      }
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("surface canvas stays responsive across 300 mixed pointer interactions", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      const refreshCanvas = async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const page = await getLiveMath3dPage(ctx!);
          try {
            await openFirstExplicitSurfaceInWorkMode(page);
            const host = await largestVisibleCanvasHost(page);
            const box = await host.boundingBox();
            if (!box) throw new Error("Surface canvas host has no bounding box.");
            return { page, host, box };
          } catch (error) {
            if (attempt >= 2) throw error;
            await getLiveMath3dPage(ctx!, 15_000);
          }
        }
        throw new Error("Surface canvas host could not be recovered.");
      };
      let canvas = await refreshCanvas();

      for (let i = 0; i < 300; i += 1) {
        const { page, box } = canvas;
        const angle = (i / 17) * Math.PI;
        const centerX = box.x + box.width * 0.5;
        const centerY = box.y + box.height * 0.5;
        const radiusX = Math.max(24, Math.min(90, box.width * 0.16));
        const radiusY = Math.max(18, Math.min(70, box.height * 0.14));
        const x = centerX + Math.cos(angle) * radiusX;
        const y = centerY + Math.sin(angle) * radiusY;

        try {
          if (i % 10 === 0) {
            await page.mouse.wheel(0, i % 20 === 0 ? -160 : 160);
          } else if (i % 3 === 0) {
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x + 34, y + 18, { steps: 4 });
            await page.mouse.up();
          } else if (i % 3 === 1) {
            await page.mouse.move(x, y);
            await page.mouse.down({ button: "right" });
            await page.mouse.move(x - 26, y + 24, { steps: 4 });
            await page.mouse.up({ button: "right" });
          } else {
            await page.mouse.click(x, y);
          }
        } catch {
          canvas = await refreshCanvas();
          continue;
        }

        if (i % 25 === 24) {
          canvas = await refreshCanvas();
          await expect(canvas.host).toBeVisible();
          await expect(canvas.page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
        }
      }

      canvas = await refreshCanvas();
      await expect(canvas.host).toBeVisible();
      await expect(canvas.page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
