#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

const baseUrl = process.env.MATH3D_RESPONSIVE_SMOKE_URL || "http://127.0.0.1:5175";
const timeoutMs = Number(process.env.MATH3D_RESPONSIVE_SMOKE_TIMEOUT_MS || 60000);

const viewports = [
  { name: "phone-portrait", width: 390, height: 844, narrow: true },
  { name: "phone-landscape", width: 844, height: 390, narrow: true },
  { name: "tablet", width: 900, height: 1180, narrow: true },
  { name: "desktop", width: 1366, height: 900, narrow: false },
];
const requestedViewportNames = new Set(process.argv.slice(2));
const selectedViewports = requestedViewportNames.size
  ? viewports.filter((viewport) => requestedViewportNames.has(viewport.name))
  : viewports;
const logFile = process.env.MATH3D_RESPONSIVE_SMOKE_LOG || "";

function writeLog(stream, message) {
  const line = message.endsWith("\n") ? message : `${message}\n`;
  stream.write(line);
  if (logFile) fs.appendFileSync(logFile, line);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForStableLayout(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator('[data-testid="app-shell"]').waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForTimeout(350);
}

async function boundedCleanup(label, cleanup) {
  try {
    await Promise.race([
      cleanup(),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch (error) {
    writeLog(process.stderr, `[responsive-smoke] ${label} cleanup warning: ${String(error?.message ?? error)}`);
  }
}

async function isVisible(locator) {
  try {
    return await locator.first().isVisible({ timeout: 750 });
  } catch {
    return false;
  }
}

async function expectHidden(locator, label) {
  assert(!(await isVisible(locator)), `${label} should be hidden`);
}

async function expectBoxInViewport(locator, label, viewport, options = {}) {
  const target = locator.first();
  await target.waitFor({ state: "visible", timeout: timeoutMs });
  const box = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  });
  assert(box, `${label} has no layout box`);

  const minWidth = options.minWidth ?? 24;
  const minHeight = options.minHeight ?? 24;
  assert(box.width >= minWidth, `${label} too narrow: ${box.width}`);
  assert(box.height >= minHeight, `${label} too short: ${box.height}`);

  if (options.insideViewport !== false) {
    assert(box.x >= -2, `${label} extends past left edge: ${box.x}`);
    assert(box.y >= -2, `${label} extends past top edge: ${box.y}`);
    assert(box.x + box.width <= viewport.width + 2, `${label} extends past right edge: ${box.x + box.width}`);
    assert(box.y + box.height <= viewport.height + 2, `${label} extends past bottom edge: ${box.y + box.height}`);
  }

  return box;
}

async function expectTouchContained(page, label) {
  const css = await page.locator('[data-testid="main-viewer"]').first().evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      overscrollBehavior: style.overscrollBehavior,
      touchAction: style.touchAction,
      userSelect: style.userSelect,
    };
  });

  assert(css.touchAction === "none", `${label} touch-action should be none, got ${css.touchAction}`);
  assert(css.overscrollBehavior === "contain", `${label} overscroll-behavior should be contain, got ${css.overscrollBehavior}`);
  assert(css.userSelect === "none", `${label} user-select should be none, got ${css.userSelect}`);
}

async function clickDrawerButton(page, navTestId, label) {
  await page
    .locator(`[data-testid="${navTestId}"]`)
    .getByRole("button", { name: new RegExp(`^${label}$`) })
    .click();
  await page.waitForTimeout(450);
}

async function checkSurfaceLayout(page, viewport) {
  writeLog(process.stdout, `[responsive-smoke] ${viewport.name} surfaces`);
  await expectBoxInViewport(page.locator('[data-testid="main-viewer"]'), "surface viewer", viewport, {
    insideViewport: false,
    minHeight: 160,
  });
  await expectTouchContained(page, "surface viewer");

  if (!viewport.narrow) {
    await expectHidden(page.locator('[data-testid="surface-bottom-nav"]'), "surface bottom nav");
    await expectHidden(page.locator('[data-testid="surface-floating-toolbar"]'), "surface floating toolbar");
    return;
  }

  await expectBoxInViewport(page.locator('[data-testid="surface-bottom-nav"]'), "surface bottom nav", viewport, { minHeight: 34 });
  await expectBoxInViewport(page.locator('[data-testid="surface-floating-toolbar"]'), "surface floating toolbar", viewport, { minHeight: 34 });

  await page.locator('[data-testid="surface-floating-toolbar"]').getByRole("button", { name: /^More$/ }).click();
  await expectBoxInViewport(page.locator('[data-testid="surface-floating-toolbar-more"]'), "surface toolbar overflow", viewport, {
    minHeight: 34,
  });

  const editButton = page.locator('[data-testid="surface-floating-toolbar"]').getByRole("button", { name: /^Edit$/ });
  if (await isVisible(editButton)) {
    await editButton.click();
    await page.waitForTimeout(200);
    await expectBoxInViewport(page.locator('[data-testid="surface-formula-editor-sheet"]'), "surface editor sheet", viewport, {
      minHeight: 120,
    });
    await page.locator('[data-testid="surface-formula-editor-sheet"]').getByRole("button", { name: /^Close$/ }).click();
    await page.waitForTimeout(150);
  }

  await clickDrawerButton(page, "surface-bottom-nav", "Scene");
  await expectBoxInViewport(page.locator('[data-testid="surface-left-panel"]'), "surface scene drawer", viewport, { minHeight: 180 });

  await clickDrawerButton(page, "surface-bottom-nav", "Inspector");
  await expectBoxInViewport(page.locator('[data-testid="surface-right-panel"]'), "surface inspector drawer", viewport, { minHeight: 180 });

  await clickDrawerButton(page, "surface-bottom-nav", "Viewer");
  await page.locator('[data-testid="surface-family-parametric"]').click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: /^Open surface params$/ }).click();
  await expectBoxInViewport(page.locator('[data-testid="surface-params-bottom-sheet"]'), "surface params bottom sheet", viewport, {
    minHeight: 160,
  });
  await page.locator('[data-testid="surface-params-bottom-sheet"]').getByRole("button", { name: /^Close$/ }).first().click();
}

