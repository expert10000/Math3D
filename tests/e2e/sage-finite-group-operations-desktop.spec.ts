import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));
const fixture = require(resolve("tests/fixtures/sage-group-d4-sage95.json"));

test("SAGE-E02 runs a capability-gated D4 dossier and reopens pinned evidence", async () => {
  test.setTimeout(180_000);
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5", available: true, status: "ok",
        operations: ["sage.group.dossier"] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body);
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5", operation: request.operation,
        success: true, latex: "", warnings: [], result: fixture }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-e02-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-e02-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-e02-desktop", title: "Group invariants" });
    const group = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "D4"),
      revision: 1, label: "D4", definition: core.FINITE_GROUP_PRESETS.find((item: { id: string }) => item.id === "D4").definition });
    project = core.upsertMath3DProjectAlgebraObject(project, group);
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
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /D4 @1/ }).click();
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    await cas.getByRole("button", { name: "Select GAP group invariants" }).click();
    await expect(cas.getByTestId("cas-object-run-controls")).toContainText("GAP group invariants");
    await cas.getByRole("button", { name: "Run and save evidence" }).click();
    await expect(cas.getByTestId("cas-object-run-status")).toContainText("Saved GAP group invariants evidence");
    await cas.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(cas.getByTestId("cas-evidence-result")).toContainText("Group order");
    await expect(cas.getByTestId("cas-evidence-result")).toContainText("GAP version");
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(exported);
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await reopened.getByTestId("cas-structures-explorer").getByRole("button", { name: /D4 @1/ }).click();
    await reopened.getByRole("button", { name: "Operations", exact: true }).click();
    await reopened.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(reopened.getByTestId("cas-evidence-result")).toContainText("Center order");
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraObjects[0].revisions[0]).toEqual(group);
    expect(imported.algebraEvidence).toHaveLength(1);
    expect(imported.algebraEvidence[0].result.subgroups).toHaveLength(10);
    expect(imported.algebraEvidence[0].request.params.targetHash).toBe(group.contentHash);
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
