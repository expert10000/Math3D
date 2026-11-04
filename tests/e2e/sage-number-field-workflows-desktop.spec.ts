import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-D02–D04 shares Project refs across workspaces and reopens number-field evidence", async () => {
  test.setTimeout(180_000);
  const requests: string[] = [];
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", available: true, status: "ok",
        operations: ["sage.algebra.reconstruct", "sage.numberField.elementDossier", "sage.numberField.primeDecomposition"] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body);
      requests.push(request.operation);
      const field = request.operation === "sage.algebra.reconstruct" ? request.params : request.params.field;
      const { target, objects } = field;
      const definitionHash = objects.at(-1).contentHash;
      const common = { format: "math3d.sage-number-field-result", schemaVersion: 1,
        operation: request.operation, target, definitionHash };
      const result = request.operation === "sage.algebra.reconstruct"
        ? { format: "math3d.sage-algebra-reconstruction-result", schemaVersion: 1, target,
          kind: "number-field", definitionHash, text: "Number Field in a with defining polynomial x^2 - 5",
          latex: "", characteristic: "0", isField: true,
          numberField: { degree: 2, signature: [2, 0], polynomialDiscriminant: "20", fieldDiscriminant: "5",
            powerBasis: ["1", "a"], integralBasis: ["1/2*a + 1/2", "a"], embeddingCount: 2 } }
        : request.operation === "sage.numberField.elementDossier"
        ? { ...common, element: ["1", "1"], norm: "-4", trace: "2", baseDegree: 1,
          relativeDegree: 2, absoluteDegree: 2, basis: ["1", "a"], embeddings: [
            { index: 0, generatorImage: "√5", elementImage: "1 + √5" },
            { index: 1, generatorImage: "-√5", elementImage: "1 - √5" },
          ] }
        : { ...common, prime: 5, splitting: "ramified", degreeCheck: 2,
          factors: [{ ideal: "Fractional ideal (-a)", ramificationIndex: 2, residueDegree: 1, norm: "5" }] };
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", operation: request.operation,
        success: true, latex: "", warnings: [], result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-d02-d04-surface",
      metadata: { title: "Project Surface" }, source: {
        representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
          v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
        parameters: {}, branchPolicy: null,
        definition: { familyId: "sage-d02-d04-plane", expressions: { x: "u", y: "v", z: "0" } },
      } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-d02-d04-desktop", title: "Shared algebra" });
    const make = (key: string, label: string, definition: unknown) => core.createAlgebraObjectRecord({
      id: core.createProjectAlgebraObjectId(project.identity.id, key), revision: 1, label, definition });
    const q = make("Q", "Q", { kind: "rational-field" });
    project = core.upsertMath3DProjectAlgebraObject(project, q);
    const k = make("K", "K", { kind: "number-field", baseField: { objectId: q.id, revision: 1 },
      definingPolynomial: ["-5", "0", "1"], generator: "a" });
    project = core.upsertMath3DProjectAlgebraObject(project, k);
    const r = make("R", "R", { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
      variables: ["x"], monomialOrder: "lex" });
    project = core.upsertMath3DProjectAlgebraObject(project, r);
    const ideal = make("I", "I", { kind: "ideal", ambientRing: { objectId: r.id, revision: 1 },
      generators: ["x^2-5"] });
    project = core.upsertMath3DProjectAlgebraObject(project, ideal);
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
    };
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(core.serializeMath3DProject(project));
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await expect(cas.getByTestId("cas-structures-explorer")).toContainText("K");
    await expect(cas.getByTestId("cas-structures-explorer")).toContainText("I");
    await cas.getByRole("button", { name: /K @1/ }).click();
    await expect(cas.getByTestId("cas-structure-inspector")).toContainText(k.id);
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("workspace-nav-number_theory").click();
    const nt = ctx.page.getByTestId("number-theory-workspace");
    await expect(nt.getByTestId("cas-structures-explorer")).toContainText("I");
    await nt.getByRole("button", { name: /K @1/ }).click();
    await expect(nt.getByTestId("cas-structure-inspector")).toContainText(k.id);
    await nt.getByRole("button", { name: "Operations", exact: true }).click();
    await nt.getByRole("button", { name: "Select Norm, trace and embeddings" }).click();
    await nt.getByRole("button", { name: "Run and save evidence" }).click();
    await expect(nt.getByTestId("cas-evidence-result")).toContainText("Norm to QQ-4");
    await expect(nt.getByTestId("cas-evidence-result")).toContainText("1 - √5");
    await nt.getByRole("button", { name: "Select Prime ideal decomposition" }).click();
    await nt.getByRole("button", { name: "Run and save evidence" }).click();
    await expect(nt.getByTestId("cas-evidence-result")).toContainText("ramified");
    await expect(nt.getByTestId("cas-evidence-result")).toContainText("e=2, f=1, N=5");
    await nt.getByRole("button", { name: "Recipes", exact: true }).click();
    await nt.getByRole("button", { name: "Create and save starter for selected structure" }).click();
    await expect(nt.getByTestId("cas-recipe-stages")).toContainText("prime-decomposition");
    await expect(nt.getByTestId("cas-recipe-stages")).toContainText("Depends on: construct");
    await nt.getByRole("button", { name: "Run saved recipe" }).click();
    await expect(nt.getByTestId("cas-recipe-status")).toContainText("Recipe complete; every stage saved.");
    expect(requests).toEqual(["sage.numberField.elementDossier", "sage.numberField.primeDecomposition",
      "sage.algebra.reconstruct", "sage.numberField.elementDossier", "sage.numberField.primeDecomposition"]);
    await nt.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    const saved = core.parseMath3DProject(exported);
    expect(saved.algebraEvidence).toHaveLength(5);
    expect(saved.algebraRecipes).toHaveLength(1);
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(exported);
    await ctx.page.getByTestId("workspace-nav-number_theory").click();
    const reopened = ctx.page.getByTestId("number-theory-workspace");
    await reopened.getByRole("button", { name: /K @1/ }).click();
    await expect(reopened.getByTestId("cas-structure-inspector")).toContainText(k.contentHash);
    await reopened.getByRole("button", { name: "Operations", exact: true }).click();
    await expect(reopened.getByTestId("cas-object-operations")).toContainText("Saved evidence for this structure (5)");
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraObjects.find((item: { id: string }) => item.id === ideal.id).revisions[0]).toEqual(ideal);
    expect(imported.algebraObjects.find((item: { id: string }) => item.id === k.id).revisions[0]).toEqual(k);
    expect(imported.algebraEvidence).toEqual(saved.algebraEvidence);
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
