import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from
  "./helpers/surfaceAppHarness";

type AuditField = { key: string; label: string; status: string;
  statistics?: { count: number; gaps: number; mean: number | null };
  profiles?: unknown };
type Audit = { verification: { status: string }; bounds?: number[][];
  fields: AuditField[] };

async function downloadAudit(app: LaunchedSurfaceApp, filename: string): Promise<Audit> {
  const workbook = app.page.getByTestId("project-middle-workbook");
  const target = test.info().outputPath(filename);
  await app.app.evaluate(({ session }, path) => session.defaultSession.once(
    "will-download", (_event, item) => item.setSavePath(path)), target);
  await workbook.getByTestId("scientific-subrectangle-export-json")
    .evaluate(element => { setTimeout(() => (element as HTMLButtonElement).click(), 0); });
  const status = workbook.getByTestId("scientific-subrectangle-workbook-report")
    .getByRole("status");
  await expect(status).toContainText(/JSON audit exported|JSON export failed/,
    { timeout: 300_000 });
  expect(await status.innerText()).not.toContain("JSON export failed");
  await expect.poll(async () => {
    try { return JSON.parse(await readFile(target, "utf8")) as Audit; }
    catch { return null; }
  }, { timeout: 60_000 }).not.toBeNull();
  return JSON.parse(await readFile(target, "utf8")) as Audit;
}

