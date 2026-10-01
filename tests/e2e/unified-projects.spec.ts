import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { runNamedProjectRoundTrip } from "./helpers/namedProjectRoundTrip";
const projectCore = require(resolve("packages/core/src/index.ts"));


test("PRJ14 restores Volume samples, source/history and historical provenance across a cold restart", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    const spatial = { dimensions: [3, 2, 2], origin: [4, -2, 1], spacing: [0.5, 2, 3], direction: [1,0,0,0,1,0,0,0,1], centering: "cell", coordinateSystem: "RAS", positionUnits: "mm", valueUnits: "density" };
    const first = projectCore.createVolumeDocument({ stableKey: "prj14-first", source: { representation: "analytic-scalar-field", recipe: { kind: "analytic-preset", presetId: "sphere", expression: "F = x^2 + y^2 + z^2 - R^2", parameters: { R: 2 }, annotation: "retain" }, spatial, dependencies: [], payload: { handle: "prj14-unverified-cache", byteLength: 48, scalarType: "float32", components: 1 } }, metadata: { title: "Saved sphere", analysisSettings: { untouched: 7 } } });
    const second = projectCore.createVolumeDocument({ stableKey: { legacyVolumeId: "custom-field" }, source: { representation: "custom-scalar-field", recipe: { kind: "custom-field", expression: "x+y+z+K", parameters: { K: 4 } }, spatial: { ...spatial, dimensions: [2,2,2], origin: [0,0,0], spacing: [1,1,1], centering: "point", positionUnits: "m" }, dependencies: [], payload: null }, metadata: { title: "Saved custom field" } });
    const docs = [first, second];
    const result = projectCore.createAnalysisResultEnvelope({ resultId: "prj14-historical", status: "numerical", provenance: { source: { documentId: first.identity.id, revision: first.identity.revision, structuralHash: first.identity.structuralHash, generation: first.identity.revision }, operation: { type: "volume.statistics", algorithm: "fixture", algorithmVersion: "1", parameters: {} }, numericContext: { tolerance: { absolute: 0.001 } }, engine: { name: "historical-offline-engine", version: "1" }, elapsedMs: 1 }, summary: { min: 13 }, warnings: [], diagnostics: [], artifacts: [] });
    const project = projectCore.createMath3DProject(projectCore.createMixedWorkspaceDocument({ entries: docs.map((document) => ({ module: "volume", checkpoint: document, expected: document.identity, replay: null })), activeDocumentIds: docs.map((document) => document.identity.id), constructions: [], results: [result], relations: [], artifacts: [], committedSelection: null }), { title: "Native Volume project", stableKey: "prj14-ui" });
    const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
    const open = async (index: number) => { await show(); await panel.getByTestId(`project-open-${docs[index].identity.id}`).click(); };
    const save = async () => { await show(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved"); return page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)); };
    const closePanel = async () => { if (await panel.isVisible()) await page.getByRole("button", { name: "Close project explorer" }).click(); };
    const range = async (expected: string) => {
      await closePanel(); await page.getByTestId("shared-inspector-tab-summary").click();
      await expect(page.getByTestId("volume-details-card")).toContainText(expected);
    };
    await show(); await panel.getByTestId("project-import-file").setInputFiles({ name: "volume.project.json", mimeType: "application/json", buffer: Buffer.from(projectCore.serializeMath3DProject(project)) });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
    await expect(page.getByTestId("project-volume-editor")).toContainText("Saved sphere");
    await range("13 … 41"); await expect(page.getByTestId("volume-details-card")).toContainText("mm / density");
    let saved = await save(); expect(saved.workspace.entries.map((entry: any) => entry.expected)).toEqual(docs.map((document) => document.identity));
    await closePanel();
    await page.getByTestId("project-volume-editor").locator("summary").click();
    expect(JSON.parse(await page.getByTestId("project-volume-spatial").inputValue())).toEqual(spatial);
    await page.getByTestId("project-volume-parameters").fill('{"R":3}'); await page.getByTestId("project-volume-apply").click();
    await range("8 … 36"); await page.getByTestId("project-volume-undo").click(); await range("13 … 41");
    await page.getByTestId("project-volume-redo").click(); await range("8 … 36");
    await open(1); await expect(page.getByTestId("project-volume-expression")).toHaveValue("x+y+z+K"); await range("4 … 7");
    await page.getByTestId("project-volume-editor").locator("summary").click();
    const editedSpatial = { ...second.source.spatial, dimensions: [3,2,2], origin: [2,0,0], spacing: [0.5,1,1], centering: "cell" };
    await page.getByTestId("project-volume-expression").fill("x*y+z+K"); await page.getByTestId("project-volume-spatial").fill(JSON.stringify(editedSpatial)); await page.getByTestId("project-volume-apply").click();
    await range("4 … 8"); await page.getByTestId("project-volume-undo").click(); await range("4 … 7"); await page.getByTestId("project-volume-redo").click();
    saved = await save(); const generations = saved.workspace.entries.map((entry: any) => entry.expected);
    expect(saved.workspace.results).toEqual([result]); expect(saved.workspace.entries[0].expected.id).toBe(first.identity.id);
    await panel.getByTestId(`project-inspect-${first.identity.id}`).click();
    await expect(panel.getByTestId(`project-result-status-${result.resultId}`)).toContainText("stale");
    await ctx.app.close(); ctx = await launchSurfaceApp({}, ctx.profileDir); page = ctx.page; panel = page.getByTestId("project-explorer-panel");
    await show(); await panel.getByTestId("project-view-saved").click(); await panel.getByTestId("project-restore-saved").click(); await panel.getByTestId("project-import-open").click();
    saved = await save(); expect(saved.workspace.entries.map((entry: any) => entry.expected)).toEqual(generations);
    await open(1); await range("4 … 8"); await page.getByTestId("project-volume-undo").click(); await expect(page.getByTestId("project-volume-expression")).toHaveValue("x+y+z+K");
    await page.getByTestId("project-volume-redo").click(); await page.getByTestId("project-volume-expression").fill("x+y+z+K+1"); await page.getByTestId("project-volume-apply").click(); await range("7 … 10");
    await page.getByTestId("project-volume-editor").locator("summary").click();
    await page.getByTestId("project-volume-spatial").fill(JSON.stringify({ ...editedSpatial, spacing: [0,1,1] })); await page.getByTestId("project-volume-apply").click(); await expect(page.getByRole("alert")).toContainText("different editor");
    await page.getByTestId("project-volume-spatial").fill(JSON.stringify(editedSpatial)); await page.getByTestId("project-volume-apply").click(); await expect(page.getByRole("alert")).toHaveCount(0);
    saved = await save(); expect(saved.workspace.results).toEqual([result]);
    const protectedBytes = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    for (const source of [{ ...first.source, representation: "dense-scalar-grid", recipe: { kind: "dense-grid" } }, { ...first.source, spatial: { ...spatial, direction: [0,-1,0,1,0,0,0,0,1] } }, { ...first.source, recipe: { ...first.source.recipe, expression: "__proto__(x)" } }]) {
      const document = projectCore.createVolumeDocument({ source, stableKey: "unsupported" });
      const unsupported = projectCore.createMath3DProject(projectCore.createMixedWorkspaceDocument({ ...project.workspace, entries: [{ module: "volume", checkpoint: document, expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id], results: [] }), { title: "Unsupported Volume", stableKey: "prj14-unsupported-project" });
      await panel.getByTestId("project-import-file").setInputFiles({ name: "unsupported.project.json", mimeType: "application/json", buffer: Buffer.from(projectCore.serializeMath3DProject(unsupported)) });
      await expect(panel.getByTestId("project-import-open")).toBeDisabled();
      expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(protectedBytes); await panel.getByTestId("project-import-cancel").click();
    }
    await closePanel(); await page.getByTestId("volume-action-new").click();
    const withNew = await save(); expect(withNew.workspace.entries).toHaveLength(3);
    expect(withNew.workspace.entries.slice(0, 2).map((entry: any) => entry.expected)).toEqual(saved.workspace.entries.map((entry: any) => entry.expected));
    const newId = withNew.workspace.entries[2].expected.id; expect(docs.map((document) => document.identity.id)).not.toContain(newId);
    await open(1); await expect(page.getByTestId("project-volume-expression")).toHaveValue("x+y+z+K+1");
    await show(); await panel.getByTestId(`project-open-${newId}`).click(); await expect(page.getByTestId("project-volume-expression")).toHaveValue("x^2 + y^2 + z^2 - 1");
    await closePanel(); await page.getByTestId("project-volume-editor").screenshot({ path: test.info().outputPath("prj14-volume-editor.png") });
    await page.setViewportSize({ width: 390, height: 844 }); const bounds = await page.getByTestId("project-volume-editor").boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391); expect(bounds!.height).toBeLessThan(422);
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ13 restores distinct Topology and Complex documents unchanged, edits history and cold reopens", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    const preset = require(resolve("renderer/src/topology/presets.ts")).TOPOLOGY_PRESETS[0].buildDiagram();
    const makeTopology = (name: string) => {
      const slug = name.toLowerCase().replaceAll(" ", "-");
      const source = { sourceId: `topology:${slug}/source`, kind: "fundamental-diagram", model: { ...preset, id: `diagram:${slug}`, name, researchNote: "preserved" } };
      return projectCore.createTopologyDocument({ source, identity: projectCore.createDocumentIdentity(projectCore.createStableDocumentId("topology", name), source), canonicalComplex: null, results: [], displayRealizations: [], provenance: { origin: "native", sourceFormat: "fixture", sourceVersion: 1, diagnostics: [] } });
    };
    const makeComplex = (text: string) => projectCore.createComplexAnalysisDocument({
      function: { sourceText: text, astVersion: 1, normalizedAst: projectCore.parseComplexExpressionAst(text, ["z"]).ast, allowedVariables: ["z"] }, parameters: [], assumptions: [],
      domain: { re: { min: -2, max: 2 }, im: { min: -2, max: 2 }, exclusions: [] }, sampling: { strategy: "uniform-grid", columns: 32, rows: 24, maximumSamples: 4096, tolerance: 1e-6 },
      contours: [{ contourId: "retained-circle", kind: "circle", points: [], center: { re: 0, im: 0 }, radius: 1, innerRadius: null, closed: true, winding: 1 }],
      branchPolicy: { profile: "sqrt", cut: { kind: "negative-real-axis", angleRadians: Math.PI, points: [] }, includeInfinity: true, sheetCount: 2, activeSheet: 1 }, covering: null, mobius: null,
    }, { stableKey: text });
    const docs = [makeTopology("First topology"), makeTopology("Second topology"), makeComplex("sqrt(z)"), makeComplex("exp(z)")];
    const project = projectCore.createMath3DProject(projectCore.createMixedWorkspaceDocument({ entries: docs.map((document) => ({ module: document.format === "math3d.topology-document" ? "topology" : "complex", checkpoint: document, expected: document.identity, replay: null })), activeDocumentIds: docs.map((document) => document.identity.id), constructions: [], results: [], relations: [], artifacts: [], committedSelection: null }), { title: "Native scientific project", stableKey: "prj13-ui" });
    const save = async () => { await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved"); return page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)); };
    const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
    const open = async (index: number) => { await show(); await panel.getByTestId(`project-open-${docs[index].identity.id}`).click(); };
    await show(); await panel.getByTestId("project-import-file").setInputFiles({ name: "scientific.math3d.project.json", mimeType: "application/json", buffer: Buffer.from(projectCore.serializeMath3DProject(project)) });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
    await expect(page.getByTestId("project-topology-editor")).toContainText("First topology");
    let saved = await save(); expect(saved.workspace.entries.map((entry: any) => entry.expected)).toEqual(docs.map((document) => document.identity));
    await open(1); await expect(page.getByTestId("project-topology-editor")).toContainText("Second topology");
    await page.getByText("Raw JSON editor", { exact: true }).click();
    const draft = JSON.parse(await page.getByTestId("topology-source-json").inputValue()); draft.name = "Edited second topology";
    await page.getByTestId("topology-source-json").fill(JSON.stringify(draft)); await page.getByRole("button", { name: "Apply JSON", exact: true }).click();
    await page.getByTestId("topology-source-undo").click(); expect(JSON.parse(await page.getByTestId("topology-source-json").inputValue()).name).toBe("Second topology");
    await page.getByTestId("topology-source-redo").click(); expect(JSON.parse(await page.getByTestId("topology-source-json").inputValue()).name).toBe("Edited second topology");
    await show(); saved = await save(); expect(saved.workspace.entries[0].expected).toEqual(docs[0].identity); expect(saved.workspace.entries[1].expected.id).toBe(docs[1].identity.id);
    await open(2); await expect(page.getByTestId("project-complex-function")).toHaveValue("sqrt(z)");
    await show(); saved = await save(); expect(saved.workspace.entries[2].expected).toEqual(docs[2].identity);
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await page.getByTestId("project-complex-function").fill("z*z");
    await expect(page.getByTestId("project-scientific-undo")).toBeEnabled(); await page.getByTestId("project-scientific-undo").click(); await expect(page.getByTestId("project-complex-function")).toHaveValue("sqrt(z)");
    await page.getByTestId("project-scientific-redo").click(); await expect(page.getByTestId("project-complex-function")).toHaveValue("z*z");
    await show(); saved = await save();
    expect(saved.identity.id).toBe(project.identity.id); expect(saved.workspace.entries[2].expected.id).toBe(docs[2].identity.id);
    await open(3); await expect(page.getByTestId("project-complex-function")).toHaveValue("exp(z)");
    await open(2); await expect(page.getByTestId("project-complex-function")).toHaveValue("z*z");
    await ctx.app.close(); ctx = await launchSurfaceApp({}, ctx.profileDir);
    page = ctx.page; panel = page.getByTestId("project-explorer-panel");
    await show(); await panel.getByTestId("project-view-saved").click(); await panel.getByTestId("project-restore-saved").click();
    await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
    await open(1); await page.getByText("Raw JSON editor", { exact: true }).click();
    expect(JSON.parse(await page.getByTestId("topology-source-json").inputValue()).name).toBe("Edited second topology");
    await page.getByTestId("topology-source-undo").click(); expect(JSON.parse(await page.getByTestId("topology-source-json").inputValue()).name).toBe("Second topology");
    await open(2); await expect(page.getByTestId("project-complex-function")).toHaveValue("z*z");
    await page.getByTestId("project-scientific-undo").click(); await expect(page.getByTestId("project-complex-function")).toHaveValue("sqrt(z)");
    await show(); saved = await save();
    expect(saved.workspace.entries.map((entry: any) => entry.expected.id)).toEqual(docs.map((document) => document.identity.id));
    expect(saved.workspace.entries[2].replay.payload.checkpoint.document.contours).toEqual(docs[2].contours);
    expect(saved.workspace.entries[2].replay.payload.checkpoint.document.branchPolicy).toEqual(docs[2].branchPolicy);
    expect(saved.workspace.entries[3].expected).toEqual(docs[3].identity);
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await page.getByText("Branch and contours (1)", { exact: true }).click();
    const changedBranch = { ...docs[2].branchPolicy, activeSheet: 0, cut: { kind: "positive-real-axis", angleRadians: 0, points: [] } };
    await page.getByTestId("project-complex-branch").fill(JSON.stringify(changedBranch)); await page.getByTestId("project-complex-branch-apply").click();
    await page.getByTestId("project-scientific-undo").click(); expect(JSON.parse(await page.getByTestId("project-complex-branch").inputValue())).toEqual(docs[2].branchPolicy);
    await page.getByTestId("project-scientific-redo").click(); expect(JSON.parse(await page.getByTestId("project-complex-branch").inputValue())).toEqual(changedBranch);
    await page.getByTestId("project-complex-contours").fill("[{\"broken\":true}]"); await page.getByTestId("project-complex-contours-apply").click(); await expect(page.getByRole("alert")).toBeVisible();
    const changedContours = [{ ...docs[2].contours[0], radius: 2 }];
    await page.getByTestId("project-complex-contours").fill(JSON.stringify(changedContours)); await page.getByTestId("project-complex-contours-apply").click();
    await show(); saved = await save();
    const replayed = projectCore.replayComplexCommandLog(saved.workspace.entries[2].replay.payload);
    expect(replayed.ok).toBe(true); expect(replayed.value.document.branchPolicy).toEqual(changedBranch); expect(replayed.value.document.contours).toEqual(changedContours);
    await page.reload(); await show(); await panel.getByTestId("project-view-saved").click(); await panel.getByTestId("project-restore-saved").click(); await panel.getByTestId("project-import-open").click();
    await open(2); await page.getByText("Branch and contours (1)", { exact: true }).click();
    expect(JSON.parse(await page.getByTestId("project-complex-branch").inputValue())).toEqual(changedBranch);
    expect(JSON.parse(await page.getByTestId("project-complex-contours").inputValue())).toEqual(changedContours);
    await page.getByTestId("project-scientific-undo").click(); expect(JSON.parse(await page.getByTestId("project-complex-contours").inputValue())).toEqual(docs[2].contours);
    await page.getByTestId("project-scientific-redo").click();
    await page.getByTestId("project-scientific-editor").screenshot({ path: test.info().outputPath("prj13-complex-editor.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const editorBounds = await page.getByTestId("project-scientific-editor").boundingBox();
    // Allow the fractional CSS pixel rounding used by the app's UI scaling.
    expect(editorBounds!.x + editorBounds!.width).toBeLessThanOrEqual(391);
    expect(editorBounds!.height).toBeLessThan(844 / 2);
    await page.getByTestId("project-scientific-editor").screenshot({ path: test.info().outputPath("prj13-complex-editor-phone.png") });
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ08 named project checkpoints survive Electron/mobile transfer, restart and managed history", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); const app = ctx;
    let sequence = 0;
    await runNamedProjectRoundTrip(app.page, async (checkpoint) => {
      const filename = test.info().outputPath(`project-${++sequence}.math3d.project.json`);
      await app.app.evaluate(({ session }, savePath) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(savePath)), filename);
      await app.page.getByTestId(checkpoint ? "project-export-checkpoint" : "project-export").click();
      await expect.poll(() => { try { projectCore.parseMath3DProject(readFileSync(filename, "utf8")); return true; } catch { return false; } }).toBe(true);
      return readFileSync(filename, "utf8");
    });
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ07 previews independent scientific starters and opens their real documents and lineage", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))));
    await panel.getByTestId("project-template-preview").click();
    await expect(panel.getByTestId("project-import-preview")).toContainText("Minimal Surface Study");
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))))).toEqual(before);
    await panel.getByTestId("project-import-cancel").click();
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))))).toEqual(before);
    await panel.getByTestId("project-template-preview").click(); await panel.getByTestId("project-import-save").click();
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries[0].id);
    await panel.getByTestId("project-template-preview").click(); await panel.getByTestId("project-import-open").click();
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(current.identity.id).not.toBe(first); expect(current.workspace.entries.map((entry: any) => entry.module)).toEqual(["graph2d", "curve", "surface"]);
    await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByTestId("project-group-surface")).toContainText("catenoid");
    await expect(panel.getByTestId("project-group-analysis")).toContainText("numerical");
    await panel.getByTestId("project-inspect-relations").click();
    await expect(panel.getByTestId("project-dependencies")).toContainText("graph2d.revolve-surface");
    await panel.getByTestId("project-template-select").selectOption("derivative-study");
    await panel.getByTestId("project-template-preview").click();
    await expect(panel.getByTestId("project-import-preview")).toContainText("Derivative Study");
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.getByTestId("project-templates").screenshot({ path: test.info().outputPath("project-starter-phone.png") });
    const bounds = await panel.boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await panel.getByTestId("project-import-cancel").click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(current.identity.id);
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ01/PRJ02 names and previews a project across restart and navigates live documents", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("project-message")).toContainText("Current workspace");
    for (const module of ["graph2d", "geometry", "curve", "surface", "mesh", "volume", "topology", "complex", "analysis"]) {
      await expect(panel.getByTestId(`project-group-${module}`)).toHaveCount(1);
    }
    await panel.getByTestId("project-title").fill("Minimal Surface Study");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Minimal Surface Study”");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries.length).toBeGreaterThan(1);
    const originalIds = saved.workspace.entries.map((entry: any) => entry.expected.id);
    await panel.screenshot({ path: test.info().outputPath("project-explorer-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await panel.screenshot({ path: test.info().outputPath("project-explorer-phone.png") });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-view-saved").click();
    await expect(panel.getByTestId("project-title")).toHaveValue("Minimal Surface Study");
    await expect(panel.getByTestId("project-title")).toBeDisabled();
    await expect(panel.getByTestId("project-save")).toBeDisabled();
    const buttons = panel.locator("button[data-testid^='project-open-']");
    await expect(buttons).toHaveCount(originalIds.length);
    for (let index = 0; index < originalIds.length; index++) await expect(buttons.nth(index)).toBeDisabled();
    const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(reopened).toEqual(saved);
    await panel.getByTestId("project-current").click();
    const graphOpen = panel.getByTestId("project-group-graph2d").getByRole("button").first();
    await expect(graphOpen).toBeEnabled(); await graphOpen.click();
    await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    await expect(panel).not.toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ02 rejects corrupt saved project without replacing its bytes", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(() => localStorage.setItem("math3d.project.v1", "{broken saved project"));
    await ctx.page.getByTestId("projects-toggle").click();
    const panel = ctx.page.getByTestId("project-explorer-panel");
    await expect(panel.getByTestId("project-message")).toContainText("Project unavailable");
    await expect(panel.getByTestId("project-save")).toBeDisabled();
    expect(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe("{broken saved project");
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ03 persists library metadata, favorites, activity and thumbnail sidecars safely", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-title").fill("Catenary research");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Catenary research”");
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await panel.getByTestId("project-description").fill("Minimal surface workflow");
    await panel.getByTestId("project-tags").fill("geometry, research");
    await panel.getByTestId("project-thumbnail").setInputFiles({ name: "thumbnail.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    await expect(panel.getByTestId("project-message")).toContainText("Thumbnail ready");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Catenary research”");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.identity).toEqual(before.identity);
    expect(saved.workspace).toEqual(before.workspace);
    const firstCard = panel.getByTestId(`project-library-${saved.identity.id}`);
    await expect(firstCard.locator("img")).toBeVisible();
    await firstCard.getByRole("button", { name: "Favorite Catenary research", exact: true }).click();
    await panel.getByTestId("project-new").click();
    await panel.getByTestId("project-title").fill("Second study");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Second study”");
    const activeId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id);
    expect(activeId).not.toBe(saved.identity.id);
    await expect(panel.getByTestId("project-library").locator("article").first()).toHaveAttribute("data-testid", `project-library-${saved.identity.id}`);
    await panel.getByTestId("project-library-search").fill("geometry");
    await expect(panel.getByTestId("project-library").locator("article")).toHaveCount(1);
    await firstCard.getByTestId(`project-preview-${saved.identity.id}`).click();
    await expect(panel.getByTestId("project-description")).toHaveValue("Minimal surface workflow");
    await expect(panel.getByTestId("project-tags")).toHaveValue("geometry, research");
    await expect(panel.getByTestId("project-description")).toBeDisabled();
    await expect(firstCard).toContainText("Viewed");
    await panel.getByTestId("project-current").click();
    await expect(panel.getByTestId("project-title")).toHaveValue("Second study");
    await page.reload();
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await page.getByTestId("projects-toggle").click();
    await expect(firstCard.getByRole("button", { name: "Favorite Catenary research", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(firstCard).toContainText("Viewed");
    await firstCard.getByTestId(`project-preview-${saved.identity.id}`).click();
    await expect(panel.getByTestId("project-description")).toHaveValue("Minimal surface workflow");
    await panel.screenshot({ path: test.info().outputPath("project-library-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.screenshot({ path: test.info().outputPath("project-library-phone.png") });
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await page.evaluate((id) => localStorage.removeItem(`math3d.project.v1.payload.${id}.thumbnail`), saved.identity.id);
    await panel.getByTestId("project-current").click();
    await expect(firstCard.getByTestId("project-thumbnail-fallback")).toBeVisible();
    const payloads = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project.v1"))));
    await page.evaluate(() => localStorage.setItem("math3d.project-library.v1", "{broken index"));
    await panel.getByTestId("project-current").click();
    await expect(panel.getByTestId("project-library-message")).toContainText("Library unavailable");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Project save failed");
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project.v1"))))).toEqual(payloads);
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ04 manages saved documents with guarded deletion and undo across reopen", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “");
    const activeBytes = await page.evaluate(() => localStorage.getItem("math3d.project.v1")!);
    const original = JSON.parse(activeBytes), graph = original.workspace.entries.find((entry: any) => entry.module === "graph2d");
    await panel.getByTestId("project-manage").click();
    for (const entry of original.workspace.entries.filter((entry: any) => entry.module !== "graph2d")) {
      await panel.getByTestId(`project-actions-${entry.expected.id}`).getByRole("button", { name: "Duplicate source", exact: true }).click();
      await expect(panel.getByTestId("project-message")).toContainText("new identity");
      await panel.getByTestId("project-undo").click();
    }
    const originalActions = panel.getByTestId(`project-actions-${graph.expected.id}`);
    await originalActions.getByRole("button", { name: "Duplicate source", exact: true }).click();
    await expect(panel.getByTestId("project-message")).toContainText("new identity");
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (2)");
    await originalActions.getByRole("button", { name: "Review delete", exact: true }).click();
    await expect(panel.getByTestId(`project-delete-review-${graph.expected.id}`)).toContainText("Delete blocked");
    await expect(panel.getByTestId(`project-delete-review-${graph.expected.id}`).getByRole("button", { name: "Delete document", exact: true })).toBeDisabled();
    const copyActions = panel.getByTestId("project-group-graph2d").locator("[data-testid^='project-actions-']").last();
    await copyActions.getByRole("textbox").fill("Independent graph snapshot");
    await copyActions.getByRole("button", { name: "Rename", exact: true }).click();
    await copyActions.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("archived");
    await copyActions.getByRole("button", { name: "Restore", exact: true }).click();
    await copyActions.getByRole("button", { name: "Review delete", exact: true }).click();
    await copyActions.getByRole("button", { name: "Delete document", exact: true }).click();
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (1)");
    await panel.getByTestId("project-undo").click();
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (2)");
    await panel.getByTestId("project-redo").click();
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (1)");
    await panel.getByTestId("project-undo").click(); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “");
    const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem(`math3d.project.v1.payload.${id}`)!), original.identity.id);
    expect(saved.workspace.entries.length).toBe(original.workspace.entries.length + 1);
    expect(saved.workspace.entries.slice(0, -1)).toEqual(original.workspace.entries);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(activeBytes);
    await page.reload(); await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId(`project-preview-${original.identity.id}`).click();
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Independent graph snapshot");
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (2)");
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ05 inspects stale lineage, provenance and missing artifacts without opening unrelated live state", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const core = projectCore, graph = core.instantiateGraph2DPreset(core.getGraph2DPresetCatalog().get("parabola-tangent"), "inspection-e2e").document;
    const curve = core.promoteGraph2DToCurve(graph, graph.source.objects[0].id);
    const result = core.analyzeGraph2DDerivative({ document: graph, objectId: graph.source.objects[0].id, x: 1, order: 1 }).publication;
    const handle = { artifactId: "e2e-unavailable-artifact", kind: "table", role: "samples" };
    const edited = core.createEmptyGraph2DDocument("replacement", "Edited graph");
    const source = edited.source, identity = core.advanceDocumentIdentity(graph.identity, source);
    const changedGraph = core.createGraph2DDocument({ stableKey: "replacement", source, identity, title: "Edited graph" });
    const workspace = core.createMixedWorkspaceDocument({ ...core.createGraph2DWorkspaceProject(changedGraph),
      entries: [...core.createGraph2DWorkspaceProject(changedGraph).entries, { module: "curve", checkpoint: curve.document, expected: curve.document.identity, replay: null }],
      results: [{ ...result, artifacts: [handle] }], artifacts: [{ handle, contentHash: core.structuralHash("missing"), byteLength: 100 }], relations: [curve.relation] });
    const project = core.createMath3DProject(workspace, { stableKey: "inspection-e2e", title: "Stale lineage study" });
    const bytes = core.serializeMath3DProject(project), page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.evaluate((raw) => localStorage.setItem("math3d.project.v1", raw), bytes);
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-view-saved").click();
    await panel.getByTestId(`project-inspect-${curve.document.identity.id}`).click();
    const inspector = panel.getByTestId("project-dependencies");
    await expect(inspector.getByTestId("project-document-freshness")).toContainText("lineage stale");
    await inspector.getByRole("button", { name: "Edited graph", exact: true }).click();
    await expect(inspector).toContainText("Dependencies: Edited graph");
    await expect(inspector.getByTestId(`project-result-status-${result.resultId}`)).toContainText(`authority ${result.status}`);
    await expect(inspector.getByTestId(`project-result-status-${result.resultId}`)).toContainText("unavailable");
    await expect(inspector.getByTestId(`project-artifact-${handle.artifactId}`)).toContainText("missing or unverified");
    await expect(panel.getByTestId(`project-open-${graph.identity.id}`)).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(bytes);
    await inspector.screenshot({ path: test.info().outputPath("project-dependencies-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await inspector.screenshot({ path: test.info().outputPath("project-dependencies-phone.png") });
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ06 exports, previews, cancels and opens supported imports while retaining historical records", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel"), core = projectCore;
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-title").fill("Local study");
    await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved “Local study”");
    const originalBytes = await page.evaluate(() => localStorage.getItem("math3d.project.v1")!);
    const exportedPath = test.info().outputPath("project.math3d.project.json");
    await ctx.app.evaluate(({ session }, savePath) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(savePath)), exportedPath);
    await panel.getByTestId("project-export").click();
    await expect.poll(() => { try { core.parseMath3DProject(readFileSync(exportedPath, "utf8")); return true; } catch { return false; } }).toBe(true);
    const exported = core.parseMath3DProject(readFileSync(exportedPath, "utf8"));
    expect(exported.identity).toEqual(JSON.parse(originalBytes).identity); expect(exported.workspace).toEqual(JSON.parse(originalBytes).workspace);
    const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))));
    await panel.getByTestId("project-import-file").setInputFiles(exportedPath);
    await expect(panel.getByTestId("project-import-preview")).toContainText("replay verified");
    await expect(panel.getByTestId("project-import-open")).toBeDisabled();
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))))).toEqual(before);
    await panel.getByTestId("project-import-cancel").click(); await expect(panel.getByTestId("project-import-preview")).toHaveCount(0);
    const future = { ...exported, schemaVersion: 99 };
    await panel.getByTestId("project-import-file").setInputFiles({ name: "future.project.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(future)) });
    await expect(panel.getByTestId("project-message")).toContainText("Project import rejected");
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))))).toEqual(before);
    const graph = core.instantiateGraph2DPreset(core.getGraph2DPresetCatalog().get("parabola-tangent"), "supported-import-e2e").document;
    const curve = core.promoteGraph2DToCurve(graph, graph.source.objects[0].id), result = core.analyzeGraph2DDerivative({ document: graph, objectId: graph.source.objects[0].id, x: 1, order: 1 }).publication;
    const workspace = core.createMixedWorkspaceDocument({ ...core.createGraph2DWorkspaceProject(graph), entries: [...core.createGraph2DWorkspaceProject(graph).entries,
      { module: "curve", checkpoint: curve.document, expected: curve.document.identity, replay: null }], results: [result], relations: [curve.relation] });
    const incoming = core.createMath3DProject(workspace, { stableKey: "supported-import-e2e", title: "Imported Graph study" }), bytes = core.serializeMath3DProject(incoming);
    const upload = { name: "supported.project.json", mimeType: "application/json", buffer: Buffer.from(bytes) };
    await panel.getByTestId("project-import-file").setInputFiles(upload);
    await expect(panel.getByTestId("project-import-preview")).toContainText("Recorded result engines");
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.screenshot({ path: test.info().outputPath("project-import-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 }); await panel.screenshot({ path: test.info().outputPath("project-import-phone.png") });
    const bounds = await panel.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 1280, height: 720 });
    await panel.getByTestId("project-import-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(originalBytes);
    await panel.getByTestId("project-import-file").setInputFiles(upload); await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project workspace");
    await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    const backup = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1.before-open")!));
    expect(backup.workspace.entries.map((entry: any) => entry.expected.id)).toEqual(JSON.parse(originalBytes).workspace.entries.map((entry: any) => entry.expected.id));
    await panel.getByTestId("project-current").click();
    await expect(panel.getByTestId(`project-open-${graph.identity.id}`)).toBeEnabled();
    await expect(panel.getByTestId("project-group-curve")).toContainText(curve.document.metadata.title);
    await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved “Imported Graph study”");
    const after = await page.evaluate(() => localStorage.getItem("math3d.project.v1")!);
    expect(JSON.parse(after).workspace.results).toContainEqual(result); expect(JSON.parse(after).workspace.relations).toContainEqual(curve.relation);
    const conflict = { ...incoming, metadata: { title: "Conflicting version" } };
    await panel.getByTestId("project-import-file").setInputFiles({ name: "conflict.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(conflict)) });
    await panel.getByTestId("project-import-save").click(); await expect(panel.getByTestId("project-message")).toContainText("different saved version");
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(after);
    await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
  } finally { await closeSurfaceApp(ctx); }
});


test("PRJ10 opens independent Curve and Surface in native editors, preserves identities and reopens saved edits", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    const curve = projectCore.createCurveDocument({ stableKey: "native-curve", source: { representation: "parametric", dimension: 3, domain: { parameter: "s", min: -2, max: 2, closed: false, periodic: false }, units: { position: "m", parameter: "s", angle: "rad" }, orientation: {}, derivatives: null, definition: { familyId: "custom", expressions: { x: "s", y: "s*s", z: "sin(s)" } }, dependencies: [] }, metadata: { title: "Native Curve" } });
    const surface = projectCore.createSurfaceDocument({ stableKey: "native-surface", source: { representation: "parametric", domain: { kind: "parameter", u: { min: -2, max: 2, label: "u", periodic: false }, v: { min: -1, max: 1, label: "v", periodic: false } }, units: { length: "m" }, orientation: { sign: 1 }, definition: { familyId: "custom", expressions: { x: "u", y: "v", z: "u*v" } }, parameters: { preserved: 7 }, branchPolicy: null }, metadata: { title: "Native Surface" } });
    const project = projectCore.createMath3DProject(projectCore.createMixedWorkspaceDocument({ results: [], artifacts: [], relations: [], constructions: [], committedSelection: null, activeDocumentIds: [curve.identity.id, surface.identity.id], entries: [{ module: "curve", checkpoint: curve, expected: curve.identity, replay: null }, { module: "surface", checkpoint: surface, expected: surface.identity, replay: null }] }), { stableKey: "native-project", title: "Native editors" });
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "native.math3d.project.json", mimeType: "application/json", buffer: Buffer.from(projectCore.serializeMath3DProject(project)) });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
    await expect(page.getByTestId("curve-kernel-document")).toContainText(curve.identity.id);
    await panel.getByTestId("project-save").click();
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries.map((entry: any) => entry.expected)).toEqual([curve.identity, surface.identity]);
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await page.getByLabel("y(t)", { exact: true }).fill("t*t*t");
    await page.getByTestId("project-editor-undo").click(); await expect(page.getByLabel("y(t)", { exact: true })).toHaveValue("t*t");
    await page.getByTestId("project-editor-redo").click(); await expect(page.getByLabel("y(t)", { exact: true })).toHaveValue("t*t*t");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.identity.id).toBe(project.identity.id); expect(saved.workspace.entries[0].expected.id).toBe(curve.identity.id);
    await panel.getByTestId(`project-open-${surface.identity.id}`).click();
    await expect(page.getByTestId("project-editor-history")).toContainText("Native Surface");
    await page.getByTestId("project-surface-z").fill("u*u+v*v");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries[1].expected.id).toBe(surface.identity.id);
    expect(saved.workspace.entries[1].expected.structuralHash).not.toBe(surface.identity.structuralHash);
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await page.getByTestId("workspace-nav-curves").click(); await expect(page.getByLabel("y(t)", { exact: true })).toHaveValue("t*t*t");
    await page.reload(); await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-view-saved").click();
    await panel.getByTestId("project-restore-saved").click(); await panel.getByTestId("project-import-open").click();
    await expect(page.getByTestId("curve-kernel-document")).toContainText(curve.identity.id);
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await expect(page.getByLabel("y(t)", { exact: true })).toHaveValue("t*t*t");
    await page.getByTestId("project-editor-undo").click(); await expect(page.getByLabel("y(t)", { exact: true })).toHaveValue("t*t");
  } finally { await closeSurfaceApp(ctx); }
});


