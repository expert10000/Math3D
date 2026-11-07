import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));
const operations = ["sage.ideal.radical", "sage.ideal.primaryDecomposition", "sage.ideal.hilbertPolynomial"];

test("SAGE-G06 runs bounded invariants and reopens their saved Inspector evidence", async () => {
  test.setTimeout(180_000);
  const calls: { operation: string; params: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5", available: true, status: "ok", operations }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const { operation, params } = JSON.parse(body);
      calls.push({ operation, params });
      if (!operations.includes(operation)) { res.statusCode = 400; res.end(JSON.stringify({ error: "Unexpected operation" })); return; }
      const fields = operation === "sage.ideal.radical" ? { basis: ["x*y"] }
        : operation === "sage.ideal.primaryDecomposition"
          ? { components: [["x"], ["y"]], associatedPrimes: [["x"], ["y"]] }
          : { hilbertPolynomial: "2", dimension: 1, grading: "standard" };
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5", operation,
        success: true, latex: "", warnings: [], elapsedMs: 5,
        result: { format: "math3d.sage-ideal-result", schemaVersion: 1,
          target: params.target, targetHash: params.targetHash, idealHash: params.idealHash, ...fields } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage fixture did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-g06-surface", metadata: { title: "Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null, definition: { familyId: "sage-g06-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-g06-desktop", title: "Ideal invariants" });
    const add = (key: string, definition: unknown) => {
      const record = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, key),
        revision: 1, label: key, definition });
      project = core.upsertMath3DProjectAlgebraObject(project, record);
      return record;
    };
    const q = add("Q", { kind: "rational-field" });
    const r = add("R", { kind: "polynomial-ring", coefficientDomain: { objectId: q.id, revision: 1 },
      variables: ["x", "y"], monomialOrder: "degrevlex" });
    const ideal = add("I", { kind: "ideal", ambientRing: { objectId: r.id, revision: 1 }, generators: ["x*y"] });
    add("RmodI", { kind: "quotient-ring", ambientRing: { objectId: r.id, revision: 1 },
      ideal: { objectId: ideal.id, revision: 1 } });
    const raw = core.serializeMath3DProject(project);
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    const seed = async (bytes: string) => {
      await ctx!.page.evaluate(({ id, title, raw }) => {
        localStorage.setItem("math3d.project.v1", raw);
        localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
        localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
          entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
      }, { id: project.identity.id, title: project.metadata.title, raw: bytes });
      await ctx!.page.reload();
      await ctx!.page.getByTestId("projects-toggle").click();
      await ctx!.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
      await ctx!.page.getByTestId("workspace-nav-cas").click();
    };
    await seed(raw);
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByRole("button", { name: /^I @1/ }).click();
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    for (const [index, [label, resultLabel]] of [["Ideal radical", "Radical Gröbner basis"],
      ["Primary decomposition and associated primes", "Primary components"]].entries()) {
      await cas.getByRole("button", { name: `Select ${label}` }).click();
      await expect(cas.getByTestId("cas-ideal-budget-warning")).toContainText("15 s");
      await cas.getByRole("button", { name: "Run and save evidence" }).click();
      await expect(cas.getByTestId("cas-object-run-status")).toContainText(`Saved ${label} evidence`);
      await expect(cas.getByRole("button", { name: "Inspect saved result" })).toHaveCount(index + 1);
      const operation = index === 0 ? "sage.ideal.radical" : "sage.ideal.primaryDecomposition";
      const inspect = cas.getByRole("button", { name: "Inspect saved result" }).locator("xpath=../..")
        .filter({ hasText: operation }).getByRole("button", { name: "Inspect saved result" });
      await inspect.click();
      await expect(inspect).toHaveAttribute("aria-current", "true");
      await expect(cas.getByTestId("cas-evidence-result")).toContainText(resultLabel);
      await cas.getByRole("button", { name: "Operations", exact: true }).click();
    }
    await cas.getByRole("button", { name: "Structures", exact: true }).click();
    await cas.getByRole("button", { name: /RmodI @1/ }).click();
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    await cas.getByRole("button", { name: "Select Quotient Hilbert polynomial" }).click();
    await cas.getByRole("button", { name: "Run and save evidence" }).click();
    await expect(cas.getByTestId("cas-object-run-status")).toContainText("Saved Quotient Hilbert polynomial evidence");
    expect(calls.map((item) => item.operation)).toEqual(operations);
    expect(calls.every((item) => (item.params.budget as { profile: string }).profile === "standard")).toBe(true);
    const bytes = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!bytes) throw new Error("Project export bytes are missing.");
    const imported = core.parseMath3DProject(bytes);
    expect(imported.algebraEvidence).toHaveLength(3);
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await seed(bytes);
    const fresh = ctx.page.getByTestId("cas-algebra-workspace");
    await fresh.getByRole("button", { name: /RmodI @1/ }).click();
    await fresh.getByRole("button", { name: "Operations", exact: true }).click();
    await expect(fresh.getByTestId("cas-object-operations")).toContainText("Saved evidence for this structure (1)");
    await fresh.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(fresh.getByTestId("cas-evidence-result")).toContainText("Hilbert polynomial");
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
