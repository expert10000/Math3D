import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

type HeldStudyTimers = { armed: boolean; held: number; released: number;
  release: () => void };
declare global { interface Window { __gr05StudyTimers: HeldStudyTimers } }

// Hold the Job's genuine yield after its first eight measurements. The
// application receives the original callback only after the source edit.
const installStudyTimerHold = () => {
  const original = window.setTimeout.bind(window);
  const clear = window.clearTimeout.bind(window);
  const pending: { id: number; callback: TimerHandler; args: unknown[] }[] = [];
  const state: HeldStudyTimers = { armed: false, held: 0, released: 0,
    release: () => {
      state.armed = false;
      for (const item of pending.splice(0)) {
        clear(item.id);
        state.released++;
        original(item.callback, 0, ...item.args);
      }
    } };
  window.__gr05StudyTimers = state;
  window.setTimeout = ((callback: TimerHandler, timeout?: number, ...args: unknown[]) => {
    if (state.armed && timeout === 0) {
      const id = original(() => {}, 30_000);
      pending.push({ id, callback, args }); state.held++;
      return id;
    }
    return original(callback, timeout, ...args);
  }) as typeof window.setTimeout;
};

test("GR-05 native Graph Job withholds late output after the study source changes", async () => {
  test.setTimeout(90_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await page.addInitScript(installStudyTimerHold);
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    await page.getByLabel("Search graphs").fill("Two slopes");
    await page.getByRole("button", { name: "Open Two slopes", exact: true }).click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByTestId("graph2d-parameters-open").click();
    const parameters = page.getByTestId("graph2d-parameters");
    await parameters.getByRole("button", { name: "Configure a" }).click();
    await parameters.getByRole("button", { name: "Save parameter" }).click();
    await parameters.getByTestId("graph2d-parameters-close").click();
    const studies = page.getByLabel("Graph inspector", { exact: true })
      .getByTestId("gf09-parameter-studies");
    await studies.getByRole("button", { name: "New parameter study" }).click();
    await studies.getByLabel("Study label").fill("Late slope survey");
    await studies.getByLabel("Measure y at x").fill("2");
    await studies.getByRole("button", { name: "Save study" }).click();
    const saved = studies.getByTestId("gf09-study");
    await page.evaluate(() => { window.__gr05StudyTimers.armed = true; });
    await saved.getByRole("button", { name: "Run study" }).click();
    await expect(studies).toContainText("8/17 measurements");
    expect(await page.evaluate(() => window.__gr05StudyTimers.held)).toBeGreaterThan(0);
    await expect(saved).not.toContainText("Series current");
    await saved.getByRole("button", { name: "Edit measurement" }).click();
    await studies.getByLabel("Measure y at x").fill("3");
    await studies.getByRole("button", { name: "Update study" }).click();
    await expect(saved).toContainText("y at x = 3");
    await page.evaluate(() => window.__gr05StudyTimers.release());
    await expect(studies.getByRole("alert")).toContainText("Study values withheld");
    await expect(saved).toContainText("Not measured");
    await expect(saved.getByRole("button", { name: "Open series in Graphs" })).toHaveCount(0);
    expect(await page.evaluate(() => window.__gr05StudyTimers.released)).toBeGreaterThan(0);
  } finally { await closeSurfaceApp(app); }
});
