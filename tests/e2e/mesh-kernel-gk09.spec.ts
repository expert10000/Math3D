import { expect, test, type Locator, type Page } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const visible = async (locator: Locator): Promise<Locator> => {
  for (let index = 0; index < await locator.count(); index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  throw new Error("No visible Mesh Analyze result card was found.");
};

const openPresetAnalyze = async (page: Page): Promise<void> => {
  await resetSurfaceAppState(page);
  const meshSections = page.getByRole("button", { name: "Mesh", exact: true });
  for (let index = 0; index < await meshSections.count(); index += 1) {
    const button = meshSections.nth(index);
    if (await button.isVisible() && await button.getAttribute("aria-pressed") != null) { await button.click(); break; }
  }
  await (await visible(page.getByRole("button", { name: "Mesh presets", exact: true }))).click();
  await page.getByTestId("mesh-preset-card-mesh_icosphere").click();
  await (await visible(page.getByRole("button", { name: "Mesh tools", exact: true }))).click();
  await page.getByTestId("surfaces-left-tab-analysis").click();
  const handoff = page.getByRole("button", { name: "Open in Mesh Analysis", exact: true });
  if (await handoff.isVisible().catch(() => false)) await handoff.click();
};

test("GK09 shows current artifact, scientific authority, and worker routing in Mesh Analyze", async () => {
  test.setTimeout(120_000);
  let context: LaunchedSurfaceApp | null = null;
  try {
    context = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const page = context.page;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openPresetAnalyze(page);
    const metadata = await visible(page.getByTestId("mesh-analysis-result-metadata"));
    const provenance = await visible(page.getByTestId("mesh-analysis-result-provenance"));
    await expect(metadata).toContainText(/Kernel resource\s*current/i, { timeout: 30_000 });
    await expect(metadata).toContainText(/Backend\s*mesh-analysis-worker/i);
    await expect(provenance).toContainText(/Scientific authority\s*numerical/i);
    await expect(provenance).toContainText(/Execution backend\s*mesh-analysis-worker/i);
    await expect(provenance).toContainText(/Transport\s*worker/i);
  } finally {
    await closeSurfaceApp(context);
  }
});
