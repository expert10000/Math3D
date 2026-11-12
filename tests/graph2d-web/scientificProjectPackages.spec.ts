import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMath3DProject, parseProjectPackage } from "@math3d/core";
import { portableScientificProjectFixture } from "../fixtures/graph-field/portableScientificProject";

async function projects(page: Page) {
  const panel = page.getByTestId("project-explorer-panel");
  if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click();
  await expect(panel).toBeVisible(); return panel;
}
async function importOpen(page: Page, raw: string) {
  const panel = await projects(page);
  await panel.getByTestId("project-import-file").setInputFiles({ name: "portable-vector.project.json",
    mimeType: "application/json", buffer: Buffer.from(raw) });
  await expect(panel.getByTestId("project-import-open")).toBeEnabled();
  await panel.getByTestId("project-import-open").click();
  await expect(panel.getByTestId("project-message")).toContainText("Opened");
}
async function explorer(page: Page) {
  const panel = page.getByTestId("project-explorer-panel");
  if (await panel.isVisible()) await page.getByTestId("projects-toggle").click();
  await page.getByTestId("workspace-nav-graphs").click();
  const view = page.getByRole("region", { name: "Scientific Field Explorer" });
  if (!await view.isVisible()) {
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer", exact: true }).click();
  }
  await expect(view).toBeVisible(); return view;
}
async function downloadPackage(page: Page) {
  const panel = await projects(page), header = panel.getByTestId("project-explorer-header");
  if (!await header.getByText("More", { exact: true }).isVisible()) {
    const details = header.getByTestId("project-detail-toggle");
    if (!await details.isVisible()) await header.getByTestId("project-gallery-layout-toggle").click();
    if (!await header.getByText("More", { exact: true }).isVisible()) await details.click();
  }
  await header.getByText("More", { exact: true }).click();
  await header.getByRole("button", { name: "Import / export" }).click();
  const download = page.waitForEvent("download");
  await panel.getByTestId("project-export-resources").click();
  return readFile((await (await download).path())!, "utf8");
}