test("PRJ11 restores Geometry objects and construction lineage, then edits, saves and reopens", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    const base = projectCore.geometryDocumentFromSceneDocument({ id: "restored-geometry", title: "Native construction", createdAt: 0, updatedAt: 0,
      objects: [{ id: "research-box", type: "box", name: "Research box", params: { width: 2, height: 3, depth: 4 }, visible: true, material: { color: 0x3366ff, opacity: 1 }, transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }],
      extensions: { "math3d.geometry.live-derived.v1": [{ id: "research-center", type: "object-centroid", sourceKind: "object", sourceObjectId: "research-box", dependent: true }] } });
    const document = projectCore.createGeometryDocument({ ...base, metadata: { ...base.metadata, constructionCreatedAt: { "research-center": 0 } }, display: { ...base.display, constructions: { "research-center": { name: "Research centroid", visible: true, createdAt: 0 } } } });
    const project = projectCore.createMath3DProject(projectCore.createMixedWorkspaceDocument({ entries: [{ module: "geometry", checkpoint: document, expected: document.identity, replay: null }], activeDocumentIds: [document.identity.id], constructions: [{ kind: "scene-script", source: "", normalizedSceneScript: "" }], results: [], relations: [], artifacts: [], committedSelection: null }), { stableKey: "native-geometry-project", title: "Native Geometry project" });
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "geometry.math3d.project.json", mimeType: "application/json", buffer: Buffer.from(projectCore.serializeMath3DProject(project)) });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
    await expect(page.getByTestId("workspace-nav-geometry")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("project-geometry-editor")).toContainText(document.identity.id);
    await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries[0].expected).toEqual(document.identity);
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await expect(page.getByTestId("project-geometry-param-width")).toHaveValue("2");
    await page.getByTestId("project-geometry-param-width").fill("5");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries[0].expected.id).toBe(document.identity.id); expect(saved.workspace.entries[0].expected.structuralHash).not.toBe(document.identity.structuralHash);
    await page.reload(); await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-view-saved").click();
    await panel.getByTestId("project-restore-saved").click(); await panel.getByTestId("project-import-open").click();
    await expect(page.getByTestId("project-geometry-editor")).toContainText(document.identity.id);
    await page.getByRole("button", { name: "Close project explorer" }).click(); await expect(page.getByTestId("project-geometry-param-width")).toHaveValue("5");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries[0].checkpoint.source.extensions["math3d.geometry.live-derived.v1"]).toEqual(document.source.extensions["math3d.geometry.live-derived.v1"]);
    expect(saved.workspace.constructions).toEqual(project.workspace.constructions);
    await panel.screenshot({ path: test.info().outputPath("restored-geometry-project.png") });
  } finally { await closeSurfaceApp(ctx); }
});
