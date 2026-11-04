import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-C02–C04 saves exact ideal recipes, quotient dimension and independent Project evidence", async () => {
  test.setTimeout(180_000);
  const calls: string[] = [];
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", available: true, status: "ok",
        operations: ["sage.ideal.groebner", "sage.ideal.eliminate", "sage.ideal.membership",
          "sage.ideal.quotientDimension"] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body), params = request.params;
      calls.push(request.operation);
      const base = { engine: "sagemath", engineVersion: "10.10", operation: request.operation,
        success: true, latex: "", warnings: [], elapsedMs: 5 };
      const result = { format: "math3d.sage-ideal-result", schemaVersion: 1, target: params.target,
        targetHash: params.targetHash, idealHash: params.idealHash,
        ...(request.operation === "sage.ideal.groebner" ? { basis: ["x - 1", "y - 1"] }
          : request.operation === "sage.ideal.eliminate" ? { basis: ["y - 1"], eliminate: params.eliminate }
            : request.operation === "sage.ideal.membership" ? { basis: ["x - 1", "y - 1"],
              polynomial: params.polynomial, member: true, normalForm: "0" }
              : { dimension: 0, quotientPresentation: "Quotient of QQ[x,y] by I" }) };
      res.end(JSON.stringify({ ...base, result }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage fixture did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-c02-surface", metadata: { title: "Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null, definition: { familyId: "sage-c02-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-c02-c04-desktop", title: "Ideal analysis" });
    const add = (key: string, definition: unknown) => {
      const record = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, key),
        revision: 1, label: key, definition });
      project = core.upsertMath3DProjectAlgebraObject(project, record);
      return record;
    };
    const q = add("Q", { kind: "rational-field" });
    const r = add("R", { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
      variables: ["x", "y"], monomialOrder: "lex" });
    const ideal = add("I", { kind: "ideal", ambientRing: { objectId: r.id, revision: 1 },
      generators: ["x*y-1", "y-1"] });
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
    await cas.getByRole("button", { name: /I @1/ }).click();
    await cas.getByRole("button", { name: "Recipes", exact: true }).click();
    await cas.getByRole("button", { name: "Create and save starter for selected structure" }).click();
    await expect(cas.getByTestId("cas-recipe-stages")).toContainText("elimination");
    await cas.getByRole("button", { name: "Run saved recipe" }).click();
    await expect(cas.getByTestId("cas-recipe-status")).toContainText("Recipe complete");
    expect(calls).toEqual(["sage.ideal.groebner", "sage.ideal.eliminate", "sage.ideal.membership"]);
    await cas.getByRole("button", { name: "Structures", exact: true }).click();
    await cas.getByRole("button", { name: /I @1/ }).click();
    await cas.getByLabel("Quotient name").fill("RmodI");
    await cas.getByRole("button", { name: "Save quotient ring" }).click();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("RmodI");
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    await cas.getByRole("button", { name: "Select Quotient dimension" }).click();
    await cas.getByRole("button", { name: "Run and save evidence" }).click();
    await expect(cas.getByTestId("cas-object-run-status")).toContainText("Saved Quotient dimension evidence");
    const bytes = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    const imported = core.parseMath3DProject(bytes);
    expect(imported.algebraRecipes).toHaveLength(1);
    expect(imported.algebraEvidence).toHaveLength(4);
    const quotient = imported.algebraObjects.find((item: { revisions: { kind: string }[] }) => item.revisions[0].kind === "quotient-ring").revisions[0];
    expect(quotient.definition).toEqual({ kind: "quotient-ring", ambientRing: { objectId: r.id, revision: 1 },
      ideal: { objectId: ideal.id, revision: 1 } });
    expect(imported.algebraEvidence.find((item: { request: { operation: string } }) =>
      item.request.operation === "sage.ideal.quotientDimension").result.dimension).toBe(0);
    if (!bytes) throw new Error("Project export bytes are missing.");
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: bytes });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const fresh = ctx.page.getByTestId("cas-algebra-workspace");
    await fresh.getByRole("button", { name: /RmodI @1/ }).click();
    await expect(fresh.getByTestId("cas-selected-structure")).toContainText("RmodI");
    await expect(fresh.getByTestId("cas-selected-structure")).toContainText("Quotient ring");
    await fresh.getByRole("button", { name: "Operations", exact: true }).click();
    await expect(fresh.getByTestId("cas-object-operations")).toContainText("Saved evidence for this structure (1)");
    await fresh.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(fresh.getByTestId("cas-evidence-result")).toContainText("Krull dimension");
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
