import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-H04/H05 installs an ideal gallery chain and reopens a completed bounded sweep", async () => {
  test.setTimeout(180_000);
  const requests: string[][] = [];
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") { res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10",
      available: true, status: "ok", operations: ["sage.numberTheory.gcd"] })); return; }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body);
      const values = request.params.values as string[];
      requests.push(values);
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", operation: request.operation,
        success: true, result: { value: values[0] === "84" ? "6" : "5" }, latex: "",
        warnings: [], elapsedMs: 4 }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-h05-surface", metadata: { title: "Surface" },
      source: { representation: "parametric", domain: { kind: "parameter",
        u: { min: -1, max: 1, periodic: false }, v: { min: -1, max: 1, periodic: false } },
        units: { length: "unitless" }, orientation: {}, parameters: {}, branchPolicy: null,
        definition: { familyId: "sage-h05-plane", expressions: { x: "u", y: "v", z: "0" } } } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    const project = core.createMath3DProject(workspace, { stableKey: "sage-h05-desktop", title: "Gallery and sweep" });
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
    await cas.getByTestId("cas-algebra-gallery").locator("summary").click();
    await cas.getByTestId("cas-gallery-nilpotent-ideal").getByRole("button", { name: "Save example" }).click();
    await expect(cas.getByTestId("cas-gallery-status")).toContainText("Saved Nilpotent affine ideal");
    await cas.getByTestId("cas-gallery-z6-module").getByRole("button", { name: "Save example" }).click();
    await expect(cas.getByTestId("cas-gallery-status")).toContainText("Saved Torsion module");
    await cas.getByTestId("cas-gallery-gf5").getByRole("button", { name: "Save example" }).click();
    await cas.getByTestId("cas-gallery-c4").getByRole("button", { name: "Save example" }).click();
    const afterGallery = core.parseMath3DProject(await ctx.page.evaluate((id) =>
      localStorage.getItem(`math3d.project.v1.payload.${id}`), project.identity.id));
    expect(afterGallery.algebraObjects).toHaveLength(7);
    const z = afterGallery.algebraObjects.find((entry: any) => entry.revisions[0].definition.kind === "integer-ring");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /Gallery ZZ @1/ }).click();
    await cas.getByRole("button", { name: "Recipes", exact: true }).click();
    await cas.getByLabel("GCD sweep parameter pairs").fill("84,30\n35,15");
    await cas.getByRole("button", { name: "Save GCD sweep recipe" }).click();
    await expect(cas.getByTestId("cas-recipe-status")).toContainText("Saved GCD parameter sweep");
    await cas.getByRole("button", { name: "Run saved recipe" }).click();
    await expect(cas.getByTestId("cas-recipe-status")).toContainText("Recipe complete");
    await expect(cas.getByTestId("cas-gcd-sweep-results")).toContainText("2/2 saved results");
    expect(requests).toEqual([["84", "30"], ["35", "15"]]);
    const savedBytes = await ctx.page.evaluate((id) =>
      localStorage.getItem(`math3d.project.v1.payload.${id}`), project.identity.id);
    if (!savedBytes) throw new Error("Saved Project bytes are missing.");
    const saved = core.parseMath3DProject(savedBytes);
    expect(saved.algebraRecipes).toHaveLength(1);
    expect(saved.algebraEvidence).toHaveLength(2);
    expect(saved.algebraRecipes[0].stages.every((stage: any) => stage.target.objectId === z.id)).toBe(true);
    expect(core.parseMath3DProject(core.serializeMath3DProject(saved)).algebraEvidence).toHaveLength(2);
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: savedBytes });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await expect(reopened.getByTestId("cas-structures-explorer")).toContainText("Gallery (x²,y)");
    await reopened.getByTestId("cas-structures-explorer").getByRole("button", { name: /Gallery ZZ @1/ }).click();
    await reopened.getByRole("button", { name: "Recipes", exact: true }).click();
    await expect(reopened.getByTestId("cas-gcd-sweep-results")).toContainText("2/2 saved results");
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
