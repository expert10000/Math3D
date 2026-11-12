import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Catenoid Study withholds a saved waist comparison after its Surface source changes", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp(); await resetSurfaceAppState(app.page);
    let page = app.page;
    await page.getByTestId("projects-toggle").click();
    let panel = page.getByTestId("project-explorer-panel");
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenoid-evidence").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    if (await panel.getByTestId("project-gallery-layout-toggle").innerText() !== "Compact panel")
      await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-save").click();
    const core = require(resolve("packages/core/src/index.ts"));
    const original = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const surface = original.workspace.entries.find((entry: { module: string }) => entry.module === "surface");
    const revised = core.replaceSurfaceDocumentSource(surface.checkpoint, {
      ...surface.checkpoint.source, parameters: { ...surface.checkpoint.source.parameters, revised: 1 },
    });
    const workspace = core.createMixedWorkspaceDocument({ ...original.workspace,
      entries: original.workspace.entries.map((entry: { expected: { id: string } }) =>
        entry.expected.id === surface.expected.id ? { ...entry, checkpoint: revised,
          expected: revised.identity, replay: null } : entry) });
    const changed = core.replaceMath3DProjectWorkspace(original, workspace);
    await page.evaluate(({ id, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
    }, { id: original.identity.id, raw: core.serializeMath3DProject(changed) });
    const profile = app.profileDir;
    await app.app.close(); app = await launchSurfaceApp({}, profile); page = app.page;
    await openLastSavedProject(page);
    await expect(page.getByTestId("project-explorer-panel").getByRole("heading", { name: "Catenoid Evidence Notebook", level: 3 }))
      .toBeVisible({ timeout: 60_000 });
    const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(reopened.workspace.studies).toHaveLength(1);
    panel = page.getByTestId("project-explorer-panel");
    if (!await panel.getByTestId("project-studies-panel").count())
      await panel.getByTestId("project-gallery-layout-toggle").first().click();
    const detail = panel.getByTestId("project-detail-toggle");
    if (!await panel.getByTestId("project-studies-panel").count() && await detail.count() &&
      await detail.getAttribute("aria-pressed") === "false") await detail.click();
    if (await panel.getByTestId("project-detail-tab-overview").count())
      await panel.getByTestId("project-detail-tab-overview").click();
    const studies = panel.getByTestId("project-studies-panel");
    await expect(studies).toBeVisible();
    await studies.locator("[data-testid^='project-study-open-']").click();
    await expect(studies.getByTestId("project-catenoid-waist-status")).toContainText("withheld");
    await expect(studies.getByTestId("project-study-open-result-pane-1")).toBeDisabled();
  } finally { await closeSurfaceApp(app); }
});

test("Catenoid Project refuses missing saved Mesh resource bytes after a cold restart", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp(); await resetSurfaceAppState(app.page);
    let page = app.page;
    await page.getByTestId("projects-toggle").click();
    let panel = page.getByTestId("project-explorer-panel");
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenoid-evidence").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    if (await panel.getByTestId("project-gallery-layout-toggle").innerText() !== "Compact panel")
      await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-save").click();
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id as string);
    await page.evaluate(async id => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("math3d.project-resources.v1");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("projects", "readwrite");
        for (const key of [id, "before-open", "before-open-a", "before-open-b"])
          transaction.objectStore("projects").delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }, id);
    const profile = app.profileDir;
    await app.app.close(); app = await launchSurfaceApp({}, profile); page = app.page;
    await openLastSavedProject(page);
    const preview = page.getByTestId("project-import-limit");
    await expect(preview).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Open project", exact: true })).toBeDisabled();
    await expect(page.getByTestId("project-catenoid-waist-evidence")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
