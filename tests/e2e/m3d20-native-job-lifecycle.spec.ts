import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls } from "./helpers/projectFreeze";
const core = require(resolve("packages/core/src/index.ts"));

type HeldResponse = { armed: boolean; requestId: string | null; bytes: number; released: number; release: (() => void) | null };
declare global { interface Window { __m3d20VolumeResponse: HeldResponse } }

// Hold one genuine result, not its computation or any application state. The
// original listener receives the original MessageEvent after the source edit.
const installResponseHold = () => {
  const state: HeldResponse = { armed: false, requestId: null, bytes: 0, released: 0, release: null };
  window.__m3d20VolumeResponse = state;
  const add = Worker.prototype.addEventListener;
  const remove = Worker.prototype.removeEventListener;
  const wrappers = new WeakMap<Worker, Map<EventListenerOrEventListenerObject, EventListener>>();
  Worker.prototype.addEventListener = function(this: Worker, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (!listener) return;
    if (type !== "message") return add.call(this, type, listener, options);
    const invoke = (event: Event) => typeof listener === "function" ? listener.call(this, event) : listener.handleEvent(event);
    const wrapped: EventListener = event => {
      const message = (event as MessageEvent).data;
      if (state.armed && message?.type === "result" && String(message.requestId).startsWith("volume-isosurface:")) {
        state.armed = false; state.requestId = message.requestId;
        state.bytes = (message.output?.positions?.byteLength ?? 0) + (message.output?.indices?.byteLength ?? 0);
        state.release = () => { state.release = null; state.released++; invoke(event); };
      } else invoke(event);
    };
    let map = wrappers.get(this); if (!map) { map = new Map(); wrappers.set(this, map); }
    map.set(listener, wrapped); return add.call(this, type, wrapped, options);
  } as typeof Worker.prototype.addEventListener;
  Worker.prototype.removeEventListener = function(this: Worker, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    if (!listener) return;
    const wrapped = wrappers.get(this)?.get(listener);
    wrappers.get(this)?.delete(listener);
    return remove.call(this, type, wrapped ?? listener, options);
  } as typeof Worker.prototype.removeEventListener;
};

const fullProjectPanel = async (page: Page) => {
  const controls = freezeControls(page); await controls.show();
  if (await controls.panel.getAttribute("data-project-placement")) await controls.panel.getByTestId("project-gallery-layout-toggle").click();
  if (await controls.panel.locator(".project-gallery-layout-detail").count()) await controls.panel.getByTestId("project-detail-toggle").click();
  return controls;
};
const readProject = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
const geometry = async (page: Page) => {
  await page.getByTestId("shared-inspector-tab-geometry").click();
  const inspector = page.getByTestId("volume-inspector");
  await inspector.getByLabel("Geometry view").selectOption("derived");
  return inspector;
};

