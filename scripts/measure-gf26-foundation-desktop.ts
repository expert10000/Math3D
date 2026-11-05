import { performance } from "node:perf_hooks";
import { expect } from "@playwright/test";
import { serializeMath3DProject } from "../packages/core/src/index";
import { createGf23Project } from "../tests/fixtures/graph-field/gf23Bundle";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "../tests/e2e/helpers/surfaceAppHarness";

async function main() {
const app = await launchSurfaceApp();
const page = app.page;
const measure = async (name: string, action: () => Promise<void>) => {
  let peakKiB = 0, samples = 0;
  let pending: Promise<void> | null = null;
  const sample = (): Promise<void> => {
    if (pending) return pending;
    pending = (async () => {
      const metrics = await app.app.evaluate(({ app }) => app.getAppMetrics());
      peakKiB = Math.max(peakKiB, metrics.reduce((sum, item) =>
        sum + Number(item.memory?.workingSetSize ?? 0), 0));
      samples++;
    })().finally(() => { pending = null; });
    return pending;
  };
  await sample();
  const timer = setInterval(() => void sample().catch(() => {}), 50);
  const start = performance.now();
  try { await action(); }
  finally { clearInterval(timer); await sample(); }
  return { name, elapsedMs: +(performance.now() - start).toFixed(1),
    peakProcessWorkingSetMiB: +(peakKiB / 1024).toFixed(1), samples };
};

try {
  await resetSurfaceAppState(page);
  await page.getByTestId("projects-toggle").click();
  const projects = page.getByTestId("project-explorer-panel");
  await projects.getByTestId("project-import-file").setInputFiles({
    name: "gf26-benchmark.math3d.project.json", mimeType: "application/json",
    buffer: Buffer.from(serializeMath3DProject(createGf23Project())) });
  await projects.getByTestId("project-import-open").click();
  const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
  const baselinePreview = await measure("Explorer first verified 3D preview", async () => {
    await page.getByTestId("workspace-nav-graphs").click();
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    await expect(explorer.getByTestId("vector-field3d-render-status"))
      .toContainText("Rendered 125 of 125", { timeout: 30_000 });
  });
  await explorer.getByRole("button", { name: "XY slice" }).click();
  const coordinate = explorer.getByLabel("Slice physical coordinate");
  const options = await coordinate.locator("option").allTextContents();
  const target = options[1]!.split(" ")[0]!;
  const baselineInteraction = await measure("Explorer verified slice coordinate", async () => {
    await coordinate.selectOption({ index: 1 });
    await explorer.getByRole("button", { name: "Preview slice", exact: true }).click();
    await expect(explorer.locator("figure figcaption").filter({ hasText: "bounded samples" }).first())
      .toContainText(`z = ${target}`, { timeout: 30_000 });
  });
  const profilePreview = await measure("GF-23 first Graph profile", async () => {
    await explorer.getByTestId("gf07-open-profile-from-explorer").click();
    await expect(explorer).toBeHidden();
    const right = page.getByRole("button", { name: "Right", exact: true });
    if (await right.getAttribute("aria-pressed") === "true") await right.click();
    const inspector = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await inspector.getAttribute("open") === null)
      await inspector.locator(":scope > summary").click();
    await expect(inspector.getByTestId("gf07-graph-profile-status"))
      .toContainText("current", { timeout: 30_000 });
  });
  await page.getByTestId("projects-toggle").click();
  await projects.getByTestId("project-save").click();
  await expect(projects.getByTestId("project-message")).toContainText("Saved");
  await page.reload();
  await openLastSavedProject(page);
  await page.getByTestId("workspace-nav-graphs").click();
  if (await explorer.isVisible())
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
  const right = page.getByRole("button", { name: "Right", exact: true });
  if (await right.getAttribute("aria-pressed") === "true") await right.click();
  const inspector = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
  if (await inspector.getAttribute("open") === null)
    await inspector.locator(":scope > summary").click();
  await expect(inspector.getByTestId("gf07-graph-profile-status"))
    .toContainText("values withheld");
  const profileInteraction = await measure("GF-23 explicit Graph refresh", async () => {
    await inspector.getByTestId("gf07-refresh-profile").click();
    await expect(inspector.getByTestId("gf07-graph-profile-status"))
      .toContainText("current", { timeout: 30_000 });
  });
  process.stdout.write(JSON.stringify({ fixture: "vortex-volume 21×21×17",
    date: "2026-11-05", method: "one Electron process, 50 ms getAppMetrics sampling",
    baselinePreview, baselineInteraction, profilePreview, profileInteraction }, null, 2) + "\n");
} finally { await closeSurfaceApp(app); }
}
void main().catch(cause => { process.stderr.write(String(cause) + "\n"); process.exitCode = 1; });
