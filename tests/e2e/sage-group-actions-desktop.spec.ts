import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));
const result = { format: "math3d.sage-group-action-result", schemaVersion: 1,
  order: 2, actionDegree: 2, point: 1, gapVersion: "4.11.1", orbit: [1, 2], stabilizer: [0],
  generatorMatrices: [[[0, 1], [1, 0]]], permutationCharacter: [2, 0],
  conjugacyClasses: [[0], [1]], characterStatus: "integer-table",
  irreducibleCharacters: [[1, -1], [1, 1]], multiplicities: [1, 1] };

test("SAGE-G07 runs a C2 action and reopens its checked Project evidence", async () => {
  test.setTimeout(180_000);
  const calls: { operation: string; params: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5", available: true,
        status: "ok", operations: ["sage.group.actionCharacters"] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const { operation, params } = JSON.parse(body);
      calls.push({ operation, params });
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5", operation,
        success: true, latex: "", warnings: [], elapsedMs: 5, result }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage fixture did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-g07-surface", metadata: { title: "Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null, definition: { familyId: "sage-g07-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-g07-desktop", title: "Group action" });
    const group = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "C2"),
      revision: 1, label: "C2", definition: { kind: "finite-group", representation: "abelian",
        invariantFactors: [2], generators: ["a"] } });
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
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /C2 @1/ }).click();
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    await cas.getByRole("button", { name: "Select Group action and characters" }).click();
    await cas.getByLabel("Action point (1 through the saved permutation degree)").fill("1");
    await cas.getByRole("button", { name: "Run and save evidence" }).click();
    await expect(cas.getByTestId("cas-object-run-status")).toContainText("Saved Group action and characters evidence");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ operation: "sage.group.actionCharacters", params: { point: 1,
      targetHash: group.contentHash } });
    await cas.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(cas.getByTestId("cas-evidence-result")).toContainText("Permutation representation multiplicities");
    await expect(cas.getByTestId("cas-evidence-result")).toContainText("Generator permutation matrices");
    await expect(cas.getByTestId("cas-group-action-edge")).toHaveCount(2);
    await cas.getByRole("button", { name: "Point 2, in selected orbit" }).click();
    await expect(cas.getByTestId("cas-group-action-selection")).toContainText("Point 2: a → 1");
    const bytes = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!bytes) throw new Error("Project export bytes are missing.");
    expect(core.parseMath3DProject(bytes).algebraEvidence[0].result.orbit).toEqual([1, 2]);
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(bytes);
    const fresh = ctx.page.getByTestId("cas-algebra-workspace");
    await fresh.getByTestId("cas-structures-explorer").getByRole("button", { name: /C2 @1/ }).click();
    await fresh.getByRole("button", { name: "Operations", exact: true }).click();
    await fresh.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(fresh.getByTestId("cas-evidence-result")).toContainText("Stabilizer element indices");
    await expect(fresh.getByTestId("cas-group-action-edge")).toHaveCount(2);
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