test("M3D20 AC04 native Project rejects a late Volume Job and cold-reopens historical evidence", async () => {
  test.setTimeout(300_000);
  const volume = core.createVolumeDocument({ stableKey: "native-job-volume", metadata: { title: "Native Job sphere" }, source: {
    representation: "custom-scalar-field", recipe: { kind: "custom-field", expression: "x*x+y*y+z*z-1", parameters: {} },
    spatial: { dimensions: [24,24,24], origin: [-1.5,-1.5,-1.5], spacing: [3/23,3/23,3/23],
      direction: [1,0,0,0,1,0,0,0,1], centering: "point", coordinateSystem: "world", positionUnits: "m", valueUnits: "unitless" },
    dependencies: [], payload: null,
  } });
  // A legal v1 metadata-only reference deliberately has no bytes or source file.
  const missing = { handle: { artifactId: "native-ui-unavailable", kind: "binary", role: "external-evidence" }, contentHash: core.structuralHash("offline evidence"), byteLength: 17 };
  const fixture = core.createMath3DProject(core.createMixedWorkspaceDocument({
    entries: [{ module: "volume", checkpoint: volume, expected: volume.identity, replay: null }], activeDocumentIds: [volume.identity.id],
    results: [], artifacts: [missing], relations: [], constructions: [], committedSelection: null,
  }), { stableKey: "native-job-project", title: "Native Job lifecycle" });
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await ctx.page.addInitScript(installResponseHold); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, controls = freezeControls(page);
    await controls.importOpen(core.serializeMath3DProject(fixture)); await controls.open(volume.identity.id);
    await expect(page.getByTestId("project-volume-editor")).toBeVisible();
    const toolbar = page.getByTestId("volume-detailed-controls");
    await toolbar.getByTestId("volume-apply-isosurface").click();
    let inspector = await geometry(page);
    const current = inspector.getByTestId("volume-derived-result-current");
    await expect(current).toHaveCount(1); await expect(current.getByTestId("volume-derived-kernel-lineage")).toContainText("current");
    await current.getByTestId("volume-derived-open-analysis").click();
    await expect(page.getByTestId("volume-handoff-return")).toBeVisible();
    await page.getByTestId("volume-handoff-return").click();
    await expect(page.getByTestId("workspace-nav-volume")).toHaveAttribute("aria-pressed", "true");
    await controls.save(); const baseline = await readProject(page); await controls.hide();
    const historical = baseline.workspace.results.filter((item: any) => item.provenance.operation.type === "volume.extract.isosurface");
    expect(historical).toHaveLength(1); expect(historical[0].artifacts.length).toBeGreaterThan(0);
    const originalSource = baseline.workspace.entries.find((item: any) => item.expected.id === volume.identity.id).expected;
    inspector = await geometry(page); await expect(inspector.getByTestId("volume-derived-result-current")).toHaveCount(1);
    await page.evaluate(() => { window.__m3d20VolumeResponse.armed = true; });
    const smooth = toolbar.getByLabel("Smooth isosurface"); await smooth.setChecked(!await smooth.isChecked());
    await toolbar.getByTestId("volume-apply-isosurface").click();
    await expect.poll(() => page.evaluate(() => window.__m3d20VolumeResponse.requestId)).not.toBeNull();
    const held = await page.evaluate(() => { const s = window.__m3d20VolumeResponse; return { requestId: s.requestId!, bytes: s.bytes }; });
    expect(held.bytes).toBeGreaterThan(0);
    await page.getByTestId("top-compute-center-button").click();
    const center = page.getByTestId("compute-center"), job = center.getByTestId(`compute-job-${held.requestId}`);
    await expect(job).toContainText("Running"); await expect(job).not.toContainText("Completed");
    await center.getByRole("button", { name: "Close", exact: true }).click();
    await expect(inspector.getByTestId("volume-derived-result-current")).toHaveCount(1);
    await page.getByTestId("project-volume-expression").fill("x*x+y*y+z*z-0.64");
    await page.getByTestId("project-volume-apply").click();
    inspector = await geometry(page);
    const stale = inspector.getByTestId("volume-derived-result-stale");
    await expect(stale).toHaveCount(1); await expect(stale).toContainText("Metrics withheld");
    await expect(stale.getByTestId("volume-derived-send-mesh")).toBeDisabled();
    await page.evaluate(() => { const s = window.__m3d20VolumeResponse; if (!s.release) throw Error("Missing genuine held response"); s.release(); });
    await page.getByTestId("top-compute-center-button").click();
    await expect(job).toContainText("Source changed"); await expect(job).not.toContainText("Completed");
    const rejectedJobText = await job.innerText();
    await center.getByRole("button", { name: "Close", exact: true }).click();
    expect(await page.evaluate(() => window.__m3d20VolumeResponse.released)).toBe(1);
    await expect(inspector.getByTestId("volume-derived-result-current")).toHaveCount(0);
    await controls.save(); const saved = await readProject(page);
    const edited = saved.workspace.entries.find((item: any) => item.expected.id === volume.identity.id).expected;
    expect(edited.revision).toBeGreaterThan(originalSource.revision); expect(edited.structuralHash).not.toBe(originalSource.structuralHash);
    expect(saved.identity.id).toBe(fixture.identity.id);
    expect(saved.workspace.results.filter((item: any) => item.provenance.operation.type === "volume.extract.isosurface")).toEqual(historical);
    expect(saved.workspace.artifacts).toEqual(expect.arrayContaining(baseline.workspace.artifacts));
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    controls = await fullProjectPanel(page); await controls.panel.getByTestId(`project-open-saved-${saved.identity.id}`).click();
    await expect.poll(async () => (await readProject(page))?.identity?.id).toBe(saved.identity.id);
    const reopened = await readProject(page);
    expect(reopened.identity).toEqual(saved.identity);
    expect(reopened.workspace.entries.map((item: any) => item.expected)).toEqual(saved.workspace.entries.map((item: any) => item.expected));
    expect(reopened.workspace.results).toEqual(saved.workspace.results); expect(reopened.workspace.artifacts).toEqual(saved.workspace.artifacts);
    expect(reopened.workspace.committedSelection).toEqual(saved.workspace.committedSelection);
    controls = await fullProjectPanel(page); await controls.panel.getByTestId("project-inspect-relations").click();
    await expect(controls.panel.getByTestId(`project-result-status-${historical[0].resultId}`)).toContainText("source stale");
    await expect(controls.panel.getByTestId(`project-artifact-${missing.handle.artifactId}`)).toContainText("missing or unverified");
    writeFileSync(test.info().outputPath("native-job-receipt.json"), JSON.stringify({ sourceCommit: process.env.TEST_SOURCE_SHA,
      projectId: saved.identity.id, originalSource, editedSource: edited, historicalResults: historical,
      held, rejectedJobText, savedIdentity: saved.identity, reopenedIdentity: reopened.identity, missingArtifact: missing,
      savedDocumentIdentities: saved.workspace.entries.map((item: any) => item.expected), reopenedDocumentIdentities: reopened.workspace.entries.map((item: any) => item.expected) }, null, 2));
    writeFileSync(test.info().outputPath("native-job-before.json"), JSON.stringify(baseline));
    writeFileSync(test.info().outputPath("native-job-saved.json"), JSON.stringify(saved));
    writeFileSync(test.info().outputPath("native-job-reopened.json"), JSON.stringify(reopened));
  } finally { await closeSurfaceApp(ctx); }
});
