import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-F03 distinguishes cusp and node tangent views, then independently reopens exact evidence", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-f03-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-f03-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-f03-desktop", title: "Singular-locus views" });
    const record = (key: string, definition: unknown) => core.createAlgebraObjectRecord({
      id: core.createProjectAlgebraObjectId(project.identity.id, key), revision: 1, label: key, definition });
    const qq = record("QQ", { kind: "rational-field" });
    project = core.upsertMath3DProjectAlgebraObject(project, qq);
    const ring = record("R", { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
      variables: ["x", "y"], monomialOrder: "degrevlex" });
    project = core.upsertMath3DProjectAlgebraObject(project, ring);
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: core.serializeMath3DProject(project) });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /R @1/ }).click();
    const builder = cas.getByTestId("cas-locus-builder");
    await builder.getByLabel("Locus sample cap").fill("8000");
    await builder.getByLabel("Locus polynomial").fill("y^2-x^3");
    await builder.getByRole("button", { name: "Validate & preview locus" }).click();
    await builder.getByRole("button", { name: "Inspect tangent and singular locus" }).click();
    await expect(builder.getByTestId("cas-singularity-view")).toContainText("Ordinary cusp");
    await expect(builder.getByTestId("cas-singularity-view")).toContainText("1·Δy^2");
    const cuspPath = test.info().outputPath("cusp.tangent.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), cuspPath);
    await builder.getByRole("button", { name: "Export tangent scene JSON" }).click();
    await expect.poll(() => { try { return readFileSync(cuspPath).length; } catch { return 0; } }).toBeGreaterThan(100);
    const cusp = core.parseSageAlgebraicSingularityScene(JSON.parse(readFileSync(cuspPath, "utf8")), project);
    expect(cusp.local.classification).toBe("ordinary-cusp");
    const geometryPath = test.info().outputPath("cusp.tangent.geometry.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), geometryPath);
    await builder.getByRole("button", { name: "Export tangent Geometry JSON" }).click();
    await expect.poll(() => { try { return readFileSync(geometryPath).length; } catch { return 0; } }).toBeGreaterThan(100);
    expect(core.parseAlgebraicSingularityGeometryDocument(JSON.parse(readFileSync(geometryPath, "utf8")), project).analysis).toEqual(cusp);
    await builder.getByRole("button", { name: "Save tangent view to Project" }).click();
    await expect(builder.getByRole("status")).toContainText("Saved exact tangent");
    await builder.getByLabel("Locus polynomial").fill("y^2-x^2*(x+1)");
    await builder.getByRole("button", { name: "Validate & preview locus" }).click();
    await builder.getByRole("button", { name: "Inspect tangent and singular locus" }).click();
    await expect(builder.getByTestId("cas-singularity-view")).toContainText("Ordinary real node");
    await builder.getByRole("button", { name: "Save tangent view to Project" }).click();
    await expect(builder.getByRole("status")).toContainText("Saved exact tangent");
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    const panel = ctx.page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-save").click();
    await panel.getByTestId("project-detail-toggle").click();
    await panel.getByTestId("project-explorer-header").locator("summary").click();
    await panel.getByTestId("project-explorer-header").getByRole("button", { name: "Import / export" }).click();
    const packagePath = test.info().outputPath("singular-locus.resources.math3d.project.json");
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
    const reopened = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const analyses = reopened.workspace.entries.filter((entry: { checkpoint: { source?: { extensions?: Record<string, unknown> } } }) =>
      entry.checkpoint.source?.extensions?.[core.SAGE_LOCUS_SINGULARITY_EXTENSION]).map((entry: { checkpoint: unknown }) =>
        core.parseAlgebraicSingularityGeometryDocument(entry.checkpoint, reopened).analysis);
    expect(analyses.map((item: { local: { classification: string } }) => item.local.classification).sort()).toEqual([
      "ordinary-cusp", "ordinary-real-node"]);
    expect(analyses.every((item: { scene: { source: { target: { contentHash: string } } } }) =>
      item.scene.source.target.contentHash === ring.contentHash)).toBe(true);
    await fresh.getByTestId("project-gallery-layout-toggle").click();
    const details = fresh.getByTestId("project-detail-toggle");
    if (await details.getAttribute("aria-pressed") === "false") await details.click();
    await fresh.getByTestId("project-detail-tab-documents").click();
    const savedMenu = fresh.getByTestId(`project-algebra-open-in-${ring.id}`);
    await savedMenu.locator("summary").click();
    const tangentActions = savedMenu.getByRole("button", { name: "Open exact tangent view in Geometry" });
    await expect(tangentActions).toHaveCount(2);
    await expect(savedMenu).toContainText("Jacobian evidence and source remain pinned");
    await tangentActions.first().click();
    const cuspDocumentId = core.algebraicSingularityGeometryDocument(cusp).identity.id;
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", cuspDocumentId);
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-algebra-return-${cuspDocumentId}`)
      .getByRole("button", { name: "Return to algebra source in CAS" }).click();
    await expect(ctx.page.getByTestId("cas-algebra-workspace").getByTestId("cas-structures-explorer")
      .getByRole("button", { name: /R @1/ })).toHaveAttribute("aria-current", "true");
    const savedInspection = ctx.page.getByTestId("cas-saved-tangent-inspection");
    await expect(savedInspection).toContainText("Saved exact tangent evidence · read-only");
    await expect(savedInspection).toContainText("Ordinary cusp");
    await expect(savedInspection).toContainText("Jacobian at point");
    await expect(ctx.page.getByTestId("cas-locus-preview")).toHaveCount(0);
    const savedChoices = ctx.page.getByTestId("cas-saved-locus-choices")
      .locator('button[data-testid^="cas-saved-locus-choice-"]');
    await expect(savedChoices).toHaveCount(2);
    await ctx.page.getByTestId("cas-saved-locus-choices")
      .getByRole("button", { name: "Compare with selected" }).click();
    const comparison = ctx.page.getByTestId("cas-saved-locus-comparison");
    await expect(comparison).toContainText("Source revision: same");
    await expect(comparison).toContainText("exact equations: different");
    await expect(comparison).toContainText("Real bounds: same");
    await expect(comparison).toContainText("exact scene: different");
    await comparison.getByRole("button", { name: "Close comparison" }).click();
    await expect(comparison).toHaveCount(0);
    await savedChoices.nth(1).click();
    await expect(savedInspection).toContainText("Ordinary real node");
    await savedChoices.first().click();
    await expect(savedInspection).toContainText("Ordinary cusp");
    await savedInspection.getByRole("button", { name: "Open saved tangent Geometry" }).click();
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", cuspDocumentId);
  } finally { await closeSurfaceApp(ctx); }
});