async function checkGeometryLayout(page, viewport) {
  writeLog(process.stdout, `[responsive-smoke] ${viewport.name} geometry`);
  await page.locator('[data-testid="workspace-nav-geometry"]').evaluate((element) => element.click());
  await waitForStableLayout(page);

  await expectBoxInViewport(page.locator('[data-testid="main-viewer"]'), "geometry viewer", viewport, {
    insideViewport: false,
    minHeight: 160,
  });
  await expectTouchContained(page, "geometry viewer");

  if (!viewport.narrow) {
    await expectHidden(page.locator('[data-testid="geometry-bottom-nav"]'), "geometry bottom nav");
    await expectHidden(page.locator('[data-testid="geometry-floating-toolbar"]'), "geometry floating toolbar");
    return;
  }

  await expectBoxInViewport(page.locator('[data-testid="geometry-bottom-nav"]'), "geometry bottom nav", viewport, { minHeight: 34 });
  await expectBoxInViewport(page.locator('[data-testid="geometry-floating-toolbar"]'), "geometry floating toolbar", viewport, {
    minHeight: 34,
  });

  await page.locator('[data-testid="geometry-floating-toolbar"]').getByRole("button", { name: /^More$/ }).click();
  await expectBoxInViewport(page.locator('[data-testid="geometry-floating-toolbar-more"]'), "geometry toolbar overflow", viewport, {
    minHeight: 34,
  });

  await clickDrawerButton(page, "geometry-bottom-nav", "Geometry");
  await expectBoxInViewport(page.locator('[data-testid="geometry-left-panel"]'), "geometry tools drawer", viewport, { minHeight: 180 });

  await clickDrawerButton(page, "geometry-bottom-nav", "Inspector");
  await expectBoxInViewport(page.locator('[data-testid="geometry-right-panel"]'), "geometry inspector drawer", viewport, { minHeight: 180 });
}

async function runViewport(browser, viewport) {
  writeLog(process.stdout, `[responsive-smoke] ${viewport.name} start`);
  let page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  page.setDefaultTimeout(timeoutMs);
  try {
    await page.goto(`${baseUrl}?responsive-smoke=${encodeURIComponent(viewport.name)}-surfaces-${Date.now()}`);
    await waitForStableLayout(page);
    await checkSurfaceLayout(page, viewport);
  } catch (error) {
    throw new Error(`[${viewport.name} surfaces] ${String(error?.message ?? error)}`);
  } finally {
    await boundedCleanup(`${viewport.name} surfaces page`, () => page.close({ runBeforeUnload: false }));
  }

  page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  page.setDefaultTimeout(timeoutMs);
  try {
    await page.goto(`${baseUrl}?responsive-smoke=${encodeURIComponent(viewport.name)}-geometry-${Date.now()}`);
    await waitForStableLayout(page);
    await checkGeometryLayout(page, viewport);
  } catch (error) {
    throw new Error(`[${viewport.name} geometry] ${String(error?.message ?? error)}`);
  } finally {
    await boundedCleanup(`${viewport.name} geometry page`, () => page.close({ runBeforeUnload: false }));
  }

  writeLog(process.stdout, `[responsive-smoke] ${viewport.name} ok`);
}

async function run() {
  writeLog(process.stdout, "[responsive-smoke] loading playwright");
  const { chromium } = await import("@playwright/test");
  writeLog(process.stdout, "[responsive-smoke] launching browser");
  const browser = await chromium.launch({ timeout: Math.max(timeoutMs, 30000) });
  try {
    assert(selectedViewports.length > 0, `Unknown viewport filter: ${[...requestedViewportNames].join(", ")}`);
    for (const viewport of selectedViewports) {
      await runViewport(browser, viewport);
    }
  } finally {
    await boundedCleanup("browser", () => browser.close());
  }
  writeLog(process.stdout, "[responsive-smoke] ok responsive layout + drawers + sheets + touch containment");
}

run().catch((error) => {
  writeLog(process.stderr, String(error?.message ?? error));
  process.exit(1);
});
