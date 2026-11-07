import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-H01 keyboard palette filters commands by object and advertised route", async () => {
  test.setTimeout(180_000);
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10",
      available: true, status: "ok", operations: ["sage.matrix.integer_forms", "sage.numberTheory.gcd",
        "sage.polynomial.factor"] }));
    else { res.statusCode = 404; res.end("{}"); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-h01-surface", metadata: { title: "Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null, definition: { familyId: "sage-h01-plane",
        expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-h01-desktop", title: "Command palette" });
    const add = (key: string, definition: unknown) => {
      const record = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, key),
        revision: 1, label: key, definition });
      project = core.upsertMath3DProjectAlgebraObject(project, record);
      return record;
    };
    const z = add("Z", { kind: "integer-ring" });
    const q = add("Q", { kind: "rational-field" });
    const ring = add("R", { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
      variables: ["x", "y"], monomialOrder: "degrevlex" });
    const ideal = add("I", { kind: "ideal", ambientRing: { objectId: ring.id, revision: 1 },
      generators: ["x^2+y"] });
    const recipe = core.createAlgebraRecipeGraph(project, "gcd-review", "GCD review", [{ id: "gcd",
      operation: "sage.numberTheory.gcd", backend: "docker", target: { objectId: z.id, revision: 1 },
      args: { values: ["84", "30"] }, dependsOn: [] }]);
    project = core.upsertMath3DProjectAlgebraRecipe(project, recipe);
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
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
    const open = async (query: string) => {
      await ctx!.page.keyboard.press("Control+k");
      const dialog = cas.getByTestId("cas-command-dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Search mathematics commands").fill(query);
      return dialog;
    };
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /I @1/ }).click();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("x^2+y");
    let dialog = await open("show tangent cone");
    await expect(dialog.getByTestId("cas-command-tangent-cone")).toContainText("Available");
    await dialog.getByLabel("Search mathematics commands").press("Enter");
    await expect(cas.getByTestId("cas-locus-builder")).toBeVisible();
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /Z @1/ }).click();
    dialog = await open("smith");
    await expect(dialog.getByTestId("cas-command-sage.matrix.integer_forms")).toContainText("Available");
    await dialog.getByLabel("Search mathematics commands").press("Enter");
    await expect(cas.getByTestId("cas-object-run-controls")).toContainText("Smith and Hermite forms over ZZ");
    dialog = await open("GCD review");
    await dialog.getByLabel("Search mathematics commands").press("Enter");
    await expect(cas.getByTestId("cas-recipes")).toBeVisible();
    await expect(cas.getByLabel("Saved recipe")).toHaveValue(recipe.id);
    await cas.getByRole("button", { name: "Structures", exact: true }).click();
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /R @1/ }).click();
    dialog = await open("polynomial dossier");
    await expect(dialog.getByTestId("cas-command-sage.polynomial.dossier"))
      .toContainText("Why unavailable: Polynomial dossier over QQ requires exactly one polynomial variable");
    await expect(dialog.getByRole("button", { name: "Polynomial dossier over QQ" })).toBeDisabled();
    await ctx.page.keyboard.press("Escape");
    dialog = await open("smith");
    await expect(dialog.getByText("No commands match this search and selected structure.")).toBeVisible();
    await ctx.page.keyboard.press("Escape");
    dialog = await open("factor over");
    await dialog.getByLabel("Search mathematics commands").press("Enter");
    await expect(cas.getByTestId("cas-object-run-controls")).toContainText("Factor over QQ");
    dialog = await open("");
    const first = await dialog.getByRole("option", { selected: true }).getAttribute("data-testid");
    await dialog.getByLabel("Search mathematics commands").press("ArrowDown");
    const second = await dialog.getByRole("option", { selected: true }).getAttribute("data-testid");
    expect(second).not.toBe(first);
    await ctx.page.keyboard.press("Escape");
    await expect(cas.getByTestId("cas-command-dialog")).toHaveCount(0);
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