test("SCI-19 JSON audit rechecks a reopened combined Workbook and withholds changed vector fields", async () => {
  test.setTimeout(1_200_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-scientific-json-audit-"));
  const scene = join(root, "swirling-flow.sscene");
  await cp(resolve("examples/scientific-scenes/vortex-volume.sscene"), scene,
    { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, scene);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    await page.getByRole("dialog", { name: "Import verified scientific dataset" })
      .getByRole("button", { name: "Open in Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const examples = explorer.getByRole("region", { name: "Built-in scientific scenes" });
    await explorer.getByRole("button", { name: "XY slice", exact: true }).click();
    await explorer.getByLabel("Slice physical coordinate").selectOption({ index: 0 });
    await examples.getByRole("button", { name: /Quadratic potential/ }).click();
    await explorer.getByRole("button", {
      name: "Show this scalar as overlay on vector slices" }).click();
    await examples.getByRole("button", { name: /Complex wave/ }).click();
    await explorer.getByRole("button", {
      name: "Show this complex field as overlay on vector slices" }).click();
    const figure = explorer.getByRole("figure", { name: "XY field slice" });
    const actions = explorer.getByTestId("scientific-inspector-region-actions");
    await actions.getByTestId("scientific-inspector-select-region").click();
    await figure.locator('[data-probe-cell="8-8"]').click();
    await figure.locator('[data-probe-cell="13-13"]').click();
    await expect(figure.getByTestId("scientific-combined-region-summary"))
      .toContainText("289/289 samples", { timeout: 90_000 });
    await actions.getByTestId("scientific-inspector-select-subrectangle").click();
    await figure.locator('[data-probe-cell="9-9"]').click();
    await figure.locator('[data-probe-cell="12-12"]').click();
    await actions.getByTestId("scientific-inspector-publish-subrectangle").click();
    await expect(figure.getByTestId("scientific-combined-subrectangle-saved-status"))
      .toContainText("curl magnitude source-current", { timeout: 120_000 });
    await explorer.getByRole("button", { name: "Save document" }).click();
    await page.getByTestId("projects-toggle").evaluate(element => {
      setTimeout(() => (element as HTMLButtonElement).click(), 0);
    });
    const projects = page.getByTestId("project-explorer-panel");
    if (await projects.getByRole("button", { name: "View current project" }).count())
      await projects.getByRole("button", { name: "View current project" })
        .evaluate(element => { setTimeout(() => (element as HTMLButtonElement).click(), 0); });
    await expect(projects.getByTestId("project-save"))
      .toBeEnabled({ timeout: 120_000 });
    await projects.getByTestId("project-save").evaluate(element => {
      setTimeout(() => (element as HTMLButtonElement).click(), 0);
    });
    await expect.poll(() => page.evaluate(() =>
      localStorage.getItem("math3d.project.v1")), { timeout: 120_000 })
      .not.toBeNull();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const result = saved.workspace.results.find((item: { provenance: {
      operation: { type: string } } }) => item.provenance.operation.type ===
      "vector3d.combined-subrectangle");
    expect(result).toBeTruthy();
    if (!await projects.getByTestId("project-dashboard").isVisible())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    const resultsTab = projects.getByTestId("project-detail-tab-results");
    await resultsTab.evaluate(element => {
      setTimeout(() => (element as HTMLButtonElement).click(), 0);
    }, undefined, { timeout: 120_000 });
    await expect(resultsTab).toHaveAttribute("aria-current", "page",
      { timeout: 120_000 });
    const outputs = projects.getByTestId("project-results-browser");
    await expect(outputs).toBeVisible({ timeout: 120_000 });
    const savedResult = outputs.getByTestId(`project-result-select-${result.resultId}`);
    await savedResult.evaluate(element => {
      setTimeout(() => (element as HTMLButtonElement).click(), 0);
    }, undefined, { timeout: 120_000 });
    await expect(savedResult).toHaveAttribute("aria-current", "true",
      { timeout: 120_000 });
    await outputs.getByTestId("project-create-subrectangle-workbook")
      .evaluate(element => { setTimeout(() => (element as HTMLButtonElement).click(), 0); });
    await expect.poll(() => page.evaluate(id => {
      const payload = localStorage.getItem(`math3d.project.v1.payload.${id}`);
      return payload ? JSON.parse(payload).workbooks?.length ?? 0 : 0;
    }, saved.identity.id), { timeout: 120_000 }).toBe(1);
    const persisted = await page.evaluate(id => JSON.parse(localStorage.getItem(
      `math3d.project.v1.payload.${id}`)!), saved.identity.id);
    const workbookId = persisted.workbooks[0].id as string;
    const reopenWorkbook = async () => {
      await page.getByTestId("projects-toggle").evaluate(element => {
        setTimeout(() => (element as HTMLButtonElement).click(), 0);
      }, undefined, { timeout: 120_000 });
      await expect(projects).toBeVisible();
      const openProject = projects.getByTestId(`project-open-saved-${saved.identity.id}`);
      await expect(openProject).toBeEnabled({ timeout: 120_000 });
      await openProject.evaluate(element => {
        setTimeout(() => (element as HTMLButtonElement).click(), 0);
      }, undefined, { timeout: 120_000 });
      if (!await projects.getByTestId("project-workbooks").isVisible())
        await projects.getByTestId("project-detail-tab-documents").click();
      const viewWorkbook = projects.getByTestId(`project-view-workbook-${workbookId}`);
      await expect.poll(async () => {
        const message = await projects.getByTestId("project-message").innerText();
        if (/Project import failed|Saved project unavailable/.test(message))
          throw new Error(message);
        return viewWorkbook.isEnabled();
      }, { timeout: 360_000 }).toBe(true);
      await viewWorkbook.evaluate(element => {
        setTimeout(() => (element as HTMLButtonElement).click(), 0);
      }, undefined, { timeout: 120_000 });
      await expect(projects.getByTestId("project-message"))
        .toContainText("Opened “Field report", { timeout: 120_000 });
      await expect(page.getByTestId("project-middle-workbook"))
        .toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId("project-middle-workbook")
        .getByTestId("scientific-subrectangle-workbook-report"))
        .toBeVisible({ timeout: 120_000 });
    };
    await reopenWorkbook();
    await expect(page.getByTestId("project-middle-workbook")
      .getByTestId("scientific-subrectangle-workbook-report"))
      .toContainText("Sources verified", { timeout: 480_000 });
    const verified = await downloadAudit(app, "verified-subrectangle-audit.json");
    expect(verified.verification.status).toBe("verified");
    expect(verified.bounds).toHaveLength(2);
    expect(verified.fields).toHaveLength(6);
    expect(verified.fields.every(field => field.status === "verified")).toBe(true);
    expect(verified.fields.find(field => field.key === "scalar"))
      .toMatchObject({ statistics: { count: expect.any(Number) } });
    const tile = join(scene, "east.f64");
    const bytes = Buffer.from(await readFile(tile));
    bytes[0] ^= 1;
    await writeFile(tile, bytes);
    const partial = await downloadAudit(app, "changed-subrectangle-audit.json");
    expect(partial.verification.status).toBe("partial");
    const byKey = (key: string) => partial.fields.find(field => field.key === key)!;
    for (const key of ["vector", "divergence", "curlMagnitude"]) {
      expect(byKey(key).status).not.toBe("verified");
      expect(Object.keys(byKey(key)).sort()).toEqual(["key", "label", "status"]);
    }
    for (const key of ["scalar", "complexMagnitude", "complexPhase"]) {
      expect(byKey(key).status).toBe("verified");
      expect(byKey(key).statistics).toEqual(
        verified.fields.find(field => field.key === key)?.statistics);
      expect(byKey(key).profiles).toBeTruthy();
    }
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) ||
        !root.includes("m3d-scientific-json-audit-"))
      throw new Error("Unsafe scientific audit fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
