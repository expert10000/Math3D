import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-F04 recomputes a typed algebra Workbook cell and reopens its exact output", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-f04-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-f04-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-f04-desktop", title: "Algebra Workbook" });
    const qq = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "QQ"),
      revision: 1, label: "QQ", definition: { kind: "rational-field" } });
    project = core.upsertMath3DProjectAlgebraObject(project, qq);
    const ring = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "R"),
      revision: 1, label: "R", definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: qq.id, revision: 1 }, variables: ["x", "y"], monomialOrder: "degrevlex" } });
    project = core.upsertMath3DProjectAlgebraObject(project, ring);
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: core.serializeMath3DProject(project) });
    await page.reload();
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: "2 Compute" }).click();
    await page.getByRole("button", { name: "Algebra object", exact: true }).click();
    const cell = page.getByTestId("workbook-algebra-object-cell").first();
    await expect(cell.getByLabel("Workbook algebra object")).toBeEnabled();
    await cell.getByLabel("Workbook algebra object").selectOption(ring.id);
    await cell.getByTestId("workbook-algebra-object-compute").click();
    await expect(cell.getByTestId("workbook-algebra-object-freshness")).toHaveText("current");
    await expect(cell.getByTestId("workbook-algebra-object-output")).toContainText("revision 1");
    await expect(cell.getByTestId("workbook-algebra-object-output")).toContainText(ring.contentHash);
    const revised = core.createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R lex",
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
        variables: ["x", "y"], monomialOrder: "lex" } });
    const saved = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const advanced = core.upsertMath3DProjectAlgebraObject(saved, revised);
    await page.evaluate(({ id, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
    }, { id: advanced.identity.id, raw: core.serializeMath3DProject(advanced) });
    await page.reload();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: "2 Compute" }).click();
    const stale = page.getByTestId("workbook-algebra-object-cell").first();
    await expect(stale.getByTestId("workbook-algebra-object-freshness")).toHaveText("stale", { timeout: 12_000 });
    await expect(stale.getByTestId("workbook-algebra-object-output")).toContainText("revision 1");
    await stale.getByTestId("workbook-algebra-object-compute").click();
    await expect(stale.getByTestId("workbook-algebra-object-freshness")).toHaveText("current");
    await expect(stale.getByTestId("workbook-algebra-object-output")).toContainText("revision 2");
    await expect(stale).toContainText("Earlier revisions (1)");
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-save").click();
    await panel.getByTestId("project-save-active-workbook").click();
    await expect(panel.getByTestId("project-message")).toContainText("Added");
    const packagePath = test.info().outputPath("algebra-workbook.resources.math3d.project.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), packagePath);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(() => { try { return readFileSync(packagePath).length; } catch { return 0; } }).toBeGreaterThan(100);
    await closeSurfaceApp(ctx); ctx = null;
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("projects-toggle").click();
    const fresh = ctx.page.getByTestId("project-explorer-panel");
    await fresh.getByTestId("project-import-file").setInputFiles(packagePath);
    await fresh.getByTestId("project-import-save").click();
    await fresh.getByTestId(`project-open-saved-${project.identity.id}`).click();
    const imported = core.parseMath3DProject(JSON.stringify(JSON.parse(readFileSync(packagePath, "utf8")).project));
    expect(imported.workbooks).toHaveLength(1);
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-workbook-${imported.workbooks[0].id}`).click();
    await ctx.page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await ctx.page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await ctx.page.getByRole("button", { name: "2 Compute" }).click();
    const reopened = ctx.page.getByTestId("workbook-algebra-object-cell").first();
    await expect(reopened.getByTestId("workbook-algebra-object-freshness")).toHaveText("current");
    await expect(reopened.getByTestId("workbook-algebra-object-output")).toContainText(revised.contentHash);
    await expect(reopened).toContainText("Earlier revisions (1)");
  } finally { await closeSurfaceApp(ctx); }
});
