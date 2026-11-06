import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-D01 builds Q(sqrt(5)) and independently reopens its exact Project dossier", async () => {
  test.setTimeout(150_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-d01-surface",
      metadata: { title: "Project Surface" }, source: {
        representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
          v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
        parameters: {}, branchPolicy: null,
        definition: { familyId: "sage-d01-plane", expressions: { x: "u", y: "v", z: "0" } },
      } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-d01-desktop", title: "Number fields" });
    const q = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "Q"),
      revision: 1, label: "Q", definition: { kind: "rational-field" } });
    project = core.upsertMath3DProjectAlgebraObject(project, q);
    const seed = core.serializeMath3DProject(project);
    const install = async (raw: string) => {
      await ctx!.page.evaluate(({ id, title, raw }) => {
        localStorage.setItem("math3d.project.v1", raw);
        localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
        localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
          entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
      }, { id: project.identity.id, title: project.metadata.title, raw });
      await ctx!.page.reload();
      await ctx!.page.getByTestId("projects-toggle").click();
      await ctx!.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
      await ctx!.page.getByTestId("workspace-nav-cas").click();
    };
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await install(seed);
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByRole("button", { name: "+ New structure" }).click();
    const form = cas.getByTestId("cas-new-structure-form");
    await form.getByLabel("Type").selectOption("number-field");
    await form.getByLabel("Name", { exact: true }).fill("K");
    await form.getByLabel("Number field base").selectOption({ label: "Q@1 · QQ" });
    await form.getByLabel("Quadratic constant coefficient").fill("-4");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    await expect(cas.getByRole("alert")).toContainText("reducible");
    await form.getByLabel("Quadratic constant coefficient").fill("-5");
    await form.getByRole("button", { name: "Validate & preview" }).click();
    const preview = cas.getByTestId("cas-builder-preview");
    await expect(preview).toContainText("x^2 - 5");
    await expect(preview).toContainText("Field discriminant5");
    await expect(preview).toContainText("Power basis1, a");
    await expect(preview).toContainText("√5; -√5");
    await preview.getByRole("button", { name: "Create and save" }).click();
    const dossier = cas.getByTestId("cas-selected-structure");
    await expect(dossier).toContainText("Quadratic number field");
    await expect(dossier).toContainText("Integral basis1, (1+a)/2");
    await expect(dossier).toContainText("Ring of integersZ[(1+√5)/2]");
    const before = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const k = before.algebraObjects.find((item: { revisions: { kind: string }[] }) => item.revisions[0].kind === "number-field").revisions[0];
    expect(k.definition).toEqual({ kind: "number-field", baseField: { objectId: q.id, revision: 1 },
      definingPolynomial: ["-5", "0", "1"], generator: "a" });
    await expect(cas.getByTestId("cas-structure-inspector")).toContainText(k.contentHash);
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    expect(core.parseMath3DProject(exported).algebraObjects.find((item: { id: string }) => item.id === k.id)
      .revisions[0]).toEqual(k);
    await ctx.app.close();
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await install(exported);
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await reopened.getByTestId("cas-structures-explorer").locator(".sage-structure-list")
      .getByRole("button", { name: /K @1/ }).click();
    await expect(reopened.getByTestId("cas-selected-structure")).toContainText("Field discriminant5");
    await expect(reopened.getByTestId("cas-structure-inspector")).toContainText(k.id);
    await expect(reopened.getByTestId("cas-structure-inspector")).toContainText(k.contentHash);
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraObjects.find((item: { id: string }) => item.id === k.id).revisions[0]).toEqual(k);
  } finally { await closeSurfaceApp(ctx); }
});
