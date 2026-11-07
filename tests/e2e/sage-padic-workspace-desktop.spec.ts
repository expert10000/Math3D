import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));
const zp = require(resolve("tests/fixtures/sage-padic-zp-sage95.json"));
const qp = require(resolve("tests/fixtures/sage-padic-qp-sage95.json"));

test("SAGE-G02 shows finite precision and reopens Zp/Qp evidence", async () => {
  test.setTimeout(180_000);
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") { res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5",
      available: true, status: "ok", operations: ["sage.numberTheory.padic"] })); return; }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body);
      const fixture = request.params.domain === "Zp" ? zp : qp;
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5", operation: request.operation,
        success: true, latex: "", warnings: [], result: { ...fixture,
          target: request.params.target, targetHash: request.params.targetHash } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-g02-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-g02-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-g02-desktop", title: "p-adic studies" });
    const zz = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "ZZ"),
      revision: 1, label: "ZZ", definition: { kind: "integer-ring" } });
    project = core.upsertMath3DProjectAlgebraObject(project, zz);
    const qq = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "QQ"),
      revision: 1, label: "QQ", definition: { kind: "rational-field" } });
    project = core.upsertMath3DProjectAlgebraObject(project, qq);
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
    const padic = ctx.page.getByTestId("number-theory-padic-workspace");
    await expect(padic.getByTestId("padic-runtime-status")).toContainText("ready");
    await expect(padic).toContainText("Pinned parent: ZZ@1");
    await padic.getByText("Optional simple-root Hensel lift").click();
    await padic.getByLabel("Polynomial coefficients, constant first").fill("-2, 0, 1");
    await padic.getByLabel("Root seed modulo p").fill("3");
    await padic.getByRole("button", { name: "Run and save p-adic study" }).click();
    await expect(padic.getByTestId("padic-run-status")).toContainText("Saved precision-explicit p-adic evidence");
    await expect(padic.getByTestId("padic-saved-result")).toContainText("precision lost");
    await expect(padic.getByTestId("padic-saved-result")).toContainText("Hensel root");
    await padic.getByLabel("Domain").selectOption("Qp");
    await padic.getByLabel("Prime p").fill("5");
    await padic.getByLabel("Precision digits N").fill("8");
    await padic.getByLabel("Operand a").fill("1/5");
    await padic.getByLabel("Operand b").fill("-1/5");
    await padic.getByLabel("Polynomial coefficients, constant first").fill("");
    await padic.getByRole("button", { name: "Run and save p-adic study" }).click();
    await expect(padic.getByTestId("padic-run-status")).toContainText("Saved precision-explicit p-adic evidence");
    await expect(padic.getByTestId("padic-saved-result")).toContainText("undetermined");
    await expect(padic.getByTestId("padic-saved-result")).toContainText("5^-1 + O(5^7)");
    await ctx.page.getByTestId("number-theory-workspace").getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(exported);
    const reopened = ctx.page.getByTestId("number-theory-padic-workspace");
    await expect(reopened.getByTestId("padic-saved-result")).toContainText("Zp(7)");
    await reopened.getByLabel("Domain").selectOption("Qp");
    await expect(reopened.getByTestId("padic-saved-result")).toContainText("Qp(5)");
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraObjects.find((item: { id: string }) => item.id === zz.id).revisions[0]).toEqual(zz);
    expect(imported.algebraObjects.find((item: { id: string }) => item.id === qq.id).revisions[0]).toEqual(qq);
    expect(imported.algebraEvidence).toHaveLength(2);
    const qpEvidence = imported.algebraEvidence.find((item: { request: { params: { domain: string } } }) =>
      item.request.params.domain === "Qp");
    expect(qpEvidence?.result.entries.sum.zeroStatus).toBe("undetermined");
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
