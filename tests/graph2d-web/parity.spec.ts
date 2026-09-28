import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
const { graph2DParityCorpus } = require(resolve("tests/fixtures/graph2dParityCorpus.ts"));
const { sampleGraph2DScene, createGraph2DWorkspaceProject, createWorkspaceProjectHandoff, serializeWorkspaceProjectHandoff } = require(resolve("packages/core/src/index.ts"));

function comparePortable(actual: unknown, expected: unknown, path = "series") {
  if (typeof expected === "number") { expect(typeof actual, path).toBe("number");
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(Math.max(1e-8, Math.abs(expected) * 1e-12)); return; }
  if (Array.isArray(expected)) { expect(Array.isArray(actual), path).toBe(true); expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((value, index) => comparePortable((actual as unknown[])[index], value, `${path}[${index}]`)); return; }
  if (expected && typeof expected === "object") { expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) comparePortable((actual as Record<string, unknown>)[key], value, `${path}.${key}`); return; }
  expect(actual, path).toEqual(expected);
}

test("G2D34 browser worker numerical corpus and rendered visual geometry", async ({ page }, info) => {
  await page.route("**/api/worker/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Optional backend unavailable in Graph corpus run."}' }));
  await page.addInitScript(() => {
    const NativeWorker = window.Worker, state = { url: "", active: 0 };
    (window as unknown as { graphCorpusWorkers: typeof state }).graphCorpusWorkers = state;
    window.Worker = class extends NativeWorker {
      tracked = false; stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options);
        this.tracked = String(url).includes("graph2dSamplingWorker");
        if (this.tracked) { state.url = String(url); state.active++; } }
      terminate() { if (this.tracked && !this.stopped) { state.active--; this.stopped = true; } super.terminate(); }
    };
  });
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload(); await page.getByTestId("workspace-nav-graphs").click();
  const functions = page.getByLabel("Graph functions");
  await functions.getByRole("button", { name: "Add function", exact: true }).click();
  await functions.getByRole("button", { name: "Save function", exact: true }).click();
  await expect(page.locator('[data-graph2d-path="function_1"]')).toHaveAttribute("d", /[ML]/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { graphCorpusWorkers: { active: number } }).graphCorpusWorkers.active)).toBe(0);
  const workerUrl = await page.evaluate(() => (window as unknown as { graphCorpusWorkers: { url: string } }).graphCorpusWorkers.url);
  expect(workerUrl).toContain("graph2dSamplingWorker");
  const runtime = await page.evaluate(() => ({ locale: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
  expect(runtime.locale).toBe(info.project.use.locale); expect(runtime.timezone).toBe(info.project.use.timezoneId);
  for (const fixture of graph2DParityCorpus()) {
    const expected = sampleGraph2DScene(fixture.request);
    const actual = await page.evaluate(async ({ url, request }) => await new Promise((resolveResult, reject) => {
      const worker = new Worker(url, { type: "module" });
      const timeout = setTimeout(() => { worker.terminate(); reject(new Error("Corpus worker timed out")); }, 5000);
      worker.onmessage = (event) => { clearTimeout(timeout); worker.terminate();
        if (event.data.error) reject(new Error(event.data.error)); else resolveResult(event.data.series); };
      worker.onerror = () => { clearTimeout(timeout); worker.terminate(); reject(new Error("Corpus worker failed")); };
      worker.postMessage({ jobId: "corpus", request });
    }), { url: workerUrl, request: fixture.request });
    comparePortable(actual, expected, fixture.id);
    // Load the same canonical fixture into the shipped browser UI, including its external table sidecar.
    await page.evaluate((tables) => { for (const [id, rows] of Object.entries(tables)) localStorage.setItem(`math3d.graph2d.table.${id}`, JSON.stringify(rows)); }, fixture.request.pointTables);
    const raw = serializeWorkspaceProjectHandoff(createWorkspaceProjectHandoff(createGraph2DWorkspaceProject(fixture.request.document), {
      producer: { platform: "desktop", name: "Graph2D corpus", version: "1" } }));
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("graph2d-handoff-import").setInputFiles({ name: `${fixture.id}.json`, mimeType: "application/json", buffer: Buffer.from(raw) });
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Opened Graph handoff");
    await page.getByTestId("kernel-workspace-toggle").click();
    const id = fixture.request.document.source.objects[0].id, path = page.locator(`[data-graph2d-path="${id}"]`).first();
    await expect(path).toHaveAttribute("d", /[ML]/);
    expect(await path.getAttribute("d")).not.toMatch(/NaN|Infinity/);
    if (fixture.oracle === "strict-disk") { await expect(page.locator(`[data-graph2d-region="${id}"]`)).toHaveAttribute("d", /Z/);
      await expect(path).toHaveAttribute("data-boundary-strict", "true"); }
    if (fixture.oracle === "jump") await expect(page.locator('[data-endpoint-open="true"]')).toHaveCount(1);
    if (fixture.oracle === "data-gap") await expect(page.locator('[data-row-id="row_3"]')).toHaveCount(0);
    await page.getByTestId("main-viewer").screenshot({ path: `output/graph2d-parity/${info.project.name}-${fixture.id}.png` });
    await expect.poll(() => page.evaluate(() => (window as unknown as { graphCorpusWorkers: { active: number } }).graphCorpusWorkers.active)).toBe(0);
  }
  // Cancel a dispatched valid request before publication, releasing its worker ownership.
  await page.evaluate(({ url, request }) => { const cancelled = new Worker(url, { type: "module" });
    cancelled.postMessage({ jobId: "cancelled", request }); cancelled.terminate(); }, { url: workerUrl, request: graph2DParityCorpus()[0].request });
  await expect.poll(() => page.evaluate(() => (window as unknown as { graphCorpusWorkers: { active: number } }).graphCorpusWorkers.active)).toBe(0);
});
