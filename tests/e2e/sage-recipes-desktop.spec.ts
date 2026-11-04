import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));
const forms = require(resolve("tests/fixtures/sage-integer-matrix-forms-2-6-0.json"));

test("SAGE-B07 saves a recipe, retains partial evidence and independently reopens it", async () => {
  test.setTimeout(180_000);
  const requests: string[] = [];
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", available: true, status: "ok",
        operations: ["sage.algebra.reconstruct", "sage.numberTheory.gcd", "sage.matrix.integer_forms"] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body);
      requests.push(request.operation);
      const base = { engine: "sagemath", engineVersion: "10.10", operation: request.operation,
        latex: "", warnings: [], elapsedMs: 5 };
      if (request.operation === "sage.algebra.reconstruct") {
        const record = request.params.objects.at(-1);
        res.end(JSON.stringify({ ...base, success: true, result: {
          format: "math3d.sage-algebra-reconstruction-result", schemaVersion: 1,
          target: request.params.target, kind: record.kind, definitionHash: record.contentHash,
          text: "Integer Ring", latex: "\\mathbb{Z}", characteristic: "0", isField: false,
        } }));
      } else if (request.operation === "sage.numberTheory.gcd") {
        res.end(JSON.stringify({ ...base, success: false, result: {}, error: "controlled GCD failure" }));
      } else if (request.operation === "sage.matrix.integer_forms") {
        res.end(JSON.stringify({ ...base, success: true, result: forms }));
      } else {
        res.end(JSON.stringify({ ...base, success: false, result: {}, error: "Unexpected operation" }));
      }
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-b07-surface",
      metadata: { title: "Recipe surface" }, source: {
        representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
          v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
        parameters: {}, branchPolicy: null,
        definition: { familyId: "sage-b07-plane", expressions: { x: "u", y: "v", z: "0" } },
      } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-b07-desktop", title: "Recipe Project" });
    const z = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "Z"),
      revision: 1, label: "Z", definition: { kind: "integer-ring" } });
    project = core.upsertMath3DProjectAlgebraObject(project, z);
    const raw = core.serializeMath3DProject(project);
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
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
    await cas.getByRole("button", { name: "Recipes", exact: true }).click();
    await cas.getByRole("button", { name: "Create and save starter for selected structure" }).click();
    await expect(cas.getByTestId("cas-recipe-status")).toContainText("Saved Z exact analysis in Project");
    await expect(cas.getByTestId("cas-recipe-stages")).toContainText("integer-forms");
    await expect(cas.getByRole("button", { name: "Run saved recipe" })).toBeEnabled();
    await cas.getByRole("button", { name: "Run saved recipe" }).click();
    await expect(cas.getByTestId("cas-recipe-status")).toContainText("partially completed");
    await expect(cas.getByTestId("cas-recipe-stages")).toContainText("controlled GCD failure");
    expect(requests).toEqual(["sage.algebra.reconstruct", "sage.numberTheory.gcd", "sage.matrix.integer_forms"]);
    const savedBytes = await ctx.page.evaluate((id) => localStorage.getItem(`math3d.project.v1.payload.${id}`),
      project.identity.id);
    const imported = core.parseMath3DProject(savedBytes);
    expect(imported.algebraRecipes).toHaveLength(1);
    expect(imported.algebraEvidence).toHaveLength(2);
    expect(imported.algebraEvidence.map((item: { request: { operation: string } }) => item.request.operation).sort())
      .toEqual(["sage.algebra.reconstruct", "sage.matrix.integer_forms"]);
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` }, profile);
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await reopened.getByRole("button", { name: "Recipes", exact: true }).click();
    await expect(reopened.getByTestId("cas-recipe-stages")).toContainText("integer-forms");
    await expect(reopened.getByText("Retained evidence: 1")).toHaveCount(2);
    await reopened.getByRole("button", { name: "Inspect retained evidence" }).first().click();
    await expect(reopened.getByTestId("cas-evidence-result")).toBeVisible();
    await reopened.getByRole("button", { name: "Operations", exact: true }).click();
    await expect(reopened.getByTestId("cas-object-operations")).toContainText("Saved evidence for this structure (2)");
  } finally {
    await closeSurfaceApp(ctx);
    await new Promise<void>((done) => server.close(() => done()));
  }
});
