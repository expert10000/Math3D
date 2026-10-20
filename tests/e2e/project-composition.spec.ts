import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { projectFreezeFixture, freezeControls } from "./helpers/projectFreeze";
import { SurfaceDocumentAdapter } from "../../renderer/src/surfaceAnalysis/surfaceDocumentAdapter";

const core = require(resolve("packages/core/src/index.ts"));

test("PC01–PC05 compares two saved Surfaces, retains their sources, and reopens the view", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = (name: string, z: string) => core.createSurfaceDocument({ stableKey: `pc-${name}`, metadata: { title: name }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false }, v: { min: -1, max: 1, periodic: false } },
      units: { length: "unitless" }, orientation: {}, parameters: {}, branchPolicy: null,
      definition: { familyId: name, expressions: { x: "u", y: "v", z } },
    } });
    const a = surface("Saddle A", "u*u-v*v"), b = surface("Plane B", "0.5*u");
    const workspace = core.createMixedWorkspaceDocument({
      entries: [a, b].map(document => ({ module: "surface", checkpoint: document, expected: document.identity, replay: null })),
      activeDocumentIds: [a.identity.id, b.identity.id], constructions: [], relations: [], results: [], artifacts: [], committedSelection: null,
    });
    const project = core.createMath3DProject(workspace, { stableKey: "pc-two-surfaces", title: "Two saved Surfaces" });
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "pc-project.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await panel.getByTestId("project-import-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
    await panel.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await expect.poll(() => page.evaluate(() => { const raw = localStorage.getItem("math3d.project.v1"); return raw ? JSON.parse(raw).identity.id : null; })).toBe(project.identity.id);
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await expect(view).toBeVisible();
    await expect(view.getByRole("region", { name: /A: Saddle A/ })).toBeVisible();
    await expect(view.getByRole("region", { name: /B: Plane B/ })).toBeVisible();
    await expect(view.getByRole("region", { name: /A: Saddle A/ }).locator("canvas").first()).toBeVisible();
    await expect(view.getByRole("region", { name: /B: Plane B/ }).locator("canvas").first()).toBeVisible();
    await view.getByRole("button", { name: "Save composition" }).click();
    await expect(view.getByText("Composition saved; source documents were not changed.")).toBeVisible();
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(persisted.compositions).toHaveLength(1);
    expect(persisted.workspace).toEqual(project.workspace);
    expect(persisted.compositions[0].members.map((member: any) => member.expected.structuralHash)).toEqual([a.identity.structuralHash, b.identity.structuralHash]);
    await view.getByRole("button", { name: "Close" }).click();
    await panel.getByTestId("project-open-composition").click();
    await view.getByLabel("Saved composition").selectOption(persisted.compositions[0].id);
    await expect(view.getByText(/Saved source status: current \/ current/)).toBeVisible();
    await page.reload();
    const afterRestart = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    expect(afterRestart).not.toBeNull();
    expect(core.parseMath3DProject(afterRestart).compositions).toHaveLength(1);
  } finally { await closeSurfaceApp(ctx); }
});

test("PC03–PC04 overlays verified Mesh and Geometry without altering their source", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const fixture = projectFreezeFixture();
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const controls = freezeControls(ctx.page);
    await controls.importOpen(fixture.raw);
    const before = await controls.save();
    await controls.panel.getByTestId("project-open-composition").click();
    const view = ctx.page.getByTestId("project-composition-view");
    await view.getByTestId("project-composition-source-0").selectOption(fixture.targets.mesh);
    await view.getByTestId("project-composition-source-1").selectOption(fixture.targets.geometry);
    await view.getByTestId("project-composition-mode").selectOption("overlay");
    await view.getByLabel("Shared frame").fill("local xyz");
    await view.getByLabel("Shared unit").fill("unitless");
    await expect(view.getByRole("region", { name: /Overlay/ })).toBeVisible();
    await expect(view.getByRole("region", { name: /Overlay/ }).locator("canvas").first()).toBeVisible();
    await view.getByRole("button", { name: "Save composition" }).click();
    await expect(view.getByText("Composition saved; source documents were not changed.")).toBeVisible();
    const after = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(after.workspace).toEqual(before.workspace);
    expect(after.compositions[0].alignment).toEqual({ frame: "local xyz", unit: "unitless" });
  } finally { await closeSurfaceApp(ctx); }
});

