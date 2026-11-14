import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseMath3DProject, VECTOR_FIELD3D_COMPARISON_RESULT_TYPE, type ScientificBundleFile } from "@math3d/core";
import { parseProjectPackage } from "../../renderer/src/projects/projectResources";
import { browserScientificBundle } from "../fixtures/graph-field/browserScientificBundle";
const { zipSync } = createRequire(resolve("renderer/package.json"))("fflate");

async function projects(page: Page) {
  const panel = page.getByTestId("project-explorer-panel");
  if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click();
  await expect(panel).toBeVisible(); return panel;
}
async function transfer(page: Page) {
  const panel = await projects(page), header = panel.getByTestId("project-explorer-header");
  if (!await panel.getByTestId("scientific-import-destination").isVisible()) {
    if (!await header.getByText("More", { exact: true }).isVisible()) {
      const details = header.getByTestId("project-detail-toggle");
      if (!await details.isVisible()) await header.getByTestId("project-gallery-layout-toggle").click();
      if (!await header.getByText("More", { exact: true }).isVisible()) await details.click();
    }
    await header.getByText("More", { exact: true }).click();
    await header.getByRole("button", { name: "Import / export" }).click();
  }
  return panel;
}
async function explorer(page: Page) {
  const panel = page.getByTestId("project-explorer-panel");
  if (await panel.isVisible()) await page.getByTestId("projects-toggle").click();
  await page.getByTestId("workspace-nav-graphs").click();
  const field = page.getByRole("region", { name: "Scientific Field Explorer" });
  if (!await field.isVisible()) {
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer", exact: true }).click();
  }
  await expect(field).toBeVisible();
  await field.getByRole("button", { name: "Analyze", exact: true }).click();
  return field;
}
async function exported(page: Page) {
  const panel = await transfer(page), pending = page.waitForEvent("download");
  await panel.getByTestId("project-export-resources").click();
  return readFile((await (await pending).path())!, "utf8");
}

