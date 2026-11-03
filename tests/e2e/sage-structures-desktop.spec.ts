import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-A06 creates Project structures and reselects one after an independent desktop restart", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-a06-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null, definition: { familyId: "sage-a06-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    const project = core.createMath3DProject(workspace, { stableKey: "sage-a06-desktop", title: "Algebra experiments" });
    const bytes = core.serializeMath3DProject(project);
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: bytes });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    const projects = ctx.page.getByTestId("project-explorer-panel");
    await projects.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await expect(cas.getByTestId("cas-structures-explorer")).toBeVisible();
    const form = cas.getByTestId("cas-new-structure-form");
    await cas.getByRole("button", { name: "+ New structure" }).click();
    await form.getByLabel("Name").fill("Q");
    await form.getByRole("button", { name: "Create and save" }).click();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("Rational field QQ");
    await cas.getByRole("button", { name: "+ New structure" }).click();
    await form.getByLabel("Type").selectOption("polynomial-ring");
    await form.getByLabel("Name").fill("R");
    await form.getByLabel("Coefficient domain").selectOption({ label: "Q@1 · QQ" });
    await form.getByLabel("Variables").fill("x, y");
    await form.getByRole("button", { name: "Create and save" }).click();
    const dossier = cas.getByTestId("cas-selected-structure");
    await expect(dossier).toContainText("Q[x,y]");
    await expect(cas.getByTestId("cas-structure-inspector")).toContainText("Parent revisions");
    await cas.screenshot({ path: "test-results/sage-a06-structures.png", animations: "disabled" });
    const saved = await ctx.page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem("math3d.project.v1")!);
      const selected = JSON.parse(localStorage.getItem(`math3d.sage-structures.selection.v1.${project.identity.id}`)!);
      return { project, selected };
    });
    expect(saved.project.algebraObjects).toHaveLength(2);
    const r = saved.project.algebraObjects.find((item: { id: string }) => item.id === saved.selected.objectId);
    expect(r.revisions[0].definition).toMatchObject({ kind: "polynomial-ring", variables: ["x", "y"],
      coefficientDomain: { revision: 1 } });
    const objectId = r.id, definitionHash = r.revisions[0].contentHash;
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    await expect(cas.getByTestId("scientific-services-cas")).toBeVisible();
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect.poll(() => ctx!.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).algebraObjects?.length)).toBe(2);
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile);
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await expect(reopened.getByTestId("cas-selected-structure")).toContainText("Q[x,y]");
    await expect(reopened.getByTestId("cas-structure-inspector")).toContainText(objectId);
    await expect(reopened.getByTestId("cas-structure-inspector")).toContainText(definitionHash);
    const reopenedBytes = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    expect(core.parseMath3DProject(reopenedBytes).algebraObjects.find((item: { id: string }) => item.id === objectId)
      .revisions[0].contentHash).toBe(definitionHash);
  } finally { await closeSurfaceApp(ctx); }
});
