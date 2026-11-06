import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));
const fixtures: Record<string, Record<string, unknown>> = {
  "3": require(resolve("tests/fixtures/sage-local-x2minus5-p3-sage95.json")),
  "5": require(resolve("tests/fixtures/sage-local-x2minus5-p5-sage95.json")),
  "11": require(resolve("tests/fixtures/sage-local-x2minus5-p11-sage95.json")),
};

test("SAGE-G03 saves inert, ramified and split local models and independently reopens them", async () => {
  test.setTimeout(180_000);
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") { res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5",
      available: true, status: "ok", operations: ["sage.numberField.localExtensions"] })); return; }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body);
      const fixture = fixtures[String(request.params.prime)];
      const record = request.params.field.objects.at(-1);
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5", operation: request.operation,
        success: true, latex: "", warnings: [], result: { ...fixture,
          target: request.params.field.target, targetHash: record.contentHash } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-g03-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-g03-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-g03-desktop", title: "Local fields" });
    const q = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "Q"),
      revision: 1, label: "Q", definition: { kind: "rational-field" } });
    project = core.upsertMath3DProjectAlgebraObject(project, q);
    const k = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "K"),
      revision: 1, label: "K", definition: { kind: "number-field",
        baseField: { objectId: q.id, revision: 1 }, definingPolynomial: ["-5", "0", "1"], generator: "a" } });
    project = core.upsertMath3DProjectAlgebraObject(project, k);
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
      await ctx!.page.getByTestId("workspace-nav-number_theory").click();
    };
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(core.serializeMath3DProject(project));
    const local = ctx.page.getByTestId("number-theory-local-extensions");
    await local.locator("summary").click();
    await expect(local.getByTestId("local-extension-runtime-status")).toContainText("ready");
    await expect(local).toContainText("Pinned field: K@1");
    for (const [prime, splitting, ramification] of [["3", "inert", "e=1"],
      ["5", "ramified", "e=2"], ["11", "split", "e=1"]] as const) {
      await local.getByLabel("Rational prime p").fill(prime);
      await local.getByRole("button", { name: "Run and save local extensions" }).click();
      await expect(local.getByTestId("local-extension-run-status")).toContainText("Saved local-extension evidence");
      await expect(local.getByTestId("local-extension-saved-result")).toContainText(splitting);
      await expect(local.getByTestId("local-extension-saved-result")).toContainText(ramification);
    }
    await expect(local.getByTestId("local-extension-saved-result")).toContainText("Prime ideal P2");
    await expect(local.getByTestId("local-extension-saved-result")).toContainText("Generator root");
    await ctx.page.getByTestId("number-theory-workspace").getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(exported);
    const reopened = ctx.page.getByTestId("number-theory-local-extensions");
    await reopened.locator("summary").click();
    await expect(reopened.getByTestId("local-extension-saved-result")).toContainText("split");
    await expect(reopened.getByTestId("local-extension-saved-result")).toContainText("Prime ideal P2");
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraObjects.find((entry: { id: string }) => entry.id === k.id).revisions[0]).toEqual(k);
    expect(imported.algebraEvidence).toHaveLength(3);
    expect(imported.algebraEvidence.map((item: { result: { splitting: string } }) => item.result.splitting))
      .toEqual(["inert", "ramified", "split"]);
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
