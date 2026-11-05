import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));
const matrix = [["2", "0"], ["0", "6"]];
const smith = { form: matrix, diagonal: ["2", "6"], transformations: { status: "verified",
  left: [["1", "0"], ["0", "1"]], right: [["1", "0"], ["0", "1"]] } };

test("SAGE-E05 runs a saved ZZ module, exports and independently reopens its exact decomposition", async () => {
  test.setTimeout(180_000);
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") { res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10",
      available: true, status: "ok", operations: ["sage.module.invariantFactors"] })); return; }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body);
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", operation: request.operation,
        success: true, latex: "", warnings: [], result: { format: "math3d.sage-module-invariant-factors-result",
          schemaVersion: 1, coefficientDomain: "ZZ", freeRank: 0, torsionOrders: ["2", "6"], smith } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-e05-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-e05-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-e05-desktop", title: "Module invariants" });
    const zz = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "ZZ"),
      revision: 1, label: "ZZ", definition: { kind: "integer-ring" } });
    project = core.upsertMath3DProjectAlgebraObject(project, zz);
    const module = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "M"),
      revision: 1, label: "M", definition: { kind: "module", baseRing: { objectId: zz.id, revision: 1 },
        ambientRank: 2, generators: ["u", "v"], relationMap: { domainRank: 2, codomainRank: 2, matrix } } });
    project = core.upsertMath3DProjectAlgebraObject(project, module);
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
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(core.serializeMath3DProject(project));
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /M @1/ }).click();
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    await cas.getByRole("button", { name: "Select ZZ module invariant factors" }).click();
    await cas.getByRole("button", { name: "Run and save evidence" }).click();
    await expect(cas.getByTestId("cas-object-run-status")).toContainText("Saved ZZ module invariant factors evidence");
    await cas.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(cas.getByTestId("cas-evidence-result")).toContainText("ZZ/2ZZ ⊕ ZZ/6ZZ");
    await expect(cas.getByTestId("cas-module-invariant-viewer")).toContainText("ZZ/6ZZ");
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    const panel = ctx.page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-save").click();
    await panel.getByTestId("project-detail-toggle").click();
    await panel.getByTestId("project-explorer-header").locator("summary").click();
    await panel.getByTestId("project-explorer-header").getByRole("button", { name: "Import / export" }).click();
    const path = test.info().outputPath("module-invariants.resources.math3d.project.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), path);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(() => { try { return readFileSync(path).length; } catch { return 0; } }).toBeGreaterThan(100);
    const bundle = JSON.parse(readFileSync(path, "utf8"));
    expect(bundle.project.algebraEvidence[0].result.torsionOrders).toEqual(["2", "6"]);
    await closeSurfaceApp(ctx); ctx = null;
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("projects-toggle").click();
    const fresh = ctx.page.getByTestId("project-explorer-panel");
    await fresh.getByTestId("project-import-file").setInputFiles(path);
    await fresh.getByTestId("project-import-save").click();
    await fresh.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await reopened.getByTestId("cas-structures-explorer").getByRole("button", { name: /M @1/ }).click();
    await reopened.getByRole("button", { name: "Operations", exact: true }).click();
    await reopened.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(reopened.getByTestId("cas-module-invariant-viewer")).toContainText("ZZ/2ZZ");
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraEvidence).toHaveLength(1);
    expect(imported.algebraEvidence[0].request.params.targetHash).toBe(module.contentHash);
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