test("portable scientific Project survives independent browser import, cold restart and source recovery", async ({ baseURL }) => {
  test.setTimeout(300_000);
  const fixture = portableScientificProjectFixture(), root = await mkdtemp(join(tmpdir(), "m3d-scientific-browser-"));
  const destinationProfile = join(root, "destination");
  let context: BrowserContext | null = null;
  const closeContext = async () => { if (context) await context.close(); };
  const start = async (profile: string) => {
    context = await chromium.launchPersistentContext(profile, { headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      viewport: { width: 1440, height: 1000 }, baseURL,
      locale: String(test.info().project.use.locale ?? "en-US"),
      timezoneId: String(test.info().project.use.timezoneId ?? "UTC"),
      args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    await context.addInitScript(() => { try { localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); } catch { /* about:blank */ } });
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(baseURL!);
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    expect(await page.evaluate(() => !!window.scientificScenes)).toBe(false);
    return page;
  };
  try {
    let page = await start(join(root, "source"));
    await importOpen(page, fixture.raw);
    let field = await explorer(page);
    await field.getByRole("button", { name: "Pin current as baseline B", exact: true }).click();
    let pair = field.getByRole("region", { name: "Linked A/B field views" });
    await expect(pair).toContainText("Both scientific sources verified");
    await expect(pair.getByRole("img", { name: /^magnitude map/ })).toHaveCount(2);
    await pair.getByRole("region", { name: "Pinned baseline B" }).getByRole("img", { name: /^magnitude map/ })
      .locator('rect[style*="crosshair"]').nth(200).click();
    await expect(pair.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    let comparison = field.getByTestId("gf18-field-comparison");
    await comparison.getByLabel("Points per axis").selectOption("5");
    await comparison.getByRole("button", { name: "Compare fields", exact: true }).click();
    await expect(comparison).toContainText("Coverage 125/125");
    await comparison.getByRole("button", { name: "Save comparison in Project" }).click();
    await field.getByRole("button", { name: "Save field to Project", exact: true }).click();
    let panel = await projects(page);
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const saved = parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")!));
    const raw = await downloadPackage(page), exported = parseProjectPackage(raw);
    const active = exported.project.workspace.entries.find(entry => entry.expected.id === fixture.document.identity.id)!.checkpoint;
    expect(active.format).toBe("math3d.vector-field3d-document");
    if (active.format !== "math3d.vector-field3d-document") throw new Error("Wrong source");
    expect(active.identity).toEqual(fixture.document.identity);
    expect(active.workspace!.probe![0]).toBeCloseTo(-0.4);
    expect(active.workspace!.probe![1]).toBeCloseTo(0.4);
    // Probe and baseline edits add ordinary migrated selections; export must retain the full saved state.
    expect(exported.project.workspace.scientificSelections).toEqual(saved.workspace.scientificSelections);
    expect(exported.project.workspace.scientificSelections).toEqual(
      expect.arrayContaining(fixture.project.workspace.scientificSelections ?? []));
    expect(exported.project.workspace.results).toHaveLength(1);
    expect(exported.resources.sidecars().filter(item => item.kind.startsWith("scientific-"))).toHaveLength(4);
    const expectedFields = exported.project.workspace.entries.filter(entry => entry.module === "vector3d").map(entry => entry.checkpoint);
    const expectedSources = exported.resources.sidecars().filter(item => item.kind.startsWith("scientific-"));
    await context!.close(); context = null;

    page = await start(destinationProfile);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project-library.v1"))).toBeNull();
    await importOpen(page, raw);
    field = await explorer(page);
    await expect(field.getByRole("region", { name: "Linked A/B field views" })).toContainText("Both scientific sources verified");
    await context!.close(); context = null;

    // Restart the real browser process, preserving only its own persisted profile.
    page = await start(destinationProfile);
    panel = await projects(page);
    await panel.getByTestId(`project-open-saved-${exported.project.identity.id}`).click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened");
    field = await explorer(page); pair = field.getByRole("region", { name: "Linked A/B field views" });
    await expect(pair).toContainText("Both scientific sources verified");
    await expect(pair.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    comparison = field.getByTestId("gf18-field-comparison");
    await expect(comparison.getByLabel("Points per axis")).toHaveValue("5");
    await comparison.locator("details").filter({ hasText: "Saved comparisons (1)" }).locator("summary").click();
    await expect(comparison).toContainText("current");
    const returned = parseProjectPackage(await downloadPackage(page));
    expect(returned.project.workspace.entries.filter(entry => entry.module === "vector3d").map(entry => entry.checkpoint)).toEqual(expectedFields);
    expect(returned.project.workspace.results).toEqual(exported.project.workspace.results);
    expect(returned.project.workspace.scientificSelections).toEqual(exported.project.workspace.scientificSelections);
    expect(returned.resources.sidecars().filter(item => item.kind.startsWith("scientific-"))).toEqual(expectedSources);

    // Invalid package preview must not replace the currently open Project.
    const activeBefore = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    for (const mode of ["missing", "corrupt"]) {
      const damaged = JSON.parse(raw), index = damaged.resources.findIndex((item: { kind: string }) => item.kind === "scientific-component");
      if (mode === "missing") damaged.resources.splice(index, 1);
      else { const bytes = Buffer.from(damaged.resources[index].data, "base64"); bytes[0] ^= 1; damaged.resources[index].data = bytes.toString("base64"); }
      panel = await projects(page);
      await panel.getByTestId("project-import-file").setInputFiles({ name: `${mode}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(damaged)) });
      await expect(panel.getByTestId("project-message")).toContainText(mode === "missing" ? /import rejected:.*missing/i : /import rejected:.*checksum/i);
      expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(activeBefore);
    }

    for (const mode of ["corrupt", "missing"]) {
      await page.evaluate(async ({ id, mode }) => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("math3d.project-resources.v1", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result, transaction = db.transaction("projects", "readwrite"), store = transaction.objectStore("projects"), get = store.get(id);
            get.onsuccess = () => {
              const record = get.result, index = record.resources.findIndex((item: { kind: string }) => item.kind === "scientific-component");
              if (mode === "missing") record.resources.splice(index, 1);
              else record.resources[index].bytes[0] ^= 1;
              store.put(record);
            };
            transaction.oncomplete = () => { db.close(); resolve(); };
            transaction.onabort = () => { db.close(); reject(transaction.error); };
          };
        });
      }, { id: exported.project.identity.id, mode });
      await context!.close(); context = null;
      page = await start(destinationProfile); panel = await projects(page);
      const ownerBefore = await page.getByTestId("app-shell").getAttribute("data-project-document-id");
      await panel.getByTestId(`project-open-saved-${exported.project.identity.id}`).click();
      await expect(panel.getByTestId("project-message")).toContainText(/missing|checksum|scientific field unavailable/i);
      expect(await page.getByTestId("app-shell").getAttribute("data-project-document-id")).toBe(ownerBefore);
      await expect(page.getByRole("img", { name: /^magnitude map/ })).toHaveCount(0);
      await importOpen(page, raw);
      field = await explorer(page); pair = field.getByRole("region", { name: "Linked A/B field views" });
      await expect(pair).toContainText("Both scientific sources verified");
      await expect(pair.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    }
    await page.screenshot({ path: test.info().outputPath("portable-scientific-browser.png"), fullPage: true });
  } finally { await closeContext(); await rm(root, { recursive: true, force: true }); }
});
