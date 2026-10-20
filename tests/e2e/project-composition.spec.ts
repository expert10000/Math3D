import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { projectFreezeFixture, freezeControls } from "./helpers/projectFreeze";

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
    await expect(view.getByRole("status")).toContainText("Composition saved");
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
    await expect(view.getByRole("status")).toContainText("Composition saved");
    const after = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(after.workspace).toEqual(before.workspace);
    expect(after.compositions[0].alignment).toEqual({ frame: "local xyz", unit: "unitless" });
  } finally { await closeSurfaceApp(ctx); }
});
