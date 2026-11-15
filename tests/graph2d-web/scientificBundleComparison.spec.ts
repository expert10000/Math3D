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

for (const { format, offset } of [{ format: "folder", offset: .5 }, { format: "zip", offset: .5 },
  { format: "zip", offset: 0 }] as const) test(`two scientific ${format} imports, difference ${offset}, share one portable Project and survive cold reopen`, async ({ baseURL }) => {
  test.setTimeout(300_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-two-bundles-"));
  const aFiles = browserScientificBundle({ title: "Run A" });
  const bFiles = browserScientificBundle({ title: "Run B", offset });
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
    const initialField = await explorer(page);
    await initialField.getByRole("button", { name: "Save field to Project", exact: true }).click();
    panel = await projects(page);
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
    // Finish with the second imported run as A: recovery must not choose the original A.
    await comparison.getByLabel("Dataset A", { exact: true }).selectOption(b.expected.id);
    comparison = field.getByTestId("gf18-field-comparison");
    await comparison.getByLabel("Second saved field").selectOption(a.expected.id);
    await comparison.getByRole("button", { name: "Show linked A/B views", exact: true }).click();
    const pair = field.getByRole("region", { name: "Linked A/B field views" });
    await expect(pair).toContainText("Both scientific sources verified");
    await pair.getByRole("region", { name: "Pinned baseline B" }).getByRole("img", { name: /^magnitude map/ })
      .locator('rect[style*="crosshair"]').nth(200).click();
    await expect(pair.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    await pair.getByLabel("Show A−B difference", { exact: true }).check();
    const delta = pair.getByTestId("field-difference-view");
    await expect(delta).toBeVisible();
    const expectDifference = async (root: Page | ReturnType<Page["getByRole"]>) => {
      const cells = root.locator('[data-difference-cell]');
      await expect(cells.first()).toBeVisible();
      const values = await cells.evaluateAll(elements => elements.map(element => Number(element.getAttribute("data-value"))));
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) expect(value).toBeCloseTo(offset, 10);
    };
    await expectDifference(delta);
    // Probe selection is shared in either direction, including keyboard access on Δ.
    const probe = pair.getByRole("table", { name: "A/B difference probe" });
    const originalProbe = await probe.locator("caption").textContent();
    await expect(pair.getByLabel("Difference channel", { exact: true })).toBeEnabled();
    await delta.locator('[data-difference-cell="10-10"]').click();
    await expect.poll(() => probe.locator("caption").textContent()).not.toBe(originalProbe);
    await expect(probe.locator('[data-probe-quantity="p"][data-probe-source="delta"]')).toHaveText(offset.toPrecision(6));
    await expect(probe.locator('[data-probe-quantity="norm"][data-probe-source="delta"]')).toHaveText(offset.toPrecision(6));
    await expect(pair.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    const clickedProbe = await probe.locator("caption").textContent();
    await expect(pair.getByLabel("Difference channel", { exact: true })).toBeEnabled();
    await delta.getByRole("img").focus(); await delta.getByRole("img").press("ArrowRight");
    await expect.poll(() => probe.locator("caption").textContent()).not.toBe(clickedProbe);
    await expect(delta.getByTestId("field-difference-probe")).toBeVisible();
    const beforeProbe = await probe.locator("caption").textContent();
    await expect(pair.getByLabel("Difference channel", { exact: true })).toBeEnabled();
    await pair.getByRole("region", { name: "Live field A" }).locator('[data-probe-cell="5-5"]').click();
    await expect.poll(() => probe.locator("caption").textContent()).not.toBe(beforeProbe);
    await pair.getByLabel("Difference channel", { exact: true }).selectOption("p");
    await expect(delta).toContainText("signed p component"); await expectDifference(delta);
    await expect(delta.getByLabel(/^Difference color legend/)).toHaveAttribute("aria-label",
      `Difference color legend, ${(-offset).toPrecision(4)} to ${offset.toPrecision(4)} m/s`);
    await pair.getByLabel("Difference channel", { exact: true }).selectOption("q");
    await expect(delta.locator('[data-difference-cell]').first()).toHaveAttribute("data-value", "0");
    await pair.getByLabel("Difference channel", { exact: true }).selectOption("p");
    await comparison.getByLabel("Points per axis").selectOption("5");
    await comparison.getByRole("button", { name: "Compare fields", exact: true }).click();
    await expect(comparison).toContainText("Coverage 125/125");
    await comparison.getByRole("button", { name: "Save comparison in Project" }).click();
    await field.getByRole("button", { name: "Save field to Project", exact: true }).click();
    panel = await projects(page); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const raw = await exported(page), packageBefore = parseProjectPackage(raw);
    expect(packageBefore.project.identity.id).toBe(ownerId);
    expect(packageBefore.resources.sidecars().filter(item => item.kind.startsWith("scientific-"))).toHaveLength(offset ? 6 : 5);
    expect(packageBefore.project.workspace.scientificSelections!.length).toBeGreaterThan(0);
    const result = packageBefore.project.workspace.results.find(item => item.provenance.operation.type === VECTOR_FIELD3D_COMPARISON_RESULT_TYPE);
    expect(result).toBeDefined();
    expect((result!.summary.vectorDifference as { rms: number }).rms).toBeCloseTo(offset, 10);
    const firstSource = packageBefore.project.workspace.entries.find(entry => entry.expected.id === a.expected.id)!.checkpoint;
    const secondSource = packageBefore.project.workspace.entries.find(entry => entry.expected.id === b.expected.id)!.checkpoint;
    if (firstSource.format !== "math3d.vector-field3d-document" || secondSource.format !== "math3d.vector-field3d-document" ||
        firstSource.source.field.kind !== "scientific-bundle" || secondSource.source.field.kind !== "scientific-bundle") throw new Error("Wrong sources");
    expect(secondSource.identity).toEqual(b.expected);
    expect(secondSource.workspace?.explorer?.differenceView).toEqual({ visible: true, channel: "p" });
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
    await expect(comparison.getByLabel("Dataset A", { exact: true })).toHaveValue(b.expected.id);
    await expect(comparison.getByLabel("Second saved field")).toHaveValue(a.expected.id);
    await expect(field.getByRole("region", { name: "Linked A/B field views" })).toContainText("Both scientific sources verified");
    await expect(field.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    const reopenedPair = field.getByRole("region", { name: "Linked A/B field views" });
    await expect(reopenedPair.getByLabel("Show A−B difference", { exact: true })).toBeChecked();
    await expect(reopenedPair.getByLabel("Difference channel", { exact: true })).toHaveValue("p");
    await expectDifference(reopenedPair.getByTestId("field-difference-view"));
    await expect(reopenedPair.getByRole("table", { name: "A/B difference probe" })
      .locator('[data-probe-quantity="p"][data-probe-source="delta"]')).toHaveText(offset.toPrecision(6));
    await comparison.locator("details").filter({ hasText: "Saved comparisons (1)" }).locator("summary").click();
    await expect(comparison).toContainText("current");
    const returned = parseProjectPackage(await exported(page));
    expect(returned.project.workspace.entries).toEqual(packageBefore.project.workspace.entries);
    expect(returned.project.workspace.results).toEqual(packageBefore.project.workspace.results);
    expect(returned.project.workspace.scientificSelections).toEqual(packageBefore.project.workspace.scientificSelections);
    expect(returned.resources.sidecars()).toEqual(packageBefore.resources.sidecars());
    await explorer(page);
    await expect(reopenedPair).toBeVisible();
    await expect(reopenedPair).toContainText("Both scientific sources verified");
    await expectDifference(reopenedPair.getByTestId("field-difference-view"));
    await page.screenshot({ path: test.info().outputPath(`two-scientific-${format}-difference-${offset}-browser.png`), fullPage: true });
    if (format === "zip" && offset === .5) for (const mode of ["corrupt", "missing"]) {
      const activeBefore = await active(page);
      const removed = await page.evaluate(async ({ id, mode }) => new Promise<{
        index: number; resource: { kind: string; id: string; bytes: number[] } }>((resolve, reject) => {
        const request = indexedDB.open("math3d.project-resources.v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction("projects", "readwrite"), store = tx.objectStore("projects"), get = store.get(id);
          let saved: { index: number; resource: { kind: string; id: string; bytes: number[] } };
          get.onsuccess = () => {
            const record = get.result, index = record.resources.findIndex((item: { kind: string }) => item.kind === "scientific-component");
            const resource = record.resources[index];
            saved = { index, resource: { ...resource, bytes: Array.from(resource.bytes) } };
            if (mode === "missing") record.resources.splice(index, 1); else resource.bytes[0] ^= 1;
            store.put(record);
          };
          tx.oncomplete = () => { db.close(); resolve(saved); };
          tx.onabort = () => { db.close(); reject(tx.error); };
        };
      }), { id: ownerId, mode });
      await reopenedPair.getByRole("button", { name: "Reverify A/B sources" }).click();
      await expect(reopenedPair).toContainText("Scientific views withheld");
      await expect(reopenedPair.getByTestId("field-difference-view")).toHaveCount(0);
      await expect(reopenedPair.getByRole("table", { name: "A/B difference probe" })).toHaveCount(0);
      await expect(reopenedPair.getByRole("img")).toHaveCount(0);
      expect(await active(page)).toBe(activeBefore);
      await page.evaluate(async ({ id, removed, mode }) => new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("math3d.project-resources.v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction("projects", "readwrite"), store = tx.objectStore("projects"), get = store.get(id);
          get.onsuccess = () => {
            const record = get.result, resource = { ...removed.resource, bytes: new Uint8Array(removed.resource.bytes) };
            if (mode === "missing") record.resources.splice(removed.index, 0, resource); else record.resources[removed.index] = resource;
            store.put(record);
          };
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
        };
      }), { id: ownerId, removed, mode });
      await reopenedPair.getByRole("button", { name: "Reverify A/B sources" }).click();
      await expect(reopenedPair).toContainText("Both scientific sources verified");
      await expectDifference(reopenedPair.getByTestId("field-difference-view"));
    }
  } finally { await closeContext(); await rm(root, { recursive: true, force: true }); }
});
