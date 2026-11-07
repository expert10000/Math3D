import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-G08 saves exact schemes, chart and map, then reopens their handoffs", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-g08-surface", metadata: { title: "Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null, definition: { familyId: "sage-g08-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-g08-desktop", title: "Scheme handoffs" });
    const add = (key: string, definition: unknown) => {
      const record = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, key),
        revision: 1, label: key, definition });
      project = core.upsertMath3DProjectAlgebraObject(project, record);
      return record;
    };
    const q = add("Q", { kind: "rational-field" });
    const ring = add("S", { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
      variables: ["x", "y", "z"], monomialOrder: "degrevlex" });
    const ideal = add("I", { kind: "ideal", ambientRing: { objectId: ring.id, revision: 1 },
      generators: ["x^2+y^2-z^2"] });
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
    await install(core.serializeMath3DProject(project));
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByRole("button", { name: "+ New scheme" }).click();
    await cas.getByLabel("Scheme name").fill("Conic");
    await cas.getByLabel("Scheme kind").selectOption("projective-scheme");
    await cas.getByLabel("Scheme ideal").selectOption(ideal.id);
    await expect(cas.getByTestId("cas-scheme-preview")).toContainText("homogeneous presentation");
    await cas.getByRole("button", { name: "Save scheme" }).click();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("Proj(S/I)");
    await cas.getByLabel("Nonzero chart coordinate").selectOption("z");
    await cas.getByRole("button", { name: "Save affine chart" }).click();
    await expect(cas.getByTestId("cas-scheme-chart-equations")).toContainText("x^2+y^2-1");
    await cas.getByRole("button", { name: "Save chart inclusion map" }).click();
    await expect(cas.getByTestId("cas-scheme-map-coordinates")).toContainText("[x : y : 1]");
    await cas.getByRole("button", { name: "+ New scheme" }).click();
    await cas.getByLabel("Scheme name").fill("AffineConic");
    await cas.getByLabel("Scheme ideal").selectOption(ideal.id);
    await cas.getByRole("button", { name: "Save scheme" }).click();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("Spec(S/I)");
    await cas.getByRole("button", { name: "Open pinned ideal for real locus" }).click();
    await expect(cas.getByTestId("cas-locus-builder")).toBeVisible();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("x^2+y^2-z^2");
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const bytes = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!bytes) throw new Error("Project export bytes are missing.");
    const imported = core.parseMath3DProject(bytes);
    expect(imported.algebraObjects.map((entry: { revisions: { kind: string }[] }) => entry.revisions.at(-1)?.kind))
      .toEqual(expect.arrayContaining(["affine-scheme", "projective-scheme", "scheme-chart", "scheme-map"]));
    await ctx.app.close();
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await install(bytes);
    const fresh = ctx.page.getByTestId("cas-algebra-workspace");
    await fresh.getByTestId("cas-structures-explorer").getByRole("button", { name: /Conic : z ≠ 0 @1/ }).click();
    await expect(fresh.getByTestId("cas-scheme-chart-equations")).toContainText("x^2+y^2-1");
    await fresh.getByTestId("cas-structures-explorer").getByRole("button", { name: /Conic : z ≠ 0 inclusion @1/ }).click();
    await expect(fresh.getByTestId("cas-scheme-map-coordinates")).toContainText("[x : y : 1]");
  } finally { await closeSurfaceApp(ctx); }
});