test("PC05 compares a retained Surface checkpoint with its current generation", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const source = { representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
      v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {}, parameters: {}, branchPolicy: null,
      definition: { familyId: "pc-history", expressions: { x: "u", y: "v", z: "0" } } };
    const original = core.createSurfaceDocument({ stableKey: "pc-history-e2e", metadata: { title: "Before / after" }, source });
    const adapter = new SurfaceDocumentAdapter(original);
    adapter.commitSource({ ...source, definition: { ...source.definition, expressions: { ...source.definition.expressions, z: "u*v" } } });
    const replay = adapter.replayBundle();
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: replay.checkpoint,
      expected: adapter.document().identity, replay: { format: "math3d.surface-replay.v1", payload: replay } }],
      activeDocumentIds: [original.identity.id], constructions: [], relations: [], results: [], artifacts: [], committedSelection: null });
    const project = core.createMath3DProject(workspace, { stableKey: "pc-history-e2e", title: "Historical Surface comparison" });
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "pc-history.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await panel.getByTestId("project-import-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
    await panel.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await expect(view.getByTestId("project-composition-generation-0")).toBeVisible();
    await view.getByTestId("project-composition-generation-0").selectOption("checkpoint");
    await expect(view.getByRole("region", { name: /A: Before \/ after/ })).toContainText("retained checkpoint r1");
    await expect(view.getByRole("region", { name: /B: Before \/ after/ })).toContainText("current r2");
    await expect(view.getByText(/Linked selection uses the same stored parameter/)).toBeVisible();
    await view.getByRole("button", { name: "Save composition" }).click();
    await expect(view.getByText("Composition saved; source documents were not changed.")).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace).toEqual(project.workspace);
    expect(saved.compositions[0].members.map((member: any) => member.expected.revision)).toEqual([1, 2]);
  } finally { await closeSurfaceApp(ctx); }
});

test("PC03 starter exposes verified, asserted and refused coordinate overlays", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-open-coordinate-overlay-study").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByLabel("Saved composition").selectOption({ label: "Verified A/B overlay" });
    await expect(view.getByText("Source-declared coordinate frames, axes, handedness, and units match this overlay.")).toBeVisible();
    await view.getByTestId("project-composition-mode").selectOption("side-by-side");
    await expect(view.getByTestId("project-composition-camera-link")).toBeEnabled();
    await view.getByLabel("Saved composition").selectOption({ label: "Unverified A/D overlay" });
    await expect(view.getByText(/Unverified overlay: at least one source/)).toBeVisible();
    await view.getByTestId("project-composition-mode").selectOption("side-by-side");
    await expect(view.getByTestId("project-composition-camera-link")).toBeDisabled();
    await view.getByLabel("Saved composition").selectOption({ label: "Unverified A/D overlay" });
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await view.getByTestId("project-composition-source-1").selectOption(project.workspace.entries[2].expected.id);
    await expect(view.getByRole("alert")).toContainText("Source coordinate frames, axes, handedness, or units disagree");
    await view.getByRole("button", { name: "Close" }).click();
    await page.reload();
    expect(core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")))).toEqual(project);
  } finally { await closeSurfaceApp(ctx); }
});

test("PC05 starter opens a replay-backed before/after comparison", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-open-surface-generation-study").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByLabel("Saved composition").selectOption({ label: "Before / after · linked u,v" });
    await expect(view.getByRole("region", { name: /A: Bowl → saddle/ })).toContainText("retained checkpoint r1");
    await expect(view.getByRole("region", { name: /B: Bowl → saddle/ })).toContainText("current r2");
    await expect(view.getByText(/Linked selection uses the same stored parameter/)).toBeVisible();
    const cameraLink = view.getByTestId("project-composition-camera-link");
    await expect(cameraLink).toBeEnabled();
    await cameraLink.check();
    await expect(view.getByText(/Camera linked from A/)).toBeVisible();
    await view.getByTestId("project-composition-camera-leader").selectOption("1");
    await expect(view.getByText(/Camera linked from B/)).toBeVisible();
    const cameraUpdates = () => view.getByText(/Camera linked from B/).textContent().then(text => Number(text?.match(/(\d+) updates/)?.[1] ?? 0));
    const beforeOrbit = await cameraUpdates();
    const leaderCanvas = view.getByRole("region", { name: /B: Bowl → saddle/ }).locator("canvas").first();
    const bounds = await leaderCanvas.boundingBox();
    if (!bounds) throw new Error("Comparison camera canvas is unavailable.");
    await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.63, bounds.y + bounds.height * 0.56, { steps: 6 });
    await page.mouse.up();
    await expect.poll(cameraUpdates).toBeGreaterThan(beforeOrbit);
    await view.getByRole("button", { name: "Save composition" }).click();
    await expect(view.getByText("Composition saved; source documents were not changed.")).toBeVisible();
    const linked = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(linked.compositions[0].camera).toEqual({ mode: "linked", leader: "B" });
    await view.getByRole("button", { name: "Close" }).click();
    await page.reload();
    const stored = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    expect(core.parseMath3DProject(stored).compositions).toHaveLength(1);
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-explorer-panel").getByTestId("project-open-composition").click();
    await view.getByLabel("Saved composition").selectOption({ label: "Before / after · linked u,v" });
    await expect(view.getByTestId("project-composition-camera-link")).toBeChecked();
    await expect(view.getByTestId("project-composition-camera-leader")).toHaveValue("1");
  } finally { await closeSurfaceApp(ctx); }
});
