import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-C01 saves a pinned ideal and independently reopens its Inspector", async () => {
  test.setTimeout(120_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-c01-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null, definition: { familyId: "sage-c01-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-c01-desktop", title: "Ideal experiment" });
    const q = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "Q"),
      revision: 1, label: "Q", definition: { kind: "rational-field" } });
    project = core.upsertMath3DProjectAlgebraObject(project, q);
    const r = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "R"),
      revision: 1, label: "R", definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: q.id, revision: 1 }, variables: ["x", "y"], monomialOrder: "lex" } });
    project = core.upsertMath3DProjectAlgebraObject(project, r);
    const raw = core.serializeMath3DProject(project);
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByRole("button", { name: "+ New ideal" }).click();
    const builder = cas.getByTestId("cas-ideal-builder");
    await builder.getByLabel("Ideal name").fill("I");
    await builder.getByLabel("Ideal generators").fill("z+1");
    await builder.getByRole("button", { name: "Validate ideal" }).click();
    await expect(builder.getByRole("alert")).toContainText("outside the ambient ring");
    await builder.getByLabel("Ideal generators").fill("x^2+y\nx*y-1");
    await builder.getByRole("button", { name: "Validate ideal" }).click();
    await expect(builder.getByTestId("cas-ideal-preview")).toContainText("R");
    await builder.getByRole("button", { name: "Save ideal to Project" }).click();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("Polynomial ideal");
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("x^2+y");
    const before = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    const parsed = core.parseMath3DProject(before);
    const ideal = parsed.algebraObjects.find((item: { revisions: { kind: string }[] }) => item.revisions[0].kind === "ideal").revisions[0];
    expect(ideal.definition).toEqual({ kind: "ideal", ambientRing: { objectId: r.id, revision: 1 },
      generators: ["x^2+y", "x*y-1"] });
    expect(ideal.revision).toBe(1);
    await expect(cas.getByTestId("cas-structure-inspector")).toContainText(ideal.id);
    await expect(cas.getByTestId("cas-structure-inspector")).toContainText(ideal.contentHash);
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    expect(core.parseMath3DProject(exported).algebraObjects.find((item: { id: string }) => item.id === ideal.id)
      .revisions[0]).toEqual(ideal);
    await ctx.app.close();
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: exported });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await reopened.getByRole("button", { name: /I @1/ }).click();
    await expect(reopened.getByTestId("cas-selected-structure")).toContainText("x^2+y");
    await expect(reopened.getByTestId("cas-structure-inspector")).toContainText(ideal.id);
    await expect(reopened.getByTestId("cas-structure-inspector")).toContainText(ideal.contentHash);
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraObjects.find((item: { id: string }) => item.id === ideal.id).revisions[0]).toEqual(ideal);
  } finally { await closeSurfaceApp(ctx); }
});