for (const format of ["folder", "zip"] as const) test(`two scientific ${format} imports share one portable Project and survive cold reopen`, async ({ baseURL }) => {
  test.setTimeout(300_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-two-bundles-"));
  const aFiles = browserScientificBundle({ title: "Run A" });
  const bFiles = browserScientificBundle({ title: "Run B", offset: 0.5 });
  let context: BrowserContext | null = null, serial = 0;
  const closeContext = async () => { if (context) await context.close(); };
  const start = async (profile: string) => {
    context = await chromium.launchPersistentContext(profile, { headless: true, baseURL,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      viewport: { width: 1440, height: 1000 }, locale: String(test.info().project.use.locale ?? "en-US"),
      timezoneId: String(test.info().project.use.timezoneId ?? "UTC"),
      args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    await context.addInitScript(() => { try { localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); } catch { /* about:blank */ } });
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(baseURL!);
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    expect(await page.evaluate(() => !!window.scientificScenes)).toBe(false);
    return page;
  };
  const upload = async (page: Page, files: ScientificBundleFile[], destination: "new" | "current") => {
    const panel = await transfer(page);
    await panel.getByTestId("scientific-import-destination").selectOption(destination);
    const input = panel.getByTestId(`scientific-import-${format}`);
    if (format === "zip") await input.setInputFiles({ name: "run.sscene.zip", mimeType: "application/zip",
      buffer: Buffer.from(zipSync(Object.fromEntries(files.map(file => [file.path, file.bytes])))) });
    else {
      const folder = join(root, `upload-${serial++}`, "run.sscene"); await mkdir(folder, { recursive: true });
      for (const file of files) await writeFile(join(folder, file.path.split("/").at(-1)!), file.bytes);
      await input.setInputFiles(folder);
    }
    return panel;
  };
  const active = (page: Page) => page.evaluate(() => localStorage.getItem("math3d.project.v1")!);
  try {
    let page = await start(join(root, "source"));
    let panel = await upload(page, aFiles, "new");
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const original = parseMath3DProject(await active(page)), a = original.workspace.entries.find(entry => entry.module === "vector3d")!;
    const ownerId = original.identity.id;
    // A rejected second upload cannot replace the active Project, its library entry or archive.
    const before = await active(page);
    const archivedBefore = await page.evaluate(async id => new Promise<string>((resolve, reject) => {
      const request = indexedDB.open("math3d.project-resources.v1", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, get = db.transaction("projects").objectStore("projects").get(id);
        get.onsuccess = () => { resolve(JSON.stringify(get.result)); db.close(); }; get.onerror = () => reject(get.error); };
    }), ownerId);
    for (const mode of ["missing", "corrupt"]) {
      const files = bFiles.map(file => ({ ...file, bytes: file.bytes.slice() }));
      if (mode === "missing") files.splice(1, 1); else files[1]!.bytes[0] ^= 1;
      panel = await upload(page, files, "current");
      await expect(panel.getByTestId("project-message")).toContainText(mode === "missing" ? /import rejected:.*missing/i : /import rejected:.*checksum/i);
      expect(await active(page)).toBe(before);
    }
    // Another tab's saved edit must win over an older pending import preview.
    panel = await upload(page, bFiles, "current");
    await expect(panel.getByTestId("project-import-open")).toHaveText("Add to current Project");
    const savedBytes = await page.evaluate(id => localStorage.getItem(`math3d.project.v1.payload.${id}`)!, ownerId);
    await page.evaluate(id => { const key = `math3d.project.v1.payload.${id}`;
      const changed = JSON.parse(localStorage.getItem(key)!); changed.metadata.title = "Saved in another tab";
      localStorage.setItem(key, JSON.stringify(changed)); }, ownerId);
    await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message")).toContainText(/Project changed|Saved project changed/i);
    expect(await active(page)).toBe(before);
    expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`math3d.project.v1.payload.${id}`)!).metadata.title, ownerId)).toBe("Saved in another tab");
    await panel.getByTestId("project-import-cancel").click();
    const archivedAfter = await page.evaluate(async id => new Promise<string>((resolve, reject) => {
      const request = indexedDB.open("math3d.project-resources.v1", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, get = db.transaction("projects").objectStore("projects").get(id);
        get.onsuccess = () => { resolve(JSON.stringify(get.result)); db.close(); }; get.onerror = () => reject(get.error); };
    }), ownerId);
    expect(archivedAfter).toBe(archivedBefore);
    await page.evaluate(({ id, bytes }) => localStorage.setItem(`math3d.project.v1.payload.${id}`, bytes), { id: ownerId, bytes: savedBytes });

    panel = await upload(page, bFiles, "current");
    await expect(panel.getByTestId("project-import-preview")).toContainText("Scientific data for current Project");
    expect(await active(page)).toBe(before);
    await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message")).toContainText("Added verified scientific datasets");
    const combined = parseMath3DProject(await active(page));
    expect(combined.identity.id).toBe(ownerId);
    expect(combined.workspace.entries.find(entry => entry.expected.id === a.expected.id)).toEqual(a);
    const b = combined.workspace.entries.find(entry => entry.module === "vector3d" && entry.expected.id !== a.expected.id)!;
    let field = await explorer(page), comparison = field.getByTestId("gf18-field-comparison");
    await comparison.getByLabel("Dataset A", { exact: true }).selectOption(b.expected.id);
    field = page.getByRole("region", { name: "Scientific Field Explorer" });
    comparison = field.getByTestId("gf18-field-comparison");
    await expect(comparison.getByLabel("Dataset A", { exact: true })).toHaveValue(b.expected.id);
    await comparison.getByLabel("Dataset A", { exact: true }).selectOption(a.expected.id);
    comparison = field.getByTestId("gf18-field-comparison");
    await comparison.getByLabel("Second saved field").selectOption(b.expected.id);
    await comparison.getByRole("button", { name: "Show linked A/B views", exact: true }).click();
    const pair = field.getByRole("region", { name: "Linked A/B field views" });
    await expect(pair).toContainText("Both scientific sources verified");
    await pair.getByRole("region", { name: "Pinned baseline B" }).getByRole("img", { name: /^magnitude map/ })
      .locator('rect[style*="crosshair"]').nth(200).click();
    await expect(pair.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    await comparison.getByLabel("Points per axis").selectOption("5");
    await comparison.getByRole("button", { name: "Compare fields", exact: true }).click();
    await expect(comparison).toContainText("Coverage 125/125");
    await comparison.getByRole("button", { name: "Save comparison in Project" }).click();
    await field.getByRole("button", { name: "Save field to Project", exact: true }).click();
    panel = await projects(page); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const raw = await exported(page), packageBefore = parseProjectPackage(raw);
    expect(packageBefore.project.identity.id).toBe(ownerId);
    expect(packageBefore.resources.sidecars().filter(item => item.kind.startsWith("scientific-"))).toHaveLength(6);
    expect(packageBefore.project.workspace.scientificSelections!.length).toBeGreaterThan(0);
    const result = packageBefore.project.workspace.results.find(item => item.provenance.operation.type === VECTOR_FIELD3D_COMPARISON_RESULT_TYPE);
    expect(result).toBeDefined();
    expect((result!.summary.vectorDifference as { rms: number }).rms).toBeCloseTo(0.5, 10);
    const firstSource = packageBefore.project.workspace.entries.find(entry => entry.expected.id === a.expected.id)!.checkpoint;
    const secondSource = packageBefore.project.workspace.entries.find(entry => entry.expected.id === b.expected.id)!.checkpoint;
    if (firstSource.format !== "math3d.vector-field3d-document" || secondSource.format !== "math3d.vector-field3d-document" ||
        firstSource.source.field.kind !== "scientific-bundle" || secondSource.source.field.kind !== "scientific-bundle") throw new Error("Wrong sources");
    expect(firstSource.source.field.references[0].sceneFingerprint).not.toBe(secondSource.source.field.references[0].sceneFingerprint);
    // A valid preview cancelled after comparison also keeps saved results and selections intact.
    panel = await upload(page, bFiles, "current");
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-cancel").click();
    expect(parseProjectPackage(await exported(page)).project).toEqual(packageBefore.project);
    await context!.close(); context = null;

    const profile = join(root, "destination"); page = await start(profile);
    panel = await transfer(page);
    await panel.getByTestId("project-import-file").setInputFiles({ name: "two-runs.project.json", mimeType: "application/json", buffer: Buffer.from(raw) });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened");
    await context!.close(); context = null;
    page = await start(profile); panel = await projects(page);
    await panel.getByTestId(`project-open-saved-${ownerId}`).click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened");
    field = await explorer(page); comparison = field.getByTestId("gf18-field-comparison");
    await expect(field.getByRole("region", { name: "Linked A/B field views" })).toContainText("Both scientific sources verified");
    await expect(field.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    await comparison.locator("details").filter({ hasText: "Saved comparisons (1)" }).locator("summary").click();
    await expect(comparison).toContainText("current");
    const returned = parseProjectPackage(await exported(page));
    expect(returned.project.workspace.entries).toEqual(packageBefore.project.workspace.entries);
    expect(returned.project.workspace.results).toEqual(packageBefore.project.workspace.results);
    expect(returned.project.workspace.scientificSelections).toEqual(packageBefore.project.workspace.scientificSelections);
    expect(returned.resources.sidecars()).toEqual(packageBefore.resources.sidecars());
    await page.screenshot({ path: test.info().outputPath(`two-scientific-${format}-browser.png`), fullPage: true });
  } finally { await closeContext(); await rm(root, { recursive: true, force: true }); }
});
